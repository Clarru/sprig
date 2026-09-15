import {expect,it} from 'vitest';
import {diagramIntent,diagramFill,NEO} from '../src/diagram-design';
import {diagramCardHeight} from '../src/card-material';
import {emptyBoard,makeBlock} from '../src/model';
it('uses graph topology for terminals without turning a condition or note into an action',()=>{
 const a=makeBlock('step','Begin',{x:0,y:0},{id:'a'}),d=makeBlock('decision','Allowed?',{x:0,y:0},{id:'d'}),z=makeBlock('step','Done',{x:0,y:0},{id:'z'});
 const board={...emptyBoard(),blocks:[a,d,z],edges:[{id:'ad',source:'a',target:'d',label:'',highlighted:false},{id:'dz',source:'d',target:'z',label:'yes',highlighted:false}]};
 expect(diagramIntent(board,a)).toBe('intent');expect(diagramIntent(board,d)).toBe('decision');expect(diagramIntent(board,z)).toBe('terminal');
 expect(diagramIntent(board,makeBlock('group','Boundary'))).toBe('boundary');
 expect(diagramFill('decision')).toBe(NEO.pink);expect(diagramFill('note')).toBe(NEO.orange);expect(diagramFill('boundary')).toBe('transparent');
});
it('allocates the inset text area of a real diamond before laying out its container',()=>{
 const detail='Both permission outcomes must stay readable while the surrounding container grows.';
 expect(diagramCardHeight(280,'Use my location?',detail,false,true)).toBeGreaterThan(diagramCardHeight(280,'Use my location?',detail,false,false));
 expect(diagramCardHeight(200,'A longer permission question?',detail,true,true)).toBeGreaterThan(diagramCardHeight(400,'A longer permission question?',detail,true,true));
});
