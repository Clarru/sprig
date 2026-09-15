"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Excalidraw, CaptureUpdateAction, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { CursorIcon, RectangleIcon, DiamondIcon, CircleIcon, ArrowRightIcon, PencilSimpleIcon, TextTIcon,
  HandIcon, ImageIcon, XIcon, DotsThreeIcon, ArrowCounterClockwiseIcon, ArrowClockwiseIcon, FrameCornersIcon, NoteIcon,
  CaretLeftIcon, CaretRightIcon, SquaresFourIcon, WarningCircleIcon } from "@phosphor-icons/react";
import {NEO,DIAGRAM_ARROW_TOOL} from '../diagram-design';
import { BoardStore } from "../store";
import { absolutePosition, availablePosition, createBoard, makeBlock, uid, type Board } from "../model";
import type { CanvasEditorProps } from "../editor";
import { NativeSurfaces } from "./surfaces";
import { readScene, type DrawingElement } from "./scene";
import { renderScene } from "./render";
import { createBoardStorageAdapter, migrateLegacyLocalStorage, parseBoardFile, serializeBoard } from "../storage";
import { sceneLabel, type SceneKind } from "../semantic-v2";
import { validateSemanticDocument } from "../semantic-operations";
import { boardDocument } from "../model";
import { layoutSemanticScene } from "../layout/semantic-layout-client";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function fingerprint(elements: readonly DrawingElement[]) {
  return canonical(elements.filter(e => !e.isDeleted).map(e => {
    const {customData, updated, version, versionNonce, index, ...drawing} = e;
    void customData; void updated; void version; void versionNonce; void index;
    return drawing;
  }));
}
const tools = [
  ["selection", "Select", "V", CursorIcon], ["rectangle", "Rectangle", "R", RectangleIcon],
  ["diamond", "Decision", "D", DiamondIcon], ["ellipse", "Ellipse", "O", CircleIcon],
  ["arrow", "Arrow", "A", ArrowRightIcon], ["freedraw", "Draw", "P", PencilSimpleIcon],
  ["text", "Text", "T", TextTIcon], ["hand", "Hand", "H", HandIcon],
] as const;
export default function NativeEditor({store: provided, initialBoard, editable = true, preservePageScroll = false, storageKey, storageAdapter: providedStorage, footer, menu, onReset, fitRequest = 0, className = ""}: CanvasEditorProps) {
  const [own] = useState(() => new BoardStore(initialBoard));
  const store = provided ?? own;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [storage] = useState(() => providedStorage ?? createBoardStorageAdapter());
  const [api, setAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [tool, setTool] = useState("selection");
  const [surfaceTarget, setSurfaceTarget] = useState<HTMLElement|null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [presenting,setPresenting]=useState(false);
  const [notesOpen,setNotesOpen]=useState(false);
  const [sceneMenuOpen,setSceneMenuOpen]=useState(false);
  const notesPanel=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(notesOpen)notesPanel.current?.focus();},[notesOpen]);
  const activeScene=snapshot.board.scenes.find(scene=>scene.id===snapshot.board.activeSceneId) ?? snapshot.board.scenes[0];
  const sceneIssues=activeScene ? validateSemanticDocument(boardDocument(snapshot.board)).filter(issue=>issue.sceneId===activeScene.id) : [];
  const sceneTranscript=activeScene?snapshot.board.transcript.filter(segment=>segment.sceneId===activeScene.id):[];
  const selectedDetail=snapshot.board.blocks.find(b=>snapshot.selection.includes(b.id)&&b.detail);
  const noteItems=selectedDetail?[selectedDetail]:snapshot.board.blocks.filter(b=>b.kind!=='group'&&b.detail&&(!activeScene||b.storyTopic===activeScene.id));
  const [error, setError] = useState("");
  const [view, setView] = useState({scrollX: 0, scrollY: 0, zoom: 1});
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [hydrated, setHydrated] = useState(!storageKey);
  const hasFooter = !!footer;
  const awaitingScene = useRef<string[] | null>(null);
  const draft = useRef<{elements: readonly DrawingElement[]; files: BinaryFiles} | null>(null);
  const pointer = useRef(false);
  const draftSelection = useRef<string[]>([]);
  const textEditing = useRef(false);
  const expected = useRef("");
  const fromNative = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const semanticLayoutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestedLayouts = useRef(new Map<string, number>());
  const cameraTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cameraFrame = useRef<number | undefined>(undefined);
  const cameraTarget = useRef<{id:string;overview:boolean} | null>(null);
  const queuedAt = useRef<number | null>(null);
  const lastCameraMove = useRef(0);
  const manualCameraUntil = useRef(0);
  const interruptFollow = useCallback(() => {
    clearTimeout(cameraTimer.current);
    if (cameraFrame.current !== undefined) cancelAnimationFrame(cameraFrame.current);
    cameraTarget.current = null; queuedAt.current = null;
    manualCameraUntil.current = Date.now() + 1000;
  }, []);
  const followNewBox = useCallback((id: string, overview = false) => {
    cameraTarget.current = {id,overview};
    queuedAt.current ??= Date.now();
    clearTimeout(cameraTimer.current);
    const due = Math.max(lastCameraMove.current + 1200, manualCameraUntil.current, Math.min(Date.now() + 350, queuedAt.current + 900));
    cameraTimer.current = setTimeout(() => {
      const request = cameraTarget.current;
      cameraTarget.current = null; queuedAt.current = null;
      if (!api || !request || pointer.current || textEditing.current || store.getSnapshot().editing) return;
      const board=store.getSnapshot().board;
      const block=board.blocks.find(b=>b.id===request.id);
      const active=board.story?.activeTopic ? board.story.topics[board.story.activeTopic] : undefined;
      const presentation=active?.view==='presentation';
      const targetId=presentation&&block?.parentId?block.parentId:request.id;
      const state = api.getAppState(), zoom = state.zoom.value;
      const footerRects=[...root.current?.querySelectorAll('.cv-editor-footer,[data-canvas-overlay]')??[]].map(e=>e.getBoundingClientRect()).filter(rect=>rect.height>0);
      const footer=footerRects.sort((a,b)=>a.top-b.top)[0];
      const safeTop=presentation?120:80;
      const safeBottom=Math.min(state.height-32,footer?footer.top-(root.current?.getBoundingClientRect().top??0)-24:state.height-32);
      const safeHeight=Math.max(160,safeBottom-safeTop);
      const overviewIds=new Set([...board.blocks.filter(b=>!b.parentId&&(!active||b.storyTopic===active.id)).map(b=>b.id),...board.edges.filter(e=>!active||board.blocks.some(b=>b.id===e.source&&b.storyTopic===active.id)).map(e=>e.id)]);
      const overviewItems=api.getSceneElements().filter(e=>!e.isDeleted&&overviewIds.has(e.id));
      const bounds=(items:readonly DrawingElement[])=>({left:Math.min(...items.map(e=>e.x)),top:Math.min(...items.map(e=>e.y))-(presentation?32:0),right:Math.max(...items.map(e=>e.x+e.width)),bottom:Math.max(...items.map(e=>e.y+e.height))});
      let candidates=request.overview?overviewItems:api.getSceneElements().filter(e=>e.id===targetId);
      if(!presentation&&!request.overview&&block){
        const related=new Set([block.id,...board.edges.filter(e=>e.source===block.id||e.target===block.id).flatMap(e=>[e.source,e.target])]);
        candidates=api.getSceneElements().filter(e=>related.has(e.id)&&!e.isDeleted);
      }
      if(presentation&&overviewItems.length){const all=bounds(overviewItems);if(Math.min((state.width-96)/(all.right-all.left),safeHeight/(all.bottom-all.top))>=.78)candidates=overviewItems;}
      if (!candidates.length) return;
      let area=bounds(candidates);
      const fitZoom=(area:ReturnType<typeof bounds>)=>Math.min(1,(state.width-96)/Math.max(1,area.right-area.left),safeHeight/Math.max(1,area.bottom-area.top));
      if(presentation&&fitZoom(area)<.85){
        const fallback=block&&block.kind!=='group'?block:board.blocks.filter(b=>b.kind!=='group'&&(block?.kind==='group'?b.parentId===block.id:b.storyTopic===active?.id)).at(-1);
        if(fallback){
          const related=new Set([fallback.id,...board.edges.filter(e=>e.source===fallback.id||e.target===fallback.id).flatMap(e=>[e.source,e.target])]);
          const nearby=api.getSceneElements().filter(e=>related.has(e.id)&&!e.isDeleted);
          const single=api.getSceneElements().filter(e=>e.id===fallback.id);
          candidates=nearby.length&&fitZoom(bounds(nearby))>=.85?nearby:single;
          if(candidates.length)area=bounds(candidates);
        }
      }
      const {left,top,right,bottom}=area;
      const targetZoom=request.overview?fitZoom(area):Math.max(.85,Math.min(1,(state.width-96)/Math.max(1,right-left),safeHeight/Math.max(1,bottom-top)));
      const centerY=safeTop+safeHeight/2;
      const destination = {x: state.width / (2 * targetZoom) - (left+right)/2, y: centerY / targetZoom - (top+bottom)/2};
      if (Math.hypot(destination.x - state.scrollX, destination.y - state.scrollY) * zoom < 24 && Math.abs(zoom-targetZoom)<.01) return;
      lastCameraMove.current = Date.now();
      const started = performance.now();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const move = (now: number) => {
        const progress = reduced ? 1 : Math.min(1, (now - started) / 620);
        const ease = 1 - Math.pow(1 - progress, 3);
        api.updateScene({appState: {scrollX: state.scrollX + (destination.x - state.scrollX) * ease, scrollY: state.scrollY + (destination.y - state.scrollY) * ease, zoom:{value:(zoom+(targetZoom-zoom)*ease) as AppState["zoom"]["value"]}}, captureUpdate: CaptureUpdateAction.NEVER});
        if (progress < 1) cameraFrame.current = requestAnimationFrame(move);
        else cameraFrame.current = undefined;
      };
      if (cameraFrame.current !== undefined) cancelAnimationFrame(cameraFrame.current);
      cameraFrame.current = requestAnimationFrame(move);
    }, Math.max(0, due - Date.now()));
  }, [api, store]);
  useEffect(() => () => interruptFollow(), [interruptFollow]);
  useEffect(()=>{const frame=requestAnimationFrame(()=>setSurfaceTarget(root.current?.querySelector<HTMLElement>(".excalidraw")??null));return ()=>cancelAnimationFrame(frame);},[api]);
  const focus = () => root.current?.querySelector<HTMLElement>(".excalidraw")?.focus({preventScroll: true});
  const fit = useCallback(() => {
    interruptFollow();
    if(!api)return;
    const board=store.getSnapshot().board,sceneId=board.activeSceneId;
    const ids=new Set([
      ...board.blocks.filter(block=>!sceneId||block.storyTopic===sceneId).map(block=>block.id),
      ...board.edges.filter(edge=>!sceneId||board.blocks.some(block=>block.id===edge.source&&block.storyTopic===sceneId)).map(edge=>edge.id),
    ]);
    const elements=api.getSceneElements().filter(element=>ids.has(element.id)||('containerId'in element&&!!element.containerId&&ids.has(element.containerId)));
    api.scrollToContent(elements.length?elements:undefined,{fitToViewport:true,viewportZoomFactor:hasFooter ? .82 : .9,animate:false,maxZoom:1});
  }, [api, hasFooter, interruptFollow, store]);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const pending = draft.current;
    if (!pending) return;
    draft.current = null;
    try {
      const drawing = readScene(store.getSnapshot().board, pending.elements, pending.files);
      fromNative.current = true;
      store.commit([{type: "drawing", ...drawing}]);
      store.select(draftSelection.current);
      expected.current = fingerprint(pending.elements);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "This drawing could not be saved.");
    } finally {
      fromNative.current = false;
      if (!pointer.current && !textEditing.current) store.setEditing(false);
    }
  }, [store]);
  const activateTool = (type:typeof tools[number][0]) => {
    flush();
    if(type==='arrow')api?.updateScene({appState:DIAGRAM_ARROW_TOOL,captureUpdate:CaptureUpdateAction.NEVER});
    api?.setActiveTool({type});focus();
  };
  // Also cover native shortcut entry points beyond the visible toolbar.
  useEffect(()=>{if(api&&tool==='arrow')api.updateScene({appState:DIAGRAM_ARROW_TOOL,captureUpdate:CaptureUpdateAction.NEVER});},[api,tool]);
  const history = useCallback((redo = false) => {
    flush();
    store.setEditing(false);
    if (redo) store.redo(); else store.undo();
  }, [flush, store]);
  useEffect(() => {
    if (!storageKey) return;
    let unsubscribe = () => {};
    let stopped=false, saveTimer:ReturnType<typeof setTimeout>|undefined;
    const frame = requestAnimationFrame(() => { void (async()=>{
      try {
        const current=store.getSnapshot().board;
        const saved=await migrateLegacyLocalStorage(storageKey,storage) ?? await storage.load(current.documentId);
        if(saved&&!stopped)store.replace(saved);
      } catch { if(!stopped)setError("The saved board could not be loaded. Import a saved copy or start a new board."); }
      if(stopped)return;
      setHydrated(true);
      let saved=store.getSnapshot().board,lastSnapshotRevision=saved.revision;
      unsubscribe=store.subscribe(()=>{
        const board=store.getSnapshot().board;if(board===saved)return;saved=board;
        try{localStorage.setItem(storageKey,JSON.stringify(board));}catch{setError("Browser storage is full. Export this board to keep your changes.");}
        clearTimeout(saveTimer);saveTimer=setTimeout(()=>void (async()=>{
          try{await storage.save(board);if(board.revision-lastSnapshotRevision>=10){await storage.snapshot(board);lastSnapshotRevision=board.revision;}}
          catch{setError("Browser storage is full. Export this board to keep your changes.");}
        })(),180);
      });
    })(); });
    return () => {stopped=true;cancelAnimationFrame(frame);clearTimeout(saveTimer);unsubscribe();};
  }, [store, storageKey, storage]);
  useEffect(() => {
    if (!api) return;
    let previous: Board | null = null;
    let previousSelection: string[] = [];
    const sync = () => {
      const board = store.getSnapshot().board;
      const selected = store.getSnapshot().selection;
      const activeTopic=board.story?.activeTopic ? board.story.topics[board.story.activeTopic] : undefined;
      const presentation=activeTopic?.view==='presentation';
      const focusChanged=!!activeTopic && previous?.story?.focusConcept!==board.story?.focusConcept;
      const focusBlock=focusChanged?board.blocks.find(b=>b.storyTopic===activeTopic?.id && b.storyConcept===board.story?.focusConcept):undefined;
      const sceneChanged=!!previous&&previous.activeSceneId!==board.activeSceneId;
      const overview=sceneChanged||(focusChanged && !!previous?.story?.focusConcept && !board.story?.focusConcept);
      const added = previous ? board.blocks.filter(b => (presentation || ['step','screen','decision','note'].includes(b.kind)) && !previous!.blocks.some(old => old.id === b.id)) : [];
      const initialScene = previous === null;
      if (!board.blocks.length) interruptFollow();
      if (fromNative.current) {previous = board; previousSelection = selected; if (added.length) followNewBox(added[added.length - 1].id); return;}
      const currentSelection = Object.keys(api.getAppState().selectedElementIds).filter(id => api.getAppState().selectedElementIds[id]);
      if (canonical(selected) !== canonical(previousSelection) && !pointer.current && !textEditing.current && canonical([...selected].sort()) !== canonical(currentSelection.sort()))
        api.updateScene({appState: {selectedElementIds: Object.fromEntries(selected.map(id => [id, true]))}, captureUpdate: CaptureUpdateAction.NEVER});
      previousSelection = selected;
      // Speech context can arrive mid-gesture without a transaction. Never
      // reconcile an older saved drawing over a native drag or pending commit.
      if (pointer.current || textEditing.current || draft.current) return;
      if (board === previous) return;
      previous = board;
      if (fromNative.current) return;
      const scene = renderScene(board);
      const currentElements = new Map(api.getSceneElements().map(e => [e.id, e]));
      scene.elements = scene.elements.map(element => {
        const current = currentElements.get(element.id);
        if (!current || fingerprint([element]) === fingerprint([current])) return element;
        return {...element, version: Math.max(element.version, current.version + 1), versionNonce: (current.versionNonce + 1) % 2147483647};
      });
      expected.current = fingerprint(scene.elements);
      awaitingScene.current = scene.elements.filter(e => !e.isDeleted).map(e => e.id).sort();
      api.addFiles(Object.values(scene.files));
      api.updateScene({elements: scene.elements, appState:{frameRendering:{enabled:true,name:true,outline:false,clip:true}}, captureUpdate: CaptureUpdateAction.NEVER});
      if (initialScene) requestAnimationFrame(() => api.scrollToContent(undefined, {fitToViewport: true, viewportZoomFactor: hasFooter ? .82 : .9, animate: false, maxZoom: 1}));
      else if(overview) followNewBox('',true);
      else if(focusBlock) followNewBox(focusBlock.id);
      else if (added.length) followNewBox(added[added.length - 1].id);
    };
    sync();
    const unsubscribe = store.subscribe(sync);
    for (const name of ["undo", "redo"] as const) api.registerAction({
      name, label: name === "undo" ? "Undo" : "Redo", trackEvent: false,
      perform: () => {history(name === "redo"); return false;},
      keyTest: () => false,
    });
    return unsubscribe;
  }, [api, store, history, hasFooter, followNewBox, interruptFollow]);
  useEffect(() => { if (fitRequest) fit(); }, [fitRequest, fit]);
  useEffect(()=>{
    if(!activeScene||activeScene.kind==='story'||requestedLayouts.current.get(activeScene.id)===activeScene.layoutRevision)return;
    clearTimeout(semanticLayoutTimer.current);
    semanticLayoutTimer.current=setTimeout(()=>{
      const request={...activeScene,nodes:structuredClone(activeScene.nodes),relations:structuredClone(activeScene.relations)};
      requestedLayouts.current.set(request.id,request.layoutRevision);
      void layoutSemanticScene(request).then(result=>{
        const current=store.getSnapshot().board.scenes.find(scene=>scene.id===result.sceneId);
        if(current?.layoutRevision===result.layoutRevision)store.applySceneLayout(result);
      }).catch((error)=>setError(`This scene could not be organized: ${error instanceof Error?error.message:'layout worker failed'}. Your current layout is unchanged.`));
    },80);
    return()=>clearTimeout(semanticLayoutTimer.current);
  },[activeScene,store]);
  useEffect(() => () => { clearTimeout(timer.current); flush(); store.setEditing(false); }, [store, flush]);
  const change = (elements: readonly DrawingElement[], state: AppState, files: BinaryFiles) => {
    if (!api) return;
    if (awaitingScene.current) {
      const ids = elements.filter(e => !e.isDeleted).map(e => e.id).sort();
      if (canonical(ids) !== canonical(awaitingScene.current)) return;
      awaitingScene.current = null;
      expected.current = fingerprint(elements);
    }
    if (state.activeTool.type !== tool) setTool(state.activeTool.type);
    textEditing.current = !!state.editingTextElement || !!state.editingFrame;
    const editing = pointer.current || textEditing.current;
    if (editing && !store.getSnapshot().editing) store.setEditing(true);
    const selected = [...new Set(Object.keys(state.selectedElementIds).filter(id => state.selectedElementIds[id]).map(id => {
      const element = elements.find(e => e.id === id);
      return element?.type === "text" && element.containerId ? element.containerId : id;
    }))];
    draftSelection.current = selected;
    const currentBoard = store.getSnapshot().board;
    if (selected.every(id => currentBoard.blocks.some(b => b.id === id) || currentBoard.edges.some(e => e.id === id))) store.select(selected);
    if (!editable || fingerprint(elements) === expected.current) {
      if (!editing && !draft.current && store.getSnapshot().editing) store.setEditing(false);
      return;
    }
    draft.current = {elements, files};
    if (!store.getSnapshot().editing) store.setEditing(true);
    clearTimeout(timer.current);
    if (!editing) timer.current = setTimeout(flush, 100);
  };
  const download = (includeTranscript=false) => {
    flush();
    const url = URL.createObjectURL(new Blob([serializeBoard(store.getSnapshot().board,includeTranscript)], {type: "application/json"}));
    const a = document.createElement("a"); a.href = url; a.download = includeTranscript?"sprig-board-with-transcript.json":"sprig-board.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const activateScene=(id:string)=>{flush();store.semantic([{type:"activateScene",id}]);setSceneMenuOpen(false);};
  const adjacentScene=(offset:number)=>{
    if(!activeScene)return;const scenes=[...snapshot.board.scenes].sort((a,b)=>a.order-b.order),index=scenes.findIndex(scene=>scene.id===activeScene.id),next=scenes[index+offset];
    if(next)activateScene(next.id);
  };
  const changeSceneKind=(kind:SceneKind)=>{if(!activeScene)return;flush();store.semantic([{type:"changeSceneKind",id:activeScene.id,kind}]);setSceneMenuOpen(false);};
  const addNote = () => {
    flush(); const board = store.getSnapshot().board;
    store.commit([{type: "add", block: makeBlock("note", "New note", availablePosition(board))}]);
    focus();
  };
  return <div ref={root} className={`cv-editor cv-native-editor ${className}`} role="region" aria-label="Canvas board" data-presenting={presenting||undefined} data-presentation={snapshot.board.story?.activeTopic && snapshot.board.story.topics[snapshot.board.story.activeTopic]?.view === "presentation" || undefined}
    onPointerDownCapture={event=>{if((event.target as HTMLElement).closest('.cv-native-stage'))interruptFollow();}}
    onWheelCapture={event => {if((event.target as HTMLElement).closest('.cv-native-stage'))interruptFollow(); if ((!editable || preservePageScroll) && !event.ctrlKey && !event.metaKey) event.stopPropagation();}}
    onKeyDownCapture={event => {
      const target = event.target as HTMLElement;
      if(event.key==='Escape'&&notesOpen&&(!target.closest('[data-canvas-overlay]')||notesPanel.current?.contains(target))){event.preventDefault();event.stopPropagation();setNotesOpen(false);return;}
      if(event.key==='Escape'&&presenting&&!target.closest('[data-canvas-overlay]')){event.preventDefault();event.stopPropagation();setPresenting(false);return;}
      if (target.matches("input,textarea,select,[contenteditable=true]") || target.closest("[data-canvas-overlay],.cv-editor-footer,.cv-native-topbar,.cv-native-menu")) return;
      interruptFollow();
      if (!pointer.current && !textEditing.current) flush();
      if(editable&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='a'){
        event.preventDefault();event.stopPropagation();activateTool('arrow');return;
      }
      if (editable && event.key === "9" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); event.stopPropagation(); imageInput.current?.click(); return;
      }
      if (editable && (event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) {
        event.preventDefault(); event.stopPropagation(); history(event.shiftKey || event.key.toLowerCase() === "y");
      }
    }}>
    <div className="cv-native-stage" style={{'--cv-grid-size':`${20*view.zoom}px`,'--cv-grid-x':`${view.scrollX*view.zoom}px`,'--cv-grid-y':`${view.scrollY*view.zoom}px`} as React.CSSProperties} data-scroll-x={view.scrollX} data-scroll-y={view.scrollY} data-zoom={view.zoom}>
      {hydrated && <Excalidraw excalidrawAPI={setAPI} initialData={() => ({...renderScene(store.getSnapshot().board), scrollToContent: true,
        appState: {viewBackgroundColor: "transparent", currentItemFontFamily: 3, currentItemFontSize: 14,
          ...DIAGRAM_ARROW_TOOL,currentItemBackgroundColor:NEO.yellow}})}
        viewModeEnabled={!editable||presenting} theme="light" gridModeEnabled={false} aiEnabled={false} autoFocus={false} handleKeyboardGlobally={false}
        UIOptions={{canvasActions: {changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false}}}
        onChange={change}
        onPointerDown={() => {pointer.current = true; store.setEditing(true);}}
        onPointerUp={() => {pointer.current = false; clearTimeout(timer.current); timer.current = setTimeout(() => {if (!textEditing.current) {flush(); store.setEditing(false);}}, 0);}}
        onScrollChange={(scrollX, scrollY, zoom) => setView(previous => previous.scrollX === scrollX && previous.scrollY === scrollY && previous.zoom === zoom.value ? previous : {scrollX, scrollY, zoom: zoom.value})}>
        <MainMenu />
        <WelcomeScreen />
      </Excalidraw>}
      <div className="cv-native-arrivals" aria-live="polite">
        {Object.entries(snapshot.arrivals).map(([id, time]) => {
          const b = snapshot.board.blocks.find(b => b.id === id);
          if (!b || b.kind === "group") return null;
          const at = absolutePosition(b, snapshot.board);
          return <Arrival key={`${id}:${time}`} time={time} label={b.label}
            style={{left: (at.x + view.scrollX) * view.zoom, top: (at.y + view.scrollY) * view.zoom,
              width: b.width, height: b.height, transform: `scale(${view.zoom})`}} />;
        })}
      </div>
    </div>
    {snapshot.board.story?.activeTopic && snapshot.board.story.topics[snapshot.board.story.activeTopic]?.view==='presentation' && <h1 className="cv-presentation-heading">{snapshot.board.story.topics[snapshot.board.story.activeTopic].label}</h1>}
    {api && surfaceTarget && <NativeSurfaces api={api} store={store} target={surfaceTarget}/>}
    <div className="cv-board-outline" data-board-revision={snapshot.board.revision}>
      <ol aria-label="Board objects">{snapshot.board.blocks.map(b => <li key={b.id} data-board-object={b.id} data-kind={b.kind}>
        <button type="button" onClick={() => {store.select([b.id]); api?.scrollToContent(b.id, {animate:false}); focus();}}>{b.label || `Untitled ${b.kind}`}</button>
        {b.detail && <span>{b.detail}</span>}{b.outcome && b.outcome !== "neutral" && <span>{b.outcome}</span>}{b.tentative && <span>Unresolved</span>}
      </li>)}</ol>
      <ul aria-label="Board connections">{snapshot.board.edges.map(edge => <li key={edge.id}>{snapshot.board.blocks.find(b => b.id === edge.source)?.label} → {snapshot.board.blocks.find(b => b.id === edge.target)?.label}{edge.label ? `: ${edge.label}` : ""}</li>)}</ul>
    </div>
    {notesOpen&&<div ref={notesPanel} className="cv-presentation-notes" role="dialog" aria-label="Supporting details" data-canvas-overlay tabIndex={-1}>
      <header><strong>Supporting details</strong><button type="button" aria-label="Close supporting details" onClick={()=>setNotesOpen(false)}><XIcon size={18}/></button></header>
      {activeScene&&<p className="cv-notes-scene">{activeScene.title} · {sceneLabel(activeScene.kind)}</p>}
      {noteItems.length?noteItems.map(b=><section key={b.id}><button type="button" onClick={()=>{store.select([b.id]);api?.scrollToContent(b.id,{animate:false});setNotesOpen(false);}}><h2>{b.label}</h2></button><p>{b.detail}</p></section>):<p>No additional details yet. Keep explaining your idea.</p>}
      {!!sceneTranscript.length&&<section className="cv-scene-transcript"><h2>Transcript</h2>{sceneTranscript.map(segment=><article key={segment.id}><p>{segment.text}</p><button type="button" onClick={()=>{const noteId=uid('note');store.semantic([{type:'upsertNode',sceneId:activeScene!.id,node:{id:noteId,label:'Transcript note',detail:segment.text,role:'note',evidence:[segment.id]}}]);setNotesOpen(false);}}>Add to canvas</button></article>)}</section>}
    </div>}
    {activeScene&&<nav className="cv-scene-navigator" aria-label="Diagram scenes" data-canvas-overlay>
      <button type="button" aria-label="Previous scene" disabled={activeScene.order===0} onClick={()=>adjacentScene(-1)}><CaretLeftIcon size={16}/></button>
      <button type="button" className="cv-scene-current" aria-label="Choose scene" aria-expanded={sceneMenuOpen} onClick={()=>setSceneMenuOpen(value=>!value)}>
        <SquaresFourIcon size={15}/><span><strong>{activeScene.title}</strong><small>{sceneLabel(activeScene.kind)} · {activeScene.maturity.replace('_',' ')}</small></span>
        {!!sceneIssues.length&&<span className="cv-scene-issue" aria-label={`${sceneIssues.length} scene issue${sceneIssues.length===1?'':'s'}`}><WarningCircleIcon size={14}/>{sceneIssues.length}</span>}
      </button>
      <button type="button" aria-label="Next scene" disabled={activeScene.order===snapshot.board.scenes.length-1} onClick={()=>adjacentScene(1)}><CaretRightIcon size={16}/></button>
      {sceneMenuOpen&&<div className="cv-scene-menu">
        <strong>Scenes</strong>
        <ol>{[...snapshot.board.scenes].sort((a,b)=>a.order-b.order).map(scene=><li key={scene.id}><button type="button" aria-current={scene.id===activeScene.id?'page':undefined} onClick={()=>activateScene(scene.id)}><span>{scene.title}</span><small>{sceneLabel(scene.kind)}</small></button></li>)}</ol>
        {editable&&<>
          <form onSubmit={event=>{event.preventDefault();const title=String(new FormData(event.currentTarget).get('scene-title')??'').trim();if(title)store.semantic([{type:'renameScene',id:activeScene.id,title}]);setSceneMenuOpen(false);}}>
            <label htmlFor="scene-title">Scene title</label><div><input id="scene-title" name="scene-title" defaultValue={activeScene.title} maxLength={200}/><button type="submit">Rename</button></div>
          </form>
          <fieldset><legend>Scene type</legend><div>{(['story','flow','system','hierarchy','comparison'] as SceneKind[]).map(kind=><button type="button" key={kind} aria-pressed={activeScene.kind===kind} onClick={()=>changeSceneKind(kind)}>{sceneLabel(kind)}{!['story','flow'].includes(kind)&&<small>Experimental</small>}</button>)}</div></fieldset>
          <div className="cv-scene-actions">
            <button type="button" onClick={()=>{store.semantic([{type:'organizeScene',id:activeScene.id}]);setSceneMenuOpen(false);}}>Organize scene</button>
            <button type="button" onClick={()=>{store.semantic([{type:'duplicateScene',id:activeScene.id,newId:uid('scene')}]);setSceneMenuOpen(false);}}>Duplicate</button>
            <button type="button" disabled={snapshot.board.scenes.length===1} onClick={()=>{if(confirm(`Delete ${activeScene.title}?`)){store.semantic([{type:'deleteScene',id:activeScene.id}]);setSceneMenuOpen(false);}}}>Delete</button>
          </div>
        </>}
      </div>}
    </nav>}
    <div className="cv-native-topbar">
      <button className="cv-native-button" type="button" aria-label="Open canvas tools" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><DotsThreeIcon size={20} /></button>
      {editable && <div className="cv-native-toolbar" role="toolbar" aria-label="Drawing tools">
        {tools.map(([type, label, shortcut, Icon]) => <button type="button" key={type} aria-label={`${label} (${shortcut})`} title={`${label} (${shortcut})`} aria-pressed={tool === type}
          disabled={!api} onClick={() => activateTool(type)}><Icon size={18} /></button>)}
        <button type="button" aria-label="Add note" title="Add note" onClick={addNote}><NoteIcon size={18} /></button>
        <button type="button" aria-label="Add image (9)" title="Add image (9)" onClick={()=>imageInput.current?.click()}><ImageIcon size={18}/></button>
      </div>}
      {(editable || snapshot.board.blocks.length > 0) && <div className="cv-native-history">
        {editable && <><button type="button" aria-label="Undo" title="Undo (⌘Z / Ctrl+Z)" disabled={!snapshot.canUndo} onClick={() => {history(); focus();}}><ArrowCounterClockwiseIcon size={17}/></button>
        <button type="button" aria-label="Redo" title="Redo (⇧⌘Z / Ctrl+Shift+Z)" disabled={!snapshot.canRedo} onClick={() => {history(true); focus();}}><ArrowClockwiseIcon size={17}/></button></>}
        <button type="button" className="cv-presenter-button" aria-label={presenting?'Return to editing':'Present view'} aria-pressed={presenting} onClick={()=>{flush();api?.updateScene({appState:{selectedElementIds:{}},captureUpdate:CaptureUpdateAction.NEVER});setMenuOpen(false);setPresenting(!presenting);}}>{presenting?'Edit':'Present'}</button>
        <button type="button" className="cv-presenter-button" aria-label="Supporting details" aria-expanded={notesOpen} onClick={()=>setNotesOpen(!notesOpen)}>Notes</button>
        <button type="button" aria-label="Fit view" title="Fit view" onClick={() => fit()}><FrameCornersIcon size={17}/></button>
      </div>}
    </div>
    {menuOpen && <div className="cv-native-menu" onClick={e => {if ((e.target as HTMLElement).closest("button") && !(e.target as HTMLElement).closest("details")) setMenuOpen(false);}}>
      {editable && <div className="cv-menu-section">
        <button type="button" onClick={()=>{if(confirm('Reflow every scene? Manual placement will be unlocked.'))store.semantic([{type:'reflowAll'}]);}}>Reflow everything</button>
        <button type="button" onClick={()=>download(false)}>Export board</button>
        <button type="button" onClick={()=>download(true)}>Export with transcript</button>
        <button type="button" onClick={() => fileInput.current?.click()}>Import board</button>
        <button type="button" onClick={() => {flush(); onReset?.(); store.replace(createBoard(), true);}}>New board</button>
      </div>}
      {menu}
      <details className="cv-help"><summary>Keyboard shortcuts</summary><p>V select · R rectangle · D decision · O ellipse · A arrow · P draw · T text · H hand</p><p>Space + drag to pan. Double-click a shape to edit its text. Shift-click to select more. ⌘/Ctrl+C, V and D copy, paste and duplicate. ⌘/Ctrl+G groups; Shift+⌘/Ctrl+G ungroups. Delete removes the selection.</p><p>Drawing powered by Excalidraw (MIT). Mascot by Bloub.</p></details>
    </div>}
    {footer && <div className="cv-editor-footer">{footer}</div>}
    {error && <div role="alert" className="cv-native-error">{error}</div>}
    <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async event=>{
      const file=event.target.files?.[0]; event.target.value=""; if(!file) return;
      const revision=store.getSnapshot().board.revision;
      try {
        if(file.size>2000000 || !["image/png","image/jpeg","image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP under 2 MB.");
        const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read the image."));reader.readAsDataURL(file);});
        const dimensions=await new Promise<{width:number;height:number}>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>reject(new Error("Could not decode the image."));img.src=data;});
        if(store.getSnapshot().board.revision!==revision) throw new Error("The board changed while the image loaded. Add it again.");
        const width=280,height=Math.max(40,Math.min(600,width*dimensions.height/dimensions.width));
        store.commit([{type:"add",block:makeBlock("image",file.name,availablePosition(store.getSnapshot().board,width,height),{width,height,image:data})}]);
        setError("");fit();
      } catch(err){setError(err instanceof Error?err.message:"Could not add the image.");}
    }}/>
    <input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
      try {if (file.size > 12000000) throw new Error("Board exceeds 12 MB."); const board = parseBoardFile(await file.text()); flush(); onReset?.(); store.replace(board, true);}
      catch (err) {setError(err instanceof Error ? err.message : "Could not import this board.");}
    }}/>
  </div>;
}
function Arrival({time, label, style}: {time: number; label: string; style: React.CSSProperties}) {
  const [visible, setVisible] = useState(() => Date.now() - time < 1800);
  useEffect(() => {const timer = setTimeout(() => setVisible(false), Math.max(0, time + 1800 - Date.now())); return () => clearTimeout(timer);}, [time]);
  if (!visible) return null;
  return <div className="cv-native-arrival" style={style} role="status" aria-label={`Adding ${label}`}>
    <div className="cv-card-placeholder cv-native-loading"><span className="cv-card-placeholder-line"/><span className="cv-card-placeholder-line"/><span className="cv-card-placeholder-caption">Adding…</span></div>
  </div>;
}
