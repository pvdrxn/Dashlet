const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },
  getMetricsSync: () => {
    try {
      return ipcRenderer.sendSync('get-desktop-metrics-sync');
    } catch {
      return null;
    }
  },
});
