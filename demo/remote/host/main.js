const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const { mouse, keyboard, Key, Point } = require('@nut-tree-fork/nut-js');

// Optional: configure nut.js
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  return sources.map(source => ({
    id: source.id,
    name: source.name
  }));
});

// Calculate absolute position based on relative coordinates
let screenWidth = 1920;
let screenHeight = 1080;
// Note: nut-js can fetch screen sizes, but for simplicity we rely on standard or fetched
const { screen } = require('@nut-tree-fork/nut-js');
screen.width().then(w => screenWidth = w);
screen.height().then(h => screenHeight = h);

ipcMain.on('mouse-move', async (event, { x, y }) => {
  try {
    const targetX = Math.floor(x * screenWidth);
    const targetY = Math.floor(y * screenHeight);
    await mouse.setPosition(new Point(targetX, targetY));
  } catch(e) {
    console.error("Mouse move error", e);
  }
});

ipcMain.on('mouse-click', async (event, { button }) => {
  try {
    // default left click for now
    await mouse.leftClick();
  } catch(e) {
    console.error("Mouse click error", e);
  }
});

ipcMain.on('type-text', async (event, { text }) => {
  try {
    await keyboard.type(text);
  } catch(e) {
    console.error("Type text error", e);
  }
});

ipcMain.on('key-down', async (event, { keys }) => {
  try {
    // Map string keys to nut-js Key enum
    // This is a simplified mapping
    const keyMap = {
      'enter': Key.Enter,
      'escape': Key.Escape,
      'backspace': Key.Backspace,
      'tab': Key.Tab,
      'space': Key.Space,
      // Add others as needed
    };
    
    // For single keys, just type them. If array, it's a shortcut.
    if (Array.isArray(keys)) {
      // In nut-js we can use keyboard.pressKey
      // E.g. [Key.LeftControl, Key.C]
    }
  } catch(e) {
    console.error("Key down error", e);
  }
});
