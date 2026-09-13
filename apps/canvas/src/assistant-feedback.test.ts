import {expect,it} from 'vitest';
import {BoardStore,makeBlock,type Transaction} from '@clarru/sprig';
import {describeAppliedEdit} from './assistant-feedback';
it('describes actual additions and corrections with labels, including their meaning',()=>{
 const store=new BoardStore();
 const before=store.getSnapshot().board;
 const add:Transaction={id:'add',baseRevision:before.revision,source:'ai',operations:[{type:'add',block:makeBlock('step','Register',{x:0,y:0},{id:'register',detail:'Create an account before the walkthrough.'})}]};
 store.apply(add);const added=store.getSnapshot().board;
 expect(describeAppliedEdit(before,added,add)).toEqual({kind:'added',change:'Added “Register”.',understood:'Register. Create an account before the walkthrough.'});
 const revise:Transaction={id:'revise',baseRevision:added.revision,source:'ai',operations:[{type:'update',id:'register',patch:{label:'Create account'}}]};
 store.apply(revise);
 expect(describeAppliedEdit(added,store.getSnapshot().board,revise)).toMatchObject({kind:'revised',change:'Changed “Register” to “Create account”.'});
});
it('does not report a failed proposal as an addition',()=>{
 const store=new BoardStore(),before=store.getSnapshot().board;
 const stale:Transaction={id:'stale',baseRevision:9,source:'ai',operations:[{type:'add',block:makeBlock('step','Ghost',{x:0,y:0})}]};
 expect(()=>store.apply(stale)).toThrow("fresh context");
 expect(describeAppliedEdit(before,store.getSnapshot().board,stale).change).not.toContain('Ghost');
});
