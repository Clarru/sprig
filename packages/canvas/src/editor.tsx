"use client";
import { lazy, Suspense, useSyncExternalStore, type ReactNode } from "react";
import type { BoardStore } from "./store";
import type { Board } from "./model";
import type { BoardStorageAdapter } from "./storage";
const NativeEditor = lazy(() => import("./native/editor"));
const subscribe = () => () => {};
export interface CanvasEditorProps {
  store?: BoardStore;
  initialBoard?: Board;
  fitRequest?: number;
  editable?: boolean;
  preservePageScroll?: boolean;
  storageKey?: string;
  storageAdapter?: BoardStorageAdapter;
  footer?: ReactNode;
  menu?: ReactNode;
  onReset?: () => void;
  className?: string;
}
/** The native engine loads only for an editor, never for an independent mascot or badge. */
export function CanvasEditor(props: CanvasEditorProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const fallback = <div className="cv-editor" aria-label="Loading canvas"/>;
  return mounted ? <Suspense fallback={fallback}><NativeEditor {...props}/></Suspense> : fallback;
}
export function DiagramViewer({board}: {board: Board}) {
  return <CanvasEditor key={JSON.stringify(board)} initialBoard={board} editable={false}/>;
}
