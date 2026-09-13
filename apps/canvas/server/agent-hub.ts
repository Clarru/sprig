import { z } from "zod";
import { randomUUID } from "node:crypto";
import { AgentActionSchema, prepareAgentAction, type PreparedAction } from "@clarru/sprig/agent";
import { describeBoard } from "@clarru/sprig/script";
import { ContextSchema, type Context } from "./session";
export const AgentRequestSchema = z.object({
  requestId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  baseRevision: z.number().int().nonnegative(),
  action: AgentActionSchema,
}).strict();
export class AgentError extends Error { constructor(public status: number, message: string) {super(message);} }
interface Peer {
  context: Context;
  send: (message: unknown) => void;
  pending?: {id: string; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>};
  requests: Map<string, {body: string; result: Promise<unknown>}>;
}
/** The running browser is the authority; an HTTP response requires its acknowledgement. */
export class AgentHub {
  private peers = new Map<string, Peer>();
  connect(context: Context, send: Peer["send"]) {
    const id = randomUUID();
    this.peers.set(id, {context: ContextSchema.parse(context), send, requests: new Map()});
    return id;
  }
  disconnect(id: string) {
    const peer = this.peers.get(id);
    if (peer?.pending) {clearTimeout(peer.pending.timer); peer.pending.reject(new AgentError(503, "The editor disconnected. Inspect the board before retrying."));}
    this.peers.delete(id);
  }
  update(id: string, context: Context) {const peer = this.get(id); peer.context = ContextSchema.parse(context);}
  private get(id: string) {const peer = this.peers.get(id); if (!peer) throw new AgentError(404, "Editor not connected. Open the standalone canvas first."); return peer;}
  list() {return [...this.peers].map(([id,p]) => ({id, title:p.context.board.title, revision:p.context.board.revision, blocks:p.context.board.blocks.length, editing:p.context.editing}));}
  read(id: string) {const {context} = this.get(id); return {...context, summary:describeBoard(context.board,context.selection)};}
  acknowledge(id: string, requestId: string, applied: boolean, context: Context, error?: string) {
    const peer = this.get(id); this.update(id, context);
    const pending = peer.pending;
    if (!pending || pending.id !== requestId) return;
    clearTimeout(pending.timer); peer.pending = undefined;
    if (applied) pending.resolve({requestId, revision:peer.context.board.revision, summary:describeBoard(peer.context.board, peer.context.selection)});
    else pending.reject(new AgentError(409, error ?? "The board changed. Read its current revision and reconsider the edit."));
  }
  apply(id: string, input: unknown): Promise<unknown> {
    const request = AgentRequestSchema.parse(input), peer = this.get(id);
    const body = JSON.stringify(request), cached = peer.requests.get(request.requestId);
    if (cached) {
      if (cached.body !== body) throw new AgentError(409, "This request ID already belongs to a different action.");
      return cached.result;
    }
    if (peer.pending) throw new AgentError(409, "An edit is already pending. Wait for its acknowledgement.");
    if (peer.context.editing || peer.context.board.revision !== request.baseRevision) throw new AgentError(409, "The board is being edited or its revision changed. Read it again.");
    const update: PreparedAction = prepareAgentAction(peer.context.board, request.action, peer.context.selection, request.requestId);
    const expiresAt = Date.now() + 5000;
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {peer.pending = undefined; reject(new AgentError(504, "Editor acknowledgement timed out. Inspect the board before sending another edit."));}, 5000);
      peer.pending = {id:request.requestId, resolve, reject, timer};
      peer.send({type:"apply", requestId:request.requestId, baseRevision:request.baseRevision, expiresAt, update});
    });
    peer.requests.set(request.requestId, {body, result});
    while (peer.requests.size > 50) peer.requests.delete(peer.requests.keys().next().value!);
    return result;
  }
}
