const { app, BrowserWindow, ipcMain, dialog, shell, net, session } = require('electron');
const {join,dirname,isAbsolute}=require('node:path');
const {randomUUID}=require('node:crypto');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
let window, settings, active, selected, lastDownload, publishing=false, backend, backendError, quitting=false,updates,changingFolder=false,selectingSource=false;
const hasLock=app.requestSingleInstanceLock();
if(!hasLock)app.quit();
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
async function main() {
  const { trustedService } = await import('../shared/manifest.mjs');
  const { downloadVerified } = await import('./download.mjs');
  const { publishApp } = await import('./publish.mjs');
  const {scanFolder}=await import('../shared/folder-package.mjs');
  const {extractVfdn,defaultProgramsRoot}=await import('../shared/vfdn-extract.mjs');
  const {writableProgramsRoot,resolveProgramsRoot}=await import('./install-paths.mjs');
  const {retryFileOperation,cleanupOwnedPath,fileOperationError}=await import('../shared/fs-operations.mjs');
  const {ipcResult}=await import('./ipc-result.mjs');
  const defaultInstallRoot=defaultProgramsRoot();
  const configFile=join(app.getPath('userData'),'settings.json');
  settings={installRoot:defaultInstallRoot};
  try { const saved=JSON.parse(await fs.readFile(configFile,'utf8')); if(typeof saved.installRoot==='string'&&isAbsolute(saved.installRoot))settings.installRoot=saved.installRoot; } catch { /* Keep default Programs folder. */ }
  async function saveInstallRoot(root) {
    const temp=configFile+'.'+randomUUID()+'.tmp';
    try {
      await fs.mkdir(dirname(configFile),{recursive:true});
      await fs.writeFile(temp,JSON.stringify({installRoot:root}),{flag:'wx'});
      await retryFileOperation(()=>fs.rename(temp,configFile));
      settings.installRoot=root;
    } catch(error) {throw fileOperationError(error,configFile,'save launcher settings');}
    finally {await cleanupOwnedPath(temp);}
  }
  const {startLocalBackend}=await import('./local-backend.mjs');
  function launchBackend(){backendError=null;return startLocalBackend({
    runtimeDir:app.isPackaged?join(process.resourcesPath,'runtime'):join(__dirname,'../artifacts/runtime'),
    dataDir:join(app.getPath('userData'),'backend'),
    onExit:message=>{backendError=message;if(window&&!window.isDestroyed())window.webContents.send('connection-error',message);}
  }).then(async value=>{
    backend=value;
    if(quitting){await backend.stop();return;}
    settings.apiUrl=value.apiUrl;settings.bootstrapUrl=value.bootstrapUrl;
  }).catch(error=>{backendError=error.message;});}
  let connectionReady=launchBackend();
  async function connected(){await connectionReady;if(backendError||!backend)throw Error(backendError||'Nuttyinc is still starting. Please try again.');}
  const documentUrl=pathToFileURL(join(__dirname,'../web/store.html')).href;
  window=new BrowserWindow({width:1320,height:860,minWidth:760,minHeight:600,backgroundColor:'#10120f',title:'download.net',autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event)=>event.preventDefault());
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  function handle(name,fn) { ipcMain.handle(name,async(event,...args)=>{
    if(event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame || event.senderFrame.url.split('#')[0]!==documentUrl) throw Error('Untrusted caller.');
    return ipcResult(async()=>{if(quitting)throw Error('download.net is closing to update.');return fn(...args);});
  }); }
  const progress=(value)=>{if(!window.isDestroyed()) window.webContents.send('progress',value);};
  async function request(origin,path,body,useSession=true) {
    trustedService(origin);
    const response=await (useSession ? net.fetch.bind(net) : fetch)(origin+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
    const json=await response.json().catch(()=>({}));
    if(!response.ok) throw Error(json.error||`Server returned ${response.status}.`);
    return json;
  }
  const {LauncherUpdates}=await import('./updates.mjs');
  let updateEngine=null,updateMode='development';
  if(app.isPackaged&&process.platform==='win32'){
    const {autoUpdater}=require('electron-updater');updateEngine=autoUpdater;
    updateMode=await fs.access(join(require('node:path').dirname(app.getPath('exe')),'Uninstall download.net.exe')).then(()=>'installed',()=>'portable');
    autoUpdater.setFeedURL({provider:'github',owner:'nuttyinc578',repo:'download.net',private:false});
  }
  updates=new LauncherUpdates({engine:updateEngine,version:app.getVersion(),mode:updateMode,
    emit:state=>{if(!window.isDestroyed())window.webContents.send('updates:state',state);},
    canInstall:()=>!active&&!publishing&&!quitting&&!changingFolder&&!selectingSource,
    beforeInstall:async()=>{quitting=true;await connectionReady;await backend?.stop();backend=null;},
    installFailed:async()=>{quitting=false;connectionReady=launchBackend();await connectionReady;}
  });
  handle('updates:get',()=>updates.snapshot());
  handle('updates:check',()=>updates.check());
  handle('updates:install',()=>updates.install());
  handle('settings:get',async()=>{await connectionReady;return {installRoot:settings.installRoot,version:app.getVersion(),connected:!!backend&&!backendError,connectionError:backendError||null};});
  async function changeInstallFolder(recommended=false) {
    if(active||publishing||changingFolder)throw Error('Wait until the current transfer or folder selection finishes.');
    changingFolder=true;
    try {
      let candidate=defaultInstallRoot;
      if(!recommended) {
        const result=await dialog.showOpenDialog(window,{title:'Choose a Programs folder',defaultPath:settings.installRoot,properties:['openDirectory','createDirectory']});
        if(result.canceled)return null;
        candidate=result.filePaths[0];
      }
      const root=await writableProgramsRoot(candidate);
      await saveInstallRoot(root);return root;
    } finally {changingFolder=false;}
  }
  handle('settings:choose-folder',()=>changeInstallFolder());
  handle('settings:reset-folder',()=>changeInstallFolder(true));
  handle('api',async(route,body)=>{
    if(!['/api/apps','/api/auth/me','/api/auth/login','/api/auth/signup','/api/auth/logout'].includes(route)) throw Error('Unsupported API route.');
    await connected();
    return request(settings.apiUrl,route,body);
  });
  handle('download',async id=>{
    if(active)throw Error('A download is already running.');
    if(changingFolder)throw Error('Finish choosing the installation folder first.');
    if(!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id))throw Error('Invalid app ID.');
    active=new AbortController();
    try {
      const location=await resolveProgramsRoot(settings.installRoot,{signal:active.signal});
      if(location.root!==settings.installRoot)await saveInstallRoot(location.root);
      progress({stage:'preparing',installRoot:location.root,message:location.notice});
      await connected();
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
      const installed=await extractVfdn(file,{root:settings.installRoot,method:'download.net',plugin:'download.net',id:manifest.id,expectedSha256:manifest.sha256,signal:active.signal,progress}).catch(error=>{throw fileOperationError(error,settings.installRoot,'install the app files');});
      lastDownload=installed.path;
      return {name:manifest.name,...installed};
    } finally { active=null; }
  });
  handle('download:cancel',()=>{active?.abort();});
  handle('download:reveal',()=>{if(lastDownload)shell.showItemInFolder(lastDownload);});
  handle('publish:choose',async()=>{
    if(publishing||selectingSource)throw Error('Wait for publishing or folder selection to finish.');
    selectingSource=true;
    try {
    const result=await dialog.showOpenDialog(window,{title:'Choose the complete app folder',properties:['openDirectory']});
    if(result.canceled)return null;
    const candidate=result.filePaths[0],info=await scanFolder(candidate);
    selected=candidate;
    return {size:info.totalSize,fileCount:info.fileCount,name:require('node:path').basename(selected)};
    } finally {selectingSource=false;}
  });
  handle('publish:submit',async(fields,token)=>{
    if(publishing||selectingSource)throw Error('Wait for the current submission or folder selection to finish.');
    if(!selected)throw Error('Choose your complete app folder first.');
    publishing=true;
    try{await connected();await request(settings.apiUrl,'/api/auth/me');return await publishApp(selected,fields,token,message=>progress({stage:'publishing',message}));}finally{publishing=false;token='';}
  });
  handle('open-link',async value=>{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||!['github.com','nuttyinc578.github.io','nightly.link','www.contributor-covenant.org','contributor-covenant.org','creativecommons.org'].includes(u.hostname))throw Error('Link is not allowed.');
    await shell.openExternal(u.href);
  });
  await window.loadURL(documentUrl);
  updates.start();
}
if(hasLock)app.whenReady().then(main).catch(error=>{dialog.showErrorBox('download.net could not start',error.message);app.quit();});
app.on('before-quit',event=>{if(backend&&!quitting){event.preventDefault();quitting=true;active?.abort();backend.stop().finally(()=>app.quit());}else{quitting=true;}});
app.on('window-all-closed',()=>{active?.abort();app.quit();});

app.on('will-quit',()=>updates?.stop());
