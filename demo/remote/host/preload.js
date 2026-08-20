const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  mouseMove: (coords) => ipcRenderer.send('mouse-move', coords),
  mouseClick: (data) => ipcRenderer.send('mouse-click', data),
  typeText: (data) => ipcRenderer.send('type-text', data),
  keyDown: (data) => ipcRenderer.send('key-down', data),
});
