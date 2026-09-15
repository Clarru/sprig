import {readdirSync,readFileSync} from 'node:fs';
import {extname,join} from 'node:path';
import {describe,expect,it} from 'vitest';

const sourceRoot=new URL('../src/',import.meta.url);

function sourceFiles(directory:URL):URL[]{
 return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const child=new URL(`${entry.name}${entry.isDirectory()?'/':''}`,directory);
  if(entry.isDirectory())return sourceFiles(child);
  return ['.ts','.tsx'].includes(extname(entry.name))?[child]:[];
 });
}

describe('React client module boundaries',()=>{
 it('keeps the client directive before imports in every client module',()=>{
  for(const file of sourceFiles(sourceRoot)){
   const source=readFileSync(file,'utf8');
   if(!source.includes('use client'))continue;
   const firstStatement=source.split('\n').find(line=>line.trim().length>0)?.trim();
   expect(firstStatement,join('packages/canvas/src',file.pathname.split('/src/')[1]??file.pathname)).toMatch(/^['"]use client['"];$/);
  }
 });
});
