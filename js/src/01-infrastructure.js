// ── API URL detection ─────────────────────────────────────────────────────────
// Priority: 1) Electron desktop injection  2) localhost dev  3) production subdomain
const API = (() => {
  // 1) config.js sets window.MS_API — always wins on production
  if (window.MS_API) return window.MS_API;
  // 2) Electron desktop mode: preload exposes window.__msDesktop
  if (window.__msDesktop?.isDesktop) return window.__msDesktop.getApiUrl();
  // 3) Direct file:// open or MS_DESKTOP_PORT injected by Electron main process
  if (window.location.protocol === 'file:' || window.__MS_DESKTOP_PORT)
    return `http://127.0.0.1:${window.__MS_DESKTOP_PORT || 8765}`;
  // 4) localhost dev
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    return `http://${window.location.hostname}:${window.location.port || 8765}`;
  // 5) fallback: api.domain.com
  return `https://${window.location.hostname.replace(/^[^.]+\./, 'api.')}`;
})();
let token = localStorage.getItem('ms_token');
let currentUser = JSON.parse(localStorage.getItem('ms_user') || 'null');
if (token) window._lastApiOk = Date.now();

let currentPage = 'dashboard';
let chartInstances = {};

// ── REAL-TIME SYNC ENGINE ──────────────────────────────────────────────────
// WebSocket-based live sync: multi-user real-time like Notion / Monday.
// Any mutation → server broadcasts → all connected clients update silently.

let _rt_ws        = null;
let _rt_reconnect = null;
let _rt_retries   = 0;
let _rt_intervals = [];
let _silentRefresh = false;  // When true: load functions skip the loading spinner

// Maps server entity names → page IDs + refresh functions
const _RT_ENTITY_MAP = {
  // Core entities
  clients:              { pages:['clients'],               fn:()=>loadClients(true),             dash:true  },
  leads:                { pages:['leads'],                  fn:()=>loadLeads(true),               dash:true  },
  invoices:             { pages:['invoices'],               fn:()=>loadInvoices(true),            dash:true  },
  collections:          { pages:['collections'],            fn:()=>loadCollections(true),                         dash:true },
  tasks:                { pages:['tasks'],                  fn:()=>{ loadTasks(true); loadNotifCount(); }, dash:true  },
  establishment:        { pages:['establishment'],          fn:()=>loadEstablishment(true),       dash:false },
  obligations:          { pages:['obligations'],            fn:()=>{ loadObligations(true); loadNotifCount(); }, dash:true  },
  formation_obligations:{ pages:['formation_obligations'],  fn:()=>loadFormationObligations(true),dash:false },
  documents:            { pages:['documents'],              fn:()=>loadDocuments(true),           dash:false },
  payroll:              { pages:['payroll'],                fn:()=>loadPayroll(true),             dash:false },
  settlements:          { pages:['settlements'],            fn:()=>loadSettlements(true),         dash:false },
  mail:                 { pages:['mail'],                   fn:()=>loadMail(true),                dash:false },
  quotations:           { pages:['quotations'],             fn:()=>loadQuotations(),              dash:false },
  // Pages not yet in RT map — now handled
  appointments:         { pages:['appointments'],           fn:()=>loadAppointments(),            dash:false },
  government_papers:    { pages:['government_papers'],      fn:()=>loadGovernmentPapers(),        dash:false },
  postal:               { pages:['postal'],                 fn:()=>loadPostal(),                  dash:false },
  statements:           { pages:['statements'],             fn:()=>loadStatements(),              dash:false },
  timesheet:            { pages:['timesheet'],              fn:()=>loadTimesheet(),               dash:false },
  office_services:      { pages:['office_services'],        fn:()=>loadOfficeServices(),          dash:false },
  assets:               { pages:['fin_reports'],            fn:()=>loadFinReports(true),          dash:false },
  accounting:           { pages:['accounting'],             fn:()=>typeof accRender==='function'&&accRender(), dash:false },
  monthly_fees:         { pages:['monthly_fees'],           fn:()=>typeof renderMFPage==='function'&&renderMFPage(), dash:false },
  daily_revenues:       { pages:['daily_revenues'],         fn:()=>typeof renderDailyRevenuesPage==='function'&&renderDailyRevenuesPage(), dash:false },
  notifications:        { pages:[],                         fn:()=>loadNotifCount(),              dash:false },
};

// Polished action labels for toast notifications
const _RT_ACTION_LABELS = {
  post:'أضاف', put:'عدّل', patch:'عدّل', delete:'حذف',
};

function _rtConnect() {
  try {
    const wsBase = API.replace(/^https?:\/\//, '');
    const proto  = API.startsWith('https') ? 'wss' : 'ws';
    _rt_ws = new WebSocket(`${proto}://${wsBase}/ws`);

    _rt_ws.onopen = () => {
      _rt_retries = 0;
      if (_rt_reconnect) { clearTimeout(_rt_reconnect); _rt_reconnect = null; }
    };

    _rt_ws.onmessage = (evt) => {
      try {
        const msg = evt.data;
        if (msg === 'pong') return;
        const event = JSON.parse(msg);
        _rtHandleEvent(event);
      } catch(_) {}
    };

    _rt_ws.onclose = () => {
      _rt_ws = null;
      const delay = Math.min(1000 * Math.pow(1.5, _rt_retries), 30000);
      _rt_retries++;
      _rt_reconnect = setTimeout(_rtConnect, delay);
    };

    _rt_ws.onerror = () => { try { _rt_ws.close(); } catch(_) {} };
  } catch(_) {
    const delay = Math.min(1000 * Math.pow(1.5, _rt_retries), 30000);
    _rt_retries++;
    _rt_reconnect = setTimeout(_rtConnect, delay);
  }
}

function _rtHandleEvent(event) {
  const { entity, raw_entity, action, affects_dashboard } = event;
  const cfg = _RT_ENTITY_MAP[entity];

  // Always bust the API cache for this entity so stale sessionStorage doesn't block the reload
  if (raw_entity) _AC.invalidate('/api/' + raw_entity);
  if (entity && entity !== raw_entity) _AC.invalidate('/api/' + entity);

  // Refresh the page if user is currently viewing it
  if (cfg && cfg.pages.includes(currentPage)) {
    _silentRefresh = true;
    Promise.resolve(cfg.fn()).finally(() => { _silentRefresh = false; });
  }

  // Refresh dashboard live counters if relevant
  if (affects_dashboard && currentPage === 'dashboard') {
    _AC.invalidate('/api/dashboard');
    loadDashboard(true);
  }

  // Show non-intrusive sync indicator
  _rtShowSyncDot();
}

// Tiny green pulse dot in top-right to indicate a live sync happened
function _rtShowSyncDot() {
  let dot = document.getElementById('_rt_dot');
  if (!dot) {
    dot = document.createElement('div');
    dot.id = '_rt_dot';
    dot.style.cssText = 'position:fixed;top:12px;right:12px;width:8px;height:8px;border-radius:50%;background:#10b981;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none';
    document.body.appendChild(dot);
  }
  dot.style.opacity = '1';
  clearTimeout(dot._timer);
  dot._timer = setTimeout(() => { dot.style.opacity = '0'; }, 1500);
}

// Call this to silently reload a section (no spinner flash)
function _rtSilentLoad(fn) {
  _silentRefresh = true;
  Promise.resolve(fn()).finally(() => { _silentRefresh = false; });
}

// Start realtime engine (called on app init)
function initRealtime() {
  _rtConnect();
  // Ping WS every 25s to keep Railway connection alive
  _rt_intervals.push(setInterval(() => {
    if (_rt_ws && _rt_ws.readyState === WebSocket.OPEN) {
      _rt_ws.send('ping');
    }
  }, 25000));
  // HTTP keep-alive: hit /health every 4 min so Railway never cold-starts
  _rt_intervals.push(setInterval(() => {
    fetch(API + '/health', {method:'GET', signal: AbortSignal.timeout(5000)}).catch(()=>{});
  }, 240000));
  // Dashboard background refresh every 60s (catches anything missed)
  _rt_intervals.push(setInterval(() => {
    if (currentPage === 'dashboard') loadDashboard(true);
  }, 60000));
}
// ── END REAL-TIME SYNC ENGINE ──────────────────────────────────────────────

// ── Shared data caches ────────────────────────────────
let _clientsCache = null;
/** Return cached client list; re-fetches only when cache is cleared */
async function getClients(pageSize=500) {
  if (_clientsCache) return _clientsCache;
  const d = await api('GET', `/api/clients?page_size=${pageSize}`);
  _clientsCache = d?.items || [];
  return _clientsCache;
}
/** Call after any client create/edit/delete to force next getClients() to re-fetch */
function invalidateClientsCache() { _clientsCache = null; }

// ── Notification interval tracker ────────────────────
let _notifInterval = null;
let _fabClickHandler = null;

// ── Utilities ──────────────────────────────────────
const $ = (s,c=document) => c.querySelector(s);
const $$ = (s,c=document) => [...c.querySelectorAll(s)];
const v = id => (document.getElementById(id)||{}).value||'';

// ── API cache (stale-while-revalidate) ─────────────────────
const _AC = {
  TTL: 60000,  // 60 seconds
  key: (path) => 'api_cache_' + path,
  set(path, data) { try { sessionStorage.setItem(this.key(path), JSON.stringify({t: Date.now(), d: data})); } catch(e){} },
  get(path) { try { const v = JSON.parse(sessionStorage.getItem(this.key(path))||'null'); return v && (Date.now()-v.t < this.TTL*10) ? v : null; } catch(e){ return null; } },
  fresh(path) { try { const v = JSON.parse(sessionStorage.getItem(this.key(path))||'null'); return v && (Date.now()-v.t < this.TTL) ? v.d : null; } catch(e){ return null; } },
  // Invalidate all cache entries whose key starts with the given base path
  // Called after every write (POST/PUT/PATCH/DELETE) to prevent stale GET returns
  invalidate(basePath) {
    try {
      const prefix = 'api_cache_' + basePath.split('?')[0].replace(/\/\d+$/, '');
      const toRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(prefix)) toRemove.push(k);
      }
      toRemove.forEach(k => sessionStorage.removeItem(k));
    } catch(e) {}
  },
};

let _staleBannerRetryTimer = null;
function _showStaleBanner() {
  if (document.getElementById('stale-banner')) return;
  const b = document.createElement('div');
  b.id = 'stale-banner';
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#fef9c3;border-bottom:2px solid #fde68a;padding:8px 16px;text-align:center;font-size:13px;color:#92400e;font-weight:600;display:flex;align-items:center;justify-content:center;gap:10px';
  b.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite">⏳</span> جاري الاتصال بالخادم — تعرض بيانات مؤقتة. سيتم التحديث تلقائياً... <button onclick="_hideStaleBanner()" style="margin-right:8px;background:none;border:none;cursor:pointer;font-size:16px;color:#92400e">✕</button>`;
  document.body.prepend(b);
  // Switch to fast polling so banner disappears as soon as server responds
  if (typeof window._connMonitorFast === 'function') window._connMonitorFast();
  // Also kick off a background retry every 6s independently of connection monitor
  if (_staleBannerRetryTimer) clearInterval(_staleBannerRetryTimer);
  _staleBannerRetryTimer = setInterval(async () => {
    if (!document.getElementById('stale-banner')) { clearInterval(_staleBannerRetryTimer); return; }
    try {
      const r = await fetch(`${API}/health`, {signal: AbortSignal.timeout(8000)});
      if (r.ok) {
        _hideStaleBanner();
        // Silently reload current page with fresh data
        const p = currentPage;
        if (typeof _REFRESH_FN_MAP !== 'undefined' && _REFRESH_FN_MAP[p]) {
          _clearPageCache(p);
          try { await _REFRESH_FN_MAP[p](); } catch(e) {}
        }
      }
    } catch(e) { /* still offline, keep waiting */ }
  }, 6000);
}

function _hideStaleBanner() {
  document.getElementById('stale-banner')?.remove();
  if (_staleBannerRetryTimer) { clearInterval(_staleBannerRetryTimer); _staleBannerRetryTimer = null; }
  if (typeof window._connMonitorNormal === 'function') window._connMonitorNormal();
}

async function api(method, path, body=null, {retries=2, retryDelay=2000, useCache=true}={}) {
  const isGet = method === 'GET';
  const opts = {
    method,
    headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})},
    signal: AbortSignal.timeout(isGet ? 30000 : 30000),
  };
  if (body) opts.body = JSON.stringify(body);

  // Return fresh cache immediately for GET (avoid spinner on repeat visits)
  if (isGet && useCache) {
    const fresh = _AC.fresh(path);
    if (fresh !== null) return fresh;
  }

  let lastErr;
  for(let attempt = 0; attempt <= retries; attempt++) {
    try {
      if(attempt > 0) await new Promise(res => setTimeout(res, retryDelay * Math.pow(1.5, attempt-1)));
      const r = await fetch(API+path, opts);
      if(r.status === 401){
        // Only logout if this is a confirmed 401 (not a transient server glitch).
        // Ignore if the last successful API call was within 10 seconds (race condition / cold-start).
        const msSinceLastOk = Date.now() - (window._lastApiOk || 0);
        if(msSinceLastOk < 10000){ return null; }
        logout(); return null;
      }
      const data = await r.json().catch(()=>({}));
      if(!r.ok) {
        let msg = 'خطأ في الطلب';
        if(typeof data.detail === 'string') msg = data.detail;
        else if(Array.isArray(data.detail)) msg = data.detail.map(e=>e.msg||e).join(' | ');
        else if(data.message) msg = data.message;
        // Log API errors (4xx/5xx) — skip 401 (handled separately)
        if (r.status !== 401) _EL.log('api', `${method} ${path} → ${r.status}`, msg);
        throw new Error(msg);
      }
      // Success — cache GET, invalidate cache for writes, clear stale banner
      if (isGet && useCache) _AC.set(path, data);
      else if (!isGet) _AC.invalidate(path);
      if(_connState !== 'ok') { _connState='ok'; setApiStatus(true,'API متصل'); }
      _hideStaleBanner();
      window._lastApiOk = Date.now();
      return data;
    } catch(e) {
      lastErr = e;
      const isNet = e.name==='TimeoutError' || e.name==='AbortError'
                 || (e.message && /fetch|Failed to fetch|NetworkError|network/i.test(e.message));
      if(isNet && attempt < retries) continue;
      if(isNet) {
        _EL.log('network', `${method} ${path} — شبكة`, e.message);
        if (isGet && useCache) {
          const stale = _AC.get(path);
          if (stale) { _showStaleBanner(); return stale.d; }
        }
        throw new Error('الخادم يُعاد تشغيله — يُرجى الانتظار لحظة ثم حاول مجدداً');
      }
      throw e;
    }
  }
  throw lastErr;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR LOGGING SYSTEM — يسجل كل خطأ في localStorage + يعرضه في شاشة الأخطاء
// ═══════════════════════════════════════════════════════════════════════════════
const _EL = {
  MAX: 500,      // أقصى عدد سجلات
  KEY: 'ms_error_log',

  _read() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch(e) { return []; }
  },

  log(type, message, detail = '', source = '') {
    try {
      const logs = this._read();
      logs.unshift({
        id: Date.now() + Math.random(),
        type,        // 'js' | 'api' | 'network' | 'promise' | 'upload'
        message: String(message).slice(0, 400),
        detail:  String(detail  || '').slice(0, 800),
        source:  String(source  || '').slice(0, 200),
        page:    typeof currentPage !== 'undefined' ? currentPage : '',
        user:    (typeof currentUser !== 'undefined' && currentUser) ? currentUser.email : '',
        ts:      new Date().toISOString(),
      });
      // حذف القديم إذا تجاوز الحد
      if (logs.length > this.MAX) logs.length = this.MAX;
      localStorage.setItem(this.KEY, JSON.stringify(logs));
      // لو الشاشة مفتوحة، حدّثها في الخلفية
      if (typeof currentPage !== 'undefined' && currentPage === 'system_logs') {
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => loadSystemLogs(), 300);
      }
    } catch(e) {}
  },

  clear() {
    localStorage.removeItem(this.KEY);
  },

  getAll() { return this._read(); },

  count() { return this._read().length; },
};

// ── Global JS error capture ──────────────────────────────────────────────────
window.onerror = function(msg, src, line, col, err) {
  _EL.log('js', msg, err?.stack || `${src}:${line}:${col}`, src);
  return false; // don't suppress default behavior
};

window.onunhandledrejection = function(e) {
  const msg = e.reason?.message || String(e.reason || 'Unhandled Promise Rejection');
  const stack = e.reason?.stack || '';
  _EL.log('promise', msg, stack);
};

// ── Safety Layer ────────────────────────────────────────────────────────────
const _SL = (function() {
  const HIST_KEY  = 'ms_sl_history';
  const MAX_HIST  = 50;
  const BULK_WARN = 3; // حد التحذير: أكثر من N عملية في ثانية واحدة

  let _recentWriteTs = [];   // timestamps لرصد البلك
  let _pendingUndo   = null; // آخر عملية قابلة للرجوع

  // ── تخزين السجل ──────────────────────────────────────────────
  function _load() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch(_) { return []; }
  }
  function _save(h) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, MAX_HIST))); } catch(_) {}
  }

  // ── تسجيل عملية ──────────────────────────────────────────────
  function log(op) {
    // op = { action, entity, entityId, label, before, after, canUndo, undoFn }
    const entry = {
      id:     Date.now() + Math.random(),
      ts:     new Date().toISOString(),
      user:   window.currentUser?.name || window.currentUser?.email || '?',
      action: op.action,   // 'create'|'update'|'delete'|'pay'|'reset_pay'
      entity: op.entity,   // 'client'|'monthly_fee'|'obligation'|...
      entityId: op.entityId,
      label:  op.label,
      status: 'success',
    };
    const h = _load();
    h.unshift(entry);
    _save(h);
    if (op.canUndo && op.undoFn) {
      _pendingUndo = { label: op.label, fn: op.undoFn, ts: Date.now() };
      _showUndoToast(op.label, op.undoFn);
    }
    _updateBadge();
  }

  // ── رصد البلك ─────────────────────────────────────────────────
  function trackWrite() {
    const now = Date.now();
    _recentWriteTs = _recentWriteTs.filter(t => now - t < 1000);
    _recentWriteTs.push(now);
    return _recentWriteTs.length;
  }

  // ── حارس البلك: يوقف التنفيذ إذا >N عملية في ثانية ─────────
  async function guardBulk(count, description) {
    if (count <= BULK_WARN) return true;
    return new Promise(resolve => {
      document.getElementById('_slBulkModal')?.remove();
      document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-backdrop" id="_slBulkModal" style="z-index:99999">
        <div class="modal" style="max-width:420px;border:3px solid #f59e0b">
          <div class="modal-header" style="background:#fff7ed">
            <h3 style="color:#92400e;font-size:15px">⚠️ تحذير — عملية جماعية</h3>
          </div>
          <div class="modal-body">
            <div style="background:#fef3c7;border-radius:10px;padding:14px;margin-bottom:12px;font-size:13px;color:#92400e;line-height:1.7">
              يحاول النظام تنفيذ <strong>${count} عمليات</strong> دفعة واحدة:<br/>
              <strong>${escH(description||'')}</strong>
            </div>
            <div style="font-size:12px;color:#64748b">هل تريد المتابعة؟ لا يمكن الرجوع تلقائياً عن عمليات جماعية.</div>
          </div>
          <div class="modal-footer">
            <button onclick="document.getElementById('_slBulkModal').remove();window._slBulkResolve(true)"
              style="padding:8px 20px;background:#f59e0b;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
              ✅ تأكيد التنفيذ
            </button>
            <button onclick="document.getElementById('_slBulkModal').remove();window._slBulkResolve(false)"
              class="btn">❌ إلغاء</button>
          </div>
        </div>
      </div>`);
      window._slBulkResolve = resolve;
    });
  }

  // ── تأكيد مزدوج للعمليات التدميرية ──────────────────────────
  async function confirmDestructive(opts) {
    // opts = { title, message, confirmText, danger }
    return new Promise(resolve => {
      document.getElementById('_slConfirmModal')?.remove();
      document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-backdrop" id="_slConfirmModal" style="z-index:99999">
        <div class="modal" style="max-width:400px;border:2px solid #ef4444">
          <div class="modal-header" style="background:#fef2f2">
            <h3 style="color:#dc2626;font-size:15px">🛡️ ${escH(opts.title||'تأكيد')}</h3>
          </div>
          <div class="modal-body">
            <div style="background:#fff1f2;border-radius:10px;padding:14px;margin-bottom:12px;font-size:13px;color:#7f1d1d;line-height:1.7">
              ${escH(opts.message||'')}
            </div>
            ${opts.backupNote !== false ? `
            <div style="font-size:11.5px;color:#64748b;padding:8px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
              💡 تأكد من وجود نسخة احتياطية قبل المتابعة.
              <a href="#" onclick="event.preventDefault();document.getElementById('_slConfirmModal').remove();navigateTo('backup')" style="color:#3b82f6;text-decoration:underline">فتح النسخ الاحتياطي</a>
            </div>` : ''}
          </div>
          <div class="modal-footer">
            <button onclick="document.getElementById('_slConfirmModal').remove();window._slConfirmResolve(true)"
              style="padding:8px 20px;background:#dc2626;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
              ${escH(opts.confirmText||'تأكيد الحذف')}
            </button>
            <button onclick="document.getElementById('_slConfirmModal').remove();window._slConfirmResolve(false)"
              class="btn">إلغاء</button>
          </div>
        </div>
      </div>`);
      window._slConfirmResolve = resolve;
    });
  }

  // ── preview قبل عملية تعديل جماعية ──────────────────────────
  async function previewBatch(title, rows, columns, onConfirm) {
    // rows: array of objects, columns: [{key,label}]
    return new Promise(resolve => {
      document.getElementById('_slPreviewModal')?.remove();
      const thead = columns.map(c=>`<th style="padding:6px 10px;font-size:11px;color:#64748b;font-weight:600;text-align:right">${escH(c.label)}</th>`).join('');
      const tbody = rows.slice(0,20).map(r=>`<tr>${columns.map(c=>`<td style="padding:6px 10px;font-size:12px;border-top:1px solid #f1f5f9">${escH(String(r[c.key]??''))}</td>`).join('')}</tr>`).join('');
      const moreNote = rows.length > 20 ? `<div style="font-size:11px;color:#64748b;padding:6px 10px">... و ${rows.length-20} صف إضافي</div>` : '';
      document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-backdrop" id="_slPreviewModal" style="z-index:99999">
        <div class="modal" style="max-width:600px">
          <div class="modal-header" style="background:#f0f9ff">
            <h3 style="color:#0369a1;font-size:15px">🔍 معاينة — ${escH(title)}</h3>
            <button onclick="document.getElementById('_slPreviewModal').remove();window._slPreviewResolve(false)" class="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div style="font-size:13px;color:#374151;margin-bottom:12px">
              سيتم تعديل <strong>${rows.length}</strong> سجل. راجع البيانات قبل التأكيد:
            </div>
            <div style="overflow:auto;max-height:300px;border:1px solid #e2e8f0;border-radius:8px">
              <table style="width:100%;border-collapse:collapse">
                <thead style="background:#f8fafc;position:sticky;top:0"><tr>${thead}</tr></thead>
                <tbody>${tbody}</tbody>
              </table>
              ${moreNote}
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="document.getElementById('_slPreviewModal').remove();window._slPreviewResolve(true)"
              style="padding:8px 20px;background:#0369a1;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
              ✅ تأكيد التنفيذ
            </button>
            <button onclick="document.getElementById('_slPreviewModal').remove();window._slPreviewResolve(false)" class="btn">إلغاء</button>
          </div>
        </div>
      </div>`);
      window._slPreviewResolve = resolve;
    });
  }

  // ── شريط Undo العائم ─────────────────────────────────────────
  function _showUndoToast(label, undoFn) {
    document.getElementById('_slUndoBar')?.remove();
    const bar = document.createElement('div');
    bar.id = '_slUndoBar';
    bar.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#1e293b;color:white;padding:10px 18px;border-radius:12px;font-size:13px;font-family:inherit;display:flex;align-items:center;gap:12px;z-index:99998;box-shadow:0 4px 20px rgba(0,0,0,.3);animation:fadeInUp .25s ease';
    bar.innerHTML = `<span>↩️ ${escH(label)}</span>
      <button onclick="_SL.undo()" style="background:#3b82f6;color:white;border:none;padding:5px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit">رجوع</button>
      <button onclick="document.getElementById('_slUndoBar')?.remove()" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:16px">✕</button>`;
    document.body.appendChild(bar);
    // Auto-dismiss after 8s
    setTimeout(() => bar.remove(), 8000);
  }

  // ── تنفيذ الـ Undo ────────────────────────────────────────────
  async function undo() {
    if (!_pendingUndo) { toast('لا توجد عملية يمكن الرجوع عنها', 'warning'); return; }
    if (Date.now() - _pendingUndo.ts > 30000) { toast('انتهت مهلة الرجوع (30 ثانية)', 'warning'); _pendingUndo = null; document.getElementById('_slUndoBar')?.remove(); return; }
    try {
      await _pendingUndo.fn();
      document.getElementById('_slUndoBar')?.remove();
      toast('✅ تم الرجوع عن العملية', 'success');
      _pendingUndo = null;
    } catch(e) {
      toast('❌ فشل الرجوع: ' + e.message, 'error');
    }
  }

  // ── بادج سجل العمليات ─────────────────────────────────────────
  function _updateBadge() {
    const badge = document.getElementById('_slBadge');
    if (!badge) return;
    const h = _load();
    badge.textContent = '🛡️ ' + h.length;
  }

  // ── لوحة سجل العمليات ─────────────────────────────────────────
  function showLog() {
    document.getElementById('_slLogPanel')?.remove();
    const h = _load();
    const ACTION_LABEL = {create:'إنشاء',update:'تعديل',delete:'حذف',pay:'دفع',reset_pay:'إلغاء دفع',send_wa:'واتساب'};
    const ACTION_COLOR = {create:'#10b981',update:'#3b82f6',delete:'#ef4444',pay:'#8b5cf6',reset_pay:'#f59e0b',send_wa:'#25d366'};
    const rows = h.length ? h.slice(0,30).map(e => {
      const color = ACTION_COLOR[e.action] || '#64748b';
      const label = ACTION_LABEL[e.action] || e.action;
      const ts = new Date(e.ts).toLocaleString('ar-EG',{timeStyle:'short',dateStyle:'short'});
      return `<tr style="border-top:1px solid #f1f5f9">
        <td style="padding:8px 10px;font-size:11px;color:#94a3b8" dir="ltr">${ts}</td>
        <td style="padding:8px 10px"><span style="background:${color}18;color:${color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${label}</span></td>
        <td style="padding:8px 10px;font-size:12px;color:#374151">${escH(e.entity||'')}</td>
        <td style="padding:8px 10px;font-size:12px;color:#1e293b;font-weight:600">${escH(e.label||'')}</td>
        <td style="padding:8px 10px;font-size:11px;color:#64748b">${escH(e.user||'')}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" style="text-align:center;padding:30px;color:#94a3b8">لا توجد عمليات مسجلة بعد</td></tr>`;

    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="_slLogPanel" onclick="if(event.target===this)this.remove()" style="z-index:99998">
      <div class="modal" style="max-width:700px">
        <div class="modal-header" style="background:linear-gradient(135deg,#1e293b,#334155)">
          <h3 style="color:white;font-size:15px">🛡️ سجل عمليات طبقة الأمان</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <button onclick="_SL.clearLog()" style="font-size:11px;padding:4px 10px;background:rgba(255,255,255,.1);color:white;border:1px solid rgba(255,255,255,.2);border-radius:6px;cursor:pointer">🗑️ مسح السجل</button>
            <button onclick="document.getElementById('_slLogPanel').remove()" style="background:transparent;border:none;color:white;font-size:18px;cursor:pointer">✕</button>
          </div>
        </div>
        <div class="modal-body" style="padding:0">
          <div style="padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b">
            آخر ${Math.min(h.length,30)} عملية — يُحفظ في المتصفح فقط
          </div>
          <div style="overflow:auto;max-height:400px">
            <table style="width:100%;border-collapse:collapse">
              <thead style="background:#f8fafc;position:sticky;top:0">
                <tr>
                  <th style="padding:8px 10px;font-size:11px;color:#64748b;font-weight:600;text-align:right">الوقت</th>
                  <th style="padding:8px 10px;font-size:11px;color:#64748b;font-weight:600;text-align:right">النوع</th>
                  <th style="padding:8px 10px;font-size:11px;color:#64748b;font-weight:600;text-align:right">الكيان</th>
                  <th style="padding:8px 10px;font-size:11px;color:#64748b;font-weight:600;text-align:right">التفاصيل</th>
                  <th style="padding:8px 10px;font-size:11px;color:#64748b;font-weight:600;text-align:right">المستخدم</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="document.getElementById('_slLogPanel').remove()" class="btn">إغلاق</button>
        </div>
      </div>
    </div>`);
  }

  function clearLog() {
    if (!confirm('هل تريد مسح سجل العمليات؟')) return;
    localStorage.removeItem(HIST_KEY);
    document.getElementById('_slLogPanel')?.remove();
    _updateBadge();
  }

  // ── تهيئة (بدون زر عائم — يُفتح السجل من الإعدادات) ──────────
  function init() {
    // No floating badge — was blocking mobile nav
  }

  return { log, trackWrite, guardBulk, confirmDestructive, previewBatch, undo, showLog, clearLog, init };
})();

// تشغيل Safety Layer بعد تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => setTimeout(_SL.init, 500));

// ═══════════════════════════════════════════════════════════════════════════════


function toast(msg, type='success') {
  const colors={success:'#16a34a',error:'#dc2626',warning:'#d97706',info:'#1a2472'};
  const icons={success:'✓',error:'✕',warning:'⚠',info:'ℹ'};
  const el=document.createElement('div');
  el.className='toast-item';
  el.style.borderColor=colors[type];
  el.innerHTML=`<span style="color:${colors[type]};font-weight:800;font-size:16px">${icons[type]}</span><span style="font-size:13px;color:#1f2937;font-weight:500">${msg}</span>`;
  document.getElementById('toasts').append(el);
  setTimeout(()=>el.remove(),4000);
}

function money(n) {
  return new Intl.NumberFormat('ar-EG',{style:'currency',currency:'EGP',minimumFractionDigits:0}).format(n||0);
}
function dateAr(d) {
  if(!d) return '—';
  return new Intl.DateTimeFormat('ar-EG',{year:'numeric',month:'short',day:'numeric'}).format(new Date(d));
}
// fmtDate removed — use dateAr() directly

function closeModal() {
  document.getElementById('modal')?.remove();
}

/**
 * openModal(content, opts)          — single-arg: full HTML is modal body
 * openModal(title, content, opts)   — two-arg: title in header + content
 * opts: { wide: bool }
 */
function openModal(titleOrContent, bodyOrOpts, opts={}) {
  closeModal(); // close any existing modal
  let title = null, body = '';
  if (typeof bodyOrOpts === 'string') {
    title = titleOrContent;
    body  = bodyOrOpts;
    if (typeof opts !== 'object') opts = {};
  } else {
    body = titleOrContent;
    opts = bodyOrOpts || {};
  }
  const maxW = opts.wide ? '720px' : '560px';
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.id = 'modal';
  el.innerHTML = `<div class="modal" style="max-width:${maxW}">
    ${title ? `<div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">${title}</h3>
      <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;line-height:1">✕</button>
    </div>` : ''}
    <div style="padding:${title?'18px 22px':'20px 24px'};overflow-y:auto;max-height:82vh">${body}</div>
  </div>`;
  document.body.append(el);
  el.onclick = e => { if (e.target === el) closeModal(); };
}

// ── Styled Confirm Dialog ──────────────────────────────
function confirmDlg(msg, title='هل أنت متأكد؟', dangerLabel='تأكيد', isDanger=true) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'confirm-overlay';
    el.id = '__confirmDlg';
    el.innerHTML = `
      <div class="confirm-box">
        <h3>${title}</h3>
        <p>${msg}</p>
        <div class="confirm-btns">
          <button class="btn btn-secondary" onclick="document.getElementById('__confirmDlg').remove();window.__confirmResolve(false)">إلغاء</button>
          <button class="btn ${isDanger?'btn-danger':'btn-primary'}" onclick="document.getElementById('__confirmDlg').remove();window.__confirmResolve(true)">${dangerLabel}</button>
        </div>
      </div>`;
    window.__confirmResolve = resolve;
    document.body.append(el);
  });
}

// ── Skeleton Loading Helper ────────────────────────────
function skeletonTable(rows=5, cols=5) {
  const ths = Array(cols).fill('<th><div class="skeleton" style="height:10px;width:70%"></div></th>').join('');
  const tds = rows => Array(rows).fill('').map(()=>`<tr>${Array(cols).fill('<td><div class="skeleton skel-line" style="width:${60+Math.random()*30|0}%"></div></td>').join('')}</tr>`).join('');
  return `<div class="card" style="overflow:hidden"><table><thead><tr>${ths}</tr></thead><tbody>${tds(rows)}</tbody></table></div>`;
}
function skeletonCards(n=6) {
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
    ${Array(n).fill('').map(()=>`<div class="card" style="padding:20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div class="skeleton skel-circle" style="width:42px;height:42px;flex-shrink:0"></div>
        <div style="flex:1"><div class="skeleton skel-line" style="width:70%;margin-bottom:6px"></div><div class="skeleton skel-line" style="width:45%;height:10px"></div></div>
      </div>
      <div class="skeleton skel-line" style="margin-bottom:8px"></div>
      <div class="skeleton skel-line" style="width:60%"></div>
    </div>`).join('')}
  </div>`;
}

// ── Shared UI Helpers ──────────────────────────────────
/** Show spinner inside any element */
function setLoading(el) {
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
}

/** Render a centred empty-state block */
function emptyState(icon, title, sub='') {
  return `<div class="empty-state">
    ${icon ? `<div class="es-icon">${icon}</div>` : ''}
    <div class="es-title">${title}</div>
    ${sub ? `<div class="es-sub">${sub}</div>` : ''}
  </div>`;
}

/** Empty-state inside a table row */
function emptyStateRow(colspan, icon, title, sub='') {
  return `<tr><td colspan="${colspan}">${emptyState(icon, title, sub)}</td></tr>`;
}

/** Wrap a save button in a loading state while async fn runs */
async function withSaving(btn, fn) {
  if (!btn) { try { await fn(); } catch(e) { toast(e.message,'error'); } return; }
  const orig = btn.innerHTML;
  const origBg = btn.style.background;
  btn.disabled = true; btn.textContent = 'جاري الحفظ...';
  try {
    await fn();
    btn.textContent = '✓ تم الحفظ';
    btn.style.background = '#16a34a';
    btn.style.color = '#fff';
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; btn.style.background = origBg; btn.style.color = ''; }, 2000);
  }
  catch(e) { toast(e.message,'error'); btn.disabled=false; btn.innerHTML=orig; btn.style.background=origBg; btn.style.color=''; }
}

// ── FAB Functions ──────────────────────────────────────
function toggleFab() {
  const btn = document.getElementById('fabBtn');
  const menu = document.getElementById('fabMenu');
  if(!btn||!menu) return;
  const open = menu.classList.toggle('open');
  btn.classList.toggle('open', open);
}
function closeFab() {
  document.getElementById('fabMenu')?.classList.remove('open');
  document.getElementById('fabBtn')?.classList.remove('open');
}
function quickAdd(type) {
  closeFab();
  if(type==='client')      { navigate('clients');      setTimeout(()=>showClientModal(),300); }
  else if(type==='invoice'){ navigate('invoices');     setTimeout(()=>showInvoiceModal(),300); }
  else if(type==='task')   { navigate('tasks');        setTimeout(()=>showTaskModal(),300); }
  else if(type==='appointment'){ navigate('appointments'); setTimeout(()=>showAddAppointment(),300); }
}

function printCurrentPage() {
  // حدّث رأس الطباعة بعنوان الصفحة والتاريخ
  const pageTitle = document.getElementById('pageTitle')?.textContent || 'MS Accounting';
  const el = document.getElementById('printPageLabel');
  const dt = document.getElementById('printDate');
  if (el) el.textContent = pageTitle;
  if (dt) dt.textContent = new Date().toLocaleDateString('ar-EG', {
    weekday:'long', year:'numeric', month:'long', day:'numeric'
  });
  window.print();
}
window.printCurrentPage = printCurrentPage;
function daysUntil(d) {
  if(!d) return null;
  const diff = Math.ceil((new Date(d)-new Date())/(1000*60*60*24));
  return diff;
}
function destroyChart(key) {
  if(chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; }
}

// ── Auth ───────────────────────────────────────────
async function login(email, password) {
  const body=new URLSearchParams({username:email,password});
  const r=await fetch(`${API}/api/auth/login`,{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  const data=await r.json();
  if(!r.ok) throw new Error(data.detail||'بيانات الدخول غير صحيحة');
  const isFirstLogin = !token;
  token=data.access_token; currentUser=data.user;
  localStorage.setItem('ms_token',token);
  localStorage.setItem('ms_user',JSON.stringify(currentUser));
  window._lastApiOk = Date.now();
  renderApp();
  // welcome greeting disabled
}
function showWelcomeGreeting(name) {
  const h = new Date().getHours();
  const n = name.trim();
  const isAmr   = /عمر[و]?(\s|$)|عمرو/.test(n);
  const isMohamed = /محمد/.test(n);
  const isSalah = /صلاح/.test(n);
  const isMS    = /^ms$/i.test(n.trim());
  const isMorning = h>=5 && h<12;
  const isNoon    = h>=12 && h<17;
  const isEvening = h>=17 && h<21;
  const isNight   = h>=21 || h<5;
  const isLate    = h>=12; // بعد 12 ظهر

  let pool = [];

  if (isAmr) {
    if (isMorning) pool = [
      '🔥 صباح النور يا عمرو بيه — النهارده فرصة تعمل حاجة عظيمة!',
      '🚀 صباح الفل يا باشا — كل صبح جديد فيه عميل جديد وفرصة جديدة!',
      '💪 صباح النور يا مستشار — الكبار بيبدأوا قبل ما الدنيا تصحى!',
      '⚡ يوم جديد يا عمرو بيه — إنت أكتر واحد بيعرف يستغله!',
      '🎯 صباح الفل يا باشا — النهارده هتضيف رقم جديد للمكتب!',
    ];
    else if (isLate && isNoon) pool = [
      '💡 الظهر يا عمرو بيه — نص اليوم الأقوى لسه جاي!',
      '🔥 الفترة دي يا باشا أكتر ناس بتتعاقد فيها — يلا!',
      '⚡ الظهر يا مستشار — الفرص مش بتاخد إجازة!',
    ];
    else if (isEvening) pool = [
      '🌆 مساء النور يا عمرو بيه — حتى في المساء إنت بتفرق!',
      '🔥 مساء الفل يا باشا — آخر جهد النهارده أقوى من أي حاجة تانية!',
      '💼 مساء النور يا مستشار — كمّل، النجاح مش بيتفاوت!',
      '🏆 المساء يا عمرو — اللي بيكمل دلوقتي هو اللي بيكسب بكره!',
    ];
    else pool = [
      '🌙 الليل يا عمرو بيه — العظماء بيخططوا بالليل وبينفذوا الصبح!',
      '⭐ بالليل يا باشا — كل دقيقة هنا بتبني مكتب أقوى!',
      '🔥 الليل يا مستشار — طاقتك ما بتخلصش، استغلها!',
    ];
  }

  else if (isMohamed) {
    if (isMorning) pool = [
      '🚀 صباح الفل يا محمد بيه — إنت من النوع اللي بيصنع الفارق!',
      '🔥 صباح النور يا أحلي محاسب — النهارده ملفاتك هتتكلم عنك!',
      '💪 صباح الفل يا محمد — إنت عارف إن المميزين بيبدأوا قوي!',
      '⚡ يوم جديد يا بيه — وعقلك ده أقوى سلاح في المكتب!',
      '🎯 صباح النور يا محمد — النهارده هتخلي كل عميل يحس إنه في إيد أمينة!',
      '🏆 صباح الفل — محمد مصطفى في المكتب يعني الشغل هيتعمل صح!',
    ];
    else if (isEvening) pool = [
      '🌆 مساء النور يا محمد — آخر جهد النهارده هو اللي بيُميّزك!',
      '🔥 مساء الفل يا بيه — الشغل اللي بتعمله دلوقتي بيتحسب ليك!',
      '💪 مساء النور يا أبو مصطفى — من بدأ قوي يكمل أقوى!',
      '🏆 المساء يا محمد — الناجحين بيكملوا حتى في آخر اليوم!',
    ];
    else if (isNoon) pool = [
      '⚡ الظهر يا محمد — نص اليوم التاني بيبدأ دلوقتي، يلا!',
      '🔥 بالظهر يا بيه — إنت مش من الناس اللي بتفضفض، يلا كمّل!',
      '💡 الظهر يا محمد — أفضل قرارات اليوم بتتاخد دلوقتي!',
    ];
    else pool = [
      '🌙 الليل يا محمد — اللي بيكمل بالليل بيقطش الصبح!',
      '⭐ بالليل يا بيه — كل ورقة بتخلصها دلوقتي راحة بكره!',
      '🔥 الليل يا أبو مصطفى — إنت بتبني مستقبلك دلوقتي!',
    ];
  }

  else if (isSalah) {
    if (isMorning) pool = [
      '🔥 صباح النور يا صلاح — النهارده فرصة تثبت إنك الأفضل!',
      '🚀 صباح الفل يا بيه — صلاح في الميدان يعني الشغل هيتخلص صح!',
      '💪 صباح النور يا صلاح — ربنا فتح عليك، يلا استغل اليوم!',
      '⚡ يوم جديد يا صلاح — وعندك كل اللي محتاجه عشان تبهر الكل!',
      '🎯 صباح الفل يا بيه — النهارده هتعمل حاجة تتفخر بيها!',
    ];
    else if (isEvening) pool = [
      '🌆 مساء النور يا صلاح — آخر جهد وإنت بتكتب قصة نجاحك!',
      '🔥 مساء الفل يا بيه — المميزين بيكملوا حتى في المساء!',
      '💪 مساء النور يا صلاح — كمّل، كل خطوة بتقربك من القمة!',
      '🏆 المساء يا بيه — اللي اتعمل النهارده هيتكلم عنك بكره!',
    ];
    else if (isNoon) pool = [
      '⚡ الظهر يا صلاح — الطاقة التانية بتبدأ دلوقتي، يلا!',
      '🔥 بالظهر يا بيه — نص اليوم الأحلى لسه جاي!',
      '💡 الظهر يا صلاح — أحسن الفرص بتيجي في النص التاني!',
    ];
    else pool = [
      '🌙 الليل يا صلاح — اللي بيستثمر وقته دلوقتي بيحصد بكره!',
      '⭐ بالليل يا بيه — إنت بتبني حاجة أكبر من إنك تسيبها دلوقتي!',
      '🔥 الليل يا صلاح — طاقتك مش هتخلص، كمّل!',
    ];
  }

  else if (isMS) {
    if (isMorning) pool = [
      '👑 صباح النور يا باشا — المكتب بيبدأ بأقوى شخص فيه!',
      '🚀 صباح الفل يا MS — كل يوم جديد فرصة تبني إمبراطورية!',
      '🔥 صباح النور يا صاحب المكتب — الناجحين بيبدأوا زيك كده!',
      '⚡ يوم جديد يا باشا — وإنت عارف إن كل خطوة بتغير الصورة!',
      '💎 صباح الفل يا MS — إنت مش بتشتغل بس، إنت بتبني مستقبل!',
    ];
    else if (isEvening) pool = [
      '🌆 مساء النور يا باشا — آخر جهد النهارده هو الفارق!',
      '👑 مساء الفل يا MS — القمة مش بتستنى، كمّل!',
      '🔥 مساء النور يا صاحب المكتب — كل قرار بتاخده دلوقتي بيحسب!',
      '💎 المساء يا باشا — العظماء بيكملوا حتى بعد ما الكل راح!',
    ];
    else if (isNoon) pool = [
      '⚡ الظهر يا باشا — نص اليوم التاني أهم من الأول!',
      '🔥 بالظهر يا MS — الفرص مش بتاخد استراحة!',
      '💡 الظهر يا صاحب المكتب — قراراتك دلوقتي بترسم الصورة!',
    ];
    else pool = [
      '🌙 الليل يا باشا — العظماء بيخططوا بالليل وبيكسبوا الصبح!',
      '👑 بالليل يا MS — كل ساعة هنا بتبني مكتب أقوى وأكبر!',
      '🔥 الليل يا صاحب المكتب — طاقتك دي هي السلاح الحقيقي!',
    ];
  }

  // fallback generic
  if (!pool.length) {
    const fn = n.split(' ')[0];
    pool = isMorning
      ? [`🔥 صباح النور يا ${fn} — النهارده فرصة تعمل حاجة عظيمة!`]
      : isEvening
      ? [`🌆 مساء النور يا ${fn} — آخر جهد هو اللي بيفرق!`]
      : isNoon
      ? [`⚡ الظهر يا ${fn} — نص اليوم الأقوى لسه جاي!`]
      : [`🌙 الليل يا ${fn} — اللي بيكمل دلوقتي بيكسب بكره!`];
  }

  const msg = pool[Math.floor(Math.random() * pool.length)];
  const timeSlot = isMorning?'morning':isNoon?'noon':isEvening?'evening':'night';
  const colors = { morning:'linear-gradient(135deg,#f59e0b,#f97316)', noon:'linear-gradient(135deg,#0ea5e9,#6366f1)', evening:'linear-gradient(135deg,#8b5cf6,#ec4899)', night:'linear-gradient(135deg,#1e3a8a,#3b82f6)' };

  const div = document.createElement('div');
  div.id = 'welcomeGreeting';
  div.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-80px);z-index:9999;transition:transform .5s cubic-bezier(.22,1,.36,1),opacity .5s;opacity:0;pointer-events:none;width:min(92vw,460px)';
  div.innerHTML = `<div style="background:${colors[timeSlot]};border-radius:18px;padding:16px 20px;box-shadow:0 12px 40px rgba(0,0,0,.3);display:flex;align-items:center;gap:12px">
    <div style="flex:1;color:white;font-size:15px;font-weight:700;line-height:1.5">${msg}</div>
    <div style="flex-shrink:0;cursor:pointer;color:rgba(255,255,255,.7);font-size:20px;line-height:1;padding:2px 6px" onclick="document.getElementById('welcomeGreeting').style.opacity='0';setTimeout(()=>document.getElementById('welcomeGreeting')?.remove(),400)">✕</div>
  </div>`;
  document.body.appendChild(div);
  requestAnimationFrame(()=>{ div.style.transform='translateX(-50%) translateY(0)'; div.style.opacity='1'; div.style.pointerEvents='auto'; });
  setTimeout(()=>{ if(div.parentNode){div.style.opacity='0';div.style.transform='translateX(-50%) translateY(-30px)';setTimeout(()=>div.remove(),500);} }, 6000);
}

function logout() {
  // Clear all realtime intervals so stale requests can't trigger re-logout
  _rt_intervals.forEach(id => clearInterval(id));
  _rt_intervals = [];
  if (_rt_ws) { try { _rt_ws.close(); } catch(_) {} _rt_ws = null; }
  if (_rt_reconnect) { clearTimeout(_rt_reconnect); _rt_reconnect = null; }
  if (_notifInterval) { clearInterval(_notifInterval); _notifInterval = null; }
  token=null; currentUser=null;
  localStorage.removeItem('ms_token'); localStorage.removeItem('ms_user');
  renderApp();
}

// ── Login Page ─────────────────────────────────────
function renderLogin() {
  document.getElementById('app').innerHTML = `
  <style>
    @keyframes floatOrb1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-80px) scale(1.15)} 66%{transform:translate(-40px,50px) scale(0.9)} }
    @keyframes floatOrb2 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-70px,60px) scale(1.1)} 66%{transform:translate(50px,-40px) scale(0.95)} }
    @keyframes floatOrb3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,70px) scale(1.2)} }
    @keyframes cardIn { from{opacity:0;transform:translateY(36px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
    @keyframes logoFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes logoPulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,0),0 12px 40px rgba(59,130,246,.4)} 50%{box-shadow:0 0 0 10px rgba(255,255,255,.05),0 16px 60px rgba(59,130,246,.6)} }
    @keyframes btnShine { 0%{background-position:200% center} 100%{background-position:-200% center} }
    @keyframes spinRing1 { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes spinRing2 { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
    @keyframes starsMove { from{transform:translateY(0)} to{transform:translateY(-50%)} }
    .login-orb { position:absolute; border-radius:50%; filter:blur(80px); pointer-events:none; }
    .login-input-wrap { position:relative; margin-bottom:16px; }
    .login-input-wrap input {
      width:100%; box-sizing:border-box; padding:14px 16px 14px 44px;
      background:rgba(255,255,255,.08); border:1.5px solid rgba(255,255,255,.18);
      border-radius:14px; color:white; font-size:14px; font-family:inherit;
      outline:none; transition:border-color .3s, background .3s, box-shadow .3s;
    }
    .login-input-wrap input::placeholder { color:rgba(255,255,255,.35); }
    .login-input-wrap input:focus { border-color:rgba(147,197,253,.8); background:rgba(255,255,255,.12); box-shadow:0 0 0 3px rgba(59,130,246,.2); }
    .login-input-wrap .inp-icon { position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:17px; pointer-events:none; }
    .login-submit-btn {
      width:100%; padding:15px; border:none; border-radius:14px; cursor:pointer;
      font-size:16px; font-weight:700; font-family:inherit; color:white; letter-spacing:.5px;
      background:linear-gradient(135deg,#1d6fe8,#4f46e5,#7c3aed,#1d6fe8);
      background-size:300% auto;
      box-shadow:0 8px 30px rgba(79,70,229,.55);
      transition:transform .2s, box-shadow .2s;
      animation: btnShine 3.5s linear infinite;
    }
    .login-submit-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 14px 40px rgba(79,70,229,.7); }
    .login-submit-btn:disabled { opacity:.7; cursor:not-allowed; transform:none; }
  </style>
  <div id="loginRoot" style="min-height:100vh;background:linear-gradient(145deg,#0b1120 0%,#111827 40%,#0f1e3d 100%);display:flex;align-items:center;justify-content:center;padding:16px;position:relative;overflow:hidden;font-family:'Segoe UI',Tahoma,sans-serif">

    <!-- Stars background -->
    <canvas id="loginStars" style="position:absolute;inset:0;pointer-events:none;z-index:0"></canvas>

    <!-- Colored orbs — brighter & warmer -->
    <div class="login-orb" style="width:550px;height:550px;background:radial-gradient(circle,rgba(59,130,246,.55),transparent 65%);top:-160px;left:-180px;animation:floatOrb1 13s ease-in-out infinite"></div>
    <div class="login-orb" style="width:450px;height:450px;background:radial-gradient(circle,rgba(168,85,247,.5),transparent 65%);bottom:-100px;right:-120px;animation:floatOrb2 16s ease-in-out infinite"></div>
    <div class="login-orb" style="width:320px;height:320px;background:radial-gradient(circle,rgba(6,182,212,.38),transparent 65%);top:40%;left:5%;animation:floatOrb3 11s ease-in-out infinite"></div>
    <div class="login-orb" style="width:250px;height:250px;background:radial-gradient(circle,rgba(251,191,36,.22),transparent 65%);top:15%;right:8%;animation:floatOrb1 9s ease-in-out infinite reverse"></div>

    <!-- Card -->
    <div style="width:100%;max-width:420px;position:relative;z-index:10;animation:cardIn .7s cubic-bezier(.22,1,.36,1) both">

      <!-- Logo -->
      <div style="text-align:center;margin-bottom:28px">
        <div style="position:relative;display:inline-block;margin-bottom:16px">
          <!-- Outer slow ring -->
          <div style="position:absolute;inset:-14px;border-radius:50%;border:1.5px dashed rgba(147,197,253,.3);animation:spinRing1 18s linear infinite"></div>
          <!-- Inner fast ring -->
          <div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(147,197,253,.2);animation:spinRing2 8s linear infinite"></div>
          <!-- Logo circle - white background for clarity -->
          <div style="width:110px;height:110px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 50px rgba(59,130,246,.5),0 0 0 4px rgba(255,255,255,.15);animation:logoFloat 4s ease-in-out infinite, logoPulse 4s ease-in-out infinite">
            <img src="assets/logo.svg" alt="MS" style="width:80px;height:80px;object-fit:contain"/>
          </div>
        </div>
        <h1 style="color:white;font-size:30px;font-weight:800;margin:0 0 5px;letter-spacing:.5px;text-shadow:0 4px 24px rgba(99,179,237,.5)">MS Accounting</h1>
        <p style="color:rgba(255,255,255,.5);font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;margin:0">Corporate Accounting Services</p>
      </div>

      <!-- Form Card -->
      <div style="background:rgba(20,30,60,.75);border:1.5px solid rgba(255,255,255,.14);border-radius:24px;padding:36px;box-shadow:0 24px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08)">
        <h2 style="font-size:19px;font-weight:700;color:white;margin:0 0 5px;text-align:center">أهلاً بك 👋</h2>
        <p style="font-size:13px;color:rgba(255,255,255,.45);text-align:center;margin:0 0 26px">سجّل دخولك للمتابعة</p>

        <div class="login-input-wrap">
          <span class="inp-icon">📧</span>
          <input id="loginEmail" type="email" placeholder="البريد الإلكتروني" autocomplete="email"/>
        </div>
        <div class="login-input-wrap" style="margin-bottom:26px">
          <span class="inp-icon">🔒</span>
          <input id="loginPass" type="password" placeholder="كلمة المرور" autocomplete="current-password"/>
        </div>

        <button id="loginBtn" class="login-submit-btn">دخول ←</button>
        <div id="loginErr" style="color:#fca5a5;font-size:13px;text-align:center;margin-top:14px;min-height:20px"></div>
      </div>

      <p style="text-align:center;color:rgba(255,255,255,.18);font-size:11px;margin-top:20px;letter-spacing:.5px">© 2025 MS Accounting — جميع الحقوق محفوظة</p>
    </div>
  </div>
`;
  // Stars animation — stores RAF id so it can be cancelled on login
  window._loginRaf = null;
  (function(){
    const c=document.getElementById('loginStars');
    if(!c)return;
    const ctx=c.getContext('2d');
    c.width=window.innerWidth; c.height=window.innerHeight;
    const stars=Array.from({length:80},()=>({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.4+.3,a:Math.random(),sp:Math.random()*.3+.08}));
    function draw(){
      if(!document.getElementById('loginStars')){ cancelAnimationFrame(window._loginRaf); return; }
      ctx.clearRect(0,0,c.width,c.height);
      stars.forEach(function(s){
        s.a+=s.sp*.012; if(s.a>1)s.a=0;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,'+Math.abs(Math.sin(s.a))*0.75+')'; ctx.fill();
      });
      window._loginRaf=requestAnimationFrame(draw);
    }
    draw();
  })();

  document.getElementById('loginBtn').onclick = async () => {
    const btn=document.getElementById('loginBtn');
    const err=document.getElementById('loginErr');
    err.textContent='';
    btn.disabled=true; btn.textContent='جاري الدخول...';
    try { await login(document.getElementById('loginEmail').value, document.getElementById('loginPass').value); }
    catch(e){ err.textContent=e.message; btn.disabled=false; btn.textContent='دخول ←'; }
  };
  document.getElementById('loginPass').onkeydown = e => { if(e.key==='Enter') document.getElementById('loginBtn').click(); };
}

// ── Sidebar nav items ──────────────────────────────
// Flat list (for backward compat — active check, pages map, etc.)
const navItems = [
  {id:'dashboard'    ,icon:'📊',label:'الرئيسية'},
  {id:'clients'      ,icon:'👥',label:'عملاء المكتب'},
  {id:'leads'        ,icon:'🎯',label:'العملاء المحتملين'},
  {id:'under_establishment_clients',icon:'⭐',label:'تحت التأسيس'},
  {id:'establishment',icon:'🏗️',label:'تأسيس الشركات'},
  {id:'collections'  ,icon:'💵',label:'الإيرادات اليومية'},
  {id:'tax'          ,icon:'🧾',label:'الإقرارات'},
  {id:'tasks'        ,icon:'✅',label:'المهام'},
  {id:'obligations'         ,icon:'🧾',label:'الالتزامات الضريبية'},
  {id:'formation_obligations',icon:'🏗️',label:'التزامات التأسيس'},
  {id:'documents'    ,icon:'📁',label:'الأرشيف'},
  {id:'settlements'  ,icon:'👷',label:'تسويات الموظفين'},
  {id:'mail'         ,icon:'📧',label:'البريد الإلكتروني'},
  {id:'client_portal' ,icon:'🔑',label:'بوابة العملاء'},
  {id:'permissions'   ,icon:'🛡️',label:'الصلاحيات'},
  {id:'monthly_fees'  ,icon:'📋',label:'المدفوعات الشهرية'},
  {id:'finance_center',icon:'💰',label:'المالية', adminOnly: true},
  {id:'owner'         ,icon:'👑',label:'إدارة المكتب المالية', adminOnly: true},
  {id:'settings'     ,icon:'⚙️',label:'الإعدادات'},
  {id:'system_logs'       ,icon:'🔍',label:'سجل الأخطاء', adminOnly: true},
  {id:'backup'            ,icon:'🗄️',label:'النسخ الاحتياطية', adminOnly: true},
  {id:'migration_dashboard',icon:'🚀',label:'تقدم الـ Migration', adminOnly: true},
  {id:'health_check'       ,icon:'🩺',label:'صحة النظام', adminOnly: true},
  {id:'company_names',icon:'🏢',label:'مولّد أسماء الشركات'},
];
// Grouped navigation for sidebar display
const navGroups = [
  {label:'لوحة التحكم', items:['dashboard']},
  {label:'CRM & المبيعات', items:['clients','leads','under_establishment_clients','establishment','company_names']},
  {label:'المالية', items:['collections','monthly_fees','tax','obligations']},
  {label:'التشغيل', items:['tasks','documents']},
  {label:'الموارد البشرية', items:['settlements']},
  {label:'الإدارة', items:['mail','client_portal','permissions','settings']},
  {label:'المكتب المالي', items:['finance_center','owner']},
  {label:'النظام', items:['system_logs','backup','migration_dashboard','health_check']},
];

// ── Client Portal Mode ─────────────────────────────
let portalToken = localStorage.getItem('ms_portal_token');
let portalUser = JSON.parse(localStorage.getItem('ms_portal_user') || 'null');

function isPortalMode() {
  return new URLSearchParams(window.location.search).has('portal') || !!portalToken;
}

function renderPortalLogin() {
  document.getElementById('app').innerHTML = `
  <div style="min-height:100vh;background:linear-gradient(135deg,#0d1540 0%,#1a2472 50%,#5b8ec4 100%);display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="width:100%;max-width:400px">
      <div style="text-align:center;margin-bottom:32px">
        <div style="width:90px;height:90px;background:white;border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 8px 32px rgba(0,0,0,.18);padding:10px">
          <img src="assets/logo.svg" alt="MS Logo" style="width:70px;height:70px;object-fit:contain"/>
        </div>
        <h1 style="color:white;font-size:22px;font-weight:800;margin:0 0 4px">بوابة عملاء MS</h1>
        <p style="color:rgba(255,255,255,.7);font-size:12px;margin:0">تتبع ملفاتك ومستحقاتك</p>
      </div>
      <div style="background:white;border-radius:18px;padding:28px;box-shadow:0 25px 60px rgba(0,0,0,.2)">
        <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin:0 0 20px;text-align:center">🔑 دخول العملاء</h2>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">اسم المستخدم</label>
          <input id="puLoginUser" class="input" placeholder="اسم المستخدم"/>
        </div>
        <div style="margin-bottom:20px">
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">كلمة المرور</label>
          <input id="puLoginPass" class="input" type="password" placeholder="••••••••"/>
        </div>
        <button id="puLoginBtn" class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;font-size:15px">🔐 دخول</button>
        <div id="puLoginErr" style="color:#dc2626;font-size:13px;text-align:center;margin-top:10px;min-height:18px"></div>
        <div style="margin-top:16px;text-align:center">
          <a href="?" style="font-size:12px;color:#94a3b8;text-decoration:none">دخول الإدارة ←</a>
        </div>
      </div>
    </div>
  </div>`;
  const doLogin = async () => {
    const btn=document.getElementById('puLoginBtn');
    const err=document.getElementById('puLoginErr');
    err.textContent=''; btn.disabled=true; btn.textContent='جاري الدخول...';
    try {
      const fd=new URLSearchParams();
      fd.append('username', document.getElementById('puLoginUser').value);
      fd.append('password', document.getElementById('puLoginPass').value);
      const res=await fetch(BASE_URL+'/api/portal/login',{method:'POST',body:fd,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
      const data=await res.json();
      if(!res.ok) throw new Error(data.detail||'خطأ في الدخول');
      portalToken=data.access_token;
      portalUser={client_id:data.client_id,client_name:data.client_name,permissions:data.permissions};
      localStorage.setItem('ms_portal_token',portalToken);
      localStorage.setItem('ms_portal_user',JSON.stringify(portalUser));
      renderPortalDashboard();
    } catch(e){ err.textContent=e.message; btn.disabled=false; btn.innerHTML='🔐 دخول'; }
  };
  document.getElementById('puLoginBtn').onclick=doLogin;
  document.getElementById('puLoginPass').onkeydown=e=>{if(e.key==='Enter')doLogin();};
}

async function renderPortalDashboard() {
  if(!portalToken||!portalUser){renderPortalLogin();return;}
  document.getElementById('app').innerHTML=`
  <div style="min-height:100vh;background:#f1f5f9;font-family:inherit">
    <div style="background:linear-gradient(135deg,#0f1f6b,#1a2472);padding:16px 20px;display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:36px;height:36px;background:rgba(255,255,255,.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px">🔑</div>
        <div>
          <div style="color:white;font-size:14px;font-weight:700">${escH(portalUser.client_name||'')}</div>
          <div style="color:rgba(255,255,255,.6);font-size:11px">بوابة العملاء</div>
        </div>
      </div>
      <button onclick="portalLogout()" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:white;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit">خروج</button>
    </div>
    <div style="max-width:900px;margin:0 auto;padding:20px 16px">
      <div id="portalContent"><div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div></div>
    </div>
  </div>`;
  await loadPortalContent();
}

async function loadPortalContent() {
  const el=document.getElementById('portalContent');
  if(!el) return;
  const perm=portalUser?.permissions||{};
  const headers={'Authorization':'Bearer '+portalToken};
  try {
    const [profile, invoices, tasks, oblInst] = await Promise.all([
      fetch(BASE_URL+'/api/portal/my-profile',{headers}).then(r=>r.json()).catch(()=>null),
      perm.can_see_invoices?fetch(BASE_URL+'/api/portal/my-invoices',{headers}).then(r=>r.json()).catch(()=>[]):[],
      perm.can_see_tasks?fetch(BASE_URL+'/api/portal/my-tasks',{headers}).then(r=>r.json()).catch(()=>[]):[],
      perm.can_see_obligations?fetch(BASE_URL+'/api/obligations/upcoming?days=60&client_id='+(portalUser.client_id||''),{headers}).then(r=>r.json()).catch(()=>[]):[],
    ]);
    const money=v=>v!=null?(+v).toLocaleString('ar-EG',{minimumFractionDigits:0,maximumFractionDigits:2})+' ج.م.':'—';
    const date=d=>d?new Date(d).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}):'—';
    const statusColors={unpaid:'#dc2626',partial:'#d97706',paid:'#16a34a',cancelled:'#94a3b8',overdue:'#7c3aed'};
    const statusLabels={unpaid:'غير مدفوع',partial:'جزئي',paid:'مدفوع',cancelled:'ملغي',overdue:'متأخر',pending:'في الانتظار',open:'مفتوح',done:'منتهي',completed:'منتهي',in_progress:'جاري'};
    const invList=Array.isArray(invoices)?invoices:[];
    const taskList=Array.isArray(tasks)?tasks:[];
    const oblList=Array.isArray(oblInst)?oblInst:(oblInst?.items||[]);
    el.innerHTML=`
    ${profile?`<div class="card" style="margin-bottom:16px;padding:16px">
      <div style="font-weight:700;color:#1e293b;margin-bottom:4px">${escH(profile.name||'')}</div>
      ${profile.tax_number?`<div style="font-size:12px;color:#64748b">الرقم الضريبي: ${escH(profile.tax_number)}</div>`:''}
      ${profile.phone?`<div style="font-size:12px;color:#64748b">📞 ${escH(profile.phone)}</div>`:''}
    </div>`:''}
    ${perm.can_see_invoices?`
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:700;color:#1e293b;margin-bottom:14px;font-size:14px">🧾 الفواتير والتحصيلات</div>
      ${!invList.length?'<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">لا توجد فواتير</div>':
      `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc"><th style="padding:8px 10px;text-align:right;color:#64748b">رقم الفاتورة</th><th style="padding:8px;text-align:right;color:#64748b">التاريخ</th><th style="padding:8px;text-align:right;color:#64748b">المبلغ</th><th style="padding:8px;text-align:right;color:#64748b">المدفوع</th><th style="padding:8px;text-align:right;color:#64748b">المتبقي</th><th style="padding:8px;text-align:right;color:#64748b">الحالة</th></tr></thead>
        <tbody>${invList.map(i=>`<tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:8px 10px;font-weight:600">${escH(i.invoice_number||String(i.id))}</td>
          <td style="padding:8px;color:#64748b">${date(i.issue_date)}</td>
          <td style="padding:8px;font-weight:600">${money(i.total)}</td>
          <td style="padding:8px;color:#16a34a;font-weight:600">${money(i.paid_amount)}</td>
          <td style="padding:8px;color:${(i.remaining||0)>0?'#dc2626':'#16a34a'};font-weight:600">${money(i.remaining)}</td>
          <td style="padding:8px"><span style="background:${statusColors[i.status]||'#94a3b8'}20;color:${statusColors[i.status]||'#94a3b8'};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">${statusLabels[i.status]||i.status}</span></td>
        </tr>`).join('')}</tbody>
      </table></div>`}
    </div>`:''}
    ${perm.can_see_obligations?`
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:700;color:#1e293b;margin-bottom:14px;font-size:14px">📋 الالتزامات القادمة</div>
      ${!oblList.length?'<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">لا توجد التزامات قادمة</div>':
      `<div style="display:flex;flex-direction:column;gap:8px">${oblList.slice(0,20).map(o=>{
        const days=o.days_remaining;
        const urgColor=days<0?'#dc2626':days<=3?'#f59e0b':days<=7?'#d97706':'#16a34a';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border-radius:10px;border-right:3px solid ${urgColor}">
          <div>
            <div style="font-size:13px;font-weight:600;color:#1e293b">${escH(o.obligation_name||o.name_ar||o.obligation_type||'')}</div>
            <div style="font-size:11px;color:#64748b">الاستحقاق: ${date(o.due_date)}</div>
          </div>
          <span style="font-size:11px;font-weight:700;color:${urgColor}">${days<0?'متأخر '+Math.abs(days)+' يوم':days===0?'اليوم':days+' يوم'}</span>
        </div>`;
      }).join('')}</div>`}
    </div>`:''}
    ${perm.can_see_tasks?`
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:700;color:#1e293b;margin-bottom:14px;font-size:14px">✅ المهام</div>
      ${!taskList.length?'<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">لا توجد مهام</div>':
      `<div style="display:flex;flex-direction:column;gap:6px">${taskList.slice(0,20).map(t=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border-radius:10px">
        <div style="font-size:13px;font-weight:500;color:#1e293b">${escH(t.title||'')}</div>
        <span style="font-size:11px;font-weight:700;background:#eef1fb;color:#1a2472;padding:2px 8px;border-radius:20px">${statusLabels[t.status]||t.status}</span>
      </div>`).join('')}</div>`}
    </div>`:''}`;
  } catch(e){el.innerHTML=`<div style="text-align:center;padding:40px;color:#dc2626">${e.message}</div>`;}
}

function portalLogout() {
  portalToken=null; portalUser=null;
  localStorage.removeItem('ms_portal_token');
  localStorage.removeItem('ms_portal_user');
  renderPortalLogin();
}

// ── App Shell ──────────────────────────────────────
function renderApp() {
  if(isPortalMode()) {
    if(portalToken) renderPortalDashboard();
    else renderPortalLogin();
    return;
  }
  if (!token) { renderLogin(); return; }
  document.getElementById('app').innerHTML = `
  <div style="display:flex;min-height:100vh;background:#f1f5f9">
    <!-- Mobile overlay -->
    <div id="sidebarOverlay" class="sidebar-overlay" onclick="closeSidebar()"></div>
    <!-- Sidebar -->
    <div id="sidebar" class="app-sidebar" style="display:flex;flex-direction:column">
      <div style="padding:20px 16px 16px">
        <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.12)">
          <div style="display:flex;align-items:center;gap:10px">
            <img src="assets/logo.svg" alt="MS Logo" style="width:48px;height:48px;object-fit:contain;flex-shrink:0;filter:brightness(0) invert(1)"/>
            <div>
              <div style="font-weight:800;font-size:15px;color:white;letter-spacing:.3px">MS Accounting</div>
              <div style="font-size:10px;color:rgba(255,255,255,.55);font-weight:600;letter-spacing:.8px;text-transform:uppercase">Corporate Accounting</div>
            </div>
          </div>
        </div>
        <nav id="nav"></nav>
      </div>
      <div style="margin-top:auto;padding:16px;border-top:1px solid rgba(255,255,255,.12)">
        <div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,.08)">
          <div style="width:34px;height:34px;background:linear-gradient(135deg,rgba(255,255,255,.25),rgba(255,255,255,.12));border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;border:1px solid rgba(255,255,255,.2)">
            ${(currentUser?.name||'A').charAt(0)}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:700;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${currentUser?.name||'مدير النظام'}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${currentUser?.email||''}</div>
          </div>
          <button onclick="logout()" style="background:none;border:none;cursor:pointer;font-size:16px;color:rgba(255,255,255,.55);padding:4px" title="خروج">🚪</button>
        </div>
        <div id="apiStatus" style="display:flex;align-items:center;gap:6px;margin-top:10px;justify-content:center">
          <span id="apiDot" style="width:8px;height:8px;border-radius:50%;background:#22c55e;transition:background .4s"></span>
          <span id="apiStatusLabel" style="font-size:11px;color:rgba(255,255,255,.45)">API متصل</span>
        </div>
      </div>
    </div>
    <!-- Bottom Navigation (mobile) -->
    <nav class="bottom-nav" id="bottomNav">
      <button class="bottom-nav-item" onclick="navigate('dashboard')" data-page="dashboard">
        <span class="bn-icon">🏠</span><span>الرئيسية</span>
      </button>
      <button class="bottom-nav-item" onclick="navigate('clients')" data-page="clients">
        <span class="bn-icon">👥</span><span>العملاء</span>
      </button>
      <button class="bottom-nav-item" onclick="navigate('invoices')" data-page="invoices">
        <span class="bn-icon">📄</span><span>الفواتير</span>
      </button>
      <button class="bottom-nav-item" onclick="navigate('tasks')" data-page="tasks">
        <span class="bn-icon">✅</span><span>المهام</span>
      </button>
      <button class="bottom-nav-item" onclick="openSidebar()" id="bottomNavMore">
        <span class="bn-icon">☰</span><span>المزيد</span>
      </button>
    </nav>
    <!-- Main -->
    <div class="app-main">
      <!-- Topbar -->
      <div id="topbar-wrap" style="background:white;border-bottom:1.5px solid #e8edf3;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:9;box-shadow:0 1px 4px rgba(0,0,0,.04)">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="mobile-menu-btn" onclick="openSidebar()" title="القائمة">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a2472" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <h1 id="pageTitle" style="font-size:18px;font-weight:800;color:#1a2472;margin:0;padding-right:12px;border-right:3px solid #1a2472"></h1>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="topbar-date" style="font-size:12px;color:#94a3b8">${new Date().toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</span>
          <!-- Global Search -->
          <div id="globalSearchWrap" style="position:relative">
            <div style="display:flex;align-items:center;background:#f8fafc;border:1.5px solid #e8edf3;border-radius:10px;padding:0 12px;gap:8px;height:38px;cursor:text" onclick="openGlobalSearch()" title="بحث عالمي (Ctrl+K)">
              <span style="font-size:14px;color:#94a3b8">🔍</span>
              <span id="searchPlaceholder" class="search-placeholder-text" style="font-size:12px;color:#94a3b8;white-space:nowrap">بحث... (Ctrl+K)</span>
            </div>
          </div>
          <!-- Language toggle -->
          <button id="langToggleBtn" onclick="toggleLanguage()" title="تبديل اللغة / Switch Language" class="topbar-extra-btn" style="background:#f8fafc;border:1.5px solid #e8edf3;border-radius:10px;padding:0 10px;height:38px;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:#374151;transition:all .15s" onmouseover="this.style.background='#eef1fb'" onmouseout="this.style.background='#f8fafc'">
            <span id="langToggleIcon">🌐</span>
            <span id="langToggleLabel">EN</span>
          </button>
          <!-- Manual Refresh button (short press = reload data, long press = hard refresh) -->
          <button id="refreshBtn" onclick="refreshCurrentPage()" oncontextmenu="event.preventDefault();hardRefresh()" title="تحديث البيانات | كليك يمين = Force Refresh كامل" style="background:#f8fafc;border:1.5px solid #e8edf3;border-radius:10px;width:38px;height:38px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .15s;position:relative" onmouseover="this.style.background='#eef1fb'" onmouseout="this.style.background='#f8fafc'"><span id="refreshIcon">🔄</span></button>
          <!-- Force Refresh button — clears ALL cache and reloads -->
          <button onclick="hardRefresh()" title="Force Refresh — مسح الكاش وإعادة التحميل الكامل" style="background:#fff8f0;border:1.5px solid #fdba74;border-radius:10px;width:38px;height:38px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;transition:all .15s" onmouseover="this.style.background='#fff3e0'" onmouseout="this.style.background='#fff8f0'">⚡</button>
          <!-- Print button -->
          <button onclick="printCurrentPage()" title="طباعة الصفحة الحالية" class="topbar-extra-btn" style="background:#f8fafc;border:1.5px solid #e8edf3;border-radius:10px;width:38px;height:38px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .15s" onmouseover="this.style.background='#eef1fb'" onmouseout="this.style.background='#f8fafc'">🖨️</button>
          <!-- Quick compose email button -->
          <button onclick="navigate('mail')" title="إرسال بريد إلكتروني" class="topbar-extra-btn" style="background:#f8fafc;border:1.5px solid #e8edf3;border-radius:10px;width:38px;height:38px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .15s" onmouseover="this.style.background='#eef1fb'" onmouseout="this.style.background='#f8fafc'">📧</button>
          <!-- Notification Bell -->
          <div id="notifBellWrap" style="position:relative">
            <button id="notifBellBtn" onclick="toggleNotifDropdown()" title="الإشعارات" style="position:relative;background:#f8fafc;border:1.5px solid #e8edf3;border-radius:10px;width:38px;height:38px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .15s" onmouseover="this.style.background='#eef1fb'" onmouseout="this.style.background='#f8fafc'">
              🔔
              <span id="notifBadge" style="display:none;position:absolute;top:-4px;right:-4px;background:#dc2626;color:white;font-size:10px;font-weight:700;border-radius:99px;min-width:18px;height:18px;line-height:18px;text-align:center;padding:0 4px;border:2px solid white"></span>
            </button>
            <div id="notifDropdown" style="display:none;position:absolute;top:44px;left:0;width:340px;background:white;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.14);border:1px solid #e8edf3;z-index:200;overflow:hidden">
              <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:13px;font-weight:700;color:#1e293b">الإشعارات</span>
                <button onclick="markAllNotifsRead()" style="background:none;border:none;font-size:11px;color:#1a2472;cursor:pointer;font-weight:600;font-family:inherit">تحديد الكل كمقروء ✓</button>
              </div>
              <div id="notifList" style="max-height:340px;overflow-y:auto">
                <div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">⏳ جاري التحميل...</div>
              </div>
              <div style="padding:10px 16px;border-top:1px solid #f1f5f9;text-align:center">
                <button onclick="navigate('obligations');toggleNotifDropdown()" style="background:none;border:none;font-size:12px;color:#1a2472;cursor:pointer;font-weight:600;font-family:inherit">عرض كل الالتزامات ←</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Page content -->
      <!-- رأس الطباعة — يظهر فقط عند الطباعة -->
      <div class="print-header" id="printHeader">
        <div>
          <div class="ph-title">🏢 MS Accounting — مكتب محاسبة</div>
          <div class="ph-meta" id="printPageLabel" style="font-size:13px;color:#475569;font-weight:600;margin-top:3px"></div>
        </div>
        <div class="ph-meta" style="text-align:left">
          <div>تاريخ الطباعة: <span id="printDate"></span></div>
        </div>
      </div>
      <div id="main" style="flex:1;padding:12px 14px;max-width:100%;width:100%;box-sizing:border-box"></div>
    </div>
  </div>`;

  // Build grouped nav
  const nav = document.getElementById('nav');
  const itemMap = Object.fromEntries(navItems.map(i=>[i.id,i]));
  navGroups.forEach(group => {
    const lbl = document.createElement('div');
    lbl.className = 'nav-group-label';
    lbl.textContent = group.label;
    nav.append(lbl);
    group.items.forEach(id => {
      const item = itemMap[id]; if(!item) return;
      // Hide admin-only items from non-admins
      if(item.adminOnly && currentUser?.role !== 'admin') return;
      const a = document.createElement('div');
      a.className = `sidebar-link${currentPage===id?' active':''}`;
      a.dataset.navId = id;
      a.innerHTML = `<span class="icon">${item.icon}</span><span>${item.label}</span>`;
      a.onclick = () => { navigate(id); if(window.innerWidth<=768) closeSidebar(); };
      nav.append(a);
    });
  });

  // FAB (Quick Add)
  const fab = document.createElement('div');
  fab.className = 'fab-wrap no-print';
  fab.id = 'fabWrap';
  fab.innerHTML = `
    <div class="fab-menu" id="fabMenu">
      <button class="fab-option" onclick="quickAdd('appointment')"><span class="fab-option-icon">📅</span>موعد جديد</button>
      <button class="fab-option" onclick="quickAdd('task')"><span class="fab-option-icon">✅</span>مهمة جديدة</button>
      <button class="fab-option" onclick="quickAdd('invoice')"><span class="fab-option-icon">💳</span>فاتورة جديدة</button>
      <button class="fab-option" onclick="quickAdd('client')"><span class="fab-option-icon">👥</span>عميل جديد</button>
    </div>
    <button class="fab-main" id="fabBtn" onclick="toggleFab()" title="إضافة سريعة">+</button>
  `;
  // Remove previous FAB to prevent duplicates on re-login
  document.getElementById('fabWrap')?.remove();
  document.body.append(fab);

  // Register FAB close-outside listener once (remove previous to avoid stacking)
  if (_fabClickHandler) document.removeEventListener('click', _fabClickHandler, {capture:true});
  _fabClickHandler = e => { const w = document.getElementById('fabWrap'); if(w && !w.contains(e.target)) closeFab(); };
  document.addEventListener('click', _fabClickHandler, {capture:true, passive:true});

  // Start connection monitor (keeps checking every 30s + handles offline/online events)
  _startConnMonitor();

  const _urlPage = new URLSearchParams(location.search).get('goto');
  if (_urlPage) currentPage = _urlPage;
  navigate(currentPage);

  // ── Start real-time sync engine ──
  initRealtime();

  // Load notifications count and refresh every 2 minutes (clear any previous interval)
  loadNotifCount();
  if (_notifInterval) clearInterval(_notifInterval);
  _notifInterval = setInterval(loadNotifCount, 120000);
}

// ── Notifications Bell ─────────────────────────────
let notifData = [], notifDropdownOpen = false;

let _taskNotifData = []; // task-based notifications

async function loadNotifCount() {
  try {
    const [oblD, taskR] = await Promise.all([
      api('GET', '/api/obligations/notifications?unread_only=true&limit=1').catch(()=>null),
      api('GET', `/api/tasks?overdue_only=true&page_size=1`).catch(()=>null),
    ]);
    const badge = document.getElementById('notifBadge');
    if (badge) {
      const oblCnt = oblD?.unread_count || 0;
      const taskCnt = taskR?.total || 0;
      const total = oblCnt + taskCnt;
      badge.textContent = total > 99 ? '99+' : total;
      badge.style.display = total > 0 ? 'block' : 'none';
    }
  } catch(e) {}
}

async function loadNotifData() {
  try {
    const [d, taskR] = await Promise.all([
      api('GET', '/api/obligations/notifications?limit=15').catch(()=>({items:[],unread_count:0})),
      api('GET', '/api/tasks?overdue_only=true&page_size=20').catch(()=>({items:[]})),
    ]);
    notifData = d?.items || [];

    // Build virtual task notifications from overdue tasks
    _taskNotifData = (taskR?.items || []).map(t => ({
      id: `task_${t.id}`,
      type: 'deadline',
      title: `⏰ مهمة متأخرة: ${t.title}`,
      message: [
        t.assigned_to_name ? `موظف: ${t.assigned_to_name}` : '',
        t.client_name ? `عميل: ${t.client_name}` : '',
        t.due_date ? `كانت مستحقة: ${dateAr(t.due_date)}` : '',
      ].filter(Boolean).join(' · '),
      is_read: false,
      created_at: t.due_date,
      _task_id: t.id,
    }));

    renderNotifList();
    const badge = document.getElementById('notifBadge');
    if (badge) {
      const oblCnt = d?.unread_count || 0;
      const taskCnt = _taskNotifData.length;
      const total = oblCnt + taskCnt;
      badge.textContent = total > 99 ? '99+' : total;
      badge.style.display = total > 0 ? 'block' : 'none';
    }
  } catch(e) { document.getElementById('notifList').innerHTML='<div style="padding:20px;text-align:center;color:#94a3b8">تعذّر تحميل الإشعارات</div>'; }
}

function renderNotifList() {
  const el = document.getElementById('notifList');
  if (!el) return;
  const allItems = [..._taskNotifData, ...notifData];
  if (!allItems.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">🎉 لا توجد إشعارات جديدة</div>';
    return;
  }
  const typeIcon = {warning:'⚠️', info:'📅', error:'🚨', success:'✅', deadline:'⏰'};
  el.innerHTML = allItems.map(n=>{
    const isTask = typeof n.id === 'string' && n.id.startsWith('task_');
    const clickAction = isTask
      ? `onclick="closeNotifDropdown();navigate('tasks');setTimeout(()=>renderOverdueBoard('overdue'),400)"`
      : `onclick="markNotifRead(${n.id})"`;
    return `
    <div ${clickAction} style="padding:12px 16px;border-bottom:1px solid #f8fafc;cursor:pointer;background:${n.is_read?'white':'#f0f7ff'};transition:background .15s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='${n.is_read?'white':'#f0f7ff'}'">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:16px;flex-shrink:0;margin-top:1px">${typeIcon[n.type]||'🔔'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:${n.is_read?600:700};color:#1e293b;margin-bottom:2px;line-height:1.4">${escH(n.title)}</div>
          <div style="font-size:11px;color:#64748b;line-height:1.4">${escH(n.message||'')}</div>
          <div style="font-size:10px;color:#cbd5e1;margin-top:4px">${dateAr(n.created_at)}</div>
        </div>
        ${!n.is_read?'<span style="width:8px;height:8px;background:#dc2626;border-radius:50%;flex-shrink:0;margin-top:4px"></span>':''}
      </div>
    </div>`;
  }).join('');
}

function closeNotifDropdown() {
  notifDropdownOpen = false;
  const dd = document.getElementById('notifDropdown');
  if (dd) dd.style.display = 'none';
}

function toggleNotifDropdown() {
  notifDropdownOpen = !notifDropdownOpen;
  const dd = document.getElementById('notifDropdown');
  if (!dd) return;
  dd.style.display = notifDropdownOpen ? 'block' : 'none';
  if (notifDropdownOpen) {
    loadNotifData();
    // Close on outside click
    setTimeout(()=>document.addEventListener('click', closeNotifOnOutside, {once:true}), 10);
  }
}

function closeNotifOnOutside(e) {
  const wrap = document.getElementById('notifBellWrap');
  if (wrap && !wrap.contains(e.target)) {
    const dd = document.getElementById('notifDropdown');
    if (dd) dd.style.display = 'none';
    notifDropdownOpen = false;
  }
}

async function markNotifRead(id) {
  try {
    await api('PUT', `/api/obligations/notifications/${id}/read`);
    notifData = notifData.map(n => n.id===id ? {...n, is_read:true} : n);
    renderNotifList();
    loadNotifCount();
  } catch(e) {}
}

async function markAllNotifsRead() {
  try {
    await api('PUT', '/api/obligations/notifications/read-all');
    notifData = notifData.map(n=>({...n,is_read:true}));
    renderNotifList();
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
  } catch(e) {}
}

// ── Global Search ─────────────────────────────────
let searchOverlay = null;

function openGlobalSearch() {
  if (searchOverlay) return;
  searchOverlay = document.createElement('div');
  searchOverlay.style='position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:300;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;backdrop-filter:blur(4px)';
  searchOverlay.innerHTML=`
    <div style="width:100%;max-width:620px;background:white;border-radius:16px;box-shadow:0 25px 60px rgba(0,0,0,.25);overflow:hidden">
      <div style="display:flex;align-items:center;padding:16px 18px;border-bottom:1px solid #f1f5f9;gap:12px">
        <span style="font-size:18px">🔍</span>
        <input id="globalSearchInput" class="input" style="border:none;padding:0;font-size:15px;font-weight:500;flex:1;outline:none" placeholder="ابحث في العملاء، الملفات، المهام، الالتزامات..." autofocus/>
        <button onclick="closeGlobalSearch()" style="background:none;border:none;cursor:pointer;font-size:16px;color:#94a3b8;padding:4px">✕</button>
      </div>
      <div id="globalSearchResults" style="max-height:420px;overflow-y:auto;padding:8px">
        <div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">اكتب للبحث في النظام كله...</div>
      </div>
      <div style="padding:10px 18px;border-top:1px solid #f1f5f9;display:flex;gap:16px;font-size:11px;color:#94a3b8">
        <span>↵ فتح</span><span>Esc إغلاق</span><span>🔍 بحث في: العملاء · الملفات · المهام · الالتزامات · الإقرارات</span>
      </div>
    </div>`;
  document.body.append(searchOverlay);
  searchOverlay.addEventListener('click', e => { if(e.target===searchOverlay) closeGlobalSearch(); });

  const input = document.getElementById('globalSearchInput');
  let searchTimer;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      document.getElementById('globalSearchResults').innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">اكتب كلمتين على الأقل...</div>';
      return;
    }
    document.getElementById('globalSearchResults').innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">⏳ جاري البحث...</div>';
    searchTimer = setTimeout(() => runGlobalSearch(q), 300);
  });
  input.addEventListener('keydown', e => { if(e.key==='Escape') closeGlobalSearch(); });
}

function closeGlobalSearch() {
  if (searchOverlay) { searchOverlay.remove(); searchOverlay = null; }
}

async function runGlobalSearch(q) {
  const el = document.getElementById('globalSearchResults');
  if (!el) return;
  try {
    // Run all searches in parallel
    const [clients, docs, tasks] = await Promise.all([
      api('GET', `/api/clients?q=${encodeURIComponent(q)}&page_size=5`).catch(()=>null),
      api('GET', `/api/documents?q=${encodeURIComponent(q)}&page_size=5`).catch(()=>null),
      api('GET', `/api/tasks?q=${encodeURIComponent(q)}&page_size=5`).catch(()=>null),
    ]);

    const sections = [];

    // Clients results
    const cItems = clients?.items || [];
    if (cItems.length) {
      sections.push(`<div style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">👥 العملاء</div>`);
      cItems.forEach(c => {
        sections.push(`<div onclick="closeGlobalSearch();navigate('clients');setTimeout(()=>showClientDetail(${c.id}),400)" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:2px" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          <div style="width:32px;height:32px;border-radius:8px;background:#eef1fb;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">👤</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#1e293b">${escH(c.name)}</div>
            <div style="font-size:11px;color:#94a3b8">${c.tax_number?'#'+c.tax_number:''} ${c.phone||''} ${c.activity||''}</div>
          </div>
          <span style="font-size:11px;color:#1a2472;font-weight:600;flex-shrink:0">${c.code||''}</span>
        </div>`);
      });
    }

    // Documents results
    const dItems = docs?.items || [];
    if (dItems.length) {
      sections.push(`<div style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-top:6px">📁 الملفات</div>`);
      dItems.forEach(d => {
        sections.push(`<div onclick="closeGlobalSearch();navigate('documents')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:2px" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          <div style="width:32px;height:32px;border-radius:8px;background:#f0f7ff;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">📄</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(d.original_name||d.name||'')}</div>
            <div style="font-size:11px;color:#94a3b8">${escH(d.client_name||'—')} • ${d.category||''}</div>
          </div>
        </div>`);
      });
    }

    // Tasks results
    const tItems = tasks?.items || [];
    if (tItems.length) {
      sections.push(`<div style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-top:6px">✅ المهام</div>`);
      tItems.forEach(t => {
        sections.push(`<div onclick="closeGlobalSearch();navigate('tasks')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:2px" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          <div style="width:32px;height:32px;border-radius:8px;background:#faf5ff;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">📋</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#1e293b">${escH(t.title||'')}</div>
            <div style="font-size:11px;color:#94a3b8">${escH(t.client_name||'—')} • ${t.status||''}</div>
          </div>
        </div>`);
      });
    }

    if (!sections.length) {
      el.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8"><div style="font-size:32px;margin-bottom:8px">🔍</div><div style="font-size:13px">لا نتائج لـ "${escH(q)}"</div></div>`;
    } else {
      el.innerHTML = sections.join('');
    }
  } catch(err) {
    if(el) el.innerHTML = `<div style="color:#dc2626;padding:20px;text-align:center;font-size:13px">${err.message}</div>`;
  }
}

// Ctrl+K shortcut
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (searchOverlay) closeGlobalSearch();
    else openGlobalSearch();
  }
});

// ── Connection Monitor ────────────────────────────────────────────────────────
let _connState = 'ok';   // 'ok' | 'degraded' | 'offline'
let _connRetries = 0;
let _connTimer = null;

function setApiStatus(ok, label) {
  const dot  = document.getElementById('apiDot');
  const lbl  = document.getElementById('apiStatusLabel');
  if(dot) dot.style.background = ok ? '#22c55e' : (_connState === 'degraded' ? '#f59e0b' : '#ef4444');
  if(lbl) lbl.textContent = label || (ok ? 'API متصل' : 'غير متصل');
}

async function _checkConn() {
  try {
    const r = await fetch(`${API}/health`, {signal: AbortSignal.timeout(8000)});
    const data = await r.json().catch(()=>({}));
    const dbOk = data.db === 'connected';

    if(_connState !== 'ok' || document.getElementById('stale-banner')) {
      // Was offline or showing stale banner — now restored
      _connState = 'ok';
      _connRetries = 0;
      setApiStatus(true, 'API متصل');
      _hideStaleBanner();
      if(_connState !== 'ok') toast('✅ تم استعادة الاتصال بالخادم');
      if(window._connMonitorNormal) window._connMonitorNormal();
      // Refresh current page silently with fresh data
      if (typeof _REFRESH_FN_MAP !== 'undefined' && _REFRESH_FN_MAP[currentPage]) {
        _clearPageCache(currentPage);
        try { await _REFRESH_FN_MAP[currentPage](); } catch(e) {}
      }
    }

    if(!dbOk && _connState !== 'degraded') {
      _connState = 'degraded';
      setApiStatus(false, 'قاعدة البيانات غير متصلة');
    } else if(dbOk && _connState !== 'offline') {
      _connState = 'ok';
      setApiStatus(true, 'API متصل');
    }
  } catch(e) {
    if(_connState === 'ok') {
      _connState = 'offline';
      _connRetries = 0;
      setApiStatus(false, 'غير متصل...');
      toast('⚠️ انقطع الاتصال بالخادم. جارٍ إعادة المحاولة...', 'error');
      if(window._connMonitorFast) window._connMonitorFast();
    }
    _connRetries++;
    setApiStatus(false, `غير متصل (محاولة ${_connRetries})`);
  }
}

function _startConnMonitor() {
  _checkConn();
  // Check every 20s normally; if offline, check every 5s until restored
  let _connInterval = setInterval(_checkConn, 20000);
  window._connMonitorFast = () => {
    clearInterval(_connInterval);
    _connInterval = setInterval(_checkConn, 5000);
  };
  window._connMonitorNormal = () => {
    clearInterval(_connInterval);
    _connInterval = setInterval(_checkConn, 20000);
  };
  window.addEventListener('online',  () => { if(_connState !== 'ok') { _checkConn(); } });
  window.addEventListener('offline', () => {
    _connState = 'offline';
    setApiStatus(false, 'لا يوجد اتصال بالإنترنت');
    toast('❌ لا يوجد اتصال بالإنترنت', 'error');
    window._connMonitorFast();
  });
}

// ── Global JS Error Catcher ───────────────────────────────────────────────────
window.onerror = function(msg, src, line, col, err) {
  console.error('[GlobalError]', msg, src, line, err);
  // Only show toast for non-trivial errors
  if(msg && !String(msg).includes('ResizeObserver') && !String(msg).includes('Script error')) {
    // Don't show raw error to user — just log silently
  }
  return false; // don't suppress default console error
};

window.addEventListener('unhandledrejection', function(e) {
  const msg = e?.reason?.message || String(e?.reason || '');
  if(msg && !msg.includes('AbortError') && !msg.includes('NetworkError')) {
    console.error('[UnhandledPromise]', msg);
  }
});

function navigate(page) {
  currentPage = page;
  document.dispatchEvent(new CustomEvent('_navigateTo',{detail:page}));
  $$('.sidebar-link[data-nav-id]').forEach(el=>el.classList.toggle('active',el.dataset.navId===page));
  // Update bottom nav active state
  $$('#bottomNav .bottom-nav-item[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  const titles={dashboard:'الرئيسية',clients:'عملاء المكتب',leads:'العملاء المحتملين (CRM)',invoices:'أتعاب الحسابات',collections:'التحصيلات',tasks:'المهام',mail:'البريد الإلكتروني',obligations:'الالتزامات الضريبية',formation_obligations:'التزامات التأسيس',quotations:'عروض أسعار التأسيس',establishment:'تأسيس الشركات',documents:'الأرشيف',tax:'الإقرارات الضريبية',settings:'الإعدادات',settlements:'تسويات الموظفين',appointments:'المواعيد',accounting:'المحاسبة',payroll:'الرواتب والموظفين',fin_reports:'التقارير المالية',statements:'الميزانيات',office_services:'خدمات المكتب',client_portal:'بوابة العملاء',permissions:'إدارة الصلاحيات',owner:'👑 إدارة المكتب المالية',finance_center:'المالية',monthly_fees:'المدفوعات الشهرية — الحسابات',daily_revenues:'الإيرادات اليومية',company_names:'🏢 مولّد أسماء الشركات',under_establishment_clients:'⭐ عملاء تحت التأسيس'};
  const t=document.getElementById('pageTitle');
  if(t) t.textContent=titles[page]||page;
  const main=document.getElementById('main');
  if(main) main.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  Object.keys(chartInstances).forEach(destroyChart);
  const pages={dashboard:loadDashboard,clients:loadClients,leads:loadLeads,invoices:loadInvoices,collections:loadCollections,tasks:loadTasks,mail:loadMail,obligations:loadObligations,formation_obligations:loadFormationObligations,quotations:loadQuotations,establishment:loadEstablishment,documents:loadDocuments,tax:loadTax,settings:loadSettings,settlements:loadSettlements,appointments:loadAppointments,payroll:loadPayroll,fin_reports:loadFinReports,statements:loadStatements,office_services:loadOfficeServices,client_portal:loadClientPortal,permissions:loadPermissions,owner:loadOwnerDashboard,finance_center:loadFinanceCenter,monthly_fees:loadMonthlyFees,daily_revenues:loadDailyRevenues,system_logs:loadSystemLogs,backup:loadBackup,migration_dashboard:loadMigrationDashboard,company_names:loadCompanyNames,under_establishment_clients:loadUnderEstablishmentClients,health_check:loadHealthCheck};
  if(pages[page]) pages[page]();
}

