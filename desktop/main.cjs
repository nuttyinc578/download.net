const { app, BrowserWindow, ipcMain, dialog, shell, net, session } = require('electron');
const { join } = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
let window, settings, active, selected, lastDownload, publishing=false, backend, backendError, quitting=false;
const hasLock=app.requestSingleInstanceLock();
if(!hasLock)app.quit();
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
async function main() {
  const { trustedService } = await import('../shared/manifest.mjs');
  const { downloadVerified } = await import('./download.mjs');
  const { publishApp } = await import('./publish.mjs');
  const {scanFolder,installPackage,safeDirectory}=await import('../shared/folder-package.mjs');
  const defaultInstallRoot=join(process.env.LOCALAPPDATA||app.getPath('appData'),'Programs');
  const configFile=join(app.getPath('userData'),'settings.json');
  settings={installRoot:defaultInstallRoot};
  try { const saved=JSON.parse(await fs.readFile(configFile,'utf8')); if(typeof saved.installRoot==='string')settings.installRoot=saved.installRoot; } catch { /* Keep default Programs folder. */ }
  const {startLocalBackend}=await import('./local-backend.mjs');
  const connectionReady=startLocalBackend({
    runtimeDir:app.isPackaged?join(process.resourcesPath,'runtime'):join(__dirname,'../artifacts/runtime'),
    dataDir:join(app.getPath('userData'),'backend'),
    onExit:message=>{backendError=message;if(window&&!window.isDestroyed())window.webContents.send('connection-error',message);}
  }).then(async value=>{
    backend=value;
    if(quitting){await backend.stop();return;}
    settings.apiUrl=value.apiUrl;settings.bootstrapUrl=value.bootstrapUrl;
  }).catch(error=>{backendError=error.message;});
  async function connected(){await connectionReady;if(backendError||!backend)throw Error(backendError||'Nuttyinc is still starting. Please try again.');}
  const documentUrl=pathToFileURL(join(__dirname,'../web/store.html')).href;
  window=new BrowserWindow({width:1320,height:860,minWidth:760,minHeight:600,backgroundColor:'#10120f',title:'download.net',autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event)=>event.preventDefault());
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  function handle(name,fn) { ipcMain.handle(name,async(event,...args)=>{
    if(event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame || event.senderFrame.url.split('#')[0]!==documentUrl) throw Error('Untrusted caller.');
    try { return await fn(...args); } catch(e) { throw Error(['EACCES','EPERM'].includes(e.code)?'Windows cannot write to this folder. Choose a writable Programs folder in Settings.':e.message); }
  }); }
  const progress=(value)=>{if(!window.isDestroyed()) window.webContents.send('progress',value);};
  async function request(origin,path,body,useSession=true) {
    trustedService(origin);
    const response=await (useSession ? net.fetch.bind(net) : fetch)(origin+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
    const json=await response.json().catch(()=>({}));
    if(!response.ok) throw Error(json.error||`Server returned ${response.status}.`);
    return json;
  }
  handle('settings:get',async()=>{await connectionReady;return {installRoot:settings.installRoot,version:app.getVersion(),connected:!!backend&&!backendError,connectionError:backendError||null};});
  handle('settings:choose-folder',async()=>{
    if(active||publishing)throw Error('Wait until the current transfer finishes.');
    const result=await dialog.showOpenDialog(window,{title:'Choose a Programs folder',defaultPath:settings.installRoot,properties:['openDirectory','createDirectory']});
    if(result.canceled)return null;
    settings.installRoot=await safeDirectory(result.filePaths[0]);
    await fs.writeFile(configFile,JSON.stringify({installRoot:settings.installRoot}));return settings.installRoot;
  });
  handle('api',async(route,body)=>{
    if(!['/api/apps','/api/auth/me','/api/auth/login','/api/auth/signup','/api/auth/logout'].includes(route)) throw Error('Unsupported API route.');
    await connected();
    return request(settings.apiUrl,route,body);
  });
  handle('download',async id=>{
    if(active)throw Error('A download is already running.');
    if(!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id))throw Error('Invalid app ID.');
    await connected();
    active=new AbortController();
    try {
      progress({stage:'bootstrap'});
      const handshake=await request(settings.bootstrapUrl,'/v1/bootstrap',undefined,false);
      if(handshake.protocol!==1||trustedService(handshake.apiUrl)!==trustedService(settings.apiUrl))throw Error('Bootstrap returned an unexpected Nuttyinc server.');
      if(active.signal.aborted)throw Error('Download cancelled.');
      progress({stage:'verification'});
      const verification=await request(settings.apiUrl,'/api/verify',handshake.ticket);
      if(!verification.verified)throw Error('Bootstrap verification failed.');
      progress({stage:'aspire'});
      const manifest=await request(settings.apiUrl,`/api/apps/${id}/download`);
      if(manifest.id!==id)throw Error('Server returned the wrong app.');
      const destination=join(app.getPath('userData'),'package-cache');
      const file=await downloadVerified(manifest,destination,{signal:active.signal,progress});
      const installed=await installPackage(file,settings.installRoot,{id:manifest.id,expectedSha256:manifest.sha256,signal:active.signal,progress});
      lastDownload=installed.path;
      return {name:manifest.name,...installed};
    } finally { active=null; }
  });
  handle('download:cancel',()=>{active?.abort();});
  handle('download:reveal',()=>{if(lastDownload)shell.showItemInFolder(lastDownload);});
  handle('publish:choose',async()=>{
    if(publishing)throw Error('Wait for publishing to finish.');
    const result=await dialog.showOpenDialog(window,{title:'Choose the complete app folder',properties:['openDirectory']});
    if(result.canceled)return null;
    const candidate=result.filePaths[0],info=await scanFolder(candidate);
    selected=candidate;
    return {size:info.totalSize,fileCount:info.fileCount,name:require('node:path').basename(selected)};
  });
  handle('publish:submit',async(fields,token)=>{
    if(publishing)throw Error('A submission is already running.');
    if(!selected)throw Error('Choose your complete app folder first.');
    await connected();
    await request(settings.apiUrl,'/api/auth/me');
    publishing=true;
    try{return await publishApp(selected,fields,token,message=>progress({stage:'publishing',message}));}finally{publishing=false;token='';}
  });
  handle('open-link',async value=>{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||!['github.com','nuttyinc578.github.io','nightly.link'].includes(u.hostname))throw Error('Link is not allowed.');
    await shell.openExternal(u.href);
  });
  await window.loadURL(documentUrl);
}
if(hasLock)app.whenReady().then(main).catch(error=>{dialog.showErrorBox('download.net could not start',error.message);app.quit();});
app.on('before-quit',event=>{if(backend&&!quitting){event.preventDefault();quitting=true;active?.abort();backend.stop().finally(()=>app.quit());}else{quitting=true;}});
app.on('window-all-closed',()=>{active?.abort();app.quit();});
