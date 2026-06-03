/**
 * MS Accounting – Electron Main Process
 * Starts the FastAPI backend as a child process, then opens a BrowserWindow.
 */

const { app, BrowserWindow, Tray, Menu, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ─── Config ─────────────────────────────────────────────────────────────────
const PORT = 8765;
const IS_DEV = !app.isPackaged;

let mainWindow = null;
let splashWindow = null;
let backendProcess = null;
let tray = null;

// ─── Path helpers ────────────────────────────────────────────────────────────
function resourcePath(...parts) {
  return IS_DEV
    ? path.join(__dirname, '..', '..', ...parts)           // development
    : path.join(process.resourcesPath, ...parts);           // packaged
}

function assetPath(...parts) {
  return path.join(__dirname, 'assets', ...parts);
}

function dataDir() {
  const d = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ─── Backend ─────────────────────────────────────────────────────────────────
function startBackend() {
  const dd = dataDir();
  const dbPath      = path.join(dd, 'ms-accounting.db');
  const uploadsDir  = path.join(dd, 'uploads');
  const backupsDir  = path.join(dd, 'backups');

  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });

  const env = {
    ...process.env,
    DESKTOP_MODE : '1',
    PORT         : String(PORT),
    DATABASE_URL : `sqlite:///${dbPath}`,
    UPLOAD_DIR   : uploadsDir,
    BACKUP_DIR   : backupsDir,
    SECRET_KEY   : 'ms-accounting-desktop-secret-2024-xK9m',
    MS_DATA_DIR  : dd,
  };

  if (IS_DEV) {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    backendProcess = spawn(py, [resourcePath('desktop', 'launcher.py')], { env });
  } else {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const exe = path.join(
      process.resourcesPath, 'backend',
      'ms_accounting_server', `ms_accounting_server${ext}`
    );
    backendProcess = spawn(exe, [], { env });
  }

  backendProcess.stdout?.on('data', d => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr?.on('data', d => console.error('[backend]', d.toString().trim()));
  backendProcess.on('exit', code => {
    if (code !== 0 && code !== null)
      console.error(`[backend] exited with code ${code}`);
  });
}

/** Poll /health every 500ms, resolve when backend answers, or after timeout. */
function waitForBackend(timeout = 90000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
        if (res.statusCode < 500) return resolve(true);
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    };
    function retry() {
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(check, 800);
    }
    check();
  });
}

// ─── Splash window ───────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 380, height: 280,
    frame: false, alwaysOnTop: true,
    transparent: true,
    webPreferences: { contextIsolation: true },
    icon: assetPath('icon.png'),
  });
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI','Arial',sans-serif; }
      body { background:linear-gradient(135deg,#0f172a,#1a2472);
             border-radius:18px; display:flex; flex-direction:column;
             align-items:center; justify-content:center; height:280px; color:white; }
      h1 { font-size:22px; font-weight:800; margin:12px 0 6px; }
      p  { font-size:13px; color:rgba(255,255,255,.7); margin-bottom:8px; }
      .hint { font-size:11px; color:rgba(255,255,255,.4); margin-bottom:20px; }
      .bar { width:220px; height:5px; background:rgba(255,255,255,.15); border-radius:99px; overflow:hidden; }
      .fill { height:100%; background:linear-gradient(90deg,#4ade80,#22c55e);
               border-radius:99px; animation:load 2.5s ease infinite; }
      @keyframes load { 0%{width:5%} 80%{width:95%} 100%{width:100%} }
      .logo { font-size:52px; }
    </style></head>
    <body>
      <div class="logo">📊</div>
      <h1>MS Accounting</h1>
      <p>جاري التشغيل...</p>
      <p class="hint">قد يستغرق التشغيل الأول دقيقة واحدة</p>
      <div class="bar"><div class="fill"></div></div>
    </body></html>
  `)}`);
}

// ─── Main window ─────────────────────────────────────────────────────────────
function createMainWindow() {
  return new Promise((resolve) => {
    mainWindow = new BrowserWindow({
      width: 1440, height: 900,
      minWidth: 900, minHeight: 600,
      show: false,
      icon: assetPath('icon.png'),
      title: 'MS Accounting',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false,
      },
    });

    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(
        `window.__MS_DESKTOP_PORT = ${PORT};`
      );
    });

    // Show window when it's ready to render
    mainWindow.once('ready-to-show', () => resolve());
    // Fallback timeout
    setTimeout(resolve, 10000);

    mainWindow.on('close', (e) => {
      if (!app.isQuiting) {
        e.preventDefault();
        mainWindow.hide();
      }
    });

    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    const frontendPath = resourcePath('frontend', 'index.html');
    console.log('[main] Loading frontend from:', frontendPath);
    mainWindow.loadFile(frontendPath).catch(err => {
      console.error('[main] loadFile error:', err);
      resolve();
    });
  });
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  const iconFile = process.platform === 'win32'
    ? assetPath('icon-tray.ico')
    : assetPath('icon-tray.png');

  try {
    tray = new Tray(iconFile);
  } catch {
    tray = new Tray(assetPath('icon.png'));
  }

  tray.setToolTip('MS Accounting');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'فتح MS Accounting', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'إنهاء البرنامج', click: () => { app.isQuiting = true; app.quit(); } },
  ]));

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else { mainWindow?.show(); mainWindow?.focus(); }
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 1. Show splash immediately
  createSplash();

  // 2. Start backend process
  startBackend();

  // 3. In parallel: build main window AND wait for backend
  const [backendReady] = await Promise.all([
    waitForBackend(90000),
    createMainWindow(),
  ]);

  console.log('[main] Backend ready:', backendReady, '— showing main window');

  // 4. Close splash, show main window
  splashWindow?.close();
  splashWindow = null;

  createTray();

  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }

  if (!backendReady) {
    console.error('[main] Backend did not start within 90 seconds');
    // Don't block with dialog — the frontend will show its own connection error
  }
});

app.on('window-all-closed', () => {
  // Keep app alive in tray (macOS convention)
});

app.on('activate', async () => {
  if (!mainWindow) {
    await createMainWindow();
    mainWindow?.show();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  backendProcess?.kill();
});
