const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, screen, nativeImage } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

let backendProcess = null;
let mainWindow = null;
let frontendServer = null;
let tray = null;

function setupTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  try {
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
  } catch (err) {
    console.error('Error creating Tray:', err);
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Dashlet',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Mostrar / Ocultar (Ctrl+Shift+D)',
      click: () => {
        toggleWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Cerrar Dashlet',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Dashlet (Ctrl+Shift+D)');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    toggleWindow();
  });
}

const isDev = !app.isPackaged;
const BACKEND_PORT = 3001;
const FRONTEND_PORT = 3002;

function getBackendPath() {
  if (isDev) {
    return path.join(__dirname, '..', 'backend', 'dist', 'main.js');
  }
  return path.join(process.resourcesPath, 'resources', 'backend', 'dist', 'main.js');
}

function waitForServer(url, maxRetries = 60) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      http.get(url, () => resolve()).on('error', () => {
        retries++;
        if (retries >= maxRetries) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

function getDbPath() {
  if (isDev) {
    return path.join(__dirname, '..', 'backend', 'prisma', 'dev.db');
  }
  return path.join(app.getPath('userData'), 'dev.db');
}

function ensureDatabase() {
  if (isDev) return;
  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) return;
  const bundledDb = path.join(process.resourcesPath, 'resources', 'backend', 'prisma', 'dev.db');
  if (!fs.existsSync(bundledDb)) return;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.copyFileSync(bundledDb, dbPath);
}

async function startBackend() {
  const backendPath = getBackendPath();
  ensureDatabase();
  const dbPath = getDbPath();
  const env = {
    ...process.env,
    NODE_ENV: isDev ? 'development' : 'production',
    PORT: String(BACKEND_PORT),
    DATABASE_URL: `file:${dbPath}`,
  };

  backendProcess = fork(backendPath, [], { env, stdio: 'pipe' });

  backendProcess.stdout?.on('data', (data) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on('data', (data) => {
    console.error(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    backendProcess = null;
  });

  await waitForServer(`http://localhost:${BACKEND_PORT}/api/v1/widgets`);
}

function getPublicPath() {
  if (isDev) return '';
  return path.join(process.resourcesPath, 'resources', 'backend', 'public');
}

function startFrontendServer(publicPath) {
  return new Promise((resolve, reject) => {
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.json': 'application/json',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    };

    frontendServer = http.createServer((req, res) => {
      let url = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      let filePath = path.join(publicPath, url);
      if (!filePath.startsWith(publicPath)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          return fs.readFile(path.join(publicPath, 'index.html'), (e2, d2) => {
            res.writeHead(e2 ? 404 : 200, { 'Content-Type': 'text/html' });
            res.end(e2 ? 'Not found' : d2);
          });
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    frontendServer.listen(FRONTEND_PORT, () => resolve(frontendServer.address().port));
    frontendServer.on('error', reject);
  });
}

function toggleWindow() {
  if (!mainWindow) return;

  if (mainWindow.isVisible()) {
    if (mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function setupIpc() {
  ipcMain.on('window-minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', (_event, toTray) => {
    if (!mainWindow) return;
    if (toTray && tray) {
      mainWindow.hide();
    } else {
      mainWindow.close();
    }
  });

  ipcMain.on('window-is-maximized-sync', (event) => {
    event.returnValue = mainWindow ? mainWindow.isMaximized() : false;
  });

  ipcMain.on('window-toggle-fullscreen', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  ipcMain.on('window-is-fullscreen-sync', (event) => {
    event.returnValue = mainWindow ? mainWindow.isFullScreen() : false;
  });

  ipcMain.on('hide-window', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    }
  });

  ipcMain.on('show-window', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.on('get-desktop-metrics-sync', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const currentDisplay = win
      ? screen.getDisplayMatching(win.getBounds())
      : screen.getPrimaryDisplay();
    event.returnValue = {
      taskbarHeight: 0,
      bottomExtra: 0,
      topOffset: 0,
      bounds: currentDisplay.bounds,
      workArea: currentDisplay.workArea,
      isMaximized: win ? win.isMaximized() : false,
    };
  });
}

async function createWindow(frontendUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    center: true,
    title: 'Dashlet',
    backgroundColor: '#0F1013',
    frame: false,
    transparent: false,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    menu: null,
    autoHideMenuBar: true,
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximize-changed', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximize-changed', false);
  });

  mainWindow.loadURL(frontendUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  Menu.setApplicationMenu(null);
  setupIpc();
  setupTray();
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    toggleWindow();
  });

  if (!isDev) {
    const publicPath = getPublicPath();
    const port = await startFrontendServer(publicPath);
    createWindow(`http://localhost:${port}`);
  } else {
    createWindow(process.env.FRONTEND_DEV_URL || `http://localhost:${BACKEND_PORT}`);
  }
  startBackend().catch((err) => {
    console.error('Failed to start backend:', err);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (frontendServer) {
    frontendServer.close();
    frontendServer = null;
  }
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    if (!isDev) {
      const publicPath = getPublicPath();
      startFrontendServer(publicPath).then((port) => {
        createWindow(`http://localhost:${port}`);
      });
    } else {
      createWindow(`http://localhost:${BACKEND_PORT}`);
    }
  }
});
