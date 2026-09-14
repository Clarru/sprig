import { convertToExcalidrawElements, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { absolutePosition, type Board } from "../model";
import { orderScene, binding, cardText, endpointSignature, outcomeBackground, outcomeColor, stampScene, type DrawingElement } from "./scene";
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Reconcile semantic edits while retaining the engine's hand-edited shape geometry and styles. */
export function renderScene(board: Board): {elements: DrawingElement[]; files: BinaryFiles} {
  const native = board.native?.elements as unknown as DrawingElement[] | undefined;
  const previous = native ? restoreElements(native, null) : [];
  const old = new Map(previous.map(e => [e.id, e]));
  const files = {...board.native?.files} as BinaryFiles;
  const skeleton: ExcalidrawElementSkeleton[] = [];
  const anchors = new Map<string,string>();
  for (const group of board.blocks.filter(b=>b.kind==="group" && board.edges.some(e=>e.source===b.id||e.target===b.id))) {
    let id=`${group.id}__canvas_anchor`;
    while(board.blocks.some(b=>b.id===id)||board.edges.some(e=>e.id===id)) id+="_";
    anchors.set(group.id,id);
    const at=absolutePosition(group,board);
    skeleton.push({type:"rectangle",id,x:at.x,y:at.y,width:group.width,height:group.height,opacity:0,locked:true,frameId:group.id,
      strokeColor:"transparent",backgroundColor:"transparent",customData:{canvasAnchor:true}});
  }
  for (const b of board.blocks) {
    const at = absolutePosition(b, board);
    const original = old.get(b.id);
    const previousBlock = original && binding(original).block;
    const oldLabel = previous.find(e => e.type === "text" && e.containerId === b.id);
    const outcomeChanged = previousBlock && b.outcome !== previousBlock.outcome;
    const base = {id: b.id, x: at.x, y: at.y, width: b.width, height: b.height,
      strokeColor: outcomeChanged ? outcomeColor(b.outcome) : b.strokeColor ?? (b.outcome && b.outcome !== "neutral" ? outcomeColor(b.outcome) : "#c4c8c5"),
      backgroundColor: outcomeChanged ? outcomeBackground(b.outcome) : b.backgroundColor ?? (b.kind === "note" ? "#fff9db" : outcomeBackground(b.outcome)),
      fillStyle: "solid" as const, strokeWidth: b.highlighted ? 2 : 1, roughness: 0,
      strokeStyle: b.tentative ? "dashed" as const : "solid" as const,
      opacity: b.muted ? 45 : 100, groupIds: b.groups ?? [], frameId: b.parentId ?? null,
      angle: b.angle ?? 0, locked: b.locked ?? false, roundness: {type: 3 as const},
    };
    const label = {text: cardText(b), fontFamily: oldLabel?.type === "text" ? oldLabel.fontFamily : 2,
      fontSize: original && binding(original).block?.fontSize !== b.fontSize ? b.fontSize ?? 16 : oldLabel?.type === "text" ? oldLabel.fontSize : b.fontSize ?? 16, strokeColor: "#282d29"};
    if (b.kind === "group") skeleton.push({...base, type: "frame", name: b.label, children: [...board.blocks.filter(child => child.parentId === b.id).map(child => child.id), ...(anchors.has(b.id)?[anchors.get(b.id)!]:[])]});
    else if (b.kind === "image") {
      const fileId = original?.type === "image" && original.fileId ? original.fileId : `${b.id}_file`;
      if (b.image) files[fileId] = {id: fileId, dataURL: b.image, mimeType: b.image.slice(5, b.image.indexOf(";")), created: 1} as BinaryFiles[string];
      skeleton.push({...base, type: "image", fileId} as unknown as ExcalidrawElementSkeleton);
    } else if (b.kind === "text") skeleton.push({...base, type: "text", text: b.label, fontFamily: 2, fontSize: b.fontSize ?? 20} as ExcalidrawElementSkeleton);
    else if (b.kind === "draw" && original?.type === "freedraw") skeleton.push(original);
    else if (b.kind === "line" || b.kind === "arrow") skeleton.push({...base, type: b.kind, points: b.points ?? [[0, 0], [b.width, b.height]]} as ExcalidrawElementSkeleton);
    else skeleton.push({...base, type: b.kind === "decision" && original?.type === "diamond" ? "diamond" : b.kind === "ellipse" ? "ellipse" : "rectangle", label} as ExcalidrawElementSkeleton);
  }
  for (const edge of board.edges) {
    const from = board.blocks.find(b => b.id === edge.source)!, to = board.blocks.find(b => b.id === edge.target)!;
    const a = absolutePosition(from, board), b = absolutePosition(to, board);
    const vertical = Math.abs(b.x - a.x) < Math.min(from.width,to.width) / 2 && Math.abs(b.y-a.y) >= Math.min(from.height,to.height);
    const right = b.x + to.width/2 >= a.x + from.width/2, down = b.y >= a.y;
    const x = a.x + (vertical ? from.width/2 : right ? from.width+5 : -5);
    const y = a.y + (vertical ? down ? from.height+5 : -5 : from.height/2);
    const endX = b.x + (vertical ? to.width/2 : right ? -5 : to.width+5);
    const endY = b.y + (vertical ? down ? -5 : to.height+5 : to.height/2);
    skeleton.push({type: "arrow", id: edge.id, x, y, width: endX - x, height: endY - y,
      points: Math.abs(endY-y)<1 || Math.abs(endX-x)<1 ? [[0,0],[endX-x,endY-y]] : vertical ? [[0, 0], [0, (endY - y) / 2], [endX - x, (endY - y) / 2], [endX - x, endY - y]] : [[0, 0], [(endX - x) / 2, 0], [(endX - x) / 2, endY - y], [endX - x, endY - y]], start: {id: anchors.get(from.id) ?? from.id}, end: {id: anchors.get(to.id) ?? to.id},
      strokeColor: outcomeColor(edge.outcome), strokeWidth: edge.highlighted ? 2 : 1.5, roughness: 0,
      opacity: edge.muted ? 45 : 100,
      ...(edge.label ? {label: {text: edge.label, fontFamily: 2, fontSize: 12, strokeColor: outcomeColor(edge.outcome)}} : {}),
    });
  }
  const raw = convertToExcalidrawElements(skeleton, {regenerateIds: false});
  const labelIds = new Map(raw.flatMap(e => e.type === "text" && e.containerId ? [[e.id,
    previous.find(p => p.type === "text" && p.containerId === e.containerId)?.id ?? `${e.containerId}_label`]] : []));
  const generated = raw.map(e => ({...e, id: labelIds.get(e.id) ?? e.id,
    boundElements: e.boundElements?.map(bound => ({...bound, id: labelIds.get(bound.id) ?? bound.id})) ?? null}));
  const next = generated.map(e => {
    const before = old.get(e.id);
    if (!before || before.type !== e.type) return e;
    const b = board.blocks.find(b => b.id === e.id), edge = board.edges.find(edge => edge.id === e.id);
    const metadata = binding(before);
    let changed = !metadata.block && !metadata.edge;
    if (b && metadata.block) {
      const at = absolutePosition(b, board);
      // Child metadata stores relative positions; a moved parent still changes
      // the native absolute geometry of every child, even if metadata is equal.
      changed = !equal({...b, image: undefined}, metadata.block) || before.x !== at.x || before.y !== at.y;
    }
    if (edge && metadata.edge) changed = !equal(edge, metadata.edge) || metadata.endpoints !== endpointSignature(board, edge);
    if (e.type === "text" && e.containerId) {
      const owner = board.blocks.find(b => b.id === e.containerId), relation = board.edges.find(edge => edge.id === e.containerId);
      const oldOwner = old.get(e.containerId);
      const oldMetadata = oldOwner && binding(oldOwner);
      const ownerAt = owner && absolutePosition(owner, board);
      changed = owner ? !equal({...owner, image: undefined}, oldMetadata?.block) || oldOwner?.x !== ownerAt?.x || oldOwner?.y !== ownerAt?.y : !equal(relation, oldMetadata?.edge) || (relation ? oldMetadata?.endpoints !== endpointSignature(board, relation) : false);
    }
    if (!changed) {
      const bindings = [...(e.boundElements ?? []), ...(before.boundElements ?? [])]
        .filter((bound, index, all) => generated.some(candidate => candidate.id === bound.id) && all.findIndex(other => other.id === bound.id) === index);
      return {...before, boundElements: bindings.length ? bindings : null};
    }
    // Rendering changes should not reset the hand-chosen stroke texture or native bindings.
    const merged = {...before, ...e, version: before.version + 1, versionNonce: (before.versionNonce + 1) % 2147483647,
      roughness: before.roughness, fillStyle: before.fillStyle, seed: before.seed, index: before.index};
    return merged;
  });
  const byId = new Map(next.map(e => [e.id, e]));
  const order = [...previous.map(e => e.id).filter(id => byId.has(id)), ...next.map(e => e.id).filter(id => !old.has(id))];
  const unclipped = order.map(id => {
    const element = byId.get(id)!;
    const edge = board.edges.find(edge => edge.id === element.id || (element.type === "text" && element.containerId === edge.id));
    if (!edge) return element;
    const from = board.blocks.find(b => b.id === edge.source)!, to = board.blocks.find(b => b.id === edge.target)!;
    return {...element, frameId: from.parentId && from.parentId === to.parentId ? from.parentId : null};
  });
  return {elements: stampScene(restoreElements(orderScene(unclipped), null), board), files};
}
