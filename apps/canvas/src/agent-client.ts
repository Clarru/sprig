import { TransactionSchema, type BoardStore } from "@clarru/sprig";
import type { DebugStore } from "./debug-store";
/** A local-only control socket. Opening it never opens the microphone or contacts an AI provider. */
export function connectAgent(store: BoardStore, debug: DebugStore) {
  let stopped = false, socket: WebSocket | undefined, unsubscribe = () => {};
  const context = () => {const {board,selection,editing,canUndo,historyEpoch} = store.getSnapshot(); return {board,selection,editing,canUndo,historyEpoch};};
  const send = (message: unknown) => {if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));};
  void fetch("/api/bootstrap").then(r => {if (!r.ok) throw new Error("Server unavailable"); return r.json();}).then(config => {
    if (stopped) return;
    socket = new WebSocket(`${location.origin.replace(/^http/,"ws")}/api/control?token=${encodeURIComponent(config.token)}`);
    socket.onopen = () => {send({type:"register",context:context()}); unsubscribe = store.subscribe(() => send({type:"context",context:context()}));};
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "registered") {debug.patch({agentId: message.id}); return;}
        if (message.type !== "apply") return;
        let applied = false, error = "";
        try {
          const current = store.getSnapshot();
          if (Date.now() > message.expiresAt || current.editing || current.board.revision !== message.baseRevision) throw new Error("The board changed or this edit expired.");
          if (message.update.transaction) store.apply(TransactionSchema.parse(message.update.transaction));
          else if (message.update.history === "undo") store.undo();
          else if (message.update.history === "redo") store.redo();
          applied = true;
          debug.event("agent-edit", message.update.message ?? "Local agent updated the board.");
        } catch (err) {error = err instanceof Error ? err.message : "Invalid edit";}
        send({type:"ack",requestId:message.requestId,applied,error,context:context()});
      } catch {debug.event("agent-error", "The local agent sent an invalid message.");}
    };
    socket.onclose = () => {unsubscribe(); debug.patch({agentId:null});};
    socket.onerror = () => debug.event("agent-connection", "Local agent connection stopped. Reload to reconnect.");
  }).catch(() => debug.event("agent-connection", "Local agent connection unavailable. Reload after starting the server."));
  return () => {stopped = true; unsubscribe(); socket?.close(); debug.patch({agentId:null});};
}
