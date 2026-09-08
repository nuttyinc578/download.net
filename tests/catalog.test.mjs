import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {publishCatalog} from '../scripts/catalog.mjs';
const app={id:'example-app',name:'Example',description:'A reviewed app',kind:'app',version:'1.0',publisher:'tester',url:'https://github.com/tester/apps/releases/download/v1/app.vfdn',sha256:'a'.repeat(64),size:100,license:'MIT'};
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'nutty-catalog-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'catalog/submissions'),{recursive:true});await mkdir(join(root,'submissions'));await writeFile(join(root,'catalog/apps.json'),'[]');return root;}
test('merged submissions from both folders use merge order, verify, and publish once',async t=>{
 const root=await fixture(t);await writeFile(join(root,'submissions/example-zzz.json'),JSON.stringify(app));
 const updated={...app,version:'2.0',url:app.url.replace('/v1/','/v2/'),sha256:'b'.repeat(64)};
 await writeFile(join(root,'catalog/submissions/example-aaa.json'),JSON.stringify(updated));
 const order=new Map([['submissions/example-zzz.json',1],['catalog/submissions/example-aaa.json',2]]),seen=[];
 const verify=async a=>seen.push(a);
 assert.deepEqual(await publishCatalog({root,order,verify}),[updated]);assert.deepEqual(seen,[updated]);
 await publishCatalog({root,order,verify});assert.equal(seen.length,1,'unchanged verified listing is not downloaded again');
});
test('a failed package verification leaves the previous catalog intact',async t=>{
 const root=await fixture(t);await writeFile(join(root,'catalog/apps.json'),JSON.stringify([app]));
 await writeFile(join(root,'catalog/submissions/example.json'),JSON.stringify({...app,version:'2.0'}));
 await assert.rejects(publishCatalog({root,order:new Map(),verify:async()=>{throw Error('Package hash mismatch');}}),/hash mismatch/);
 assert.deepEqual(JSON.parse(await readFile(join(root,'catalog/apps.json'),'utf8')),[app]);
});
