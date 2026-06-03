/**
 * MS Accounting – Electron Main Process
 * Starts the FastAPI backend as a child process, then opens a BrowserWindow.
 * Auto-updates: frontend fetched from GitHub on each launch (if online).
 *               App release notifications via GitHub Releases API.
 */

const { app, BrowserWindow, Tray, Menu, shell, Notification } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');

// ─── Config ─────────────────────────────────────────────────────────────────
const PORT      = 8765;
const IS_DEV    = !app.isPackaged;
const REPO      = 'mosaeed1099-ship-it/ms-accounting';
const RAW_BASE  = `https://raw.githubusercontent.com/${REPO}/main/frontend`;
const API_BASE  = `https://api.github.com/repos/${REPO}/releases/latest`;

let mainWindow     = null;
let splashWindow   = null;
let backendProcess = null;
let tray           = null;

// ─── Path helpers ────────────────────────────────────────────────────────────
function resourcePath(...parts) {
  return IS_DEV
    ? path.join(__dirname, '..', '..', ...parts)
    : path.join(process.resourcesPath, ...parts);
}

function assetPath(...parts) {
  return path.join(__dirname, 'assets', ...parts);
}

function dataDir() {
  const d = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ─── HTTPS helper ─────────────────────────────────────────────────────────────
function httpsGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'MSAccounting-Desktop' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── Auto-update: download latest frontend from GitHub ────────────────────────
async function autoUpdateFrontend() {
  const cacheDir  = path.join(app.getPath('userData'), 'frontend-cache');
  const cacheFile = path.join(cacheDir, 'index.html');
  try {
    console.log('[update] Fetching latest frontend from GitHub…');
    const result = await httpsGet(`${RAW_BASE}/index.html`);
    if (result.status === 200 && result.body.length > 1000) {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cacheFile, result.body, 'utf8');
      console.log('[update] Frontend updated ✓ (' + result.body.length + ' bytes)');
      return cacheFile;
    }
  } catch (e) {
    console.log('[update] Frontend fetch failed (offline?):', e.message);
  }
  // Fall back to cached version if available
  if (fs.existsSync(cacheFile)) {
    console.log('[update] Using cached frontend');
    return cacheFile;
  }
  return null;
}

// ─── Auto-update: check for new app release on GitHub ────────────────────────
async function checkForNewRelease() {
  try {
    const result = await httpsGet(API_BASE);
    if (result.status !== 200) return;
    const release = JSON.parse(result.body);
    const latestTag = release.tag_name?.replace(/^v/, '');
    const currentVer = app.getVersion();
    if (latestTag && latestTag !== currentVer) {
      console.log(`[update] New release available: ${latestTag} (current: ${currentVer})`);
      showUpdateNotification(latestTag, release.html_url);
    } else {
      console.log('[update] App is up-to-date:', currentVer);
    }
  } catch (e) {
    console.log('[update] Release check failed:', e.message);
  }
}

function showUpdateNotification(newVersion, releaseUrl) {
  // Show in-window banner via injected JS
  mainWindow?.webContents.executeJavaScript(`
    (function() {
      if (document.getElementById('__ms_update_banner')) return;
      const b = document.createElement('div');
      b.id = '__ms_update_banner';
      b.style = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;' +
                'background:#1e40af;color:#fff;padding:10px 20px;border-radius:10px;' +
                'font-family:Arial,sans-serif;font-size:14px;direction:rtl;text-align:right;' +
                'box-shadow:0 4px 20px rgba(0,0,0,.3);display:flex;align-items:center;gap:12px;';
      b.innerHTML = '<span>🆕 يوجد إصدار جديد <b>${newVersion}</b> — قم بتحميله من GitHub</span>' +
                    '<button onclick="require(\\'electron\\').shell.openExternal(\\'${releaseUrl}\\');this.parentNode.remove();" ' +
                    'style="background:#3b82f6;border:none;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;">تحميل</button>' +
                    '<button onclick="this.parentNode.remove();" ' +
                    'style="background:transparent;border:1px solid rgba(255,255,255,.4);color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;">×</button>';
      document.body.appendChild(b);
    })();
  `).catch(() => {});

  // Also show OS notification
  if (Notification.isSupported()) {
    new Notification({
      title: 'MS Accounting — تحديث جديد',
      body: `الإصدار ${newVersion} متاح. افتح البرنامج للتحديث.`,
    }).show();
  }
}

// ─── Backend ─────────────────────────────────────────────────────────────────
function startBackend() {
  const dd        = dataDir();
  const dbPath    = path.join(dd, 'ms-accounting.db');
  const uploadsDir = path.join(dd, 'uploads');
  const backupsDir = path.join(dd, 'backups');

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

/** Poll /health every 800ms up to timeout ms. */
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

// ─── Splash window ────────────────────────────────────────────────────────────
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

// ─── Main window ──────────────────────────────────────────────────────────────
function createMainWindow(frontendPath) {
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
      // Check for app update after window loads (non-blocking)
      setTimeout(() => checkForNewRelease(), 3000);
    });

    mainWindow.once('ready-to-show', () => resolve());
    setTimeout(resolve, 10000); // fallback

    mainWindow.on('close', (e) => {
      if (!app.isQuiting) { e.preventDefault(); mainWindow.hide(); }
    });
    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    const loadPath = frontendPath || resourcePath('frontend', 'index.html');
    console.log('[main] Loading frontend from:', loadPath);
    mainWindow.loadFile(loadPath).catch(err => {
      console.error('[main] loadFile error, falling back to bundle:', err.message);
      mainWindow.loadFile(resourcePath('frontend', 'index.html')).catch(() => resolve());
    });
  });
}

// ─── System Tray ──────────────────────────────────────────────────────────────
function createTray() {
  const iconFile = process.platform === 'win32'
    ? assetPath('icon-tray.ico')
    : assetPath('icon-tray.png');
  try { tray = new Tray(iconFile); }
  catch { tray = new Tray(assetPath('icon.png')); }

  tray.setToolTip('MS Accounting');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'فتح MS Accounting', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'إنهاء البرنامج', click: () => { app.isQuiting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else { mainWindow?.show(); mainWindow?.focus(); }
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash();
  startBackend();

  // Run in parallel: fetch updated frontend + wait for backend
  const [frontendCache, backendReady] = await Promise.all([
    autoUpdateFrontend(),
    waitForBackend(90000),
  ]);

  console.log('[main] Backend ready:', backendReady, '| Frontend cache:', frontendCache ?? 'bundle');

  await createMainWindow(frontendCache);
  createTray();

  splashWindow?.close();
  splashWindow = null;

  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }

  if (!backendReady) {
    console.error('[main] Backend did not start within 90 seconds');
  }
});

app.on('window-all-closed', () => { /* keep alive in tray */ });

app.on('activate', async () => {
  if (!mainWindow) {
    const cached = path.join(app.getPath('userData'), 'frontend-cache', 'index.html');
    await createMainWindow(fs.existsSync(cached) ? cached : null);
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
