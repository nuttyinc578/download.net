const {app}=require('electron');
// Load the installed dependency tree from the built app, including all transitives.
const updaterPackage=require('node:path').resolve('artifacts/win-unpacked/resources/app.asar/node_modules/electron-updater');
const {NsisUpdater}=require(updaterPackage);
const {ElectronHttpExecutor}=require(updaterPackage+'/out/electronHttpExecutor');
const fs=require('node:fs');const fsp=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const http=require('node:http');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');const yaml=require('js-yaml');
const pkg=require('../package.json');const live=process.argv.includes('--live');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'nutty-updater-'));app.setPath('userData',root);app.disableHardwareAcceleration();
const report=path.resolve('artifacts/'+(live?'updater-live-result.json':'updater-smoke-result.json'));
let server;
async function sha(file,algorithm='sha512',encoding='base64'){const h=createHash(algorithm);for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest(encoding);}
function updater(url,suffix){
 const directory=path.join(root,suffix);fs.mkdirSync(directory,{recursive:true});
 const adapter={version:'0.0.1',name:pkg.name,isPackaged:true,appUpdateConfigPath:path.resolve('artifacts/win-unpacked/resources/app-update.yml'),userDataPath:directory,baseCachePath:directory,whenReady:()=>Promise.resolve(),quit:()=>{throw Error('Tests must never install or quit through the updater.');},relaunch:()=>{throw Error('Tests must never relaunch.');},onQuit:()=>{throw Error('Tests must never register automatic installation.');}};
 const engine=new NsisUpdater(null,adapter);engine.httpExecutor=new ElectronHttpExecutor();
 engine.logger={info:()=>{},warn:()=>{},debug:()=>{},error:()=>{}};engine.autoDownload=false;engine.autoInstallOnAppQuit=false;engine.allowPrerelease=false;engine.allowDowngrade=false;engine.disableWebInstaller=true;engine.disableDifferentialDownload=true;
 engine.setFeedURL(url?{provider:'generic',url}:{provider:'github',owner:'nuttyinc578',repo:'download.net',private:false});
 engine.quitAndInstall=()=>{throw Error('Tests must never start setup.');};return engine;
}
app.whenReady().then(async()=>{
 let base;
 if(!live){
  const metadata=fs.readFileSync('artifacts/latest.yml');const parsed=yaml.load(metadata.toString());const name=parsed.files[0].url;
  const bad=Buffer.from('Intentionally corrupted updater fixture');const badMeta={...parsed,files:[{url:name,size:bad.length,sha512:Buffer.alloc(64).toString('base64')}],path:name,sha512:Buffer.alloc(64).toString('base64')};
  server=http.createServer((request,response)=>{
   const route=new URL(request.url,'http://localhost').pathname;
   if(route==='/latest.yml'){response.end(metadata);return;}
   if(route==='/bad/latest.yml'){response.end(JSON.stringify(badMeta));return;}
   if(route==='/bad/'+name){response.setHeader('Content-Length',bad.length);response.end(bad);return;}
   if(route==='/'+name){const file=path.resolve('artifacts',name);response.setHeader('Content-Length',fs.statSync(file).size);fs.createReadStream(file).pipe(response);return;}
   response.writeHead(404);response.end();
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
 }
 const engine=updater(base,'valid');let downloaded=false;engine.on('update-downloaded',()=>{downloaded=true;});
 const result=await engine.checkForUpdates();assert.equal(result.updateInfo.version,pkg.version);const files=await engine.downloadUpdate();assert.ok(downloaded);assert.equal(files.length,1);assert.equal(await sha(files[0]),result.updateInfo.files[0].sha512);
 if(!live){const corrupt=updater(base+'bad/','corrupt');await corrupt.checkForUpdates();await assert.rejects(corrupt.downloadUpdate(),/checksum|sha512|mismatch/i);}
 const output={passed:true,mode:live?'live GitHub release':'local release fixture',version:result.updateInfo.version,sha256:await sha(files[0],'sha256','hex'),checks:['new-version detection','real Electron update download','SHA-512 verification',...(live?[]:['corrupted update rejected']),'installer execution disabled during tests']};
 await fsp.writeFile(report,JSON.stringify(output,null,2));
}).catch(async error=>{await fsp.writeFile(report,JSON.stringify({passed:false,error:error.stack}));process.exitCode=1;}).finally(async()=>{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('nutty-updater-'));
 await fsp.rm(root,{recursive:true,force:true});app.exit(process.exitCode||0);
});
