const { contextBridge, ipcRenderer } = require('electron');
async function invoke(channel,...args) {
  const result=await ipcRenderer.invoke(channel,...args);
  if(!result?.ok)throw Error(result?.error||'The launcher returned an invalid response.');
  return result.value;
}
contextBridge.exposeInMainWorld('nutty', {
  updateState: () => invoke('updates:get'),
  checkUpdates: () => invoke('updates:check'),
  installUpdate: () => invoke('updates:install'),
  onUpdate: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('updates:state',listener);return ()=>ipcRenderer.removeListener('updates:state',listener);},
  settings: () => invoke('settings:get'),
  resetInstallFolder: () => invoke('settings:reset-folder'),
  chooseInstallFolder: () => invoke('settings:choose-folder'),
  api: (route,body) => invoke('api',route,body),
  download: id => invoke('download',id),
  cancel: () => invoke('download:cancel'),
  reveal: () => invoke('download:reveal'),
  chooseFolder: () => invoke('publish:choose'),
  publish: (fields,token) => invoke('publish:submit',fields,token),
  openLink: url => invoke('open-link',url),
  onConnectionError: callback => { const listener=(_event,message)=>callback(message); ipcRenderer.on('connection-error',listener); return ()=>ipcRenderer.removeListener('connection-error',listener); },
  onProgress: callback => { const listener=(_event,value)=>callback(value); ipcRenderer.on('progress',listener); return ()=>ipcRenderer.removeListener('progress',listener); }
});
