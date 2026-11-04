const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Controles de ventana estándar (estilo Linear / Notion)
  minimize: () => {
    ipcRenderer.send('window-minimize');
  },
  maximize: () => {
    ipcRenderer.send('window-maximize');
  },
  close: (toTray = false) => {
    ipcRenderer.send('window-close', toTray);
  },
  isMaximized: () => {
    try {
      return ipcRenderer.sendSync('window-is-maximized-sync');
    } catch {
      return false;
    }
  },
  toggleFullscreen: () => {
    ipcRenderer.send('window-toggle-fullscreen');
  },
  isFullScreen: () => {
    try {
      return ipcRenderer.sendSync('window-is-fullscreen-sync');
    } catch {
      return false;
    }
  },
  onMaximizeChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximize-changed', subscription);
    return () => ipcRenderer.removeListener('window-maximize-changed', subscription);
  },

  // Métodos de visibilidad y compatibilidad
  hideWindow: () => {
    ipcRenderer.send('hide-window');
  },
  showWindow: () => {
    ipcRenderer.send('show-window');
  },
  getMetricsSync: () => {
    try {
      return ipcRenderer.sendSync('get-desktop-metrics-sync');
    } catch {
      return null;
    }
  },
});
