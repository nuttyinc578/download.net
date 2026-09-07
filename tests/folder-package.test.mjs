import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildPackage,inspectPackage,installPackage,scanFolder} from '../shared/folder-package.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'vfdn-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=join(dir,'My App');await mkdir(source);await mkdir(join(source,'assets'));await mkdir(join(source,'empty'));
 const files={'app.exe':Buffer.from('already compiled app fixture'),'assets/config.json':Buffer.from('{"theme":"green"}'),'.settings':Buffer.from('include hidden names'),'assets/zero':Buffer.alloc(0)};
 for(const [name,value]of Object.entries(files))await writeFile(join(source,name),value);
 return {dir,source,files,output:join(dir,'app.vfdn'),root:join(dir,'Programs')};
}
async function rawPackage(dir,manifest,payload=Buffer.alloc(0)){
 const header=Buffer.from(JSON.stringify(manifest));const prefix=Buffer.alloc(12);prefix.write('VFDNPK1\n');prefix.writeUInt32LE(header.length,8);
 const bytes=Buffer.concat([prefix,header,payload]),path=join(dir,'bad.vfdn');await writeFile(path,bytes);return {path,hash:sha(bytes)};
}
const inventory=(files,directories=[])=>({format:'vfdn',version:1,directories,files});
const emptyFile=path=>({path,size:0,sha256:sha('')});
test('build and install preserves every file, nested folder, hidden name, and empty directory',async t=>{
 const f=await fixture(t),built=await buildPackage(f.source,f.output);
 assert.equal(built.fileCount,4);assert.equal(built.sha256,sha(await readFile(f.output)));
 const info=await inspectPackage(f.output,{expectedSha256:built.sha256});assert.equal(info.fileCount,4);
 const options={id:'test-app',expectedSha256:built.sha256};
 const installed=await installPackage(f.output,f.root,options);
 for(const [name,value]of Object.entries(f.files))assert.deepEqual(await readFile(join(installed.path,name)),value);
 assert.deepEqual(await readdir(join(installed.path,'empty')),[]);
 assert.equal((await installPackage(f.output,f.root,options)).cached,true);
 assert.deepEqual(await readdir(f.root),[installed.path.split(/[\\/]/).at(-1)]);
});
test('build is deterministic and does not overwrite an existing package',async t=>{
 const f=await fixture(t),first=await buildPackage(f.source,f.output),second=await buildPackage(f.source,join(f.dir,'second.vfdn'));
 assert.equal(first.sha256,second.sha256);
 await assert.rejects(buildPackage(f.source,f.output),/already exists/);
});
test('builder rejects output inside source without adding folders',async t=>{
 const f=await fixture(t),before=await readdir(f.source);
 await assert.rejects(buildPackage(f.source,join(f.source,'nested-output','app.vfdn')),/outside/);
 assert.deepEqual(await readdir(f.source),before);
});
test('path traversal, Windows device names, ADS, and absolute paths are rejected',async t=>{
 const f=await fixture(t);
 for(const path of ['../outside','/absolute','C:/escape','assets\\escape','nul.txt','COM1.exe','a:secret','dot.','space ','a//b','a/../../b']){
  const bad=await rawPackage(f.dir,inventory([emptyFile(path)]));
  await assert.rejects(installPackage(bad.path,f.root,{id:'test-app',expectedSha256:bad.hash}),/path|parent/);
  assert.deepEqual(await readdir(f.root),[]);
 }
});
test('inventory rejects case collisions, missing parents, and file/directory conflicts',async t=>{
 const f=await fixture(t);
 for(const m of [inventory([emptyFile('File'),emptyFile('file')]),inventory([emptyFile('a/b')]),inventory([emptyFile('a')],['a']),inventory([emptyFile('a/b')],['A'])]){
  const bad=await rawPackage(f.dir,m);await assert.rejects(inspectPackage(bad.path),/Duplicate|conflicting|parent/);
 }
});
test('truncated packages, trailing data, and oversized headers are rejected',async t=>{
 const f=await fixture(t);await buildPackage(f.source,f.output);const bytes=await readFile(f.output);
 for(const payload of [bytes.subarray(0,bytes.length-1),Buffer.concat([bytes,Buffer.from('extra')])]){
  await writeFile(f.output,payload);await assert.rejects(inspectPackage(f.output),/length/);
 }
 const prefix=Buffer.alloc(12);prefix.write('VFDNPK1\n');prefix.writeUInt32LE(0xffffffff,8);await writeFile(f.output,prefix);await assert.rejects(inspectPackage(f.output),/header/);
});
test('wrong per-file or whole-package hash leaves no installation or staging folder',async t=>{
 const f=await fixture(t),built=await buildPackage(f.source,f.output);
 await assert.rejects(installPackage(f.output,f.root,{id:'test-app',expectedSha256:'0'.repeat(64)}),/SHA-256/);
 assert.deepEqual(await readdir(f.root),[]);
 const bytes=await readFile(f.output);bytes[bytes.length-1]^=1;await writeFile(f.output,bytes);
 await assert.rejects(installPackage(f.output,f.root,{id:'test-app',expectedSha256:sha(bytes)}),/File verification/);
 assert.deepEqual(await readdir(f.root),[]);
});
test('cancelled extraction is cleaned up and does not appear as an installed app',async t=>{
 const f=await fixture(t),built=await buildPackage(f.source,f.output),controller=new AbortController();
 await assert.rejects(installPackage(f.output,f.root,{id:'test-app',expectedSha256:built.sha256,signal:controller.signal,progress:()=>controller.abort()}),/cancelled/);
 assert.deepEqual(await readdir(f.root),[]);
});
test('changed existing installation is preserved and never overwritten',async t=>{
 const f=await fixture(t),built=await buildPackage(f.source,f.output),options={id:'test-app',expectedSha256:built.sha256};
 const installed=await installPackage(f.output,f.root,options);
 await writeFile(join(installed.path,'app.exe'),'user changes');
 await assert.rejects(installPackage(f.output,f.root,options),/has changed/);
 assert.equal(await readFile(join(installed.path,'app.exe'),'utf8'),'user changes');
});
test('junctions/symlinks are rejected in source and installation roots',async t=>{
 const f=await fixture(t),outside=join(f.dir,'outside');await mkdir(outside);await writeFile(join(outside,'private'),'do not include');
 await symlink(outside,join(f.source,'linked'),'junction');
 await assert.rejects(scanFolder(f.source),/links|junction/);
 await rm(join(f.source,'linked'));const built=await buildPackage(f.source,f.output);
 await symlink(outside,f.root,'junction');
 await assert.rejects(installPackage(f.output,f.root,{id:'test-app',expectedSha256:built.sha256}),/links/);
 assert.deepEqual(await readdir(outside),['private']);
});
test('CLI build accepts folders and output paths containing spaces',async t=>{
 const f=await fixture(t);
 const result=JSON.parse(execFileSync(process.execPath,[resolve('scripts/vfdn.mjs'),'build',f.source,'--out',f.output],{encoding:'utf8',windowsHide:true}));
 assert.equal(result.fileCount,4);assert.equal((await inspectPackage(f.output)).sha256,result.sha256);
});


test('verified Node download installs a complete folder from its reviewed catalog manifest',async t=>{
 const {downloadVerified}=await import('../desktop/download.mjs');
 const f=await fixture(t),built=await buildPackage(f.source,f.output),payload=await readFile(f.output);
 const manifest={id:'test-app',name:'Test',description:'Complete folder',kind:'app',version:'1',publisher:'tester',url:'https://github.com/tester/apps/releases/download/v1/app.vfdn',license:'MIT',sha256:built.sha256,size:built.size};
 const cached=await downloadVerified(manifest,join(f.dir,'cache'),{fetcher:async()=>new Response(payload)});
 assert.match(cached,/\.vfdn$/);
 const installed=await installPackage(cached,f.root,{id:manifest.id,expectedSha256:manifest.sha256});
 assert.deepEqual(await readFile(join(installed.path,'assets/config.json')),f.files['assets/config.json']);
 assert.equal(installed.fileCount,4);
});

