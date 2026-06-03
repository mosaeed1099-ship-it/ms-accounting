/**
 * MS Accounting – Electron Main Process
 * Starts the FastAPI backend as a child process, then opens a BrowserWindow.
 */

const { app, BrowserWindow, Tray, Menu, shell, dialog } = require('electron');
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
    // Development: run Python directly
    const py = process.platform === 'win32' ? 'python' : 'python3';
    backendProcess = spawn(py, [resourcePath('desktop', 'launcher.py')], { env });
  } else {
    // Production: run bundled executable
    const ext  = process.platform === 'win32' ? '.exe' : '';
    const exe  = path.join(
      process.resourcesPath, 'backend',
      'ms_accounting_server', `ms_accounting_server${ext}`
    );
    backendProcess = spawn(exe, [], { env });
  }

  backendProcess.stdout?.on('data', d => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr?.on('data', d => console.error('[backend]', d.toString().trim()));
  backendProcess.on('exit', code => {
    if (code !== 0 && code !== null) {
      console.error(`[backend] exited with code ${code}`);
    }
  });
}

function waitForBackend(timeout = 20000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
        if (res.statusCode < 500) return resolve(true);
        retry();
      }).on('error', retry);
    };
    function retry() {
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(check, 500);
    }
    check();
  });
}

// ─── Splash window ───────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 380, height: 260,
    frame: false, alwaysOnTop: true,
    transparent: true,
    webPreferences: { contextIsolation: true },
    icon: assetPath('icon.png'),
  });
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head><meta charset="utf-8">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI','Arial',sans-serif; }
      body { background:linear-gradient(135deg,#0f172a,#1a2472);
             border-radius:18px; display:flex; flex-direction:column;
             align-items:center; justify-content:center; height:260px; color:white; }
      h1 { font-size:22px; font-weight:800; margin:12px 0 6px; }
      p  { font-size:13px; color:rgba(255,255,255,.6); margin-bottom:24px; }
      .bar { width:200px; height:5px; background:rgba(255,255,255,.15); border-radius:99px; overflow:hidden; }
      .fill { height:100%; background:linear-gradient(90deg,#4ade80,#22c55e);
               border-radius:99px; animation:load 2s ease infinite; }
      @keyframes load { 0%{width:0%} 100%{width:100%} }
      .logo { font-size:48px; }
    </style></head>
    <body>
      <div class="logo">📊</div>
      <h1>MS Accounting</h1>
      <p>جاري التشغيل...</p>
      <div class="bar"><div class="fill"></div></div>
    </body></html>
  `)}`);
}

// ─── Main window ─────────────────────────────────────────────────────────────
async function createMainWindow() {
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
      webSecurity: false,    // allow file:// → localhost API calls
    },
  });

  await mainWindow.loadFile(resourcePath('frontend', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    // Inject desktop API URL so the frontend knows where to call
    mainWindow.webContents.executeJavaScript(
      `window.__MS_DESKTOP_PORT = ${PORT};`
    );
  });

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of quitting
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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
    tray = new Tray(assetPath('icon.png'));  // fallback
  }

  tray.setToolTip('MS Accounting');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'فتح MS Accounting', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'إنهاء البرنامج', click: () => { app.isQuiting = true; app.quit(); } },
  ]));

  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else { mainWindow?.show(); mainWindow?.focus(); }
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash();
  startBackend();

  const ready = await waitForBackend();

  await createMainWindow();
  createTray();

  splashWindow?.close();
  splashWindow = null;

  mainWindow.show();

  if (!ready) {
    dialog.showErrorBox(
      'خطأ في التشغيل',
      'تعذّر تشغيل الخادم المحلي.\nتأكد من أن البرنامج مثبت بشكل صحيح وأعد المحاولة.'
    );
  }
});

app.on('window-all-closed', () => {
  // Keep alive in tray (don't quit)
});

app.on('activate', () => {
  // macOS: re-open window when clicking Dock icon
  if (!mainWindow) createMainWindow();
  else mainWindow.show();
});

app.on('before-quit', () => {
  app.isQuiting = true;
  backendProcess?.kill();
});
