export const RELEASES_URL='https://github.com/nuttyinc578/download.net/releases/latest';
function noteText(value){
 const notes=typeof value==='string'?value:Array.isArray(value)?value.map(n=>n.note||'').join('\n\n'):'';
 // The UI renders textContent only. Strip feed formatting for readability, never render release HTML.
 return notes.slice(0,16000).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(amp|lt|gt|quot|#39);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[entity])).trim();
}
export class LauncherUpdates {
 constructor({engine,version,mode='installed',emit=()=>{},canInstall=()=>true,beforeInstall=async()=>{},installFailed=async()=>{},schedule=setInterval,unschedule=clearInterval}){
  Object.assign(this,{engine,emit,canInstall,beforeInstall,installFailed,schedule,unschedule});
  this.state={mode,currentVersion:version,latestVersion:null,phase:engine?'idle':'unsupported',percent:0,transferred:0,total:0,lastChecked:null,notes:'',error:null,releaseUrl:RELEASES_URL};
  this.pending=null;this.timer=null;this.closed=false;this.listeners=[];
  if(!engine)return;
  engine.autoDownload=mode==='installed';engine.autoInstallOnAppQuit=mode==='installed';engine.autoRunAppAfterInstall=true;engine.allowPrerelease=false;engine.allowDowngrade=false;engine.disableWebInstaller=true;
  const listen=(event,callback)=>{engine.on(event,callback);this.listeners.push([event,callback]);};
  listen('checking-for-update',()=>this.patch({phase:'checking',error:null}));
  const info=value=>({latestVersion:String(value.version),notes:noteText(value.releaseNotes)});
  listen('update-available',value=>this.patch({...info(value),phase:'available',error:null}));
  listen('update-not-available',value=>this.patch({...info(value),phase:'current',percent:0,error:null}));
  listen('download-progress',value=>this.patch({phase:'downloading',percent:Math.max(0,Math.min(100,Number(value.percent)||0)),transferred:Number(value.transferred)||0,total:Number(value.total)||0,error:null}));
  listen('update-downloaded',value=>this.patch({...info(value),phase:'ready',percent:100,error:null}));
  listen('error',error=>this.fail(error));
 }
 snapshot(){return {...this.state};}
 patch(change){Object.assign(this.state,change);this.emit(this.snapshot());}
 fail(error){const installing=this.state.phase==='installing';this.patch({phase:'error',error:'Could not update download.net. Check your connection and try again. '+String(error.message||error).slice(0,350)});if(installing)void Promise.resolve().then(()=>this.installFailed()).catch(()=>{});}
 check(){
  if(this.pending)return this.pending;
  if(!this.engine||this.closed||['ready','installing'].includes(this.state.phase))return Promise.resolve(this.snapshot());
  this.patch({phase:'checking',error:null,lastChecked:new Date().toISOString(),percent:0});
  this.pending=Promise.resolve().then(()=>this.engine.checkForUpdates()).then(async result=>{if(result?.downloadPromise)await result.downloadPromise;return this.snapshot();}).catch(error=>{this.fail(error);return this.snapshot();}).finally(()=>{this.pending=null;});
  return this.pending;
 }
 start(){if(!this.engine||this.timer||this.closed)return;void this.check();this.timer=this.schedule(()=>void this.check(),6*60*60*1000);this.timer?.unref?.();}
 async install(){
  if(!this.engine||this.state.mode!=='installed'||this.state.phase!=='ready')throw Error('Download a verified launcher update before restarting.');
  if(!this.canInstall())throw Error('Wait for your app download or publishing to finish before restarting.');
  this.patch({phase:'installing',error:null});
  try{await this.beforeInstall();this.engine.quitAndInstall(true,true);}catch(error){this.fail(error);}
  return this.snapshot();
 }
 stop(){this.closed=true;if(this.timer)this.unschedule(this.timer);this.timer=null;}
}
