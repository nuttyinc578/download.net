import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {LauncherUpdates} from '../desktop/updates.mjs';import verifier from '../scripts/verify-update-artifacts.cjs';
const release={version:'1.0.4',releaseNotes:'New launcher features.'};
class Engine extends EventEmitter{constructor(){super();this.calls=0;this.installs=[];}async checkForUpdates(){this.calls++;this.emit('checking-for-update');this.emit('update-available',release);return {downloadPromise:this.autoDownload?Promise.resolve().then(()=>{this.emit('download-progress',{percent:47,transferred:47,total:100});this.emit('update-downloaded',release);}):null};}quitAndInstall(...args){this.installs.push(args);}}
test('checks stable releases automatically, downloads, and stops services before restart',async()=>{
 const engine=new Engine(),events=[],order=[];let tick,cleared=false;
 const updates=new LauncherUpdates({engine,version:'1.0.3',emit:s=>events.push(s),beforeInstall:async()=>{order.push('services stopped');},schedule:(cb,ms)=>{assert.equal(ms,21600000);tick=cb;return 1;},unschedule:id=>{assert.equal(id,1);cleared=true;}});
 engine.quitAndInstall=(...args)=>{assert.deepEqual(order,['services stopped']);engine.installs.push(args);};
 updates.start();await updates.pending;assert.equal(engine.calls,1);assert.equal(engine.allowPrerelease,false);assert.equal(engine.allowDowngrade,false);assert.equal(engine.disableWebInstaller,true);assert.equal(engine.autoInstallOnAppQuit,true);
 assert.equal(updates.snapshot().phase,'ready');assert.ok(events.some(s=>s.phase==='downloading'&&s.percent===47));assert.equal(updates.snapshot().latestVersion,'1.0.4');
 tick();await updates.check();assert.equal(engine.calls,1,'a ready update is kept for installation');
 await updates.install();assert.deepEqual(engine.installs,[[true,true]]);assert.equal(updates.snapshot().phase,'installing');updates.stop();assert.ok(cleared);
});
test('simultaneous checks share one request and errors can be retried',async()=>{
 const engine=new Engine();let finish;
 engine.checkForUpdates=()=>{engine.calls++;return new Promise((resolve,reject)=>{finish=reject;});};
 const updates=new LauncherUpdates({engine,version:'1.0.3'});const first=updates.check();assert.equal(first,updates.check());await Promise.resolve();finish(Error('offline'));await first;
 assert.equal(engine.calls,1);assert.equal(updates.snapshot().phase,'error');
 engine.checkForUpdates=async()=>{engine.calls++;engine.emit('update-not-available',{version:'1.0.3'});return {};};
 await updates.check();assert.equal(engine.calls,2);assert.equal(updates.snapshot().phase,'current');assert.equal(updates.snapshot().error,null);
});
test('failed verification never enables installation',async()=>{
 const engine=new Engine();engine.checkForUpdates=async()=>{engine.emit('update-available',release);return {downloadPromise:Promise.reject(Error('SHA-512 mismatch'))};};
 const updates=new LauncherUpdates({engine,version:'1.0.3'});await updates.check();assert.equal(updates.snapshot().phase,'error');await assert.rejects(updates.install(),/verified/);assert.equal(engine.installs.length,0);
});
test('restart waits for transfers; failed installation recovers the backend',async()=>{
 const engine=new Engine();let busy=true,recovered=false;
 const updates=new LauncherUpdates({engine,version:'1.0.3',canInstall:()=>!busy,installFailed:async()=>{recovered=true;}});await updates.check();
 await assert.rejects(updates.install(),/publishing/);assert.equal(updates.snapshot().phase,'ready');busy=false;
 engine.quitAndInstall=()=>engine.emit('error',Error('Installer unavailable'));await updates.install();await Promise.resolve();assert.equal(updates.snapshot().phase,'error');assert.ok(recovered);
});
test('portable builds notify about releases without installing into an unrelated folder',async()=>{
 const engine=new Engine();const updates=new LauncherUpdates({engine,version:'1.0.3',mode:'portable'});await updates.check();assert.equal(engine.autoDownload,false);assert.equal(engine.autoInstallOnAppQuit,false);assert.equal(updates.snapshot().phase,'available');await assert.rejects(updates.install(),/verified/);
});
test('development builds never start update polling',async()=>{
 let scheduled=false;const updates=new LauncherUpdates({engine:null,version:'1.0.3',mode:'development',schedule:()=>{scheduled=true;}});updates.start();assert.equal((await updates.check()).phase,'unsupported');assert.equal(scheduled,false);
});
test('release verification rejects corrupted setup files and wrong versions or URLs',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'nutty-update-artifacts-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const bytes=Buffer.from('installer fixture'),name='download.net-Setup-1.0.3.exe',hash=createHash('sha512').update(bytes).digest('base64');
 const valid={version:'1.0.3',files:[{url:name,size:bytes.length,sha512:hash}],path:name,sha512:hash};
 await writeFile(join(dir,name),bytes);await writeFile(join(dir,name+'.blockmap'),'blockmap fixture');const save=m=>writeFile(join(dir,'latest.yml'),JSON.stringify(m));await save(valid);await verifier.verifyUpdateArtifacts(dir,'1.0.3');
 await save({...valid,version:'1.0.2'});await assert.rejects(verifier.verifyUpdateArtifacts(dir,'1.0.3'));
 await save({...valid,files:[{...valid.files[0],url:'https://untrusted.example/update.exe'}]});await assert.rejects(verifier.verifyUpdateArtifacts(dir,'1.0.3'));
 await save(valid);await writeFile(join(dir,name),Buffer.alloc(bytes.length));await assert.rejects(verifier.verifyUpdateArtifacts(dir,'1.0.3'),/integrity hash/);
});

test('release notes are readable text without active feed markup',async()=>{const engine=new Engine();const updates=new LauncherUpdates({engine,version:'1.0.3'});engine.emit('update-available',{version:'1.0.4',releaseNotes:'<h2>New &amp; improved</h2><p>Faster downloads.</p><script>unwanted()</script>'});assert.equal(updates.snapshot().notes,'New & improved\nFaster downloads.');});
