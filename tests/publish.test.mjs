import {inspectPackage} from '../shared/folder-package.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm,mkdir,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {publishApp} from '../desktop/publish.mjs';
for(const mode of ['owner','existing-fork','new-fork'])test('publishing creates one catalog submission and uploads all files: '+mode,async t=>{
 const dir=await mkdtemp(join(tmpdir(),'nutty-publish-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=join(dir,'source');await mkdir(source);await mkdir(join(source,'assets'));await writeFile(join(source,'assets/config.json'),'{"enabled":true}');const file=join(source,'fixture.exe');const binary=Buffer.alloc(256);binary.write('MZ');binary.writeUInt32LE(128,60);binary.write('PE\0\0',128);binary.writeUInt16LE(0x8664,132);await writeFile(file,binary);
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);const calls=[];let committed;
 const token='test-token-kept-in-memory-12345';
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url);assert.ok(['api.github.com','uploads.github.com'].includes(u.hostname));assert.equal(options.headers.Authorization,`Bearer ${token}`);assert.equal(options.redirect,'error');
  const body=typeof options.body==='string'?JSON.parse(options.body):null;calls.push({path:u.pathname,method:options.method||'GET',body});let response;
  if(u.pathname==='/user')response={login:mode==='owner'?'nuttyinc578':'tester'};
  else if(u.pathname==='/repos/tester/download.net'){if(mode==='new-fork')return new Response('{}',{status:404});response={fork:true,owner:{login:'tester'},parent:{full_name:'nuttyinc578/download.net'},full_name:'tester/download.net',default_branch:'main'};}
  else if(u.pathname.endsWith('/forks')){assert.equal(mode,'new-fork');response={fork:true,owner:{login:'tester'},parent:{full_name:'nuttyinc578/download.net'},full_name:'tester/download.net',default_branch:'main'};}
  else if(u.pathname.endsWith('/git/ref/heads/main'))response={object:{sha:'a'.repeat(40)}};
  else if(u.pathname.endsWith('/git/refs')){assert.equal(body.sha,'a'.repeat(40));assert.ok(u.pathname.startsWith('/repos/'+(mode==='owner'?'nuttyinc578':'tester')+'/'));response={ref:body.ref};}
  else if(u.hostname==='uploads.github.com') {const chunks=[];for await(const b of options.body)chunks.push(b);const packagePath=join(dir,'uploaded.vfdn');await writeFile(packagePath,Buffer.concat(chunks));const inspected=await inspectPackage(packagePath);assert.equal(inspected.fileCount,2);assert.ok(inspected.manifest.files.some(f=>f.path==='assets/config.json'));assert.equal(u.searchParams.get('name'),'test-app.vfdn');response={browser_download_url:'https://github.com/tester/download.net/releases/download/app-v1/test-app.vfdn'};}
  else if(u.pathname.endsWith('/releases'))response={upload_url:'https://uploads.github.com/repos/tester/download.net/releases/1/assets{?name,label}',html_url:'https://github.com/tester/download.net/releases/tag/app-v1'};
  else if(u.pathname.includes('/contents/catalog/submissions/')){committed=JSON.parse(Buffer.from(body.content,'base64').toString());assert.ok(!JSON.stringify(body).includes(token));response={commit:{sha:'b'.repeat(40)}};}
  else if(u.pathname==='/repos/nuttyinc578/download.net')response={default_branch:'main',permissions:{push:mode==='owner'}};
  else if(u.pathname.endsWith('/pulls')){assert.match(body.head,mode==='owner'?/^submission\/test-app-/:/^tester:submission\/test-app-/);response={html_url:'https://github.com/nuttyinc578/download.net/pull/1',number:1};}
  else throw Error('Unexpected request: '+u.pathname);
  return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});
 };
 const result=await publishApp(source,{id:'test-app',name:'Test App',description:'Test app description',kind:'app',version:'1.0',license:'MIT'},token);
 assert.equal(result.number,1);assert.ok(committed.size>binary.length);assert.equal(committed.publisher,mode==='owner'?'nuttyinc578':'tester');assert.match(committed.sha256,/^[a-f0-9]{64}$/);assert.equal(calls.filter(c=>c.path.endsWith('/pulls')).length,1);
});
