const { app, BrowserWindow, Menu } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

let backendProcess = null;
let mainWindow = null;
let frontendServer = null;

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

async function createWindow(frontendUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    menu: null,
  });

  mainWindow.loadURL(frontendUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });


  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  Menu.setApplicationMenu(null);
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
