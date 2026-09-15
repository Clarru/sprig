import {expect,it} from 'vitest';
import {glassCardHeight} from '../src/card-material';
it('reserves room for the icon, complete copy, and unresolved state',()=>{
 expect(glassCardHeight(260,'Continue')).toBe(116);
 const text='A longer explanation needs to stay readable when its card becomes narrower.';
 expect(glassCardHeight(190,'An unresolved alternative',text,true)).toBeGreaterThan(glassCardHeight(400,'An unresolved alternative',text,false));
});
