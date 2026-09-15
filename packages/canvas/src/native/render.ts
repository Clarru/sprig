import {diagramIntent,diagramFill,diagramStroke,isLegacyDiagramColor,isLegacyDiagramStroke,NEO,DIAGRAM_ARROW_STYLE} from '../diagram-design';
import { convertToExcalidrawElements, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { absolutePosition, type Board } from "../model";
import { orderScene, binding, cardText,isPresentationCard, endpointSignature, stampScene, type DrawingElement } from "./scene";
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Reconcile semantic edits while retaining the engine's hand-edited shape geometry and styles. */
export function renderScene(board: Board): {elements: DrawingElement[]; files: BinaryFiles} {
  const native = board.native?.elements as unknown as DrawingElement[] | undefined;
  const previous = native ? restoreElements(native, null) : [];
  const old = new Map(previous.map(e => [e.id, e]));
  const files = {...board.native?.files} as BinaryFiles;
  const skeleton: ExcalidrawElementSkeleton[] = [];
  const anchors = new Map<string,string>();
  const retryEdges=new Set<string>();
  const ports=new Map<string,{start:[number,number];end:[number,number]}>();
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
    const oldLabel = previous.find(e => e.type === "text" && e.containerId === b.id);
    const intent=diagramIntent(board,b);
    const migrating=original?.customData?.diagramTheme!=='neo-v1';
    const base = {id: b.id, x: at.x, y: at.y, width: b.width, height: b.height,
      strokeColor:migrating&&isLegacyDiagramStroke(b.strokeColor)?NEO.ink:diagramStroke(b.strokeColor),
      backgroundColor:diagramFill(intent,b.outcome,migrating&&isLegacyDiagramColor(b.backgroundColor)?undefined:b.backgroundColor),customData:{diagramIntent:intent},
      fillStyle: "solid" as const, strokeWidth: b.highlighted ? 3 : 2, roughness: 0,
      strokeStyle: b.tentative ? "dashed" as const : "solid" as const,
      opacity: b.muted ? 45 : 100, groupIds: b.groups ?? [], frameId: b.parentId ?? null,
      angle: b.angle ?? 0, locked: b.locked ?? false, roundness:original?original.roundness:intent==='intent'||intent==='terminal'?{type: 3 as const}:null,
    };
    const label = {text: cardText(b,board), fontFamily: oldLabel?.type === "text" ? oldLabel.fontFamily : 3,
      fontSize: original && binding(original).block?.fontSize !== b.fontSize ? b.fontSize ?? (isPresentationCard(b,board)?20:14) : oldLabel?.type === "text" ? oldLabel.fontSize : b.fontSize ?? (isPresentationCard(b,board)?20:14), strokeColor:oldLabel?.strokeColor??NEO.ink,textAlign:oldLabel?.type==="text"?oldLabel.textAlign:"center" as const,verticalAlign:oldLabel?.type==="text"?oldLabel.verticalAlign:"middle" as const};
    if (b.kind === "group") skeleton.push({...base, backgroundColor:"transparent", type: "frame", name: b.label, children: [...board.blocks.filter(child => child.parentId === b.id).map(child => child.id), ...(anchors.has(b.id)?[anchors.get(b.id)!]:[])]});
    else if (b.kind === "image") {
      const fileId = original?.type === "image" && original.fileId ? original.fileId : `${b.id}_file`;
      if (b.image) files[fileId] = {id: fileId, dataURL: b.image, mimeType: b.image.slice(5, b.image.indexOf(";")), created: 1} as BinaryFiles[string];
      skeleton.push({...base, type: "image", fileId} as unknown as ExcalidrawElementSkeleton);
    } else if (b.kind === "text") skeleton.push({...base, type: "text", text: b.label, fontFamily: original?.type==="text"?original.fontFamily:3, fontSize: b.fontSize ?? 20} as ExcalidrawElementSkeleton);
    else if (b.kind === "draw" && original?.type === "freedraw") skeleton.push(original);
    else if (b.kind === "line" || b.kind === "arrow") skeleton.push({...base, type: b.kind, points: b.points ?? [[0, 0], [b.width, b.height]]} as ExcalidrawElementSkeleton);
    else skeleton.push({...base, type: b.kind === "decision" ? "diamond" : b.kind === "ellipse" ? "ellipse" : "rectangle", label} as ExcalidrawElementSkeleton);
  }
  for (const edge of board.edges) {
    const from = board.blocks.find(b => b.id === edge.source)!, to = board.blocks.find(b => b.id === edge.target)!;
    const a = absolutePosition(from, board), b = absolutePosition(to, board);
    // Return paths use their own outside channel, so a retry cannot obscure
    // the forward arrow between the same native shapes.
    const relation=Object.values(board.story?.topics??{}).flatMap(t=>t.relations).find(r=>`${from.storyTopic}__${r.id}`===edge.storyRelationId);
    const visited=new Set<string>();
    const reaches=(id:string):boolean=>{if(id===from.id)return true;if(visited.has(id))return false;visited.add(id);return board.edges.filter(e=>e.id!==edge.id&&e.source===id).some(e=>reaches(e.target));};
    const retry=relation?.retry===true||((relation?.kind==='branch'||relation?.kind==='returns')&&reaches(to.id));
    if(retry){
      const sameRow=Math.abs(a.y-b.y)<Math.min(from.height,to.height)/2;
      let x=a.x+(sameRow?from.width/2:from.width+5),y=a.y+(sameRow?-5:from.height/2);
      const endX=b.x+(sameRow?to.width/2:to.width+5),endY=b.y+(sameRow?-5:to.height/2);
      const obstacles=board.blocks.filter(c=>c.kind!=='group').map(c=>({id:c.id,...absolutePosition(c,board),width:c.width,height:c.height}));
      const outside=sameRow?Math.min(a.y,b.y)-56:Math.max(a.x+from.width,b.x+to.width,...obstacles.filter(c=>c.y<Math.max(a.y+from.height,b.y+to.height)&&c.y+c.height>Math.min(a.y,b.y)).map(c=>c.x+c.width))+72;
      let points=sameRow?[[0,0],[0,outside-y],[endX-x,outside-y],[endX-x,endY-y]]:[[0,0],[outside-x,0],[outside-x,endY-y],[endX-x,endY-y]];
      const blocked=!sameRow&&obstacles.some(c=>c.id!==from.id&&c.id!==to.id&&c.x+c.width>x&&c.x<outside&&c.y<y&&c.y+c.height>y);
      if(blocked){
        const below=Math.max(a.y+from.height,...obstacles.filter(c=>c.x+c.width>a.x&&c.x<outside&&c.y<Math.max(a.y+from.height,b.y+to.height)&&c.y+c.height>Math.min(a.y,b.y)).map(c=>c.y+c.height))+64;
        x=a.x+from.width/2;y=a.y+from.height+5;
        points=[[0,0],[0,below-y],[outside-x,below-y],[outside-x,endY-y],[endX-x,endY-y]];
      }
      ports.set(edge.id,{start:blocked?[.5,1]:sameRow?[.5,0]:[1,.5],end:sameRow?[.5,0]:[1,.5]});retryEdges.add(edge.id);
      skeleton.push({type:'arrow',id:edge.id,x,y,width:endX-x,height:endY-y,points,start:{id:anchors.get(from.id)??from.id},end:{id:anchors.get(to.id)??to.id},...DIAGRAM_ARROW_STYLE,...(edge.label?{label:{text:edge.label,fontFamily:2,fontSize:12,strokeColor:NEO.ink}}:{})} as ExcalidrawElementSkeleton);
      continue;
    }
    const vertical = Math.abs(b.x - a.x) < Math.min(from.width,to.width) / 2 && Math.abs(b.y-a.y) >= Math.min(from.height,to.height);
    const right = b.x + to.width/2 >= a.x + from.width/2, down = b.y >= a.y;
    const x = a.x + (vertical ? from.width/2 : right ? from.width+5 : -5);
    const y = a.y + (vertical ? down ? from.height+5 : -5 : from.height/2);
    const endX = b.x + (vertical ? to.width/2 : right ? -5 : to.width+5);
    const endY = b.y + (vertical ? down ? -5 : to.height+5 : to.height/2);
    ports.set(edge.id,{start:vertical?[.5,down?1:0]:[right?1:0,.5],end:vertical?[.5,down?0:1]:[right?0:1,.5]});
    skeleton.push({type: "arrow", id: edge.id, x, y, width: endX - x, height: endY - y,
      points: Math.abs(endY-y)<1 || Math.abs(endX-x)<1 ? [[0,0],[endX-x,endY-y]] : vertical ? [[0, 0], [0, (endY - y) / 2], [endX - x, (endY - y) / 2], [endX - x, endY - y]] : [[0, 0], [(endX - x) / 2, 0], [(endX - x) / 2, endY - y], [endX - x, endY - y]], start: {id: anchors.get(from.id) ?? from.id}, end: {id: anchors.get(to.id) ?? to.id},
      ...DIAGRAM_ARROW_STYLE,strokeWidth:edge.highlighted?4:DIAGRAM_ARROW_STYLE.strokeWidth,
      opacity: edge.muted ? 45 : 100,
      ...(edge.label ? {label: {text: edge.label, fontFamily: 2, fontSize: 12, strokeColor:NEO.ink}} : {}),
    });
  }
  const raw = convertToExcalidrawElements(skeleton, {regenerateIds: false});
  const labelIds = new Map(raw.flatMap(e => e.type === "text" && e.containerId ? [[e.id,
    previous.find(p => p.type === "text" && p.containerId === e.containerId)?.id ?? `${e.containerId}_label`]] : []));
  const generated:DrawingElement[] = raw.map(e => ({...e,customData:{...e.customData,diagramTheme:'neo-v1',...(retryEdges.has(e.id)?{diagramRouting:'retry-v2'}:{})},...(e.type==='arrow'&&ports.has(e.id)?{elbowed:true,fixedSegments:retryEdges.has(e.id)?Array.from({length:e.points.length-3},(_,i)=>({index:i+2,start:e.points[i+1],end:e.points[i+2]})):null,startBinding:e.startBinding?{...e.startBinding,gap:8,fixedPoint:ports.get(e.id)!.start}:null,endBinding:e.endBinding?{...e.endBinding,gap:8,fixedPoint:ports.get(e.id)!.end}:null}:{}), id: labelIds.get(e.id) ?? e.id,
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
    if (b?.kind === "group" && before.backgroundColor !== "transparent") changed = true;
    if (edge && metadata.edge) changed = !equal(edge, metadata.edge) || metadata.endpoints !== endpointSignature(board, edge);
    if (e.type === "text" && e.containerId) {
      const owner = board.blocks.find(b => b.id === e.containerId), relation = board.edges.find(edge => edge.id === e.containerId);
      const oldOwner = old.get(e.containerId);
      const oldMetadata = oldOwner && binding(oldOwner);
      const ownerAt = owner && absolutePosition(owner, board);

      changed = owner ? !equal({...owner, image: undefined}, oldMetadata?.block) || oldOwner?.x !== ownerAt?.x || oldOwner?.y !== ownerAt?.y : !equal(relation, oldMetadata?.edge) || (relation ? oldMetadata?.endpoints !== endpointSignature(board, relation) : false);
    }
    if(b&&before.backgroundColor.toLowerCase()==='#fb5707'&&e.backgroundColor!==before.backgroundColor)changed=true;
    // Migrate the previous visual treatment even when semantic content is unchanged.
    if(b&&['step','screen','note','decision','group'].includes(b.kind)&&(before.customData?.diagramTheme!=='neo-v1'||before.customData?.diagramIntent!==e.customData?.diagramIntent))changed=true;
    if(edge&&before.type==='arrow'&&e.type==='arrow'&&before.customData?.diagramTheme!=='neo-v1')changed=true;
    if(e.type==="text"&&e.containerId){const priorOwner=old.get(e.containerId),freshOwner=generated.find(candidate=>candidate.id===e.containerId);if(priorOwner&&freshOwner&&(priorOwner.type!==freshOwner.type||priorOwner.width!==freshOwner.width||priorOwner.height!==freshOwner.height))changed=true;}
    if(e.type==='text'&&before.type==='text'&&e.containerId){const owner=board.blocks.find(b=>b.id===e.containerId);if(owner&&(e.originalText!==before.originalText||(isPresentationCard(owner,board)&&e.fontSize!==before.fontSize)))changed=true;}
    if(retryEdges.has(e.id)&&before.customData?.diagramRouting!=='retry-v2')changed=true;
    if(e.type==='text'&&e.containerId&&retryEdges.has(e.containerId)&&old.get(e.containerId)?.customData?.diagramRouting!=='retry-v2')changed=true;
    if (!changed) {
      const bindings = [...(e.boundElements ?? []), ...(before.boundElements ?? [])]
        .filter((bound, index, all) => generated.some(candidate => candidate.id === bound.id) && all.findIndex(other => other.id === bound.id) === index);
      return {...before, boundElements: bindings.length ? bindings : null};
    }
    // Rendering changes should not reset the hand-chosen stroke texture or native bindings.
    const merged = {...before, ...e,customData:{...before.customData,...e.customData}, version: before.version + 1, versionNonce: (before.versionNonce + 1) % 2147483647,
      strokeWidth:before.customData?.diagramTheme==='neo-v1'?before.strokeWidth:e.strokeWidth,strokeStyle:b&&metadata.block&&b.tentative!==metadata.block.tentative?e.strokeStyle:before.strokeStyle,roughness: before.roughness, fillStyle: before.fillStyle, seed: before.seed, index: before.index};
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
