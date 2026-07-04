// ═══════════════════════════════════════════════════════════════════════════════
// 12-accounting-platform.js — Accounting Services Platform (ASP)
// Plugin-based, Stateless Services, Universal Import, ADL Query Layer
// ═══════════════════════════════════════════════════════════════════════════════

// ── Service Registry ───────────────────────────────────────────────────────────

const _aspServices = {};

function aspRegisterService(def) {
  if (!def.id || !def.label) return;
  _aspServices[def.id] = def;
}

// ── Built-in Services ──────────────────────────────────────────────────────────

aspRegisterService({
  id: 'vat_return',
  label: 'إقرار ضريبة القيمة المضافة',
  icon: '🧾',
  inputTypes: [
    { id: 'sales',     label: 'مبيعات',   section: 'sale'     },
    { id: 'purchases', label: 'مشتريات',  section: 'purchase' },
  ],
  renderOutput: aspRenderVatOutput,
});

aspRegisterService({
  id: 'payroll',
  label: 'رواتب وأجور',
  icon: '👥',
  inputTypes: [
    { id: 'salary', label: 'كشف الرواتب', section: 'salary' },
  ],
  renderOutput: null,
});

aspRegisterService({
  id: 'fixed_assets',
  label: 'الأصول الثابتة',
  icon: '🏗️',
  inputTypes: [
    { id: 'asset', label: 'الأصول', section: 'asset' },
  ],
  renderOutput: null,
});

// ── Platform Shell ─────────────────────────────────────────────────────────────

function renderAccountingPlatform(clientId) {
  const services = Object.values(_aspServices);
  const tiles = services.map(s => `
    <div class="asp-tile" onclick="aspOpenService('${s.id}', ${clientId})" style="cursor:pointer;background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:24px;text-align:center;transition:box-shadow .2s">
      <div style="font-size:2rem;margin-bottom:8px">${s.icon || '📋'}</div>
      <div style="font-weight:600;color:var(--text,#111)">${s.label}</div>
    </div>
  `).join('');

  return `
    <div id="asp-shell" style="padding:24px;max-width:1100px;margin:0 auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
        <h2 style="margin:0;font-size:1.4rem;font-weight:700">🏛️ مركز الخدمات المحاسبية</h2>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:32px">
        ${tiles}
      </div>
      <div id="asp-workspace"></div>
    </div>
  `;
}

// ── Service Workspace ──────────────────────────────────────────────────────────

let _aspActiveClientId = null;
let _aspActiveServiceId = null;

async function aspOpenService(serviceId, clientId) {
  _aspActiveClientId = clientId;
  _aspActiveServiceId = serviceId;
  const svc = _aspServices[serviceId];
  if (!svc) return;

  const ws = document.getElementById('asp-workspace');
  if (!ws) return;

  ws.innerHTML = `
    <div style="background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:24px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <span style="font-size:1.5rem">${svc.icon || '📋'}</span>
        <h3 style="margin:0;font-weight:700">${svc.label}</h3>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
        ${(svc.inputTypes || []).map(it => `
          <button onclick="aspShowImport('${serviceId}','${it.id}','${it.label}',${clientId})"
            style="padding:10px 18px;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--card-bg,#fff);cursor:pointer;font-size:.95rem;font-weight:500">
            📤 استيراد ${it.label}
          </button>
        `).join('')}
        <button onclick="aspLoadBatches('${serviceId}',${clientId})"
          style="padding:10px 18px;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--card-bg,#fff);cursor:pointer;font-size:.95rem">
          📁 السجلات السابقة
        </button>
        ${svc.renderOutput ? `
          <button onclick="aspGenerateSnapshot('${serviceId}',${clientId})"
            style="padding:10px 18px;border-radius:8px;background:#2563eb;color:#fff;border:none;cursor:pointer;font-size:.95rem;font-weight:600">
            ⚡ توليد التقرير
          </button>
        ` : ''}
      </div>
      <div id="asp-service-body"></div>
    </div>
  `;
}

// ── Universal Import UI ────────────────────────────────────────────────────────

function aspShowImport(serviceId, inputTypeId, inputTypeLabel, clientId) {
  const body = document.getElementById('asp-service-body');
  if (!body) return;

  body.innerHTML = `
    <div style="border:2px dashed var(--border,#e5e7eb);border-radius:10px;padding:32px;text-align:center">
      <div style="font-size:2.5rem;margin-bottom:12px">📤</div>
      <div style="font-weight:600;font-size:1.1rem;margin-bottom:6px">استيراد ${inputTypeLabel}</div>
      <div style="color:#6b7280;font-size:.9rem;margin-bottom:20px">رفع ملف Excel — يتم الاستيراد تلقائياً بدون خطوات إضافية</div>
      <label style="display:inline-block;padding:10px 24px;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;font-weight:600">
        اختر ملف Excel
        <input type="file" accept=".xlsx,.xls" style="display:none"
          onchange="aspHandleFileUpload(this,'${serviceId}','${inputTypeId}',${clientId})">
      </label>
    </div>
    <div id="asp-import-status" style="margin-top:16px"></div>
  `;
}

async function aspHandleFileUpload(input, serviceId, inputTypeId, clientId) {
  const file = input.files && input.files[0];
  if (!file) return;

  const statusEl = document.getElementById('asp-import-status');
  if (statusEl) statusEl.innerHTML = '<div style="text-align:center;padding:16px;color:#6b7280">⏳ جاري الاستيراد...</div>';

  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('service_id', serviceId);
    fd.append('input_type', inputTypeId);

    const token = localStorage.getItem('ms_token');
    const resp = await fetch(API + `/api/accounting/${clientId}/asp/import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: fd,
    });
    if (!resp.ok) { const e = await resp.json().catch(()=>({detail:'فشل'})); throw new Error(e.detail || `HTTP ${resp.status}`); }
    const result = await resp.json();

    if (statusEl) statusEl.innerHTML = aspRenderImportReport(result.report);
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<div style="color:#dc2626;padding:16px">❌ فشل الاستيراد: ${e.message || e}</div>`;
  }
}

function aspRenderImportReport(report) {
  if (!report) return '';
  const skipped = report.skipped_rows || 0;
  const imported = report.imported_rows || 0;
  const totals = report.totals || {};
  const ms = report.execution_ms || 0;

  const skippedRows = (report.skipped_details || []).slice(0, 10).map(s =>
    `<tr><td style="padding:4px 8px;color:#6b7280">${s.row || '—'}</td><td style="padding:4px 8px;color:#6b7280">${s.reason || '—'}</td></tr>`
  ).join('');

  return `
    <div style="background:var(--card-bg,#fff);border:1px solid #d1fae5;border-radius:10px;padding:20px">
      <div style="font-weight:700;font-size:1.05rem;margin-bottom:12px;color:#065f46">✅ تم الاستيراد بنجاح</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:16px">
        ${_aspStat('✅ مُستورد', imported, '#065f46')}
        ${_aspStat('⏭️ محذوف', skipped, skipped > 0 ? '#b45309' : '#6b7280')}
        ${totals.sales    ? _aspStat('مبيعات', totals.sales,    '#1d4ed8') : ''}
        ${totals.purchases? _aspStat('مشتريات', totals.purchases,'#7c3aed') : ''}
        ${totals.vat      ? _aspStat('ضريبة', totals.vat,       '#0369a1') : ''}
        ${_aspStat('⏱️ وقت', ms + 'ms', '#6b7280')}
      </div>
      ${skipped > 0 ? `
        <div style="margin-top:10px">
          <div style="font-weight:600;font-size:.9rem;margin-bottom:6px;color:#b45309">الصفوف المحذوفة:</div>
          <table style="width:100%;font-size:.85rem;border-collapse:collapse">
            <thead><tr>
              <th style="text-align:right;padding:4px 8px;color:#6b7280">رقم</th>
              <th style="text-align:right;padding:4px 8px;color:#6b7280">السبب</th>
            </tr></thead>
            <tbody>${skippedRows}</tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `;
}

function _aspStat(label, value, color) {
  const formatted = typeof value === 'number' && !String(value).includes('ms')
    ? value.toLocaleString('ar-EG', { maximumFractionDigits: 2 })
    : value;
  return `
    <div style="background:#f9fafb;border-radius:8px;padding:10px;text-align:center">
      <div style="font-size:.8rem;color:#6b7280;margin-bottom:2px">${label}</div>
      <div style="font-weight:700;color:${color}">${formatted}</div>
    </div>
  `;
}

// ── Batch Manager ──────────────────────────────────────────────────────────────

async function aspLoadBatches(serviceId, clientId) {
  const body = document.getElementById('asp-service-body');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">⏳ تحميل السجلات...</div>';

  try {
    const res = await api('GET', `/api/accounting/${clientId}/asp/batches?service_id=${serviceId}`);
    const batches = res.batches || [];

    if (!batches.length) {
      body.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">لا توجد سجلات سابقة</div>';
      return;
    }

    const rows = batches.map(b => `
      <tr style="border-bottom:1px solid var(--border,#f3f4f6)">
        <td style="padding:10px 8px">${b.filename || '—'}</td>
        <td style="padding:10px 8px;color:#6b7280">${b.imported_by || '—'}</td>
        <td style="padding:10px 8px;color:#6b7280">${b.imported_at ? b.imported_at.slice(0,16).replace('T',' ') : '—'}</td>
        <td style="padding:10px 8px;text-align:center">${b.tx_count || 0}</td>
        <td style="padding:10px 8px;text-align:left;color:#1d4ed8">${(b.total_vat||0).toLocaleString('ar-EG',{maximumFractionDigits:2})}</td>
        <td style="padding:10px 8px">
          <button onclick="aspViewBatchReport(${b.id},${clientId})"
            style="padding:4px 10px;border-radius:6px;border:1px solid var(--border,#e5e7eb);background:var(--card-bg,#fff);cursor:pointer;font-size:.82rem">
            📋 تقرير
          </button>
          <button onclick="aspDeleteBatch(${b.id},${clientId},'${serviceId}')"
            style="padding:4px 10px;border-radius:6px;border:1px solid #fca5a5;color:#dc2626;background:#fff;cursor:pointer;font-size:.82rem;margin-right:4px">
            🗑️
          </button>
        </td>
      </tr>
    `).join('');

    body.innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:.9rem">
          <thead>
            <tr style="background:#f9fafb;font-weight:600">
              <th style="padding:10px 8px;text-align:right">الملف</th>
              <th style="padding:10px 8px;text-align:right">المستورِد</th>
              <th style="padding:10px 8px;text-align:right">التاريخ</th>
              <th style="padding:10px 8px;text-align:center">عدد القيود</th>
              <th style="padding:10px 8px;text-align:left">إجمالي الضريبة</th>
              <th style="padding:10px 8px;text-align:right">إجراءات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch (e) {
    body.innerHTML = `<div style="color:#dc2626;padding:16px">خطأ: ${e.message || e}</div>`;
  }
}

async function aspViewBatchReport(batchId, clientId) {
  try {
    const res = await api('GET', `/api/accounting/${clientId}/asp/batches/${batchId}/report`);
    const body = document.getElementById('asp-service-body');
    if (body && res.report) {
      body.innerHTML = `
        <button onclick="aspLoadBatches('${_aspActiveServiceId}',${clientId})"
          style="margin-bottom:12px;padding:6px 14px;border-radius:6px;border:1px solid var(--border,#e5e7eb);background:var(--card-bg,#fff);cursor:pointer">
          ← رجوع
        </button>
        ${aspRenderImportReport(res.report)}
      `;
    }
  } catch (e) {
    alert('فشل تحميل التقرير: ' + (e.message || e));
  }
}

async function aspDeleteBatch(batchId, clientId, serviceId) {
  if (!confirm('هل تريد حذف هذا الاستيراد وجميع قيوده؟')) return;
  try {
    await api('DELETE', `/api/accounting/${clientId}/import/batches/${batchId}`);
    await aspLoadBatches(serviceId, clientId);
  } catch (e) {
    alert('فشل الحذف: ' + (e.message || e));
  }
}

// ── VAT Service Output (Consumer only — reads ADL) ─────────────────────────────

async function aspGenerateSnapshot(serviceId, clientId) {
  const svc = _aspServices[serviceId];
  if (!svc || !svc.renderOutput) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const body = document.getElementById('asp-service-body');
  if (body) body.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">⏳ جاري توليد التقرير...</div>';

  try {
    const data = await api('GET', `/api/accounting/${clientId}/adl/vat-data?service_id=${serviceId}&year=${year}&month=${month}`);

    const snapshotPayload = {
      service_id: serviceId,
      period: `${year}-${String(month).padStart(2,'0')}`,
      label: `تقرير ${svc.label} — ${month}/${year}`,
      data,
    };
    await api('POST', `/api/accounting/${clientId}/asp/snapshots`, snapshotPayload);

    if (body) body.innerHTML = svc.renderOutput(data, snapshotPayload.label);
  } catch (e) {
    if (body) body.innerHTML = `<div style="color:#dc2626;padding:16px">فشل التوليد: ${e.message || e}</div>`;
  }
}

function aspRenderVatOutput(data, label) {
  if (!data) return '';
  const s = data.sales    || {};
  const p = data.purchases || {};
  const netVat = data.net_vat || 0;
  const color = netVat >= 0 ? '#065f46' : '#991b1b';

  return `
    <div style="background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:10px;padding:24px">
      <div style="font-weight:700;font-size:1.1rem;margin-bottom:20px">${label || 'ملخص الضريبة'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div style="background:#f0fdf4;border-radius:8px;padding:16px">
          <div style="font-weight:600;color:#065f46;margin-bottom:10px">المبيعات</div>
          ${_aspVatLine('عدد الفواتير', s.count)}
          ${_aspVatLine('الإجمالي', s.total, true)}
          ${_aspVatLine('الضريبة المحصلة', s.vat, true)}
        </div>
        <div style="background:#faf5ff;border-radius:8px;padding:16px">
          <div style="font-weight:600;color:#7c3aed;margin-bottom:10px">المشتريات</div>
          ${_aspVatLine('عدد الفواتير', p.count)}
          ${_aspVatLine('الإجمالي', p.total, true)}
          ${_aspVatLine('الضريبة المدفوعة', p.vat, true)}
        </div>
      </div>
      <div style="background:#f9fafb;border-radius:8px;padding:16px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:1rem">صافي الضريبة المستحقة</span>
        <span style="font-weight:800;font-size:1.2rem;color:${color}">
          ${netVat.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ر.س
        </span>
      </div>
    </div>
  `;
}

function _aspVatLine(label, value, isCurrency) {
  const v = isCurrency
    ? (Number(value) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ر.س'
    : (value || 0);
  return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.9rem">
    <span style="color:#6b7280">${label}</span>
    <span style="font-weight:600">${v}</span>
  </div>`;
}

// ── Navigation Entry Point ─────────────────────────────────────────────────────

async function loadAccountingPlatform() {
  setPageContent('<div style="padding:24px;text-align:center;color:#6b7280">⏳ تحميل...</div>');

  let clients = [];
  try { const raw = await api('GET', '/api/clients') || []; clients = Array.isArray(raw) ? raw : (raw.items || []); } catch (e) { clients = []; }

  if (!clients.length) {
    setPageContent('<div style="padding:32px;text-align:center;color:#6b7280">لا يوجد عملاء</div>');
    return;
  }

  const opts = clients.map(c => `<option value="${c.id}">${escH ? escH(c.name) : c.name}</option>`).join('');
  const firstId = clients[0].id;

  setPageContent(`
    <div style="padding:24px 24px 0">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <label style="font-weight:600;color:var(--text,#111)">العميل:</label>
        <select id="asp-client-select" onchange="aspSwitchClient(this.value)"
          style="padding:8px 14px;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--card-bg,#fff);font-size:.95rem">
          ${opts}
        </select>
      </div>
    </div>
    <div id="asp-platform-root"></div>
  `);

  aspSwitchClient(firstId);
}

function aspSwitchClient(clientId) {
  const root = document.getElementById('asp-platform-root');
  if (!root) return;
  root.innerHTML = renderAccountingPlatform(clientId);
}

function renderASPPage(clientId) {
  loadAccountingPlatform();
}

function setPageContent(html) {
  const el = document.getElementById('main') || document.getElementById('content') || document.getElementById('main-content');
  if (el) el.innerHTML = html;
}

// Expose functions called from inline HTML handlers to global scope
window.aspSwitchClient     = aspSwitchClient;
window.aspOpenService      = aspOpenService;
window.aspShowImport       = aspShowImport;
window.aspHandleFileUpload = aspHandleFileUpload;
window.aspLoadBatches      = aspLoadBatches;
window.aspViewBatchReport  = aspViewBatchReport;
window.aspDeleteBatch      = aspDeleteBatch;
window.aspGenerateSnapshot = aspGenerateSnapshot;
window.loadAccountingPlatform = loadAccountingPlatform;
