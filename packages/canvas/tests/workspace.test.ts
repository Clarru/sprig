import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

it('resolves the standalone app to the local package on a clean install',()=>{
 const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
 const library=read('../package.json'),app=read('../../../apps/canvas/package.json'),lock=read('../../../package-lock.json');
 expect(app.dependencies[library.name]).toBe(library.version);
 expect(lock.packages['apps/canvas'].dependencies[library.name]).toBe(library.version);
 expect(lock.packages['packages/canvas'].version).toBe(library.version);
 expect(lock.packages[`node_modules/${library.name}`]).toMatchObject({resolved:'packages/canvas',link:true});
});
