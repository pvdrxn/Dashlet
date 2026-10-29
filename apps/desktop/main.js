const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, screen, nativeImage } = require('electron');
const { fork, spawn } = require('child_process');
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
      label: 'Dashlet (Widgets Desktop)',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Mostrar / Ocultar (Ctrl+Shift+D)',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
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

  tray.setToolTip('Dashlet');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
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

function setupIpc() {
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    win.setIgnoreMouseEvents(Boolean(ignore), options || { forward: true });
  });

  ipcMain.on('get-desktop-metrics-sync', (event) => {
    const display = screen.getPrimaryDisplay();
    const taskbarHeight = Math.max(
      0,
      display.bounds.height - (display.workArea.y + display.workArea.height),
    );
    event.returnValue = {
      taskbarHeight,
      bottomExtra: BOTTOM_EXTRA,
      topOffset: TOP_OFFSET,
    };
  });
}

const TOP_OFFSET = 25;
const BOTTOM_EXTRA = 60;

function setupWin32DesktopWindow(win) {
  if (process.platform !== 'win32') return;

  const hwndBuf = win.getNativeWindowHandle();
  const hwndStr =
    hwndBuf.length === 8
      ? hwndBuf.readBigUInt64LE(0).toString()
      : hwndBuf.readUInt32LE(0).toString();

  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class Win32Desktop {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindowEx(IntPtr parentHandle, IntPtr childAfter, string className, string windowTitle);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    public static IntPtr GetShellDefView() {
        IntPtr progman = FindWindow("Progman", null);
        IntPtr defView = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (defView == IntPtr.Zero) {
            EnumWindows((h, l) => {
                IntPtr dv = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (dv != IntPtr.Zero) {
                    defView = dv;
                    return false;
                }
                return true;
            }, IntPtr.Zero);
        }
        return defView;
    }

    public static void PinToDesktop(long rawHwnd) {
        IntPtr hwnd = new IntPtr(rawHwnd);
        IntPtr defView = GetShellDefView();
        if (defView != IntPtr.Zero) {
            SetWindowLongPtr(hwnd, -8, defView);
        }
    }
}
"@
[Win32Desktop]::PinToDesktop([long]${hwndStr})
`;

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
    { windowsHide: true, stdio: 'ignore' },
  );
}

async function createWindow(frontendUrl) {
  const primaryBounds = screen.getPrimaryDisplay().bounds;

  mainWindow = new BrowserWindow({
    width: primaryBounds.width,
    height: primaryBounds.height + TOP_OFFSET + BOTTOM_EXTRA,
    x: primaryBounds.x,
    y: primaryBounds.y - TOP_OFFSET,
    transparent: true,
    frame: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    resizable: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    enableLargerThanScreen: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    menu: null,
    autoHideMenuBar: true,
  });

  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadURL(frontendUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.setBounds({
      x: primaryBounds.x,
      y: primaryBounds.y - TOP_OFFSET,
      width: primaryBounds.width,
      height: primaryBounds.height + TOP_OFFSET + BOTTOM_EXTRA,
    });
    mainWindow.show();
    mainWindow.setMenuBarVisibility(false);
    setupWin32DesktopWindow(mainWindow);
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
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  if (!isDev) {
    const publicPath = getPublicPath();
    const port = await startFrontendServer(publicPath);
    createWindow(`http://localhost:${port}`);
  } else {
    createWindow(`http://localhost:${BACKEND_PORT}`);
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
