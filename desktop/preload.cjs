const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nutty', {
  updateState: () => ipcRenderer.invoke('updates:get'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdate: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('updates:state',listener);return ()=>ipcRenderer.removeListener('updates:state',listener);},
  settings: () => ipcRenderer.invoke('settings:get'),
  chooseInstallFolder: () => ipcRenderer.invoke('settings:choose-folder'),
  api: (route,body) => ipcRenderer.invoke('api',route,body),
  download: id => ipcRenderer.invoke('download',id),
  cancel: () => ipcRenderer.invoke('download:cancel'),
  reveal: () => ipcRenderer.invoke('download:reveal'),
  chooseFolder: () => ipcRenderer.invoke('publish:choose'),
  publish: (fields,token) => ipcRenderer.invoke('publish:submit',fields,token),
  openLink: url => ipcRenderer.invoke('open-link',url),
  onConnectionError: callback => { const listener=(_event,message)=>callback(message); ipcRenderer.on('connection-error',listener); return ()=>ipcRenderer.removeListener('connection-error',listener); },
  onProgress: callback => { const listener=(_event,value)=>callback(value); ipcRenderer.on('progress',listener); return ()=>ipcRenderer.removeListener('progress',listener); }
});
