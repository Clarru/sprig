import {
  applyTransaction,
  makeBlock,
  uid,
  type Board,
  type Block,
  type BlockKind,
  type Operation,
  type Transaction,
} from "../model";
export class ScriptError extends Error {
  constructor(
    public line: number,
    message: string,
  ) {
    super(`Line ${line}: ${message}`);
    this.name = "ScriptError";
  }
}
export interface ScriptContext {
  selection?: string[];
  pointer?: { x: number; y: number };
}
export interface CompiledCommand {
  source: string;
  operations: Operation[];
  message?: string;
  state?: "updated" | "listening" | "clarification";
  control?: "undo" | "redo" | "continue" | "done";
}
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (/\s/.test(line[i])) {
      i++;
      continue;
    }
    if (line[i] === "#" && tokens.length === 0) break;
    if (line[i] === '"') {
      const start = i++;
      let escaped = false;
      let closed = false;
      while (i < line.length) {
        const c = line[i++];
        if (c === '"' && !escaped) {
          closed = true;
          break;
        }
        escaped = c === "\\" && !escaped;
      }
      if (!closed) throw new Error("Unclosed quoted label");
      tokens.push(JSON.parse(line.slice(start, i)));
    } else {
      const start = i;
      while (i < line.length && !/\s/.test(line[i])) i++;
      tokens.push(line.slice(start, i));
    }
  }
  return tokens;
}
const namePattern = /^[a-zA-Z0-9_-]{1,100}$/;
function resolve(board: Board, ref: string, context: ScriptContext): Block {
  if (ref === "$selected") {
    if (context.selection?.length !== 1)
      throw new Error("$selected requires exactly one selected object");
    ref = context.selection[0];
  }
  const scoped = board.focus ? `${board.focus}__${ref}` : ref;
  const found =
    board.blocks.find((b) => b.id === scoped) ??
    board.blocks.find((b) => b.id === ref);
  if (found) return found;
  const byLabel = board.blocks.filter(
    (b) => b.label.toLowerCase() === ref.toLowerCase(),
  );
  if (byLabel.length === 1) return byLabel[0];
  throw new Error(
    byLabel.length > 1
      ? `"${ref}" is ambiguous; use its ID`
      : `Unknown object "${ref}"`,
  );
}
function newId(board: Board, ref: string, root = false) {
  if (!namePattern.test(ref))
    throw new Error(
      "Use a short alphanumeric ID (underscores and hyphens are allowed)",
    );
  const id =
    !root && board.focus && !ref.startsWith(board.focus + "__")
      ? `${board.focus}__${ref}`
      : ref;
  if (id.length > 100) throw new Error("Object ID is too long");
  return id;
}
const dimensions = (kind: BlockKind) =>
  kind === "screen"
    ? { width: 180, height: 300 }
    : kind === "decision"
      ? { width: 200, height: 150 }
      : kind === "note"
        ? { width: 220, height: 150 }
        : kind === "text"
          ? { width: 220, height: 36 }
          : kind === "group"
            ? { width: 640, height: 460 }
            : { width: 220, height: 110 };
function overlaps(a: Block, b: Block) {
  return (
    a.parentId === b.parentId &&
    a.position.x < b.position.x + b.width + 24 &&
    a.position.x + a.width + 24 > b.position.x &&
    a.position.y < b.position.y + b.height + 24 &&
    a.position.y + a.height + 24 > b.position.y
  );
}
/** Compile meaning into deterministic graph edits. No model-generated geometry or executable code. */
export function compileCommand(
  board: Board,
  source: string,
  context: ScriptContext = {},
): CompiledCommand {
  const t = tokenize(source);
  if (!t.length || t[0] === "```" || t[0] === "```canvas")
    return { source, operations: [] };
  const [verb, ...args] = t;
  const ops: Operation[] = [];
  let working = board;
  const emit = (op: Operation) => {
    ops.push(op);
    working = applyTransaction(working, {
      id: uid("compile"),
      source: "ai",
      baseRevision: working.revision,
      operations: [op],
    });
  };
  const get = (ref: string) => resolve(working, ref, context);
  const requireArgs = (min: number, max = min) => {
    if (args.length < min || args.length > max)
      throw new Error(
        `${verb} expects ${min === max ? min : `${min}-${max}`} arguments`,
      );
  };
  const update = (
    id: string,
    patch: Extract<Operation, { type: "update" }>["patch"],
  ) => {
    const b = get(id);
    if (
      Object.entries(patch).some(
        ([k, v]) => JSON.stringify(b[k as keyof Block]) !== JSON.stringify(v),
      )
    )
      emit({ type: "update", id: b.id, patch });
  };
  const connect = (from: string, to: string, label = "") => {
    const a = get(from),
      b = get(to);
    if (a.id === b.id) throw new Error("Cannot connect an object to itself");
    const existing = working.edges.find(
      (e) => e.source === a.id && e.target === b.id,
    );
    if (existing) {
      if (label && label !== existing.label)
        emit({ type: "edge", id: existing.id, label });
      return;
    }
    let id = `${a.id}_${b.id}`;
    if (id.length > 90) id = uid("edge");
    emit({
      type: "connect",
      edge: { id, source: a.id, target: b.id, label, highlighted: false },
    });
  };
  const disconnect = (from: string, to: string) => {
    const a = get(from),
      b = get(to);
    const ids = working.edges
      .filter((e) => e.source === a.id && e.target === b.id)
      .map((e) => e.id);
    if (ids.length) emit({ type: "disconnect", ids });
  };
  const fitFrame = (parentId?: string) => {
    if (!parentId) return;
    const frame = get(parentId);
    const children = working.blocks.filter((b) => b.parentId === parentId);
    update(parentId, {
      width: Math.max(
        frame.width,
        ...children.map((b) => b.position.x + b.width + 35),
      ),
      height: Math.max(
        frame.height,
        ...children.map((b) => b.position.y + b.height + 35),
      ),
    });
  };
  const ensure = (
    ref: string,
    label: string,
    kind: BlockKind,
    parentId = working.focus,
    position?: { x: number; y: number },
  ) => {
    const id = newId({...working, focus: parentId}, ref, !parentId);
    const existing = working.blocks.find((b) => b.id === id);
    if (existing) {
      update(id, { label });
      return get(id);
    }
    const size = dimensions(kind);
    const p = position ?? { x: parentId ? 35 : 40, y: parentId ? 75 : 60 };
    const candidate = makeBlock(kind, label, p, { id, parentId, ...size });
    if (!position) {
      while (
        working.blocks.some((b) => b.kind !== "group" && overlaps(candidate, b))
      ) {
        candidate.position = {
          x: candidate.position.x,
          y: candidate.position.y + size.height + 45,
        };
      }
    }
    emit({ type: "add", block: candidate });
    fitFrame(parentId);
    return get(id);
  };
  const makeRoom = (
    candidate: Block,
    axis: "right" | "down",
    exclude = new Set<string>(),
  ) => {
    const queue = [candidate];
    const shifted = new Set(exclude);
    while (queue.length) {
      const obstacle = queue.shift()!;
      for (const other of [...working.blocks]) {
        if (
          other.id === candidate.id ||
          other.id === obstacle.id ||
          shifted.has(other.id) ||
          other.kind === "group" ||
          !overlaps(obstacle, other)
        )
          continue;
        shifted.add(other.id);
        const p = { ...other.position };
        if (axis === "right") p.x = obstacle.position.x + obstacle.width + 90;
        else p.y = obstacle.position.y + obstacle.height + 80;
        update(other.id, { position: p });
        queue.push(get(other.id));
      }
    }
  };
  const insert = (
    anchorRef: string,
    ref: string,
    label: string,
    side: "after" | "before",
    kind?: BlockKind,
  ) => {
    const anchor = get(anchorRef);
    const parentId = anchor.parentId;
    const axis = parentId ? (get(parentId).direction ?? "right") : "right";
    const requestedId = newId({...working, focus: parentId}, ref, !parentId);
    const existing = working.blocks.find((b) => b.id === requestedId);
    if (existing) {
      if (existing.id === anchor.id) throw new Error("Cannot insert an object next to itself");
      update(existing.id, {label});
      const alreadyAdjacent = working.edges.some(e => side === "after" ? e.source === anchor.id && e.target === existing.id : e.source === existing.id && e.target === anchor.id);
      if (alreadyAdjacent) return;
      const incoming = working.edges.filter(e => e.target === existing.id), outgoing = working.edges.filter(e => e.source === existing.id);
      emit({type:"disconnect", ids:[...incoming,...outgoing].map(e => e.id)});
      for (const left of incoming) for (const right of outgoing) if (left.source !== right.target) connect(left.source, right.target, right.label);
      const adjacent = working.edges.filter(e => side === "after" ? e.source === anchor.id : e.target === anchor.id);
      for (const edge of adjacent) {
        emit({type:"disconnect",ids:[edge.id]});
        if (side === "after") connect(existing.id, edge.target, edge.label); else connect(edge.source, existing.id, edge.label);
      }
      if (side === "after") connect(anchor.id, existing.id); else connect(existing.id, anchor.id);
      if (existing.parentId !== parentId) emit({type:"group",ids:[existing.id],parentId:parentId ?? null});
      const position = side === "after" ? {x:anchor.position.x+(axis === "right" ? anchor.width+90 : 0),y:anchor.position.y+(axis === "down" ? anchor.height+80 : 0)} : {...anchor.position};
      makeRoom({...get(existing.id),position},axis,side === "after" ? new Set([anchor.id]) : new Set());
      update(existing.id,{position}); fitFrame(parentId);
      return;
    }
    const size = dimensions(
      kind ?? (anchor.kind === "screen" ? "screen" : "step"),
    );
    const p =
      side === "after"
        ? {
            x: anchor.position.x + (axis === "right" ? anchor.width + 90 : 0),
            y: anchor.position.y + (axis === "down" ? anchor.height + 80 : 0),
          }
        : { ...anchor.position };
    const candidate = makeBlock(
      kind ?? (anchor.kind === "screen" ? "screen" : "step"),
      label,
      p,
      { id: requestedId, parentId, ...size },
    );
    const adjacent = working.edges.filter((e) =>
      side === "after" ? e.source === anchor.id : e.target === anchor.id,
    );
    makeRoom(
      candidate,
      axis,
      side === "after" ? new Set([anchor.id]) : new Set(),
    );
    emit({ type: "add", block: candidate });
    if (side === "after") {
      for (const edge of adjacent) {
        disconnect(anchor.id, edge.target);
        connect(candidate.id, edge.target, edge.label);
      }
      connect(anchor.id, candidate.id);
    } else {
      for (const edge of adjacent) {
        disconnect(edge.source, anchor.id);
        connect(edge.source, candidate.id, edge.label);
      }
      connect(candidate.id, anchor.id);
    }
    fitFrame(parentId);
  };
  switch (verb) {
    case "status":
    case "wait":
    case "ask":
      requireArgs(1);
      return {
        source,
        operations: [],
        message: args[0],
        state:
          verb === "ask"
            ? "clarification"
            : verb === "wait"
              ? "listening"
              : "updated",
      };
    case "undo":
    case "redo":
    case "continue":
    case "done":
      requireArgs(0);
      return { source, operations: [], control: verb };
    case "scene": {
      requireArgs(2, 3);
      const id = newId(working, args[0], true);
      const existing = working.blocks.find((b) => b.id === id);
      if (existing && existing.kind !== "group")
        throw new Error("Scene ID belongs to a non-scene object");
      if (!existing) {
        const roots = working.blocks.filter((b) => !b.parentId);
        const x = roots.length
          ? Math.max(...roots.map((b) => b.position.x + b.width)) + 160
          : 40;
        emit({
          type: "add",
          block: makeBlock(
            "group",
            args[1],
            { x, y: 40 },
            {
              id,
              ...dimensions("group"),
              direction: args[2] === "down" ? "down" : "right",
            },
          ),
        });
      } else
        update(id, {
          label: args[1],
          ...(args[2]
            ? { direction: args[2] === "down" ? "down" : "right" }
            : {}),
        });
      if (working.focus !== id) emit({ type: "focus", id });
      break;
    }
    case "use":
      requireArgs(1);
      if (args[0] === "none") {
        if (working.focus) emit({ type: "focus", id: null });
      } else {
        const frame = get(args[0]);
        if (frame.kind !== "group") throw new Error("Use must name a scene");
        if (working.focus !== frame.id) emit({ type: "focus", id: frame.id });
      }
      break;
    case "screen":
    case "step":
    case "note":
    case "decision":
    case "text":
    case "ellipse":
      requireArgs(2);
      ensure(args[0], args[1], verb as BlockKind);
      break;
    case "after":
    case "before":
      requireArgs(3);
      insert(args[0], args[1], args[2], verb);
      break;
    case "between": {
      requireArgs(4);
      const left = get(args[0]),
        right = get(args[1]);
      if (
        !working.edges.some(
          (e) => e.source === left.id && e.target === right.id,
        )
      )
        throw new Error(
          "The two objects must have a connection to insert between them",
        );
      insert(left.id, args[2], args[3], "after");
      break;
    }
    case "branch": {
      requireArgs(3, 4);
      const from = get(args[0]);
      const count = working.edges.filter((e) => e.source === from.id).length;
      const kind = from.kind === "screen" ? "screen" : "step";
      const to = ensure(args[1], args[2], kind, from.parentId, {
        x: from.position.x + from.width + 90,
        y: from.position.y + (count + 1) * (dimensions(kind).height + 60),
      });
      connect(from.id, to.id, args[3] ?? "");
      break;
    }
    case "connect":
      requireArgs(2, 3);
      connect(args[0], args[1], args[2]);
      break;
    case "disconnect":
      requireArgs(2);
      disconnect(args[0], args[1]);
      break;
    case "rename":
      requireArgs(2);
      update(args[0], { label: args[1] });
      break;
    case "detail":
      requireArgs(2);
      update(args[0], { detail: args[1] });
      break;
    case "tentative":
    case "lock":
      requireArgs(2);
      if (!["on", "off"].includes(args[1]))
        throw new Error("Expected on or off");
      update(
        args[0],
        verb === "lock"
          ? { locked: args[1] === "on" }
          : { tentative: args[1] === "on" },
      );
      break;
    case "kind":
      requireArgs(2);
      if (
        !["step", "screen", "decision", "note", "text", "ellipse"].includes(
          args[1],
        )
      )
        throw new Error("Unsupported block kind");
      update(args[0], { kind: args[1] as BlockKind });
      break;
    case "move":
      requireArgs(3);
      update(args[0], { position: { x: Number(args[1]), y: Number(args[2]) } });
      break;
    case "resize":
      requireArgs(3);
      update(args[0], { width: Number(args[1]), height: Number(args[2]) });
      break;
    case "rotate":
      requireArgs(2);
      update(args[0], { angle: (Number(args[1]) * Math.PI) / 180 });
      break;
    case "style": {
      requireArgs(3);
      const field = {
        stroke: "strokeColor",
        fill: "backgroundColor",
        font: "fontSize",
      }[args[1]];
      if (!field) throw new Error("Style supports stroke, fill, or font");
      update(args[0], {
        [field]: field === "fontSize" ? Number(args[2]) : args[2],
      });
      break;
    }
    case "highlight":
      emit({ type: "highlight", ids: args.map((ref) => get(ref).id) });
      break;
    case "order":
      requireArgs(2);
      if (!["front", "back"].includes(args[1]))
        throw new Error("Order expects front or back");
      emit({
        type: "order",
        id: get(args[0]).id,
        position: args[1] as "front" | "back",
      });
      break;
    case "duplicate": {
      requireArgs(2);
      const original = get(args[0]);
      const id = newId(working, args[1], !original.parentId);
      if (working.blocks.some((b) => b.id === id))
        throw new Error("Duplicate target ID already exists");
      emit({
        type: "add",
        block: {
          ...original,
          id,
          sourceId: original.id,
          position: {
            x: original.position.x + 40,
            y: original.position.y + 40,
          },
        },
      });
      break;
    }
    case "group": {
      requireArgs(3, 40);
      const groupId = args[0];
      if (!namePattern.test(groupId)) throw new Error("Invalid group ID");
      for (const ref of args.slice(1)) {
        const b = get(ref);
        update(b.id, { groups: [...new Set([...(b.groups ?? []), groupId])] });
      }
      break;
    }
    case "ungroup":
      requireArgs(1);
      for (const b of [...working.blocks])
        if (b.groups?.includes(args[0]))
          update(b.id, { groups: b.groups.filter((g) => g !== args[0]) });
      break;
    case "remove": {
      requireArgs(1, 40);
      for (const ref of args) {
        const b = get(ref);
        const incoming = working.edges.filter((e) => e.target === b.id),
          outgoing = working.edges.filter((e) => e.source === b.id);
        for (const a of incoming)
          for (const z of outgoing)
            if (a.source !== z.target) connect(a.source, z.target, z.label);
        emit({ type: "remove", ids: [b.id] });
      }
      break;
    }
    default:
      throw new Error(`Unknown command "${verb}"`);
  }
  return { source, operations: ops };
}
export function compileScript(
  board: Board,
  script: string,
  context: ScriptContext = {},
): { board: Board; commands: CompiledCommand[]; transactions: Transaction[] } {
  let working = board;
  const commands: CompiledCommand[] = [];
  const transactions: Transaction[] = [];
  const lines = script.split(/\r?\n/);
  if (lines.length > 150 || script.length > 16000)
    throw new ScriptError(1, "Script is too large");
  for (let i = 0; i < lines.length; i++) {
    try {
      const command = compileCommand(working, lines[i], context);
      commands.push(command);
      if (command.operations.length) {
        const tx: Transaction = {
          id: uid("script"),
          source: "ai",
          baseRevision: working.revision,
          operations: command.operations,
        };
        working = applyTransaction(working, tx);
        transactions.push(tx);
      }
    } catch (error) {
      throw new ScriptError(
        i + 1,
        error instanceof Error ? error.message : "Invalid command",
      );
    }
  }
  return { board: working, commands, transactions };
}
export function describeBoard(board: Board, selection: string[] = []): string {
  const alias = (id: string) =>
    board.focus && id.startsWith(board.focus + "__")
      ? id.slice(board.focus.length + 2)
      : id;
  return [
    `focus ${board.focus ?? "none"}`,
    selection.length ? `selected ${selection.map(alias).join(" ")}` : "",
    ...board.blocks.map(
      (b) =>
        `${alias(b.id)} [${b.kind}${b.parentId ? ` in ${b.parentId}` : ""}${b.tentative ? " tentative" : ""}] ${JSON.stringify(b.label)}${b.detail ? " " + JSON.stringify(b.detail) : ""}`,
    ),
    ...board.edges.map(
      (e) =>
        `${alias(e.source)} -> ${alias(e.target)}${e.label ? " " + JSON.stringify(e.label) : ""}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}
/** Newlines terminate commands, but quoted labels can contain escaped newlines. */
export class ScriptStream {
  private buffer = "";
  push(delta: string) {
    this.buffer += delta;
    const lines: string[] = [];
    let quoted = false,
      escaped = false,
      start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const c = this.buffer[i];
      if (c === '"' && !escaped) quoted = !quoted;
      if (c === "\n" && !quoted) {
        lines.push(this.buffer.slice(start, i).trim());
        start = i + 1;
      }
      escaped = c === "\\" && !escaped;
    }
    this.buffer = this.buffer.slice(start);
    return lines;
  }
  finish() {
    const last = this.buffer.trim();
    this.buffer = "";
    return last ? [last] : [];
  }
}
