import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {writableProgramsRoot,resolveProgramsRoot} from '../desktop/install-paths.mjs';
import {retryFileOperation,fileOperationError} from '../shared/fs-operations.mjs';
import {ipcResult} from '../desktop/ipc-result.mjs';
async function folder(t){const dir=await mkdtemp(join(tmpdir(),'download-net-path-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const coded=code=>Object.assign(Error('fixture '+code),{code});
test('Programs preflight creates nested folders, preserves app files and removes its probe',async t=>{
  const root=join(await folder(t),'Local','Programs');await mkdir(root,{recursive:true});await writeFile(join(root,'existing.txt'),'keep');
  assert.equal(await writableProgramsRoot(root),root);assert.equal(await readFile(join(root,'existing.txt'),'utf8'),'keep');assert.deepEqual(await readdir(root),['existing.txt']);
  assert.equal(await writableProgramsRoot(join(root,'nested')),join(root,'nested'));
});
test('unwritable roots fall back to the recommended Programs folder',async()=>{
  for(const code of ['EACCES','EPERM','EROFS','ENOENT','ENOTDIR']){
    const calls=[];const result=await resolveProgramsRoot('blocked',{recommended:'recommended',probe:async p=>{calls.push(p);if(p==='blocked')throw coded(code);return p;}});
    assert.equal(result.root,'recommended');assert.match(result.notice,/blocked/);assert.deepEqual(calls,['blocked','recommended']);
  }
});
test('valid custom roots are kept; a missing account name is repaired',async()=>{
  const probe=async p=>p;
  assert.deepEqual(await resolveProgramsRoot('custom',{probe}),{root:'custom',notice:null});
  for(const path of ['c:/user/appdata/local/programs','C:\\Users\\AppData\\Local\\Programs'])assert.equal((await resolveProgramsRoot(path,{recommended:'account-programs',probe})).root,'account-programs');
});
test('unsafe paths, full disks and cancellation never trigger silent fallback',async()=>{
  for(const error of [Error('Folders cannot contain links'),coded('ENOSPC'),Error('Operation cancelled.')]){
    let calls=0;await assert.rejects(resolveProgramsRoot('custom',{probe:async()=>{calls++;throw error;}}),e=>e===error);assert.equal(calls,1);
  }
});
test('Programs preflight rejects directory junctions without touching their target',async t=>{
  const dir=await folder(t),target=join(dir,'target'),link=join(dir,'link');await mkdir(target);await symlink(target,link,process.platform==='win32'?'junction':'dir');
  await assert.rejects(writableProgramsRoot(link),/links/);assert.deepEqual(await readdir(target),[]);
});
test('Windows denied folder uses account Programs without elevation',{skip:process.platform!=='win32'},async t=>{
  const dir=await folder(t),blocked=join(dir,'blocked'),recommended=join(dir,'Programs');await mkdir(blocked);
  const acl=args=>execFileSync('icacls.exe',args,{windowsHide:true,stdio:'pipe'});
  try {
    acl([blocked,'/deny','*S-1-1-0:(OI)(CI)(W)']);
    await assert.rejects(writableProgramsRoot(blocked),e=>['EACCES','EPERM'].includes(e.code)&&e.message.includes(blocked));
    const result=await resolveProgramsRoot(blocked,{recommended});assert.equal(result.root,recommended);assert.deepEqual(await readdir(recommended),[]);
  } finally {acl([blocked,'/remove:d','*S-1-1-0']);}
});
test('Windows file locks are retried with a bounded delay',async()=>{
  let calls=0;const waits=[];
  assert.equal(await retryFileOperation(()=>{if(++calls<3)throw coded('EPERM');return 'ok';},{wait:async ms=>waits.push(ms)}),'ok');
  assert.equal(calls,3);assert.deepEqual(waits,[100,200]);
  calls=0;await assert.rejects(retryFileOperation(()=>{calls++;throw coded('EBUSY');},{wait:async()=>{}}),/EBUSY/);assert.equal(calls,5);
});
test('full disks are not retried and cancellation stops a retry',async()=>{
  let calls=0;await assert.rejects(retryFileOperation(()=>{calls++;throw coded('ENOSPC');},{wait:async()=>{}}),/ENOSPC/);assert.equal(calls,1);
  const control=new AbortController();calls=0;await assert.rejects(retryFileOperation(()=>{calls++;throw coded('EPERM');},{signal:control.signal,wait:async()=>control.abort()}),/cancelled/);assert.equal(calls,1);
});
test('filesystem errors identify the failing location and preserve the cause',()=>{
  const cause=coded('ENOSPC'),error=fileOperationError(cause,'package-cache','save the downloaded package');
  assert.equal(error.cause,cause);assert.equal(error.code,'ENOSPC');assert.match(error.message,/package-cache/);assert.match(error.message,/drive is full/);
});
test('IPC results and the preload preserve values and clean actionable errors',async()=>{
  assert.deepEqual(await ipcResult(()=>42),{ok:true,value:42});
  let bridge;const calls=[];let result={ok:true,value:'Programs'};
  const electron={contextBridge:{exposeInMainWorld:(_name,value)=>bridge=value},ipcRenderer:{invoke:async(...args)=>{calls.push(args);return result;}}};
  runInNewContext(await readFile(new URL('../desktop/preload.cjs',import.meta.url),'utf8'),{require:()=>electron});
  assert.equal(await bridge.resetInstallFolder(),'Programs');assert.deepEqual(calls,[['settings:reset-folder']]);
  result=await ipcResult(()=>{throw Error('Cannot write app files at Programs.');});
  await assert.rejects(bridge.download('test-app'),{message:'Cannot write app files at Programs.'});
});
