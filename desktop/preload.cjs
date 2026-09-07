const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nutty', {
  settings: () => ipcRenderer.invoke('settings:get'),
  chooseInstallFolder: () => ipcRenderer.invoke('settings:choose-folder'),
  configure: settings => ipcRenderer.invoke('settings:set',settings),
  api: (route,body) => ipcRenderer.invoke('api',route,body),
  download: id => ipcRenderer.invoke('download',id),
  cancel: () => ipcRenderer.invoke('download:cancel'),
  reveal: () => ipcRenderer.invoke('download:reveal'),
  chooseFolder: () => ipcRenderer.invoke('publish:choose'),
  publish: (fields,token) => ipcRenderer.invoke('publish:submit',fields,token),
  openLink: url => ipcRenderer.invoke('open-link',url),
  onProgress: callback => { const listener=(_event,value)=>callback(value); ipcRenderer.on('progress',listener); return ()=>ipcRenderer.removeListener('progress',listener); }
});
