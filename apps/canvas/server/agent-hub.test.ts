import {afterEach, expect, it, vi} from "vitest";
import {AgentHub} from "./agent-hub";
import {emptyBoard, applyTransaction} from "@clarru/sprig/model";
import type {Context} from "./session";
import type {PreparedAction} from "@clarru/sprig/agent";
afterEach(() => vi.useRealTimers());
const context = (): Context => ({board:emptyBoard(),selection:[],editing:false,canUndo:false});
it("waits for browser acknowledgement and deduplicates a repeated request", async () => {
 const hub=new AgentHub(); let ctx=context();
 let sent=0;
 const id=hub.connect(ctx, raw => {
   sent++; const message=raw as {requestId:string;update:PreparedAction};
   if ("transaction" in message.update) ctx={...ctx,board:applyTransaction(ctx.board,message.update.transaction)};
   hub.acknowledge(id,message.requestId,true,ctx);
 });
 const request={requestId:"one",baseRevision:0,action:{kind:"script",script:'step welcome "Welcome"\nafter welcome register "Register"'}};
 const first=await hub.apply(id,request), second=await hub.apply(id,request);
 expect(first).toEqual(second); expect(sent).toBe(1);
 expect(hub.read(id).board.blocks).toHaveLength(2);
 expect(hub.read(id).board.revision).toBe(1);
 expect(() => hub.apply(id,{...request,action:{kind:"script",script:'step other "Other"'}})).toThrow("different action");
});
it("rejects stale or currently edited boards before sending anything", () => {
 const hub=new AgentHub(), send=vi.fn(), id=hub.connect(context(),send);
 const request={requestId:"one",baseRevision:1,action:{kind:"script",script:'step welcome "Welcome"'}};
 expect(() => hub.apply(id,request)).toThrow("revision changed");
 hub.update(id,{...context(),editing:true});
 expect(() => hub.apply(id,{...request,baseRevision:0})).toThrow("being edited"); expect(send).not.toHaveBeenCalled();
});
it("invalid scripts are atomic and a lost editor connection rejects pending work", async () => {
 const hub=new AgentHub(), send=vi.fn(), id=hub.connect(context(),send);
 expect(() => hub.apply(id,{requestId:"bad",baseRevision:0,action:{kind:"script",script:'step one "One"\nnot_a_command'}})).toThrow("Line 2");
 expect(send).not.toHaveBeenCalled();
 const result=hub.apply(id,{requestId:"one",baseRevision:0,action:{kind:"script",script:'step one "One"'}});
 const rejection=expect(result).rejects.toThrow("disconnected");
 hub.disconnect(id); await rejection;
});
it("bounds acknowledgement waiting and does not resend on retry", async () => {
 vi.useFakeTimers(); const hub=new AgentHub(), send=vi.fn(), id=hub.connect(context(),send);
 const request={requestId:"one",baseRevision:0,action:{kind:"script",script:'step one "One"'}};
 const result=hub.apply(id,request), assertion=expect(result).rejects.toThrow("timed out");
 await vi.advanceTimersByTimeAsync(5000); await assertion;
 await expect(hub.apply(id,request)).rejects.toThrow("timed out"); expect(send).toHaveBeenCalledTimes(1);
});
