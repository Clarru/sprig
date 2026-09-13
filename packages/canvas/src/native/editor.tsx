"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Excalidraw, CaptureUpdateAction, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { CursorIcon, RectangleIcon, DiamondIcon, CircleIcon, ArrowRightIcon, PencilSimpleIcon, TextTIcon,
  HandIcon, ImageIcon, DotsThreeIcon, ArrowCounterClockwiseIcon, ArrowClockwiseIcon, FrameCornersIcon, NoteIcon } from "@phosphor-icons/react";
import { BoardStore } from "../store";
import { absolutePosition, availablePosition, emptyBoard, layoutOperations, makeBlock, parseBoard, type Board } from "../model";
import type { CanvasEditorProps } from "../editor";
import { NativeSurfaces } from "./surfaces";
import { readScene, type DrawingElement } from "./scene";
import { renderScene } from "./render";
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
export default function NativeEditor({store: provided, initialBoard, editable = true, storageKey, footer, menu, onReset, fitRequest = 0, className = ""}: CanvasEditorProps) {
  const [own] = useState(() => new BoardStore(initialBoard));
  const store = provided ?? own;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [api, setAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [tool, setTool] = useState("selection");
  const [surfaceTarget, setSurfaceTarget] = useState<HTMLElement|null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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
  const cameraTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cameraFrame = useRef<number | undefined>(undefined);
  const cameraTarget = useRef<string | null>(null);
  const queuedAt = useRef<number | null>(null);
  const lastCameraMove = useRef(0);
  const manualCameraUntil = useRef(0);
  const interruptFollow = useCallback(() => {
    clearTimeout(cameraTimer.current);
    if (cameraFrame.current !== undefined) cancelAnimationFrame(cameraFrame.current);
    cameraTarget.current = null; queuedAt.current = null;
    manualCameraUntil.current = Date.now() + 1000;
  }, []);
  const followNewBox = useCallback((id: string) => {
    cameraTarget.current = id;
    queuedAt.current ??= Date.now();
    clearTimeout(cameraTimer.current);
    const due = Math.max(lastCameraMove.current + 1200, manualCameraUntil.current, Math.min(Date.now() + 350, queuedAt.current + 900));
    cameraTimer.current = setTimeout(() => {
      const targetId = cameraTarget.current;
      cameraTarget.current = null; queuedAt.current = null;
      if (!api || !targetId || pointer.current || textEditing.current || store.getSnapshot().editing) return;
      const target = api.getSceneElements().find(e => e.id === targetId);
      if (!target) return;
      const state = api.getAppState(), zoom = state.zoom.value;
      const destination = {x: state.width / (2 * zoom) - target.x - target.width / 2, y: state.height / (2 * zoom) - target.y - target.height / 2};
      if (Math.hypot(destination.x - state.scrollX, destination.y - state.scrollY) * zoom < 24) return;
      lastCameraMove.current = Date.now();
      const started = performance.now();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const move = (now: number) => {
        const progress = reduced ? 1 : Math.min(1, (now - started) / 620);
        const ease = 1 - Math.pow(1 - progress, 3);
        api.updateScene({appState: {scrollX: state.scrollX + (destination.x - state.scrollX) * ease, scrollY: state.scrollY + (destination.y - state.scrollY) * ease}, captureUpdate: CaptureUpdateAction.NEVER});
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
  const fit = useCallback(() => api?.scrollToContent(undefined, {fitToViewport: true, viewportZoomFactor: hasFooter ? .82 : .9, animate: false, maxZoom: 1}), [api, hasFooter]);
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
    } finally { fromNative.current = false; }
  }, [store]);
  const history = useCallback((redo = false) => {
    flush();
    store.setEditing(false);
    if (redo) store.redo(); else store.undo();
  }, [flush, store]);
  useEffect(() => {
    if (!storageKey) return;
    let unsubscribe = () => {};
    const frame = requestAnimationFrame(() => {
      try { const saved = localStorage.getItem(storageKey); if (saved) store.replace(parseBoard(saved)); }
      catch { setError("The saved board could not be loaded. Import a saved copy or start a new board."); }
      setHydrated(true);
      let saved = store.getSnapshot().board;
      unsubscribe = store.subscribe(() => {
        const board = store.getSnapshot().board;
        if (board === saved) return;
        saved = board;
        try { localStorage.setItem(storageKey, JSON.stringify(board)); }
        catch { setError("Browser storage is full. Download this board to keep your changes."); }
      });
    });
    return () => { cancelAnimationFrame(frame); unsubscribe(); };
  }, [store, storageKey]);
  useEffect(() => {
    if (!api) return;
    let previous: Board | null = null;
    let previousSelection: string[] = [];
    const sync = () => {
      const board = store.getSnapshot().board;
      const selected = store.getSnapshot().selection;
      const added = previous ? board.blocks.filter(b => ['step','screen','decision','note'].includes(b.kind) && !previous!.blocks.some(old => old.id === b.id)) : [];
      const initialScene = previous === null;
      if (!board.blocks.length) interruptFollow();
      if (fromNative.current) {previous = board; previousSelection = selected; if (added.length) followNewBox(added[added.length - 1].id); return;}
      const currentSelection = Object.keys(api.getAppState().selectedElementIds).filter(id => api.getAppState().selectedElementIds[id]);
      if (canonical(selected) !== canonical(previousSelection) && !pointer.current && !textEditing.current && canonical([...selected].sort()) !== canonical(currentSelection.sort()))
        api.updateScene({appState: {selectedElementIds: Object.fromEntries(selected.map(id => [id, true]))}, captureUpdate: CaptureUpdateAction.NEVER});
      previousSelection = selected;
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
      api.updateScene({elements: scene.elements, captureUpdate: CaptureUpdateAction.NEVER});
      if (initialScene) requestAnimationFrame(() => api.scrollToContent(undefined, {fitToViewport: true, viewportZoomFactor: hasFooter ? .82 : .9, animate: false, maxZoom: 1}));
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
    textEditing.current = !!state.editingTextElement;
    const editing = pointer.current || textEditing.current;
    if (store.getSnapshot().editing !== editing) store.setEditing(editing);
    const selected = [...new Set(Object.keys(state.selectedElementIds).filter(id => state.selectedElementIds[id]).map(id => {
      const element = elements.find(e => e.id === id);
      return element?.type === "text" && element.containerId ? element.containerId : id;
    }))];
    draftSelection.current = selected;
    const currentBoard = store.getSnapshot().board;
    if (selected.every(id => currentBoard.blocks.some(b => b.id === id) || currentBoard.edges.some(e => e.id === id))) store.select(selected);
    if (!editable || fingerprint(elements) === expected.current) return;
    draft.current = {elements, files};
    clearTimeout(timer.current);
    if (!editing) timer.current = setTimeout(flush, 100);
  };
  const download = () => {
    flush();
    const url = URL.createObjectURL(new Blob([JSON.stringify(store.getSnapshot().board, null, 2)], {type: "application/json"}));
    const a = document.createElement("a"); a.href = url; a.download = "sprig-board.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const addNote = () => {
    flush(); const board = store.getSnapshot().board;
    store.commit([{type: "add", block: makeBlock("note", "New note", availablePosition(board))}]);
    focus();
  };
  return <div ref={root} className={`cv-editor cv-native-editor ${className}`} role="region" aria-label="Canvas board"
    onPointerDownCapture={interruptFollow}
    onWheelCapture={event => {interruptFollow(); if (!editable && !event.ctrlKey && !event.metaKey) event.stopPropagation();}}
    onKeyDownCapture={event => {
      interruptFollow();
      const target = event.target as HTMLElement;
      if (target.matches("input,textarea,select,[contenteditable=true]")) return;
      if (!pointer.current && !textEditing.current) flush();
      if (editable && event.key === "9" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); event.stopPropagation(); imageInput.current?.click(); return;
      }
      if (editable && (event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) {
        event.preventDefault(); event.stopPropagation(); history(event.shiftKey || event.key.toLowerCase() === "y");
      }
    }}>
    <div className="cv-native-stage" data-scroll-x={view.scrollX} data-scroll-y={view.scrollY} data-zoom={view.zoom}>
      {hydrated && <Excalidraw excalidrawAPI={setAPI} initialData={() => ({...renderScene(store.getSnapshot().board), scrollToContent: true,
        appState: {viewBackgroundColor: "#ffffff", currentItemFontFamily: 2, currentItemFontSize: 20, currentItemRoughness: 0,
          currentItemStrokeColor: "#414741", currentItemBackgroundColor: "transparent", currentItemFillStyle: "solid", currentItemStrokeWidth: 1, currentItemRoundness: "sharp"}})}
        viewModeEnabled={!editable} theme="light" gridModeEnabled={false} aiEnabled={false} autoFocus={false} handleKeyboardGlobally={false}
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
    {api && surfaceTarget && <NativeSurfaces api={api} store={store} target={surfaceTarget}/>}
    <div className="cv-board-outline" data-board-revision={snapshot.board.revision}>
      <ol aria-label="Board objects">{snapshot.board.blocks.map(b => <li key={b.id} data-board-object={b.id} data-kind={b.kind}>
        <button type="button" onClick={() => {store.select([b.id]); api?.scrollToContent(b.id, {animate:false}); focus();}}>{b.label || `Untitled ${b.kind}`}</button>
        {b.detail && <span>{b.detail}</span>}{b.outcome && b.outcome !== "neutral" && <span>{b.outcome}</span>}{b.tentative && <span>Unresolved</span>}
      </li>)}</ol>
      <ul aria-label="Board connections">{snapshot.board.edges.map(edge => <li key={edge.id}>{snapshot.board.blocks.find(b => b.id === edge.source)?.label} → {snapshot.board.blocks.find(b => b.id === edge.target)?.label}{edge.label ? `: ${edge.label}` : ""}</li>)}</ul>
    </div>
    <div className="cv-native-topbar">
      <button className="cv-native-button" type="button" aria-label="Open canvas tools" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><DotsThreeIcon size={20} /></button>
      {editable && <div className="cv-native-toolbar" role="toolbar" aria-label="Drawing tools">
        {tools.map(([type, label, shortcut, Icon]) => <button type="button" key={type} aria-label={`${label} (${shortcut})`} title={`${label} (${shortcut})`} aria-pressed={tool === type}
          onClick={() => {flush(); api?.setActiveTool({type}); focus();}}><Icon size={18} /></button>)}
        <button type="button" aria-label="Add note" title="Add note" onClick={addNote}><NoteIcon size={18} /></button>
        <button type="button" aria-label="Add image (9)" title="Add image (9)" onClick={()=>imageInput.current?.click()}><ImageIcon size={18}/></button>
      </div>}
      {(editable || snapshot.board.blocks.length > 0) && <div className="cv-native-history">
        {editable && <><button type="button" aria-label="Undo" title="Undo (⌘Z / Ctrl+Z)" disabled={!snapshot.canUndo} onClick={() => {history(); focus();}}><ArrowCounterClockwiseIcon size={17}/></button>
        <button type="button" aria-label="Redo" title="Redo (⇧⌘Z / Ctrl+Shift+Z)" disabled={!snapshot.canRedo} onClick={() => {history(true); focus();}}><ArrowClockwiseIcon size={17}/></button></>}
        <button type="button" aria-label="Fit view" title="Fit view" onClick={() => fit()}><FrameCornersIcon size={17}/></button>
      </div>}
    </div>
    {menuOpen && <div className="cv-native-menu" onClick={e => {if ((e.target as HTMLElement).closest("button") && !(e.target as HTMLElement).closest("details")) setMenuOpen(false);}}>
      {editable && <div className="cv-menu-section">
        <button type="button" onClick={() => {flush(); store.commit(layoutOperations(store.getSnapshot().board));}}>Arrange board</button>
        <button type="button" onClick={download}>Export board</button>
        <button type="button" onClick={() => fileInput.current?.click()}>Import board</button>
        <button type="button" onClick={() => {flush(); onReset?.(); store.replace(emptyBoard(), true);}}>New board</button>
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
      try {if (file.size > 12000000) throw new Error("Board exceeds 12 MB."); const board = parseBoard(await file.text()); flush(); onReset?.(); store.replace(board, true);}
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
