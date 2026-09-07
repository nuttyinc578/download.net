import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {publishApp} from '../desktop/publish.mjs';
test('publishing uploads the inspected binary and creates a single-manifest pull request',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'nutty-publish-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'fixture.exe');const binary=Buffer.alloc(256);binary.write('MZ');binary.writeUInt32LE(128,60);binary.write('PE\0\0',128);binary.writeUInt16LE(0x8664,132);await writeFile(file,binary);
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);const calls=[];let committed;
 const token='test-token-kept-in-memory-12345';
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url);assert.ok(['api.github.com','uploads.github.com'].includes(u.hostname));assert.equal(options.headers.Authorization,`Bearer ${token}`);assert.equal(options.redirect,'error');
  const body=typeof options.body==='string'?JSON.parse(options.body):null;calls.push({path:u.pathname,method:options.method||'GET',body});let response;
  if(u.pathname==='/user')response={login:'tester'};
  else if(u.pathname.endsWith('/forks'))response={fork:true,owner:{login:'tester'},parent:{full_name:'nuttyinc/download.net'},full_name:'tester/download.net',default_branch:'main'};
  else if(u.pathname.endsWith('/git/ref/heads/main'))response={object:{sha:'a'.repeat(40)}};
  else if(u.pathname.endsWith('/git/refs'))response={ref:body.ref};
  else if(u.hostname==='uploads.github.com') {const chunks=[];for await(const b of options.body)chunks.push(b);assert.deepEqual(Buffer.concat(chunks),binary);response={browser_download_url:'https://github.com/tester/download.net/releases/download/app-v1/test-app.exe'};}
  else if(u.pathname.endsWith('/releases'))response={upload_url:'https://uploads.github.com/repos/tester/download.net/releases/1/assets{?name,label}',html_url:'https://github.com/tester/download.net/releases/tag/app-v1'};
  else if(u.pathname.includes('/contents/submissions/')){committed=JSON.parse(Buffer.from(body.content,'base64').toString());assert.ok(!JSON.stringify(body).includes(token));response={commit:{sha:'b'.repeat(40)}};}
  else if(u.pathname==='/repos/nuttyinc/download.net')response={default_branch:'main'};
  else if(u.pathname.endsWith('/pulls')){assert.match(body.head,/^tester:submission\/test-app-/);response={html_url:'https://github.com/nuttyinc/download.net/pull/1',number:1};}
  else throw Error('Unexpected request: '+u.pathname);
  return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});
 };
 const result=await publishApp(file,{id:'test-app',name:'Test App',description:'Test app description',kind:'app',version:'1.0',license:'MIT'},token);
 assert.equal(result.number,1);assert.equal(committed.size,binary.length);assert.equal(committed.publisher,'tester');assert.match(committed.sha256,/^[a-f0-9]{64}$/);assert.equal(calls.filter(c=>c.path.endsWith('/pulls')).length,1);
});
