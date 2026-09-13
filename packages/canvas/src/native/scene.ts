import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { absolutePosition, makeBlock, type Block, type Board, type Edge, type NativeScene } from "../model";

export type DrawingElement = ExcalidrawElement;
export interface Binding {
  block?: Omit<Block, "image">;
  edge?: Edge;
  endpoints?: string;
  text?: string;
}
export function binding(element: DrawingElement): Binding {
  return (element.customData?.canvas ?? {}) as Binding;
}
export function cardText(block: Block) {
  return [block.label, block.detail, block.tentative ? "Unresolved" : ""].filter(Boolean).join("\n\n");
}
export const outcomeColor = (outcome?: string) => outcome === "success" ? "#29815a" : outcome === "failure" ? "#ba4a46" : "#555555";
export const outcomeBackground = (outcome?: string) => outcome === "success" ? "#edf8f1" : outcome === "failure" ? "#fff1f0" : "#ffffff";
export function endpointSignature(board: Board, edge: Edge) {
  return JSON.stringify([edge.source, edge.target].map(id => {
    const b = board.blocks.find(b => b.id === id)!;
    return [absolutePosition(b, board), b.width, b.height, b.angle ?? 0];
  }));
}
const blockMetadata = (block: Block) => {
  const { image, ...metadata } = block;
  void image;
  return metadata;
};
/** Stamp the model represented by a native frame, without changing its drawing geometry. */
export function stampScene(elements: readonly DrawingElement[], board: Board): DrawingElement[] {
  return elements.map(e => {
    const block = board.blocks.find(b => b.id === e.id);
    const edge = board.edges.find(edge => edge.id === e.id);
    const text = e.type === "text" ? (e.originalText ?? e.text) : undefined;
    const canvas: Binding = block ? {block: blockMetadata(block)} : edge ? {edge, endpoints: endpointSignature(board, edge)} : {text};
    return {...e, customData: {...e.customData, canvas}};
  });
}
/** Native gestures become the same versioned drawing used by speech and scripts. */
export function readScene(board: Board, all: readonly DrawingElement[], files: BinaryFiles): {blocks: Block[]; edges: Edge[]; native: NativeScene} {
  const elements = all.filter(e => !e.isDeleted && e.type !== "selection");
  const byId = new Map(elements.map(e => [e.id, e]));
  const endpoint = (id:string) => {const e=byId.get(id); return e?.customData?.canvasAnchor === true && e.frameId && byId.get(e.frameId)?.type === "frame" ? e.frameId : id;};
  const boundLabel = (e: DrawingElement) => elements.find(t => t.type === "text" && t.containerId === e.id);
  const isEdge = (e: DrawingElement) => e.type === "arrow" && e.startBinding && e.endBinding &&
    e.startBinding.elementId !== e.endBinding.elementId && byId.has(e.startBinding.elementId) && byId.has(e.endBinding.elementId);
  const blocks: Block[] = [];
  for (const e of elements) {
    if (e.customData?.canvasAnchor === true || (e.type === "text" && e.containerId && byId.has(e.containerId)) || isEdge(e)) continue;
    const old = board.blocks.find(b => b.id === e.id);
    const kind = e.type === "frame" || e.type === "magicframe" ? "group" : e.type === "diamond" ? "decision" :
      e.type === "ellipse" ? "ellipse" : e.type === "freedraw" ? "draw" : e.type === "line" || e.type === "arrow" || e.type === "text" || e.type === "image" ? e.type :
      old?.kind === "screen" || old?.kind === "note" || old?.kind === "decision" ? old.kind : "step";
    const label = e.type === "text" ? e : boundLabel(e);
    const text = label?.type === "text" ? label.originalText ?? label.text : e.type === "frame" || e.type === "magicframe" ? e.name ?? "Group" : old?.label ?? "";
    const unchangedText = old && text === cardText(old);
    const parts = text.split("\n\n");
    if (old?.tentative && parts.at(-1) === "Unresolved") parts.pop();
    const parent = e.frameId ? byId.get(e.frameId) : undefined;
    const image = e.type === "image" && e.fileId ? files[e.fileId]?.dataURL : undefined;
    blocks.push(makeBlock(kind, unchangedText ? old.label : parts.shift() ?? "", {
      x: e.x - (parent?.x ?? 0), y: e.y - (parent?.y ?? 0),
    }, {
      ...old,
      id: e.id, kind,
      label: unchangedText ? old.label : text ? (text.split("\n\n")[0]) : "",
      detail: unchangedText ? old.detail : parts.join("\n\n"),
      position: {x: e.x - (parent?.x ?? 0), y: e.y - (parent?.y ?? 0)},
      width: Math.max(1, e.width), height: Math.max(1, e.height),
      parentId: parent && kind !== "group" ? parent.id : undefined,
      groups: [...e.groupIds], angle: e.angle, locked: e.locked,
      strokeColor: e.strokeColor, backgroundColor: e.backgroundColor,
      ...(e.type === "text" ? {fontSize: e.fontSize} : {}),
      ...("points" in e ? {points: e.points.map(p => [p[0], p[1]] as [number, number])} : {}),
      ...(image && /^data:image\/(png|jpeg|webp);base64,/.test(image) ? {image} : {}),
    }));
  }
  const blockIds = new Set(blocks.map(b => b.id));
  const edges: Edge[] = [];
  for (const e of elements) {
    if (e.type !== "arrow" || !e.startBinding || !e.endBinding || !isEdge(e)) continue;
    const source=endpoint(e.startBinding.elementId), target=endpoint(e.endBinding.elementId);
    if (!blockIds.has(source) || !blockIds.has(target) || source===target) continue;
    const old = board.edges.find(edge => edge.id === e.id);
    const text = boundLabel(e);
    edges.push({...old, id: e.id, source, target,
      label: text?.type === "text" ? text.originalText ?? text.text : "", highlighted: old?.highlighted ?? false});
  }
  const next = {...board, blocks, edges};
  const usedFiles = new Set<string>(elements.flatMap(e => e.type === "image" && e.fileId ? [e.fileId] : []));
  return {blocks, edges, native: {
    elements: stampScene(elements, next) as unknown as NativeScene["elements"],
    files: Object.fromEntries(Object.entries(files).filter(([id]) => usedFiles.has(id))),
  }};
}

/** Keep frame families contiguous and bound labels directly after their owners, as native editing expects. */
export function orderScene(elements: readonly DrawingElement[]): DrawingElement[] {
  const ordered: DrawingElement[] = [], used = new Set<string>();
  const append = (element: DrawingElement) => {
    if (used.has(element.id)) return;
    used.add(element.id); ordered.push(element);
    for (const label of elements) if (label.type === "text" && label.containerId === element.id) append(label);
  };
  const frame = (id: string) => {
    for (const child of elements) if (child.frameId === id && !(child.type === "text" && child.containerId)) append(child);
    const parent = elements.find(e => e.id === id);
    if (parent) append(parent);
  };
  for (const element of elements) {
    if (element.type === "text" && element.containerId && elements.some(e => e.id === element.containerId)) continue;
    if (element.frameId) frame(element.frameId);
    else if (element.type === "frame" || element.type === "magicframe") frame(element.id);
    else append(element);
  }
  return ordered;
}
