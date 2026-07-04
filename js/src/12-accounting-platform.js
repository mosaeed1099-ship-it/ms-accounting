'use strict';
// ═══════════════════════════════════════════════════════════════════════════════
//  Accounting Services Platform — 12-accounting-platform.js
//  Plugin-based service hub: register a service → it appears automatically.
//  Core is never modified when adding new services.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Service Registry ───────────────────────────────────────────────────────────
const _aspSvc  = {};
const _aspCats = [
  { id:'tax',        label:'الإقرارات الضريبية', icon:'🧾' },
  { id:'financial',  label:'التقارير المالية',    icon:'📊' },
  { id:'operations', label:'العمليات اليومية',    icon:'💼' },
  { id:'treasury',   label:'الخزينة والأصول',    icon:'🏦' },
];

function aspRegisterService(d) {
  if (d && d.id && d.label) _aspSvc[d.id] = { inputTypes:[], ...d };
}

// ── Register All Services ──────────────────────────────────────────────────────

// 🧾 إقرارات ضريبية
aspRegisterService({
  id:'vat_return', label:'إقرار ضريبة القيمة المضافة', icon:'🧾', category:'tax',
  inputTypes:[{id:'sales',label:'مبيعات'},{id:'purchases',label:'مشتريات'}],
  hasGenerate:true,
});
aspRegisterService({
  id:'government_reports', label:'التقارير الحكومية', icon:'🏛️', category:'tax',
  comingSoon:true,
});

// 📊 تقارير مالية
aspRegisterService({
  id:'financial_statements', label:'القوائم المالية', icon:'📋', category:'financial',
  inputTypes:[
    {id:'sales',label:'مبيعات'}, {id:'purchases',label:'مشتريات'},
    {id:'expenses',label:'مصروفات'}, {id:'salary',label:'مرتبات'},
    {id:'assets',label:'أصول ثابتة'},
  ],
  hasGenerate:true, composite:true,
});
aspRegisterService({
  id:'income_statement', label:'قائمة الدخل', icon:'📈', category:'financial', isReport:true,
});
aspRegisterService({
  id:'trial_balance', label:'ميزان المراجعة', icon:'⚖️', category:'financial', isReport:true,
});
aspRegisterService({
  id:'general_ledger', label:'دفتر الأستاذ العام', icon:'📖', category:'financial', isReport:true,
});
aspRegisterService({
  id:'journal_entries', label:'القيود اليومية', icon:'📝', category:'financial',
  inputTypes:[{id:'sale',label:'مبيعات'},{id:'purchase',label:'مشتريات'},{id:'expense',label:'مصروفات'}],
});

// 💼 عمليات يومية
aspRegisterService({
  id:'sales', label:'المبيعات', icon:'💰', category:'operations',
  inputTypes:[{id:'sales',label:'مبيعات'}],
});
aspRegisterService({
  id:'purchases', label:'المشتريات', icon:'🛒', category:'operations',
  inputTypes:[{id:'purchases',label:'مشتريات'}],
});
aspRegisterService({
  id:'expenses', label:'المصروفات', icon:'📤', category:'operations',
  inputTypes:[{id:'expenses',label:'مصروفات'}],
});
aspRegisterService({
  id:'payroll', label:'الرواتب والمرتبات', icon:'👥', category:'operations',
  inputTypes:[{id:'salary',label:'كشف مرتبات'}],
});
aspRegisterService({
  id:'cost_centers', label:'مراكز التكلفة', icon:'🎯', category:'operations',
  comingSoon:true,
});

// 🏦 خزينة وأصول
aspRegisterService({
  id:'fixed_assets', label:'الأصول الثابتة', icon:'🏗️', category:'treasury',
  inputTypes:[{id:'assets',label:'أصول ثابتة'}],
});
aspRegisterService({
  id:'petty_cash', label:'المصروفات النثرية', icon:'💵', category:'treasury',
  inputTypes:[{id:'expenses',label:'مصروفات نثرية'}],
});
aspRegisterService({
  id:'bank_reconciliation', label:'التسوية البنكية', icon:'🏦', category:'treasury',
  comingSoon:true,
});
aspRegisterService({
  id:'custody', label:'العهد والسلف', icon:'🤝', category:'treasury',
  comingSoon:true,
});

// ── State ──────────────────────────────────────────────────────────────────────
let _aspClientId = null;
let _aspActiveId = null;

// ── Helpers ────────────────────────────────────────────────────────────────────
const _h   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const _fmt = n => Number(n||0).toLocaleString('ar-EG',{minimumFractionDigits:0,maximumFractionDigits:2});
const _kpi = (label,val,color,bg) => `
  <div style="background:${bg||'#fff'};border-radius:8px;padding:12px 14px;border:1px solid var(--border,#e5e7eb)">
    <div style="font-size:.75rem;color:#6b7280;margin-bottom:4px">${label}</div>
    <div style="font-weight:700;font-size:1.05rem;${color?'color:'+color:''}">${val}</div>
  </div>`;

// ── Shell HTML ─────────────────────────────────────────────────────────────────
const _aspStyles = `<style>
#asp-frame{display:flex;flex-direction:column;height:calc(100vh - 112px);min-height:560px;border:1px solid var(--border,#e5e7eb);border-radius:12px;overflow:hidden;background:var(--card-bg,#fff)}
#asp-topbar{display:flex;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--border,#e5e7eb);background:var(--sidebar-bg,#f8fafc);flex-shrink:0}
#asp-body{display:flex;flex:1;overflow:hidden}
#asp-nav{width:220px;min-width:220px;border-left:1px solid var(--border,#e5e7eb);overflow-y:auto;padding:6px 0;background:var(--sidebar-bg,#f8fafc)}
.asp-cat{padding:14px 12px 4px;font-size:.72rem;font-weight:700;color:#9ca3af;letter-spacing:.06em;text-transform:uppercase}
.asp-item{display:flex;align-items:center;gap:9px;padding:8px 12px;cursor:pointer;font-size:.88rem;color:var(--text,#1f2937);transition:background .12s;user-select:none}
.asp-item:hover:not(.asp-soon){background:var(--hover-bg,#f1f5f9)}
.asp-active{background:#eff6ff!important;color:#2563eb!important;font-weight:600;border-right:3px solid #2563eb}
.asp-soon{opacity:.5;cursor:not-allowed}
#asp-ws{flex:1;overflow-y:auto}
.asp-ws-hd{padding:18px 22px 0;border-bottom:1px solid var(--border,#e5e7eb);position:sticky;top:0;background:var(--card-bg,#fff);z-index:1}
.asp-ws-title{font-size:1.15rem;font-weight:700;margin:0 0 12px}
.asp-actions{display:flex;gap:8px;flex-wrap:wrap;padding-bottom:14px}
.asp-btn{padding:8px 16px;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--card-bg,#fff);cursor:pointer;font-size:.88rem;font-weight:500;transition:all .13s;color:var(--text,#1f2937)}
.asp-btn:hover{background:#f1f5f9}
.asp-btn-pri{background:#2563eb;color:#fff;border-color:#2563eb}
.asp-btn-pri:hover{background:#1d4ed8}
.asp-btn-red{color:#dc2626;border-color:#dc2626}
.asp-btn-red:hover{background:#fef2f2}
.asp-ws-body{padding:20px 22px}
.asp-tbl{width:100%;border-collapse:collapse;font-size:.88rem}
.asp-tbl th{padding:9px 10px;background:#f8fafc;text-align:right;font-weight:600;border-bottom:1px solid var(--border,#e5e7eb)}
.asp-tbl td{padding:8px 10px;border-bottom:1px solid var(--border,#f3f4f6)}
.asp-card{border:1px solid var(--border,#e5e7eb);border-radius:10px;overflow:hidden;margin-bottom:16px}
.asp-card-hd{padding:11px 16px;font-weight:700;font-size:.95rem}
.asp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px}
</style>`;

function _aspBuildNav(clientId) {
  return _aspCats.map(cat => {
    const svcs = Object.values(_aspSvc).filter(s => s.category === cat.id);
    if (!svcs.length) return '';
    return `<div class="asp-cat">${cat.label}</div>` + svcs.map(s => `
      <div class="asp-item${s.id===_aspActiveId?' asp-active':''}${s.comingSoon?' asp-soon':''}"
        onclick="${s.comingSoon?'':("aspOpenService('"+s.id+"',"+clientId+")")}"
        title="${s.comingSoon?'قريباً':_h(s.label)}">
        <span style="font-size:1.1rem">${s.icon}</span>
        <span style="flex:1">${_h(s.label)}</span>
        ${s.comingSoon?'<span style="font-size:.7rem;background:#f3f4f6;padding:1px 6px;border-radius:4px;color:#9ca3af">قريباً</span>':''}
      </div>`).join('');
  }).join('');
}

// ── Main Entry ─────────────────────────────────────────────────────────────────
function _aspSet(html) { const m = document.getElementById('main'); if(m){ m.className='page'; m.innerHTML=html; } }

async function loadAccountingPlatform() {
  // ── TRACE MODE ────────────────────────────────────────────────────────────────
  const _trace = [];
  const _tr = (step, detail='') => {
    _trace.push(`✅ ${step}${detail?' — '+detail:''}`);
    const m = document.getElementById('main');
    if (m) m.innerHTML = `<div style="padding:20px;font-family:monospace;font-size:.82rem;line-height:1.8">
      <b>🔍 ASP Runtime Trace</b><br><br>${_trace.map(l=>`<div>${l}</div>`).join('')}
    </div>`;
  };
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    _tr('STEP 1: loadAccountingPlatform() دخل');

    let clients = [];
    try {
      _tr('STEP 2: api(/api/clients) — قبل الاستدعاء');
      const raw = await api('GET', '/api/clients') || [];
      _tr('STEP 3: api(/api/clients) — رجعت', `type=${Array.isArray(raw)?'Array':'Object'}, keys=${Object.keys(raw||{}).join(',')}`);
      clients = Array.isArray(raw) ? raw : (raw.items || []);
      _tr('STEP 4: clients parsed', `count=${clients.length}`);
    } catch(e) {
      _tr(`STEP 2-4: ❌ EXCEPTION في api()`, e.message);
      clients = [];
    }

    if (!clients.length) {
      _tr('STEP 5: clients.length=0 — خروج مبكر');
      _aspSet('<div style="padding:36px;text-align:center;color:#6b7280">لا يوجد عملاء</div>');
      return;
    }

    _tr('STEP 5: clients OK — بناء opts', `first client id=${clients[0].id}`);
    _aspClientId = clients[0].id;
    _aspActiveId = null;
    const opts = clients.map(c => `<option value="${c.id}">${_h(c.name)}</option>`).join('');

    _tr('STEP 6: _aspBuildNav() — قبل');
    const navHtml = _aspBuildNav(_aspClientId);
    _tr('STEP 7: _aspBuildNav() — رجعت', `length=${navHtml.length}`);

    _tr('STEP 8: _aspSet(full HTML) — قبل');
    _aspSet(`
      ${_aspStyles}
      <div style="padding:0 0 20px">
      <div id="asp-frame">
        <div id="asp-topbar">
          <span style="font-weight:700;font-size:1rem">🏛️ مركز الخدمات المحاسبية</span>
          <span style="color:#9ca3af;font-size:.9rem">|</span>
          <label style="font-size:.88rem;color:#6b7280;font-weight:500">العميل:</label>
          <select id="asp-client-sel" onchange="aspSwitchClient(this.value)"
            style="padding:6px 12px;border-radius:7px;border:1px solid var(--border,#e5e7eb);background:var(--card-bg,#fff);font-size:.9rem;min-width:160px">
            ${opts}
          </select>
        </div>
        <div id="asp-body">
          <div id="asp-nav">${navHtml}</div>
          <div id="asp-ws">
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#9ca3af;gap:12px">
              <div style="font-size:3rem">🏛️</div>
              <div style="font-size:1rem;font-weight:500">اختر خدمة من القائمة</div>
              <div style="font-size:.85rem">مركز خدماتك المحاسبية في مكان واحد</div>
            </div>
          </div>
        </div>
      </div>
      </div>`);
    // STEP 9 won't show on screen (main was just replaced) — that's expected ✅
  } catch(err) {
    const _m = document.getElementById('main');
    if(_m) _m.innerHTML = `<div style="padding:24px;color:#dc2626;font-family:monospace;white-space:pre-wrap;font-size:.85rem">
      ❌ EXCEPTION في loadAccountingPlatform<br><br>
      Trace حتى الآن:<br>${_trace.map(l=>`${l}<br>`).join('')}<br>
      <b>Error:</b> ${err.message}<br><br>${err.stack||''}
    </div>`;
  }
}

function aspSwitchClient(clientId) {
  _aspClientId = +clientId;
  _aspActiveId = null;
  const nav = document.getElementById('asp-nav');
  if (nav) nav.innerHTML = _aspBuildNav(_aspClientId);
  const ws = document.getElementById('asp-ws');
  if (ws) ws.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#9ca3af;gap:10px">
      <div style="font-size:2.5rem">🏛️</div>
      <div style="font-size:.95rem">اختر خدمة من القائمة</div>
    </div>`;
}

// ── Open Service ───────────────────────────────────────────────────────────────
async function aspOpenService(serviceId, clientId) {
  _aspActiveId = serviceId;
  _aspClientId = +clientId;
  const svc = _aspSvc[serviceId];
  if (!svc) return;

  // Update nav active
  const nav = document.getElementById('asp-nav');
  if (nav) nav.innerHTML = _aspBuildNav(clientId);

  const ws = document.getElementById('asp-ws');
  if (!ws) return;
  ws.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280">⏳ تحميل...</div>';

  if (svc.isReport) {
    await _aspLoadReport(serviceId, clientId, ws);
  } else if (svc.composite) {
    _aspRenderComposite(svc, clientId, ws);
  } else {
    _aspRenderImportWS(svc, clientId, ws);
  }
}

// ── Import Workspace ───────────────────────────────────────────────────────────
function _aspRenderImportWS(svc, clientId, ws) {
  const imports = (svc.inputTypes||[]).map(it => `
    <button class="asp-btn" onclick="aspShowImport('${svc.id}','${it.id}','${_h(it.label)}',${clientId})">
      📤 استيراد ${_h(it.label)}
    </button>`).join('');

  ws.innerHTML = `
    <div class="asp-ws-hd">
      <h3 class="asp-ws-title">${svc.icon} ${_h(svc.label)}</h3>
      <div class="asp-actions">
        ${imports}
        <button class="asp-btn" onclick="aspLoadBatches('${svc.id}',${clientId})">📁 السجلات السابقة</button>
        ${svc.hasGenerate ? `<button class="asp-btn asp-btn-pri" onclick="aspGenerateSnapshot('${svc.id}',${clientId})">⚡ توليد التقرير</button>` : ''}
      </div>
    </div>
    <div class="asp-ws-body">
      <div id="asp-service-body">
        <div style="border:2px dashed var(--border,#e5e7eb);border-radius:10px;padding:40px;text-align:center;color:#9ca3af">
          <div style="font-size:2.5rem;margin-bottom:10px">📂</div>
          <div style="font-size:.95rem">ارفع ملف Excel أو افتح السجلات السابقة</div>
        </div>
      </div>
    </div>`;
}

// ── Composite Workspace (القوائم المالية) ────────────────────────────────────
function _aspRenderComposite(svc, clientId, ws) {
  const imports = (svc.inputTypes||[]).map(it => `
    <button class="asp-btn" onclick="aspShowImport('${svc.id}','${it.id}','${_h(it.label)}',${clientId})">
      📤 ${_h(it.label)}
    </button>`).join('');

  ws.innerHTML = `
    <div class="asp-ws-hd">
      <h3 class="asp-ws-title">${svc.icon} ${_h(svc.label)}</h3>
      <div style="font-size:.83rem;color:#6b7280;margin-bottom:10px;padding-bottom:4px">
        استورد بيانات الفترة المالية، ثم اضغط "توليد القوائم" لإنتاج جميع التقارير تلقائياً.
      </div>
      <div class="asp-actions">
        ${imports}
        <button class="asp-btn" onclick="aspLoadBatches('${svc.id}',${clientId})">📁 السجلات</button>
        <button class="asp-btn asp-btn-pri" onclick="aspGenerateSnapshot('${svc.id}',${clientId})">⚡ توليد القوائم المالية</button>
      </div>
    </div>
    <div class="asp-ws-body">
      <div id="asp-service-body">
        <div style="border:2px dashed var(--border,#e5e7eb);border-radius:10px;padding:36px;text-align:center;color:#9ca3af">
          <div style="font-size:2.5rem;margin-bottom:10px">📋</div>
          <div style="font-weight:600;color:var(--text,#374151);margin-bottom:6px">ابدأ باستيراد البيانات</div>
          <div style="font-size:.88rem">استورد المبيعات والمشتريات والمصروفات، ثم اضغط توليد القوائم المالية</div>
        </div>
      </div>
    </div>`;
}

// ── ADL Report Workspace ───────────────────────────────────────────────────────
async function _aspLoadReport(serviceId, clientId, ws) {
  const svc = _aspSvc[serviceId];
  ws.innerHTML = `
    <div class="asp-ws-hd">
      <h3 class="asp-ws-title">${svc.icon} ${_h(svc.label)}</h3>
      <div class="asp-actions">
        <button class="asp-btn" onclick="aspOpenService('${serviceId}',${clientId})">🔄 تحديث</button>
        <button class="asp-btn" onclick="aspOpenService('financial_statements',${clientId})">📋 القوائم المالية</button>
      </div>
    </div>
    <div class="asp-ws-body" id="asp-report-body">
      <div style="text-align:center;padding:24px;color:#6b7280">⏳ جاري التحميل...</div>
    </div>`;

  const body = document.getElementById('asp-report-body');
  try {
    const snaps = await api('GET', `/api/accounting/${clientId}/asp/snapshots?service_id=financial_statements`);
    const list  = snaps?.snapshots || snaps?.items || [];

    if (!list.length) {
      body.innerHTML = `
        <div style="text-align:center;padding:48px;border:2px dashed var(--border,#e5e7eb);border-radius:10px">
          <div style="font-size:2.5rem;margin-bottom:12px">📊</div>
          <div style="font-weight:600;margin-bottom:8px">لا توجد بيانات مالية بعد</div>
          <div style="color:#6b7280;font-size:.9rem;margin-bottom:18px">
            استورد بيانات الفترة من <strong>القوائم المالية</strong> ثم اضغط "توليد القوائم المالية"
          </div>
          <button class="asp-btn asp-btn-pri" onclick="aspOpenService('financial_statements',${clientId})">
            ← الانتقال للقوائم المالية
          </button>
        </div>`;
      return;
    }

    const snap = await api('GET', `/api/accounting/${clientId}/asp/snapshots/${list[0].id}`);
    const d    = snap?.data || snap;

    if (serviceId === 'income_statement') body.innerHTML = _aspIncomeStatement(d);
    else if (serviceId === 'trial_balance') body.innerHTML = _aspTrialBalance(d);
    else if (serviceId === 'general_ledger') body.innerHTML = _aspGeneralLedger(d, clientId);
    else body.innerHTML = '<div style="color:#9ca3af;padding:24px">التقرير غير متاح</div>';
  } catch(e) {
    body.innerHTML = `<div style="color:#dc2626;padding:16px;background:#fef2f2;border-radius:8px">❌ ${e.message||e}</div>`;
  }
}

// ── Import Panel ───────────────────────────────────────────────────────────────
function aspShowImport(serviceId, inputTypeId, inputTypeLabel, clientId) {
  const body = document.getElementById('asp-service-body');
  if (!body) return;
  body.innerHTML = `
    <div style="border:2px dashed #93c5fd;border-radius:10px;padding:32px;text-align:center;max-width:480px;margin:0 auto;background:#f0f9ff">
      <div style="font-size:2.5rem;margin-bottom:12px">📤</div>
      <div style="font-weight:600;font-size:1.05rem;margin-bottom:6px">استيراد ${_h(inputTypeLabel)}</div>
      <div style="color:#6b7280;font-size:.87rem;margin-bottom:20px">رفع ملف Excel — يتم التحليل والاستيراد تلقائياً بدون أي خطوات إضافية</div>
      <label style="display:inline-block;padding:10px 26px;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:.95rem">
        اختر ملف Excel
        <input type="file" accept=".xlsx,.xls" style="display:none"
          onchange="aspHandleFileUpload(this,'${serviceId}','${inputTypeId}',${clientId})">
      </label>
    </div>
    <div id="asp-import-status" style="margin-top:20px"></div>`;
}

async function aspHandleFileUpload(input, serviceId, inputTypeId, clientId) {
  const file = input.files && input.files[0];
  if (!file) return;
  const st = document.getElementById('asp-import-status');
  if (st) st.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">⏳ جاري التحليل والاستيراد...</div>';
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('service_id', serviceId);
    fd.append('input_type', inputTypeId);
    const token = localStorage.getItem('ms_token');
    const resp  = await fetch(API + `/api/accounting/${clientId}/asp/import`, {
      method:'POST', headers:{'Authorization':`Bearer ${token}`}, body:fd,
    });
    if (!resp.ok) { const e = await resp.json().catch(()=>({detail:'فشل'})); throw new Error(e.detail||`HTTP ${resp.status}`); }
    const result = await resp.json();
    if (st) st.innerHTML = _aspImportReport(result.report);
  } catch(e) {
    if (st) st.innerHTML = `<div style="color:#dc2626;padding:16px;background:#fef2f2;border-radius:8px;text-align:center">❌ فشل الاستيراد: ${_h(e.message||String(e))}</div>`;
  }
}

function _aspImportReport(r) {
  if (!r) return '';
  const t = r.totals || {};
  const skipped = (r.skipped_details||[]).map(d =>
    `<tr><td style="padding:4px 8px">${d.row||''}</td><td style="padding:4px 8px;color:#6b7280">${_h(d.reason||'')}</td></tr>`
  ).join('');
  return `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:20px">
      <div style="font-weight:700;color:#166534;margin-bottom:14px;font-size:1rem">✅ تم الاستيراد بنجاح</div>
      <div class="asp-grid">
        ${_kpi('إجمالي الصفوف', r.total_rows||0)}
        ${_kpi('تم استيرادها', r.imported_rows||0, '#16a34a')}
        ${_kpi('صفوف متخطاة', r.skipped_rows||0, r.skipped_rows?'#dc2626':null)}
        ${_kpi('إجمالي المبيعات', _fmt(t.sales||0))}
        ${_kpi('ضريبة القيمة المضافة', _fmt(t.vat||0))}
        ${_kpi('صافي', _fmt(t.net||0))}
        ${_kpi('وقت التنفيذ', (r.execution_ms||0)+'ms')}
      </div>
      ${skipped ? `
        <details style="margin-top:8px">
          <summary style="cursor:pointer;color:#6b7280;font-size:.85rem">الصفوف المتخطاة (${r.skipped_rows})</summary>
          <table style="width:100%;margin-top:8px;font-size:.82rem">
            <thead><tr>
              <th style="text-align:right;padding:4px 8px">صف</th>
              <th style="text-align:right;padding:4px 8px">السبب</th>
            </tr></thead>
            <tbody>${skipped}</tbody>
          </table>
        </details>` : ''}
    </div>`;
}

// ── Batch Management ───────────────────────────────────────────────────────────
async function aspLoadBatches(serviceId, clientId) {
  const body = document.getElementById('asp-service-body');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">⏳ تحميل السجلات...</div>';
  try {
    const data    = await api('GET', `/api/accounting/${clientId}/asp/batches?service_id=${serviceId}`);
    const batches = data?.batches || data?.items || [];
    if (!batches.length) {
      body.innerHTML = '<div style="color:#9ca3af;text-align:center;padding:32px">لا توجد سجلات سابقة</div>';
      return;
    }
    const rows = batches.map(b => `
      <tr>
        <td style="padding:8px 10px;font-size:.85rem">${(b.imported_at||'').substring(0,10)}</td>
        <td style="padding:8px 10px;font-size:.85rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_h(b.filename||'')}">${_h(b.filename||'-')}</td>
        <td style="padding:8px 10px;font-size:.85rem;text-align:center">${b.input_type||b.section_type||'-'}</td>
        <td style="padding:8px 10px;font-size:.85rem;text-align:center">${b.tx_count||0}</td>
        <td style="padding:8px 10px;font-family:monospace;font-size:.82rem;text-align:left">${_fmt(b.total_sales||0)}</td>
        <td style="padding:8px 10px;text-align:center;white-space:nowrap">
          <button class="asp-btn" style="padding:4px 10px;font-size:.8rem" onclick="aspViewBatchReport(${b.id},${clientId})">📋 تقرير</button>
          <button class="asp-btn asp-btn-red" style="padding:4px 10px;font-size:.8rem" onclick="aspDeleteBatch(${b.id},'${serviceId}',${clientId})">🗑️</button>
        </td>
      </tr>`).join('');
    body.innerHTML = `
      <div style="overflow-x:auto">
        <table class="asp-tbl" style="border:1px solid var(--border,#e5e7eb);border-radius:8px;overflow:hidden">
          <thead><tr>
            <th>التاريخ</th><th>الملف</th><th style="text-align:center">النوع</th>
            <th style="text-align:center">الصفوف</th><th style="text-align:left">إجمالي المبيعات</th>
            <th style="text-align:center">إجراءات</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch(e) {
    body.innerHTML = `<div style="color:#dc2626;padding:16px;background:#fef2f2;border-radius:8px">❌ ${_h(e.message||String(e))}</div>`;
  }
}

async function aspViewBatchReport(batchId, clientId) {
  const body = document.getElementById('asp-service-body');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">⏳ تحميل التقرير...</div>';
  try {
    const data = await api('GET', `/api/accounting/${clientId}/asp/batches/${batchId}/report`);
    body.innerHTML = _aspImportReport(data?.report || data);
  } catch(e) {
    body.innerHTML = `<div style="color:#dc2626;padding:16px">❌ ${_h(e.message||String(e))}</div>`;
  }
}

async function aspDeleteBatch(batchId, serviceId, clientId) {
  if (!await confirmDlg('حذف هذا الاستيراد نهائياً؟ سيتم حذف جميع المعاملات المرتبطة به.', 'تأكيد الحذف', true)) return;
  try {
    await api('DELETE', `/api/accounting/${clientId}/import/batches/${batchId}`);
    await aspLoadBatches(serviceId, clientId);
  } catch(e) { alert('❌ فشل الحذف: ' + (e.message||e)); }
}

// ── Generate Snapshot ──────────────────────────────────────────────────────────
async function aspGenerateSnapshot(serviceId, clientId) {
  const body = document.getElementById('asp-service-body');
  if (body) body.innerHTML = '<div style="text-align:center;padding:28px;color:#6b7280">⏳ جاري حساب البيانات وتوليد التقرير...</div>';
  try {
    let snapData = {};

    if (serviceId === 'vat_return') {
      // Use ADL for accurate VAT data
      const adl = await api('GET', `/api/accounting/${clientId}/adl/vat-data?service_id=vat_return`);
      snapData = {
        total_sales:     adl?.sales?.total    || 0,
        total_purchases: adl?.purchases?.total || 0,
        vat_sales:       adl?.sales?.vat      || 0,
        vat_purchases:   adl?.purchases?.vat  || 0,
        net_vat:         adl?.net_vat         || 0,
        sales_net:       adl?.sales?.net      || 0,
        purchases_net:   adl?.purchases?.net  || 0,
      };
    } else {
      // Aggregate from batch totals for all other services
      const resp    = await api('GET', `/api/accounting/${clientId}/asp/batches?service_id=${serviceId}`);
      const batches = resp?.batches || resp?.items || [];
      snapData = batches.reduce((acc, b) => ({
        total_sales:     (acc.total_sales||0)     + (b.total_sales||0),
        total_purchases: (acc.total_purchases||0) + (b.total_purchases||0),
        total_expenses:  (acc.total_expenses||0)  + (b.total_expenses||0),
        total_salary:    (acc.total_salary||0)    + (b.total_salary||0),
        total_vat:       (acc.total_vat||0)       + (b.total_vat||0),
        total_net:       (acc.total_net||0)        + (b.total_net||0),
      }), {});
    }

    // Persist snapshot
    await api('POST', `/api/accounting/${clientId}/asp/snapshots`, {
      service_id: serviceId,
      data:       snapData,
      label:      `${serviceId} — ${new Date().toLocaleDateString('ar-EG')}`,
    });

    // Render output
    if (body) {
      if (serviceId === 'vat_return')           body.innerHTML = _aspVatSummary(snapData);
      else if (serviceId === 'financial_statements') body.innerHTML = _aspFinancialStatements(snapData);
      else                                          body.innerHTML = _aspGenericReport(snapData, serviceId);
    }
  } catch(e) {
    if (body) body.innerHTML = `<div style="color:#dc2626;padding:16px;background:#fef2f2;border-radius:8px;text-align:center">❌ فشل توليد التقرير: ${_h(e.message||String(e))}</div>`;
  }
}

// ── Report Renderers ───────────────────────────────────────────────────────────
function _aspVatSummary(d) {
  const sales   = d.total_sales||0, vatOut = d.vat_sales||0, salesNet = d.sales_net||0;
  const purch   = d.total_purchases||0, vatIn = d.vat_purchases||0;
  const vatDue  = (vatOut - vatIn);
  return `
    <div style="max-width:620px">
      <div class="asp-card">
        <div class="asp-card-hd" style="background:#eff6ff;color:#1e40af">🧾 ملخص إقرار ضريبة القيمة المضافة</div>
        <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div style="background:#f8fafc;border-radius:8px;padding:14px">
            <div style="font-size:.78rem;color:#6b7280;margin-bottom:6px">📤 المبيعات</div>
            <div style="font-size:1.1rem;font-weight:700">${_fmt(sales)}</div>
            <div style="font-size:.8rem;color:#6b7280;margin-top:4px">ضريبة: ${_fmt(vatOut)} | صافي: ${_fmt(salesNet)}</div>
          </div>
          <div style="background:#f8fafc;border-radius:8px;padding:14px">
            <div style="font-size:.78rem;color:#6b7280;margin-bottom:6px">📥 المشتريات</div>
            <div style="font-size:1.1rem;font-weight:700">${_fmt(purch)}</div>
            <div style="font-size:.8rem;color:#6b7280;margin-top:4px">ضريبة: ${_fmt(vatIn)}</div>
          </div>
        </div>
        <div style="margin:0 16px 16px;background:${vatDue>=0?'#fef3c7':'#f0fdf4'};border-radius:8px;padding:16px;text-align:center;border:1px solid ${vatDue>=0?'#fcd34d':'#86efac'}">
          <div style="font-size:.83rem;color:#6b7280;margin-bottom:5px">${vatDue>=0?'الضريبة المستحقة السداد':'رصيد ضريبي دائن'}</div>
          <div style="font-size:1.9rem;font-weight:700;color:${vatDue>=0?'#92400e':'#166534'}">${_fmt(Math.abs(vatDue))}</div>
          <div style="font-size:.78rem;color:#9ca3af;margin-top:5px">تم التوليد: ${new Date().toLocaleDateString('ar-EG')}</div>
        </div>
      </div>
    </div>`;
}

function _aspFinancialStatements(d) {
  const sales   = d.total_sales||0, purch = d.total_purchases||0;
  const exp     = d.total_expenses||0, sal  = d.total_salary||0;
  const gross   = sales - purch;
  const totalEx = exp + sal;
  const net     = gross - totalEx;
  const vat     = d.total_vat||0;

  const tRow = (l,v,bold,indent,color) => `
    <tr style="${bold?'font-weight:700;background:#f8fafc;border-top:1px solid #e5e7eb':''}">
      <td style="padding:7px 12px;${indent?'padding-right:26px;color:#6b7280':''}">${l}</td>
      <td style="padding:7px 12px;text-align:left;font-family:monospace;${color||''}">${_fmt(v)}</td>
    </tr>`;

  const tbRow = (n,dr,cr) => `
    <tr style="border-bottom:1px solid var(--border,#f3f4f6)">
      <td style="padding:7px 10px">${n}</td>
      <td style="padding:7px 10px;text-align:left;font-family:monospace">${dr?_fmt(dr):'-'}</td>
      <td style="padding:7px 10px;text-align:left;font-family:monospace">${cr?_fmt(cr):'-'}</td>
    </tr>`;

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px">

      <div class="asp-card">
        <div class="asp-card-hd" style="background:#eff6ff;color:#1e40af">📈 قائمة الدخل</div>
        <table class="asp-tbl">
          <tbody>
            ${tRow('إيرادات المبيعات', sales)}
            ${tRow('تكلفة المشتريات', purch, false, true)}
            ${tRow('مجمل الربح', gross, true, false, gross<0?'color:#dc2626':'')}
            ${tRow('المصروفات التشغيلية', exp, false, true)}
            ${tRow('الرواتب والمرتبات', sal, false, true)}
            ${tRow('إجمالي المصروفات', totalEx, true)}
            ${tRow('صافي الربح / الخسارة', net, true, false, net<0?'color:#dc2626':'color:#16a34a')}
          </tbody>
        </table>
      </div>

      <div class="asp-card">
        <div class="asp-card-hd" style="background:#f0fdf4;color:#166534">⚖️ ميزان المراجعة</div>
        <table class="asp-tbl">
          <thead><tr>
            <th>الحساب</th>
            <th style="text-align:left">مدين</th>
            <th style="text-align:left">دائن</th>
          </tr></thead>
          <tbody>
            ${tbRow('المبيعات',    0,       sales)}
            ${tbRow('المشتريات',  purch,   0)}
            ${tbRow('المصروفات',  exp,     0)}
            ${tbRow('الرواتب',    sal,     0)}
            ${tbRow('ض.ق.م',      vat,     0)}
            <tr style="font-weight:700;border-top:2px solid #e5e7eb;background:#f8fafc">
              <td style="padding:8px 10px">الإجمالي</td>
              <td style="padding:8px 10px;text-align:left;font-family:monospace">${_fmt(purch+exp+sal+vat)}</td>
              <td style="padding:8px 10px;text-align:left;font-family:monospace">${_fmt(sales)}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
    <div style="margin-top:10px;font-size:.78rem;color:#9ca3af;text-align:center">
      تم التوليد في ${new Date().toLocaleDateString('ar-EG')} — مبني على بيانات الفترة المستوردة
    </div>`;
}

function _aspGenericReport(d, serviceId) {
  const svc = _aspSvc[serviceId] || {};
  const entries = Object.entries(d).filter(([k]) => !['id','service_id','client_id'].includes(k));
  return `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:20px;max-width:600px">
      <div style="font-weight:700;color:#166534;margin-bottom:14px">✅ تم توليد تقرير ${_h(svc.label||serviceId)}</div>
      <div class="asp-grid">
        ${entries.map(([k,v]) => _kpi(k, typeof v==='number'?_fmt(v):String(v))).join('')}
      </div>
    </div>`;
}

// ── Report renderers for sidebar report services ───────────────────────────────
function _aspIncomeStatement(d) {
  if (!d || !Object.keys(d).length)
    return '<div style="color:#9ca3af;padding:24px;text-align:center">لا توجد بيانات كافية</div>';
  const sales = d.total_sales||0, purch = d.total_purchases||0;
  const exp   = d.total_expenses||0, sal  = d.total_salary||0;
  const gross = sales - purch, net = gross - (exp+sal);
  const row = (l,v,b,color) => `
    <tr style="${b?'font-weight:700;background:#f8fafc;border-top:1px solid #e5e7eb':''}">
      <td style="padding:8px 12px">${l}</td>
      <td style="padding:8px 12px;text-align:left;font-family:monospace;${color||''}">${_fmt(v)}</td>
    </tr>`;
  return `<div style="max-width:500px"><table class="asp-tbl" style="border:1px solid var(--border,#e5e7eb);border-radius:8px;overflow:hidden">
    <tbody>
      ${row('إيرادات المبيعات',sales)}${row('تكلفة المشتريات',purch)}
      ${row('مجمل الربح',gross,true,gross<0?'color:#dc2626':'')}
      ${row('المصروفات التشغيلية',exp)}${row('الرواتب',sal)}
      ${row('صافي الربح',net,true,net<0?'color:#dc2626':'color:#16a34a')}
    </tbody>
  </table></div>`;
}

function _aspTrialBalance(d) {
  if (!d || !Object.keys(d).length)
    return '<div style="color:#9ca3af;padding:24px;text-align:center">لا توجد بيانات</div>';
  const s   = { sales:d.total_sales||0, purch:d.total_purchases||0, exp:d.total_expenses||0, sal:d.total_salary||0, vat:d.total_vat||0 };
  const acc = [
    {n:'المبيعات',dr:0,cr:s.sales},{n:'المشتريات',dr:s.purch,cr:0},
    {n:'المصروفات',dr:s.exp,cr:0},{n:'الرواتب',dr:s.sal,cr:0},{n:'ض.ق.م',dr:s.vat,cr:0},
  ].filter(a=>a.dr||a.cr);
  const td = acc.reduce((t,a)=>t+a.dr,0), tc = acc.reduce((t,a)=>t+a.cr,0);
  const rows = acc.map(a=>`<tr style="border-bottom:1px solid var(--border,#f3f4f6)">
    <td style="padding:8px 10px">${a.n}</td>
    <td style="padding:8px 10px;text-align:left;font-family:monospace">${a.dr?_fmt(a.dr):'-'}</td>
    <td style="padding:8px 10px;text-align:left;font-family:monospace">${a.cr?_fmt(a.cr):'-'}</td>
  </tr>`).join('');
  return `<div style="max-width:600px"><table class="asp-tbl" style="border:1px solid var(--border,#e5e7eb);border-radius:8px;overflow:hidden">
    <thead><tr><th>الحساب</th><th style="text-align:left">مدين</th><th style="text-align:left">دائن</th></tr></thead>
    <tbody>${rows}
      <tr style="font-weight:700;background:#f8fafc;border-top:2px solid #e5e7eb">
        <td style="padding:8px 10px">الإجمالي</td>
        <td style="padding:8px 10px;text-align:left;font-family:monospace">${_fmt(td)}</td>
        <td style="padding:8px 10px;text-align:left;font-family:monospace">${_fmt(tc)}</td>
      </tr>
    </tbody>
  </table></div>`;
}

function _aspGeneralLedger(d, clientId) {
  if (!d || !Object.keys(d).length)
    return '<div style="color:#9ca3af;padding:24px;text-align:center">لا توجد قيود. استورد البيانات أولاً.</div>';
  const s = d.total_sales||0, p = d.total_purchases||0, e = d.total_expenses||0, sal = d.total_salary||0;
  const entries = [
    {date:'-',partner:'إجمالي المبيعات',type:'مبيعات',amount:s},
    {date:'-',partner:'إجمالي المشتريات',type:'مشتريات',amount:p},
    {date:'-',partner:'إجمالي المصروفات',type:'مصروفات',amount:e},
    {date:'-',partner:'الرواتب والمرتبات',type:'مرتبات',amount:sal},
  ].filter(r=>r.amount);
  const rows = entries.map(r=>`
    <tr style="border-bottom:1px solid var(--border,#f3f4f6)">
      <td style="padding:8px 10px;font-size:.85rem">${r.date}</td>
      <td style="padding:8px 10px;font-size:.85rem">${r.partner}</td>
      <td style="padding:8px 10px;font-size:.85rem">${r.type}</td>
      <td style="padding:8px 10px;text-align:left;font-family:monospace;font-size:.85rem">${_fmt(r.amount)}</td>
    </tr>`).join('');
  return `
    <div style="margin-bottom:10px;font-size:.83rem;color:#6b7280">يعرض ملخص القيود من آخر Snapshot. لعرض تفاصيل أكثر، راجع خدمة القوائم المالية.</div>
    <table class="asp-tbl" style="border:1px solid var(--border,#e5e7eb);border-radius:8px;overflow:hidden;max-width:700px">
      <thead><tr><th>التاريخ</th><th>البيان</th><th>النوع</th><th style="text-align:left">المبلغ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Window Exports ─────────────────────────────────────────────────────────────
window.loadAccountingPlatform = loadAccountingPlatform;
window.aspSwitchClient        = aspSwitchClient;
window.aspOpenService         = aspOpenService;
window.aspShowImport          = aspShowImport;
window.aspHandleFileUpload    = aspHandleFileUpload;
window.aspLoadBatches         = aspLoadBatches;
window.aspViewBatchReport     = aspViewBatchReport;
window.aspDeleteBatch         = aspDeleteBatch;
window.aspGenerateSnapshot    = aspGenerateSnapshot;
