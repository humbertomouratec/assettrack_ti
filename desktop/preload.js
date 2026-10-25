const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  platform: process.platform,
  version: '1.2.0',
  sendNotification: (title, body) => {
    ipcRenderer.send('app-notification', { title, body });
  },
  minimizeToTray: () => {
    ipcRenderer.send('minimize-to-tray');
  },
  reconnect: (newUrl) => {
    ipcRenderer.send('reconnect-server', newUrl);
  },
  setServerUrl: (newUrl) => {
    ipcRenderer.send('set-server-url', newUrl);
  },
  getServerUrl: () => {
    return ipcRenderer.invoke('get-server-url');
  },
  openConfigWindow: () => {
    ipcRenderer.send('open-config-window');
  },
  closeConfigWindow: () => {
    ipcRenderer.send('close-config-window');
  }
});
