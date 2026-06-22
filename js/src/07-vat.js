async function loadTax() {
  const main = document.getElementById('main');
  main.className = 'page';
  // Load clients + obligations map for tab filtering
  const [clients, oblData] = await Promise.all([
    getClients().catch(()=>[]),
    api('GET','/api/obligations?page_size=500').catch(()=>({items:[]})),
  ]);
  _tcAllClients = clients;
  _tcOblMap = {};
  (oblData.items||[]).forEach(o => {
    if (!_tcOblMap[o.client_id]) _tcOblMap[o.client_id] = new Set();
    _tcOblMap[o.client_id].add(o.obligation_type);
  });
  _renderTaxShell();
  await _tcLoadTab(_tcTab);
}

function _renderTaxShell() {
  const main = document.getElementById('main');
  const tabs = [
    {id:'dashboard', icon:'📊', label:'لوحة التحكم'},
    {id:'vat',       icon:'🧾', label:'ض.ق.م.'},
    {id:'wht',       icon:'✂️', label:'أسس توحيد المرتبات'},
    {id:'corporate', icon:'🏢', label:'ضريبة الخصم والتحصيل'},
    {id:'salary',    icon:'👤', label:'ضريبة المرتبات'},
    {id:'calendar',  icon:'📅', label:'التقويم الضريبي'},
    {id:'portals',   icon:'🌐', label:'البوابات'},
  ];
  const tabBtn = (t) => `<button id="ttab-${t.id}" onclick="switchTaxTab('${t.id}')"
    style="display:flex;align-items:center;gap:6px;padding:10px 15px;font-size:12.5px;font-weight:700;font-family:inherit;border:none;border-bottom:2.5px solid ${_tcTab===t.id?'#1a2472':'transparent'};background:transparent;cursor:pointer;color:${_tcTab===t.id?'#1a2472':'#64748b'};margin-bottom:-2px;white-space:nowrap;transition:all .15s">
    ${t.icon} ${t.label}</button>`;

  // Map tab → obligation type(s) for filtering
  const TAB_OBL_TYPE = {
    vat: ['vat_monthly'],
    wht: ['withholding_monthly'],
    corporate: ['income_annual','income_quarterly'],
    salary: ['payroll_monthly'],
    calendar: null, // show all
    dashboard: null,
    portals: null,
  };
  const tabOblTypes = TAB_OBL_TYPE[_tcTab] || null;
  // Filter clients: for specific tabs, show only clients with matching obligation
  const clientsForTab = tabOblTypes
    ? (_tcAllClients.length ? _tcAllClients.filter(c => {
        const oblSet = _tcOblMap[c.id];
        return oblSet && tabOblTypes.some(t => oblSet.has(t));
      }) : [])
    : (_tcAllClients.length ? _tcAllClients : []);

  window._tcClientsForTab = clientsForTab; // store for tcFilterClientList
  main.innerHTML = `
  <!-- Client/Period selector bar -->
  <div style="background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:12px 16px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
    <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px">
      <input id="tcClientSearch" class="input" style="font-size:12px;padding:5px 10px" placeholder="🔍 بحث باسم الشركة..." oninput="tcFilterClientList(this.value)"/>
      <select id="tcClientSel" class="input" style="font-size:13px" onchange="tcClientChanged()">
        <option value="">— اختر عميل —</option>
        ${clientsForTab.map(c=>`<option value="${c.id}" ${c.id==_tcClientId?'selected':''}>${escH(c.name||c.trade_name||'')}</option>`).join('')}
      </select>
      ${tabOblTypes?`<div style="font-size:10px;color:#5b8ec4">يعرض فقط العملاء المرتبطين بهذا الالتزام (${clientsForTab.length} عميل)</div>`:''}
    </div>
    <div>
      <select id="tcMonthSel" class="input" style="font-size:13px;width:110px" onchange="tcPeriodChanged()">
        ${TC_MONTH_AR.slice(1).map((m,i)=>`<option value="${i+1}" ${_tcMonth===i+1?'selected':''}>${m}</option>`).join('')}
      </select>
    </div>
    <div>
      <select id="tcYearSel" class="input" style="font-size:13px;width:90px" onchange="tcPeriodChanged()">
        ${[2022,2023,2024,2025,2026].map(y=>`<option value="${y}" ${_tcYear===y?'selected':''}>${y}</option>`).join('')}
      </select>
    </div>
    <div id="tcPeriodStatus" style="font-size:12px;color:#94a3b8"></div>
  </div>
  <!-- Tabs -->
  <div style="display:flex;gap:0;border-bottom:2px solid #e8edf3;margin-bottom:20px;overflow-x:auto">
    ${tabs.map(tabBtn).join('')}
  </div>
  <div id="taxTabContent"></div>`;

  // Client list already populated inline above
}

window.tcClientChanged = function() {
  const sel = document.getElementById('tcClientSel');
  _tcClientId = sel?.value || null;
  _tcClientName = sel?.selectedOptions[0]?.text || '';
  _tcLoadTab(_tcTab);
};
window.tcPeriodChanged = function() {
  _tcMonth = +document.getElementById('tcMonthSel')?.value || _tcMonth;
  _tcYear  = +document.getElementById('tcYearSel')?.value  || _tcYear;
  _tcLoadTab(_tcTab);
};
window.tcFilterClientList = function(q) {
  const sel = document.getElementById('tcClientSel');
  if (!sel) return;
  // display:none on <option> doesn't work in browsers — rebuild the list instead
  const clients = window._tcClientsForTab || [];
  const lq = q.toLowerCase();
  const matched = !q ? clients : clients.filter(c => (c.name||c.trade_name||'').toLowerCase().includes(lq));
  const curVal = _tcClientId;
  sel.innerHTML = `<option value="">— اختر عميل —</option>` +
    matched.map(c=>`<option value="${c.id}" ${c.id==curVal?'selected':''}>${escH(c.name||c.trade_name||'')}</option>`).join('');
};

async function switchTaxTab(id) {
  _tcTab = id;
  // Re-render shell so client dropdown filters by new tab's obligation type
  _renderTaxShell();
  await _tcLoadTab(id);
}

async function _tcLoadTab(id) {
  const el = document.getElementById('taxTabContent');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  try {
    if      (id === 'dashboard') await _tcRenderDashboard(el);
    else if (id === 'vat')       await _tcRenderVat(el);
    else if (id === 'wht')       await _tcRenderWht(el);
    else if (id === 'corporate') await _tcRenderCorporate(el);
    else if (id === 'salary')    await _tcRenderSalary(el);
    else if (id === 'calendar')  await _tcRenderCalendar(el);
    else if (id === 'portals')   _tcRenderPortals(el);
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px;background:white;border-radius:10px;border:1px solid #fca5a5">❌ ${escH(e.message)}</div>`;
  }
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────
async function _tcRenderDashboard(el) {
  if (!_tcClientId) { el.innerHTML = _tcNeedClient(); return; }
  const d = await api('GET', `/api/tax-center/dashboard/${_tcClientId}?year=${_tcYear}`);

  const kpi = (icon, label, value, color='#1a2472', sub='') => `
    <div style="background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:16px 18px">
      <div style="font-size:24px;margin-bottom:6px">${icon}</div>
      <div style="font-size:20px;font-weight:800;color:${color}">${value}</div>
      <div style="font-size:12px;color:#64748b;margin-top:3px">${label}</div>
      ${sub ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${sub}</div>` : ''}
    </div>`;

  const vat = d.vat_summary || {};
  const wht = d.wht_summary || {};
  const corp = d.corporate || {};
  const upcoming = d.upcoming_deadlines || [];

  el.innerHTML = `
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px">
    ${kpi('🧾','ض.ق.م. مستحقة',money(vat.net_vat_due||0),'#dc2626')}
    ${kpi('🏛️','خصم والتحصيل',money(corp.gross_tax||0),'#7c3aed')}
    ${kpi('🏢','ضريبة الدخل',money(corp.gross_tax||0),'#1a2472')}
    ${kpi('📅','مواعيد قادمة',upcoming.length,'#d97706',upcoming.length?`أقرب: ${dateAr(upcoming[0]?.due_date)}`:'لا يوجد')}
  </div>

  ${upcoming.length ? `
  <div class="card" style="padding:16px;margin-bottom:16px">
    <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px">📅 المواعيد القادمة</div>
    <div style="display:grid;gap:8px">
      ${upcoming.slice(0,5).map(ev => {
        const days = Math.ceil((new Date(ev.due_date) - new Date()) / 86400000);
        const urg = days <= 3 ? '#dc2626' : days <= 7 ? '#d97706' : '#64748b';
        return `<div style="display:flex;align-items:center;gap:12px;padding:10px;background:#f8fafc;border-radius:8px;border-right:3px solid ${urg}">
          <div style="flex:1;font-size:13px;font-weight:600;color:#1e293b">${escH(ev.title||ev.event_type||'')}</div>
          <div style="font-size:12px;color:${urg};font-weight:700">${dateAr(ev.due_date)} ${days<=0?'⚠️ متأخر':days<=3?`(${days} أيام)`:''}</div>
        </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="card" style="padding:16px">
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:10px">🧾 ض.ق.م. — ${_tcYear}</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr><th style="text-align:right;color:#64748b;padding:4px 0">الشهر</th><th style="text-align:left;color:#64748b;padding:4px 0">مستحق</th><th style="text-align:left;color:#64748b;padding:4px 0">الحالة</th></tr></thead>
        <tbody>
          ${(d.vat_by_month||[]).slice(0,6).map(m=>`<tr style="border-top:1px solid #f1f5f9">
            <td style="padding:5px 0;color:#374151">${TC_MONTH_AR[m.period_month]||m.period_month}</td>
            <td style="padding:5px 0;font-weight:700;color:${(m.net_vat_due||0)>0?'#dc2626':'#15803d'}">${money(m.net_vat_due||0)}</td>
            <td style="padding:5px 0"><span class="badge ${m.status==='submitted'||m.status==='paid'?'badge-green':m.status==='approved'?'badge-blue':'badge-yellow'}" style="font-size:10px">${m.status||'draft'}</span></td>
          </tr>`).join('')||'<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:12px">لا بيانات</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="card" style="padding:16px">
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:10px">🏢 تقدير ضريبة الدخل — ${_tcYear}</div>
      ${corp.taxable_income != null ? `
      <div style="display:grid;gap:6px;font-size:13px">
        <div style="display:flex;justify-content:space-between;padding:6px;background:#f8fafc;border-radius:6px">
          <span style="color:#64748b">الدخل الخاضع</span><strong>${money(corp.taxable_income||0)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px;background:#f8fafc;border-radius:6px">
          <span style="color:#64748b">إجمالي الضريبة</span><strong style="color:#dc2626">${money(corp.gross_tax||0)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px;background:#f8fafc;border-radius:6px">
          <span style="color:#64748b">صافي المستحق</span><strong style="color:#dc2626">${money(corp.final_tax_due||0)}</strong>
        </div>
      </div>` : `<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px">لم يُعدّ تقدير بعد<br><button class="btn btn-secondary" style="margin-top:8px;font-size:12px" onclick="switchTaxTab('corporate')">إعداد تقدير</button></div>`}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// VAT EXCEL ANALYSIS DASHBOARD — Phase 2
// ══════════════════════════════════════════════════════════════════════════════
// State (persists across sub-tab switches within the same session)
window._vat = window._vat || {
  analysis: null,   // loaded analysis {id, summary, invoices, company_name, ...}
  tab: 'dashboard', // 'dashboard' | 'invoices' | 'preview' | 'history'
  page: 1,
  filter: {q:'', direction:'', status:'', sort:'date_desc'},
  overrides: {},    // preview editor overrides: {sales_net, sales_vat, pur_net, pur_vat}
  el: null,         // container element reference
};

async function _tcRenderVat(el) {
  window._vat.el = el;
  _vatRender();
}

function _vatRender() {
  const el = window._vat.el;
  if (!el) return;
  const v = window._vat;
  const a = v.analysis;

  const tabBtn = (id, icon, label) => `
    <button onclick="_vatSetTab('${id}')" style="display:flex;align-items:center;gap:5px;padding:9px 14px;font-size:12.5px;font-weight:700;font-family:inherit;border:none;border-bottom:2.5px solid ${v.tab===id?'#0F6E56':'transparent'};background:transparent;cursor:pointer;color:${v.tab===id?'#0F6E56':'#64748b'};white-space:nowrap;transition:all .15s">
      ${icon} ${label}</button>`;

  const subTabs = a ? `
    <div style="display:flex;gap:0;border-bottom:2px solid #e8edf3;margin-bottom:16px;overflow-x:auto">
      ${tabBtn('dashboard','📊','لوحة التحكم')}
      ${tabBtn('invoices','📋','الفواتير (${a.summary?.total_invoices??0})')}
      ${tabBtn('preview','📄','Preview الإقرار')}
      ${tabBtn('history','🕐','السجل')}
    </div>` : '';

  const clearBtn = a ? `<button onclick="_vatClear()" style="padding:5px 12px;font-size:11px;border:1.5px solid #fca5a5;border-radius:20px;background:#fff;color:#dc2626;cursor:pointer;font-family:inherit">✕ تحميل ملف جديد</button>` : '';

  const infoBanner = a ? `
    <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:10px 14px;font-size:12px;color:#15803d;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span>✅ <strong>${escH(a.company_name||'')}</strong> · رقم ضريبي: ${escH(a.tax_number||'')} · فترة: ${escH(a.period_label||'')} · ${a.summary?.total_invoices??0} فاتورة</span>
      <span style="margin-right:auto">${clearBtn}</span>
    </div>` : '';

  el.innerHTML = `${infoBanner}${subTabs}<div id="_vatContent"></div>`;

  // Replace tab labels (need actual count)
  if (a) {
    el.querySelector('[id="_vatContent"]').previousElementSibling.innerHTML = `
      ${tabBtn('dashboard','📊','لوحة التحكم')}
      ${tabBtn('invoices','📋',`الفواتير (${a.summary?.total_invoices??0})`)}
      ${tabBtn('preview','📄','Preview الإقرار')}
      ${tabBtn('history','🕐','السجل')}`;
  }

  const content = document.getElementById('_vatContent');
  if (!a) { _vatRenderUpload(content); return; }

  if (v.tab === 'dashboard') _vatRenderDashboard(content);
  else if (v.tab === 'invoices') _vatRenderInvoices(content);
  else if (v.tab === 'preview') _vatRenderPreview(content);
  else if (v.tab === 'history') _vatRenderHistory(content);
}

window._vatSetTab = function(t) { window._vat.tab = t; window._vat.page = 1; _vatRender(); };
window._vatClear  = function()  { window._vat.analysis = null; window._vat.tab = 'dashboard'; _vatRender(); };

// ── Upload Zone ───────────────────────────────────────────────────────────────
function _vatRenderUpload(el) {
  el.innerHTML = `
  <div style="display:grid;gap:14px">

    <!-- Drop zone -->
    <div id="_vatDrop" ondragover="event.preventDefault();this.style.borderColor='#0F6E56';this.style.background='#f0fdf4'"
         ondragleave="this.style.borderColor='#cbd5e1';this.style.background='#f8fafc'"
         ondrop="_vatHandleDrop(event)"
         style="border:2px dashed #cbd5e1;border-radius:16px;background:#f8fafc;padding:48px 24px;text-align:center;cursor:pointer;transition:all .2s"
         onclick="document.getElementById('_vatFileIn').click()">
      <div style="font-size:40px;margin-bottom:10px">📊</div>
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:6px">ارفع ملف Excel الفواتير الإلكترونية (ETA)</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:16px">اسحب الملف هنا أو اضغط للاختيار · .xlsx أو .xls فقط · حد أقصى 10 MB</div>
      <div style="display:inline-block;padding:9px 22px;background:#0F6E56;color:white;border-radius:8px;font-size:13px;font-weight:700">اختر ملف Excel</div>
    </div>
    <input id="_vatFileIn" type="file" accept=".xlsx,.xls" style="display:none" onchange="_vatHandleFile(this.files[0])"/>

    <!-- Progress -->
    <div id="_vatProgress" style="display:none;background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:20px;text-align:center">
      <div class="spinner" style="margin:0 auto 12px"></div>
      <div style="font-size:13px;color:#374151">جارٍ تحليل الملف... قد يستغرق بضع ثوان للملفات الكبيرة</div>
    </div>

    <!-- Error -->
    <div id="_vatUploadErr" style="display:none;background:#fff5f5;border:1.5px solid #fca5a5;border-radius:12px;padding:14px;color:#dc2626;font-size:13px"></div>

    <!-- History preview (last 3) -->
    <div id="_vatHistPreview"></div>
  </div>`;
  _vatLoadHistPreview();
}

async function _vatLoadHistPreview() {
  const c = document.getElementById('_vatHistPreview');
  if (!c) return;
  try {
    const hist = await api('GET', '/api/vat-excel/history');
    if (!hist?.length) return;
    c.innerHTML = `
    <div style="background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:16px">
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:12px">🕐 آخر التحليلات — اضغط لإعادة الفتح</div>
      ${hist.slice(0,5).map(h=>`
        <div onclick="_vatOpenHistory(${h.id})" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;cursor:pointer;transition:background .15s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
          <div style="width:38px;height:38px;background:#e0f2fe;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📊</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(h.company_name||'—')}</div>
            <div style="font-size:11px;color:#64748b">${escH(h.period_label||'')} · ${(h.total_invoices??0)} فاتورة</div>
          </div>
          <div style="text-align:left;flex-shrink:0">
            <div style="font-size:12px;font-weight:700;color:${(h.net_vat??0)<0?'#0F6E56':'#dc2626'}">${_vatFmtMoney(Math.abs(h.net_vat??0))}</div>
            <div style="font-size:10px;color:#94a3b8">${(h.net_vat??0)<0?'رصيد دائن':'مستحق'}</div>
          </div>
        </div>`).join('')}
    </div>`;
  } catch(_){}
}

window._vatHandleDrop = function(e) {
  e.preventDefault();
  document.getElementById('_vatDrop').style.borderColor = '#cbd5e1';
  document.getElementById('_vatDrop').style.background = '#f8fafc';
  const f = e.dataTransfer?.files?.[0];
  if (f) _vatHandleFile(f);
};
window._vatHandleFile = async function(file) {
  if (!file) return;
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    _vatShowUploadErr('يُقبل ملف Excel فقط (.xlsx أو .xls)'); return;
  }
  if (file.size > 10*1024*1024) {
    _vatShowUploadErr('حجم الملف يتجاوز الحد المسموح به (10 MB)'); return;
  }
  document.getElementById('_vatProgress').style.display = 'block';
  document.getElementById('_vatUploadErr').style.display = 'none';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch(API + '/api/vat-excel/analyze', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${token}`},
      body: fd,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
    window._vat.analysis = data;
    window._vat.tab = 'dashboard';
    window._vat.overrides = {};
    _vatRender();
  } catch(e) {
    document.getElementById('_vatProgress').style.display = 'none';
    _vatShowUploadErr(`❌ ${e.message}`);
  }
};
function _vatShowUploadErr(msg) {
  const el = document.getElementById('_vatUploadErr');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function _vatRenderDashboard(el) {
  const s = window._vat.analysis?.summary || {};
  const isCredit = (s.net_vat??0) < 0;
  const netAbs   = Math.abs(s.net_vat??0);

  const kpi = (label, val, sub, key, color='#1e293b') => `
    <div onclick="_vatDrillOpen('${key}','${label}')" style="background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:14px 16px;cursor:${key?'pointer':'default'};transition:box-shadow .15s" onmouseover="if('${key}')this.style.boxShadow='0 2px 8px #0F6E5625'" onmouseout="this.style.boxShadow='none'">
      <div style="font-size:11px;color:#64748b;margin-bottom:6px">${label}</div>
      <div style="font-size:18px;font-weight:800;color:${color}">${_vatFmtMoney(val)}</div>
      ${sub?`<div style="font-size:11px;color:#94a3b8;margin-top:3px">${sub}</div>`:''}
      ${key?`<div style="font-size:10px;color:#0F6E56;margin-top:4px">← اضغط لعرض الفواتير</div>`:''}
    </div>`;

  const suppliers = (s.suppliers||[]).slice(0,5);
  const maxNet = suppliers.length ? Math.max(...suppliers.map(x=>x.net)) : 1;
  const barPct = v => Math.max(2, Math.round(v/maxNet*100));

  el.innerHTML = `
  <!-- KPI Row 1: Core figures -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:10px;margin-bottom:10px">
    ${kpi('إجمالي المشتريات (واردة)', s.pur_net??0, `${s.incoming_count??0} فاتورة واردة`, 'pur_net', '#185FA5')}
    ${kpi('ضريبة المدخلات', s.pur_vat??0, 'مستحق الخصم', 'pur_vat', '#0F6E56')}
    ${kpi('إجمالي المبيعات (صادرة)', s.sales_net??0, `${s.outgoing_count??0} فاتورة صادرة`, 'sales_net', '#374151')}
    ${kpi('ضريبة المخرجات', s.sales_vat??0, 'على المبيعات', 'sales_vat', '#374151')}
    <div style="background:${isCredit?'#f0fdf4':'#fff5f5'};border:1.5px solid ${isCredit?'#86efac':'#fca5a5'};border-radius:12px;padding:14px 16px">
      <div style="font-size:11px;color:#64748b;margin-bottom:6px">${isCredit?'الرصيد الدائن':'ضريبة مستحقة'}</div>
      <div style="font-size:18px;font-weight:800;color:${isCredit?'#0F6E56':'#dc2626'}">${_vatFmtMoney(netAbs)}</div>
      <div style="font-size:11px;color:${isCredit?'#15803d':'#dc2626'};margin-top:3px">${isCredit?'يُرحَّل أو يُسترد':'للسداد للمصلحة'}</div>
    </div>
  </div>

  <!-- KPI Row 2: Counts -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px">
    ${kpi('إجمالي الفواتير', s.total_invoices??0, '', 'all', '#374151')}
    <div style="background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:14px 16px">
      <div style="font-size:11px;color:#64748b;margin-bottom:6px">عدد الموردين</div>
      <div style="font-size:18px;font-weight:800">${s.supplier_count??0}</div>
    </div>
    <div style="background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:14px 16px">
      <div style="font-size:11px;color:#64748b;margin-bottom:6px">أكبر فاتورة</div>
      <div style="font-size:15px;font-weight:800">${_vatFmtMoney(s.max_invoice??0)}</div>
    </div>
    <div style="background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:14px 16px">
      <div style="font-size:11px;color:#64748b;margin-bottom:6px">متوسط الفاتورة</div>
      <div style="font-size:15px;font-weight:800">${_vatFmtMoney(s.avg_invoice??0)}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
    <!-- Calculation box -->
    <div style="background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:16px">
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:12px">📐 ملخص حساب الإقرار</div>
      <div style="display:flex;flex-direction:column;gap:0">
        ${_vatCalcRow('ضريبة مخرجات (مبيعات)', s.sales_vat??0, false)}
        ${_vatCalcRow('تُطرح: ضريبة مدخلات (مشتريات)', s.pur_vat??0, false)}
        <div style="height:1px;background:#e8edf3;margin:8px 0"></div>
        ${_vatCalcRow('صافي الضريبة', s.net_vat??0, true, isCredit?'#0F6E56':'#dc2626')}
      </div>
      <div style="background:${isCredit?'#f0fdf4':'#fff5f5'};border-radius:8px;padding:10px 12px;margin-top:10px;font-size:11.5px;color:${isCredit?'#15803d':'#dc2626'}">
        ${isCredit?'✅ رصيد دائن لصالح الممول — يُرحَّل للفترة القادمة أو يُطلب استرداده':'⚠️ ضريبة مستحقة للسداد للمصلحة الضريبية'}
      </div>
    </div>

    <!-- Suppliers -->
    <div style="background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:16px">
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:12px">🏢 أكبر الموردين</div>
      ${suppliers.length ? suppliers.map((sp,i)=>`
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px">
            <span style="color:#374151;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${escH(sp.name||'')}</span>
            <span style="color:#64748b;flex-shrink:0">${_vatFmtMoney(sp.net)} · ${sp.count} ف.</span>
          </div>
          <div style="background:#f1f5f9;border-radius:3px;height:6px">
            <div style="width:${barPct(sp.net)}%;height:100%;background:${['#0F6E56','#1D9E75','#5DCAA5','#9FE1CB','#D1F5EA'][i]||'#0F6E56'};border-radius:3px"></div>
          </div>
        </div>`).join('') : '<div style="color:#94a3b8;font-size:12px;padding:16px;text-align:center">لا موردين</div>'}
    </div>
  </div>

  <!-- Action buttons -->
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <button onclick="_vatSetTab('invoices')" class="btn btn-secondary" style="font-size:12px">📋 عرض الفواتير التفصيلي</button>
    <button onclick="_vatSetTab('preview')" style="padding:9px 20px;background:#0F6E56;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📄 إنشاء ملف الإقرار ←</button>
  </div>

  <!-- Drill modal (hidden) -->
  ${_vatDrillModalHtml()}`;
}

function _vatCalcRow(label, val, bold, color='#374151') {
  return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:12.5px">
    <span style="color:#64748b">${label}</span>
    <span style="font-weight:${bold?'800':'600'};color:${color}">${_vatFmtMoney(val)} ج.م</span>
  </div>`;
}

// ── Invoice Table ─────────────────────────────────────────────────────────────
function _vatRenderInvoices(el) {
  const v = window._vat;
  const all = v.analysis?.invoices || [];
  const f = v.filter;

  // Filter
  let rows = all.filter(i => {
    if (f.q) {
      const q = f.q.toLowerCase();
      if (!(i.uuid||'').toLowerCase().includes(q) &&
          !(i.issuer||'').toLowerCase().includes(q) &&
          !(i.receiver||'').toLowerCase().includes(q) &&
          !(i.internal_id||'').toLowerCase().includes(q)) return false;
    }
    if (f.direction && i.direction !== f.direction) return false;
    if (f.status && i.status !== f.status) return false;
    return true;
  });

  // Sort
  if (f.sort === 'date_desc') rows.sort((a,b) => (b.issue_date||'').localeCompare(a.issue_date||''));
  else if (f.sort === 'date_asc') rows.sort((a,b) => (a.issue_date||'').localeCompare(b.issue_date||''));
  else if (f.sort === 'amt_desc') rows.sort((a,b) => (b.total||0)-(a.total||0));
  else if (f.sort === 'amt_asc')  rows.sort((a,b) => (a.total||0)-(b.total||0));

  const PER = 10;
  const total = rows.length;
  const pages = Math.ceil(total/PER) || 1;
  if (v.page > pages) v.page = 1;
  const slice = rows.slice((v.page-1)*PER, v.page*PER);

  // Grand totals from filtered rows (using Decimal-like sum)
  const sumNet = rows.reduce((a,r)=>a+(r.net_after??r.net??0),0);
  const sumVat = rows.reduce((a,r)=>a+(r.vat??0),0);
  const sumTot = rows.reduce((a,r)=>a+(r.total??0),0);

  const dirBadge = d => d==='صادرة'
    ? `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">صادرة</span>`
    : `<span style="background:#f0fdf4;color:#15803d;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">واردة</span>`;
  const statusBadge = s => {
    const c = s==='صالحة'?'#15803d':s==='ملغاة'?'#dc2626':'#d97706';
    const bg = s==='صالحة'?'#f0fdf4':s==='ملغاة'?'#fff5f5':'#fefce8';
    return `<span style="background:${bg};color:${c};padding:2px 7px;border-radius:12px;font-size:10px">${escH(s||'')}</span>`;
  };

  el.innerHTML = `
  <!-- Filters -->
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    <input value="${escH(f.q)}" oninput="_vatFilterQ(this.value)" placeholder="🔍 بحث بـ UUID أو اسم الطرف..." style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;font-family:inherit"/>
    <select onchange="_vatFilterDir(this.value)" style="padding:7px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;font-family:inherit">
      <option value="" ${!f.direction?'selected':''}>كل الاتجاهات</option>
      <option value="واردة" ${f.direction==='واردة'?'selected':''}>واردة فقط</option>
      <option value="صادرة" ${f.direction==='صادرة'?'selected':''}>صادرة فقط</option>
    </select>
    <select onchange="_vatFilterStatus(this.value)" style="padding:7px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;font-family:inherit">
      <option value="" ${!f.status?'selected':''}>كل الحالات</option>
      <option value="صالحة" ${f.status==='صالحة'?'selected':''}>صالحة</option>
      <option value="ملغاة" ${f.status==='ملغاة'?'selected':''}>ملغاة</option>
    </select>
    <select onchange="_vatFilterSort(this.value)" style="padding:7px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;font-family:inherit">
      <option value="date_desc" ${f.sort==='date_desc'?'selected':''}>التاريخ ↓</option>
      <option value="date_asc"  ${f.sort==='date_asc'?'selected':''}>التاريخ ↑</option>
      <option value="amt_desc"  ${f.sort==='amt_desc'?'selected':''}>المبلغ ↓</option>
      <option value="amt_asc"   ${f.sort==='amt_asc'?'selected':''}>المبلغ ↑</option>
    </select>
    <button onclick="_vatExportFilteredCsv()" style="padding:7px 14px;background:#185FA5;color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">⬇ CSV</button>
  </div>

  <!-- Table -->
  <div style="background:white;border:1.5px solid #e8edf3;border-radius:12px;overflow:hidden">
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600;white-space:nowrap;border-bottom:1.5px solid #e8edf3">#</th>
          <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600;white-space:nowrap;border-bottom:1.5px solid #e8edf3">UUID</th>
          <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600;white-space:nowrap;border-bottom:1.5px solid #e8edf3">الطرف</th>
          <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600;white-space:nowrap;border-bottom:1.5px solid #e8edf3">الاتجاه</th>
          <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600;white-space:nowrap;border-bottom:1.5px solid #e8edf3">التاريخ</th>
          <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600;white-space:nowrap;border-bottom:1.5px solid #e8edf3">صافي</th>
          <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600;white-space:nowrap;border-bottom:1.5px solid #e8edf3">ضريبة</th>
          <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600;white-space:nowrap;border-bottom:1.5px solid #e8edf3">الإجمالي</th>
          <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600;white-space:nowrap;border-bottom:1.5px solid #e8edf3">الحالة</th>
          <th style="padding:10px 12px;border-bottom:1.5px solid #e8edf3"></th>
        </tr>
      </thead>
      <tbody>
        ${slice.length ? slice.map((inv,idx)=>{
          const n = (v.page-1)*PER + idx + 1;
          const party = inv.direction==='واردة' ? (inv.issuer||'—') : (inv.receiver||'—');
          return `<tr style="border-bottom:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:9px 12px;color:#94a3b8">${n}</td>
            <td style="padding:9px 12px;font-size:10px;color:#64748b;font-family:monospace;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escH(inv.uuid||'')}">${escH((inv.uuid||'').substring(0,12))}…</td>
            <td style="padding:9px 12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600" title="${escH(party)}">${escH(party)}</td>
            <td style="padding:9px 12px">${dirBadge(inv.direction)}</td>
            <td style="padding:9px 12px;color:#374151;white-space:nowrap;font-size:11px">${escH(inv.issue_date||'')}</td>
            <td style="padding:9px 12px;text-align:left;font-weight:600">${_vatFmtMoney(inv.net_after??inv.net??0)}</td>
            <td style="padding:9px 12px;text-align:left;color:#0F6E56;font-weight:600">${_vatFmtMoney(inv.vat??0)}</td>
            <td style="padding:9px 12px;text-align:left;font-weight:700">${_vatFmtMoney(inv.total??0)}</td>
            <td style="padding:9px 12px">${statusBadge(inv.status)}</td>
            <td style="padding:9px 12px"><button onclick="_vatInvDetail('${escH(inv.uuid||'')}',${n-1})" style="border:1.5px solid #e2e8f0;background:white;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px">👁</button></td>
          </tr>`;
        }).join('') : `<tr><td colspan="10" style="padding:40px;text-align:center;color:#94a3b8">لا توجد فواتير مطابقة للفلتر</td></tr>`}
      </tbody>
      <tfoot>
        <tr style="background:#f0fdf4;font-weight:700;border-top:1.5px solid #86efac">
          <td colspan="5" style="padding:9px 12px;color:#15803d">الإجمالي (${total} فاتورة مفلترة)</td>
          <td style="padding:9px 12px;text-align:left">${_vatFmtMoney(sumNet)}</td>
          <td style="padding:9px 12px;text-align:left;color:#0F6E56">${_vatFmtMoney(sumVat)}</td>
          <td style="padding:9px 12px;text-align:left">${_vatFmtMoney(sumTot)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
    </div>
  </div>

  <!-- Pagination -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:12px;color:#64748b">
    <span>عرض ${(v.page-1)*PER+1}–${Math.min(v.page*PER,total)} من ${total}</span>
    <div style="display:flex;gap:4px">
      <button onclick="_vatPage(${v.page-1})" ${v.page<=1?'disabled':''} style="padding:4px 10px;border:1.5px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-family:inherit">‹</button>
      ${Array.from({length:Math.min(pages,7)},(_,i)=>{
        const p=i+1;
        return `<button onclick="_vatPage(${p})" style="padding:4px 10px;border:1.5px solid ${v.page===p?'#0F6E56':'#e2e8f0'};border-radius:6px;background:${v.page===p?'#0F6E56':'white'};color:${v.page===p?'white':'#374151'};cursor:pointer;font-family:inherit">${p}</button>`;
      }).join('')}
      <button onclick="_vatPage(${v.page+1})" ${v.page>=pages?'disabled':''} style="padding:4px 10px;border:1.5px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-family:inherit">›</button>
    </div>
  </div>

  <!-- Invoice detail modal -->
  <div id="_vatInvModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:none;align-items:center;justify-content:center">
    <div style="background:white;border-radius:16px;padding:24px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto" id="_vatInvModalBody"></div>
  </div>`;

  // Drill modal
  el.insertAdjacentHTML('beforeend', _vatDrillModalHtml());
}

window._vatFilterQ      = function(q) { window._vat.filter.q=q; window._vat.page=1; _vatRenderInvoices(document.getElementById('_vatContent')); };
window._vatFilterDir    = function(d) { window._vat.filter.direction=d; window._vat.page=1; _vatRenderInvoices(document.getElementById('_vatContent')); };
window._vatFilterStatus = function(s) { window._vat.filter.status=s; window._vat.page=1; _vatRenderInvoices(document.getElementById('_vatContent')); };
window._vatFilterSort   = function(s) { window._vat.filter.sort=s; window._vat.page=1; _vatRenderInvoices(document.getElementById('_vatContent')); };
window._vatPage         = function(p) { window._vat.page=p; _vatRenderInvoices(document.getElementById('_vatContent')); };

window._vatInvDetail = function(uuid, idx) {
  const inv = (window._vat.analysis?.invoices||[])[idx] || (window._vat.analysis?.invoices||[]).find(i=>i.uuid===uuid);
  if (!inv) return;
  const party = inv.direction==='واردة'?(inv.issuer||'—'):(inv.receiver||'—');
  const partyTin = inv.direction==='واردة'?(inv.issuer_tin||'—'):(inv.receiver_tin||'—');
  const modal = document.getElementById('_vatInvModal');
  document.getElementById('_vatInvModalBody').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:15px;font-weight:800;color:#1e293b">تفاصيل الفاتورة</h3>
      <button onclick="document.getElementById('_vatInvModal').style.display='none'" style="border:none;background:none;font-size:20px;cursor:pointer;color:#64748b">✕</button>
    </div>
    ${[
      ['UUID', inv.uuid],['رقم داخلي', inv.internal_id],['نوع المستند', inv.doc_type],
      ['الاتجاه', inv.direction],['الحالة', inv.status],
      ['تاريخ الإصدار', inv.issue_date],['تاريخ التقديم', inv.submit_date],
      ['الطرف', party],['رقم ضريبي الطرف', partyTin],['العملة', inv.currency],
      ['المبلغ الصافي', _vatFmtMoney(inv.net??0)+' ج.م'],
      ['الخصم', _vatFmtMoney(inv.discount??0)+' ج.م'],
      ['بعد الخصم', _vatFmtMoney(inv.net_after??0)+' ج.م'],
      ['الضريبة', _vatFmtMoney(inv.vat??0)+' ج.م'],
      ['الإجمالي', _vatFmtMoney(inv.total??0)+' ج.م'],
    ].map(([l,vl])=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:12.5px"><span style="color:#64748b">${l}</span><span style="font-weight:600;color:#1e293b">${escH(String(vl??''))}</span></div>`).join('')}`;
  modal.style.display = 'flex';
};

window._vatExportFilteredCsv = function() {
  const v = window._vat;
  const a = v.analysis;
  if (!a) return;
  const f = v.filter;
  const rows = (a.invoices||[]).filter(i => {
    if (f.q) { const q=f.q.toLowerCase(); if(!(i.uuid||'').toLowerCase().includes(q)&&!(i.issuer||'').toLowerCase().includes(q)&&!(i.receiver||'').toLowerCase().includes(q)&&!(i.internal_id||'').toLowerCase().includes(q)) return false; }
    if (f.direction && i.direction!==f.direction) return false;
    if (f.status && i.status!==f.status) return false;
    return true;
  });
  const cols = ['uuid','internal_id','doc_type','direction','status','issue_date','submit_date','issuer','issuer_tin','receiver','receiver_tin','net_after','vat','total','currency'];
  const csv = [cols.join(','), ...rows.map(r=>cols.map(c=>JSON.stringify(r[c]??'')).join(','))].join('\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a2 = document.createElement('a'); a2.href=url; a2.download='invoices_filtered.csv'; a2.click();
  URL.revokeObjectURL(url);
};

// ── Drill-down ────────────────────────────────────────────────────────────────
function _vatDrillModalHtml() {
  return `<div id="_vatDrillModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;align-items:center;justify-content:center">
    <div style="background:white;border-radius:16px;padding:24px;width:min(660px,95vw);max-height:80vh;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 id="_vatDrillTitle" style="font-size:14px;font-weight:800;color:#1e293b"></h3>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="_vatDrillCsvBtn" style="padding:5px 12px;background:#185FA5;color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">⬇ CSV</button>
          <button onclick="document.getElementById('_vatDrillModal').style.display='none'" style="border:none;background:none;font-size:22px;cursor:pointer;color:#64748b;line-height:1">✕</button>
        </div>
      </div>
      <div id="_vatDrillTotals" style="background:#f0fdf4;border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;gap:20px;font-size:12px;flex-wrap:wrap"></div>
      <div style="overflow-y:auto;flex:1" id="_vatDrillBody"></div>
    </div>
  </div>`;
}

window._vatDrillOpen = async function(key, label) {
  if (!key || !window._vat.analysis?.id) return;
  const modal = document.getElementById('_vatDrillModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('_vatDrillTitle').textContent = `الفواتير المكوِّنة لـ: ${label}`;
  document.getElementById('_vatDrillBody').innerHTML = '<div style="padding:30px;text-align:center"><div class="spinner" style="margin:auto"></div></div>';
  document.getElementById('_vatDrillTotals').innerHTML = '';

  try {
    const id = window._vat.analysis.id;
    const data = await api('GET', `/api/vat-excel/drill/${id}/${key}`);
    document.getElementById('_vatDrillTotals').innerHTML = `
      <span>عدد الفواتير: <strong>${data.count}</strong></span>
      <span>إجمالي صافي: <strong>${_vatFmtMoney(data.total_net)}</strong> ج.م</span>
      <span>إجمالي ضريبة: <strong>${_vatFmtMoney(data.total_vat)}</strong> ج.م</span>
      <span>الإجمالي: <strong>${_vatFmtMoney(data.total_amt)}</strong> ج.م</span>`;

    const invs = data.invoices || [];
    document.getElementById('_vatDrillCsvBtn').onclick = () => _vatDrillDownloadCsv(id, key, label);
    document.getElementById('_vatDrillBody').innerHTML = invs.length ? `
      <table style="width:100%;border-collapse:collapse;font-size:11.5px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px;text-align:right;color:#64748b;border-bottom:1.5px solid #e8edf3">#</th>
          <th style="padding:8px;text-align:right;color:#64748b;border-bottom:1.5px solid #e8edf3">الطرف</th>
          <th style="padding:8px;text-align:right;color:#64748b;border-bottom:1.5px solid #e8edf3">التاريخ</th>
          <th style="padding:8px;text-align:left;color:#64748b;border-bottom:1.5px solid #e8edf3">صافي</th>
          <th style="padding:8px;text-align:left;color:#64748b;border-bottom:1.5px solid #e8edf3">ضريبة</th>
          <th style="padding:8px;text-align:left;color:#64748b;border-bottom:1.5px solid #e8edf3">الإجمالي</th>
          <th style="padding:8px;text-align:right;color:#64748b;border-bottom:1.5px solid #e8edf3">حالة</th>
        </tr></thead>
        <tbody>
          ${invs.map((inv,i)=>{
            const party = inv.direction==='واردة'?(inv.issuer||'—'):(inv.receiver||'—');
            const sc = inv.status==='صالحة'?'#15803d':inv.status==='ملغاة'?'#dc2626':'#d97706';
            return `<tr style="border-bottom:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
              <td style="padding:7px 8px;color:#94a3b8">${i+1}</td>
              <td style="padding:7px 8px;font-weight:600;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escH(party)}">${escH(party)}</td>
              <td style="padding:7px 8px;font-size:10.5px">${escH(inv.issue_date||'')}</td>
              <td style="padding:7px 8px;text-align:left">${_vatFmtMoney(inv.net_after??inv.net??0)}</td>
              <td style="padding:7px 8px;text-align:left;color:#0F6E56">${_vatFmtMoney(inv.vat??0)}</td>
              <td style="padding:7px 8px;text-align:left;font-weight:700">${_vatFmtMoney(inv.total??0)}</td>
              <td style="padding:7px 8px"><span style="color:${sc};font-size:10px;font-weight:700">${escH(inv.status||'')}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<div style="padding:30px;text-align:center;color:#94a3b8">لا فواتير</div>';
  } catch(e) {
    document.getElementById('_vatDrillBody').innerHTML = `<div style="color:#dc2626;padding:16px">${escH(e.message)}</div>`;
  }
};

window._vatDrillDownloadCsv = async function(id, key, label) {
  const resp = await fetch(API + `/api/vat-excel/drill/${id}/${key}/csv`, {headers:{'Authorization':`Bearer ${token}`}});
  if (!resp.ok) return;
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`فواتير_${label}.csv`; a.click();
  URL.revokeObjectURL(url);
};

// ── Preview Editor ────────────────────────────────────────────────────────────
function _vatRenderPreview(el) {
  const v = window._vat;
  const a = v.analysis;
  const s = a?.summary || {};
  const ov = v.overrides;

  const fval = (k, fallback) => ov[k] !== undefined ? ov[k] : (s[k] !== undefined ? s[k] : (fallback??0));

  const sv = fval('sales_vat', 0);
  const pv = fval('pur_vat', 0);
  const sn = fval('sales_net', 0);
  const pn = fval('pur_net', 0);
  const netVat = +(sv - pv).toFixed(2);
  const isCredit = netVat < 0;

  const field = (id, label, val, editable=true) => `
    <div style="background:${editable?'white':'#f8fafc'};border:1.5px solid ${editable?'#e2e8f0':'transparent'};border-radius:10px;padding:10px 14px">
      <label style="font-size:10px;color:#64748b;display:block;margin-bottom:4px">${label}${editable?' <span style="color:#0F6E56;font-size:10px">(قابل للتعديل)</span>':''}</label>
      <input id="${id}" type="number" value="${val}" ${!editable?'readonly':''}
        oninput="_vatPreviewRecalc()"
        style="width:100%;border:none;background:transparent;font-size:14px;font-weight:700;color:#1e293b;outline:none;font-family:inherit"/>
    </div>`;

  el.innerHTML = `
  <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:10px 14px;font-size:12px;color:#92400e;margin-bottom:16px">
    ✏️ <strong>شاشة المراجعة والتعديل</strong> — يمكنك تعديل أي خانة خضراء قبل التنزيل. صافي الضريبة يُحسب تلقائياً.
  </div>

  <!-- Company info (read-only) -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
    ${field('_pvCompany', 'اسم الشركة / الممول', escH(a?.company_name||''), false)}
    ${field('_pvTax', 'الرقم الضريبي', escH(a?.tax_number||''), false)}
    ${field('_pvPeriod', 'فترة الإقرار', escH(a?.period_label||''), false)}
    ${field('_pvDate', 'تاريخ التقديم', new Date().toLocaleDateString('ar-EG'), true)}
  </div>

  <!-- Section A: Sales -->
  <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:14px;margin-bottom:12px">
    <div style="font-size:12px;font-weight:800;color:#15803d;margin-bottom:10px">📤 القسم الأول: المبيعات (ضريبة المخرجات)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${field('_pvSalesNet', 'إجمالي المبيعات (بدون ضريبة)', sn, true)}
      ${field('_pvSalesVat', 'ضريبة المخرجات', sv, true)}
    </div>
  </div>

  <!-- Section B: Purchases -->
  <div style="background:#eff6ff;border:1.5px solid #93c5fd;border-radius:12px;padding:14px;margin-bottom:12px">
    <div style="font-size:12px;font-weight:800;color:#1d4ed8;margin-bottom:10px">📥 القسم الثاني: المشتريات (ضريبة المدخلات)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${field('_pvPurNet', 'إجمالي المشتريات (بدون ضريبة)', pn, true)}
      ${field('_pvPurVat', 'ضريبة المدخلات (مستحقة الخصم)', pv, true)}
    </div>
  </div>

  <!-- Section C: Result -->
  <div id="_pvResultBox" style="border-radius:12px;padding:14px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;background:${isCredit?'#f0fdf4':'#fff5f5'};border:1.5px solid ${isCredit?'#86efac':'#fca5a5'}">
    <div>
      <div style="font-size:12px;color:${isCredit?'#15803d':'#dc2626'};font-weight:700" id="_pvResultLabel">${isCredit?'▶ رصيد دائن لصالح الممول':'▶ ضريبة مستحقة للسداد'}</div>
      <div style="font-size:11px;color:#64748b;margin-top:3px" id="_pvCalcNote">= ضريبة مخرجات (${_vatFmtMoney(sv)}) − ضريبة مدخلات (${_vatFmtMoney(pv)})</div>
    </div>
    <div style="font-size:22px;font-weight:800;color:${isCredit?'#0F6E56':'#dc2626'}" id="_pvResultVal">${_vatFmtMoney(Math.abs(netVat))} ج.م</div>
  </div>

  <!-- Actions -->
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <button onclick="_vatDownloadDeclaration()" style="padding:10px 22px;background:#0F6E56;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">⬇ تحميل ملف الإقرار (Excel — نموذج ١٠ ض.ق.م)</button>
    <button onclick="_vatSetTab('dashboard')" class="btn btn-secondary" style="font-size:12px">← العودة للمراجعة</button>
    <button onclick="_vatResetOverrides()" class="btn btn-secondary" style="font-size:12px">↺ استعادة الأصلي</button>
  </div>`;
}

window._vatPreviewRecalc = function() {
  const sv = +document.getElementById('_pvSalesVat')?.value || 0;
  const pv = +document.getElementById('_pvPurVat')?.value  || 0;
  const sn = +document.getElementById('_pvSalesNet')?.value || 0;
  const pn = +document.getElementById('_pvPurNet')?.value  || 0;

  // Save overrides
  window._vat.overrides = { sales_net: sn, sales_vat: sv, pur_net: pn, pur_vat: pv };

  const net = +(sv-pv).toFixed(2);
  const isCredit = net < 0;
  const box = document.getElementById('_pvResultBox');
  const lbl = document.getElementById('_pvResultLabel');
  const note = document.getElementById('_pvCalcNote');
  const val = document.getElementById('_pvResultVal');
  if (!box) return;
  box.style.background = isCredit?'#f0fdf4':'#fff5f5';
  box.style.borderColor = isCredit?'#86efac':'#fca5a5';
  if (lbl) { lbl.style.color=isCredit?'#15803d':'#dc2626'; lbl.textContent=isCredit?'▶ رصيد دائن لصالح الممول':'▶ ضريبة مستحقة للسداد'; }
  if (note) note.textContent=`= ضريبة مخرجات (${_vatFmtMoney(sv)}) − ضريبة مدخلات (${_vatFmtMoney(pv)})`;
  if (val)  { val.style.color=isCredit?'#0F6E56':'#dc2626'; val.textContent=`${_vatFmtMoney(Math.abs(net))} ج.م`; }
};

window._vatResetOverrides = function() { window._vat.overrides = {}; _vatRenderPreview(document.getElementById('_vatContent')); };

window._vatDownloadDeclaration = async function() {
  const v = window._vat;
  const id = v.analysis?.id;
  if (!id) return;
  let url = `/api/vat-excel/declaration/${id}`;
  if (Object.keys(v.overrides).length) {
    url += `?overrides=${encodeURIComponent(JSON.stringify(v.overrides))}`;
  }
  const resp = await fetch(API + url, {headers:{'Authorization':`Bearer ${token}`}});
  if (!resp.ok) { alert('❌ فشل التحميل'); return; }
  const blob = await resp.blob();
  const burl = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=burl;
  a.download = `إقرار_ضريبة_القيمة_المضافة_${(v.analysis?.period_label||'').replace(/[→\/]/g,'_')}.xlsx`;
  a.click();
  URL.revokeObjectURL(burl);
};

// ── History ───────────────────────────────────────────────────────────────────
async function _vatRenderHistory(el) {
  el.innerHTML = '<div style="padding:30px;text-align:center"><div class="spinner" style="margin:auto"></div></div>';
  try {
    const hist = await api('GET', '/api/vat-excel/history');
    if (!hist?.length) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;background:white;border-radius:12px;border:1.5px solid #e8edf3">لا توجد تحليلات محفوظة — ارفع ملف Excel لإنشاء أول تحليل</div>';
      return;
    }
    el.innerHTML = `
    <div style="background:white;border:1.5px solid #e8edf3;border-radius:12px;overflow:hidden">
      ${hist.map(h => {
        const isCredit = (h.net_vat??0) < 0;
        const netAbs = Math.abs(h.net_vat??0);
        return `<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #f1f5f9">
          <div style="width:42px;height:42px;background:#e0f2fe;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📊</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:#1e293b">${escH(h.company_name||'—')}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">${escH(h.period_label||'')} · ${h.total_invoices??0} فاتورة · ${escH(h.created_at?.substring(0,10)||'')}</div>
          </div>
          <div style="text-align:left;flex-shrink:0;margin-left:12px">
            <div style="font-size:13px;font-weight:800;color:${isCredit?'#0F6E56':'#dc2626'}">${_vatFmtMoney(netAbs)} ج.م</div>
            <div style="font-size:10px;color:#94a3b8">${isCredit?'رصيد دائن':'مستحق'}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button onclick="_vatOpenHistory(${h.id})" style="padding:5px 12px;background:#0F6E56;color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">فتح</button>
            <button onclick="_vatHistDownload(${h.id},'${escH((h.period_label||'').replace(/[→\/]/g,'_'))}')" style="padding:5px 12px;background:#185FA5;color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">⬇ Excel</button>
            <button onclick="_vatHistDelete(${h.id},this)" style="padding:5px 10px;background:white;color:#dc2626;border:1.5px solid #fca5a5;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">🗑</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:16px">${escH(e.message)}</div>`;
  }
}

window._vatOpenHistory = async function(id) {
  try {
    const data = await api('GET', `/api/vat-excel/history/${id}`);
    window._vat.analysis = data;
    window._vat.tab = 'dashboard';
    window._vat.overrides = {};
    _vatRender();
  } catch(e) { alert('❌ ' + e.message); }
};

window._vatHistDownload = async function(id, period) {
  const resp = await fetch(API + `/api/vat-excel/declaration/${id}`, {headers:{'Authorization':`Bearer ${token}`}});
  if (!resp.ok) { alert('❌ فشل التحميل'); return; }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`إقرار_${period}.xlsx`; a.click();
  URL.revokeObjectURL(url);
};

window._vatHistDelete = async function(id, btn) {
  if (!confirm('حذف هذا التحليل نهائياً؟')) return;
  btn.disabled = true;
  try {
    await api('DELETE', `/api/vat-excel/history/${id}`);
    // Re-render history
    _vatRenderHistory(document.getElementById('_vatContent'));
  } catch(e) { alert('❌ '+e.message); btn.disabled=false; }
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function _vatFmtMoney(v) {
  if (v === null || v === undefined) return '—';
  return (+v).toLocaleString('ar-EG', {minimumFractionDigits:2, maximumFractionDigits:2});
}

// ── VAT RETURNS (client-specific, preserved) ──────────────────────────────────

// ── VAT Status config ────────────────────────────────────
const VAT_STATUS = {
  draft:     {label:'مسودة',     icon:'📝', color:'#6b7280', bg:'#f3f4f6', step:0},
  reviewed:  {label:'قيد المراجعة', icon:'👀', color:'#d97706', bg:'#fefce8', step:1},
  approved:  {label:'معتمد',    icon:'✅', color:'#15803d', bg:'#f0fdf4', step:2},
  submitted: {label:'مُرسَل',   icon:'📤', color:'#1d4ed8', bg:'#dbeafe', step:3},
  paid:      {label:'مسدد',     icon:'💚', color:'#065f46', bg:'#dcfce7', step:4},
  amended:   {label:'معدَّل',   icon:'🔄', color:'#7c3aed', bg:'#f5f3ff', step:5},
};

function _vatStatusBadge(status) {
  const s = VAT_STATUS[status] || {label:status, icon:'❓', color:'#64748b', bg:'#f1f5f9'};
  return `<span style="display:inline-flex;align-items:center;gap:4px;background:${s.bg};color:${s.color};border:1.5px solid ${s.color}33;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">${s.icon} ${s.label}</span>`;
}

async function _tcVatLoadList() {
  const el = document.getElementById('tcVatArea');
  if (!el) return;
  try {
    const data = await api('GET', `/api/tax-center/vat/${_tcClientId}?year=${_tcYear}`);
    const rows = data?.items || data || [];
    window._tcVatReturnsMap = {};
    rows.forEach(r => { window._tcVatReturnsMap[r.id] = r; });
    el.innerHTML = `
    <div class="card" style="overflow:hidden">
      <table>
        <thead><tr><th>الفترة</th><th>إجمالي المبيعات</th><th>ضريبة المخرجات</th><th>ضريبة المدخلات</th><th>صافي مستحق</th><th>تاريخ الاستحقاق</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${!rows.length ? `<tr><td colspan="8" style="text-align:center;padding:40px;color:#94a3b8">لا توجد إقرارات — اضغط "بناء إقرار" لإنشاء إقرار الشهر الحالي</td></tr>` :
            rows.map(r => `<tr>
              <td style="font-weight:700">${TC_MONTH_AR[r.period_month]||r.period_month} ${r.period_year}</td>
              <td>${money(r.out_std_taxable||0)}</td>
              <td style="color:#15803d;font-weight:600">${money(r.total_output_vat||0)}</td>
              <td style="color:#1a2472;font-weight:600">${money(r.total_input_vat||0)}</td>
              <td style="font-weight:800;color:${(r.net_vat_due||0)>0?'#dc2626':'#15803d'}">${money(r.net_vat_due||0)}</td>
              <td style="color:${daysUntil(r.due_date)<=3?'#dc2626':'#374151'};font-size:12px">${dateAr(r.due_date)}</td>
              <td>${_vatStatusBadge(r.status)}</td>
              <td><button class="btn btn-primary btn-sm" onclick="tcVatWorkflow(${r.id})">📋 مراجعة</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:16px">❌ ${escH(e.message)}</div>`;
  }
}

window.tcVatBuildManualModal = function() {
  const mon = TC_MONTH_AR[_tcMonth] + ' ' + _tcYear;
  const html = `
  <div class="modal-backdrop" id="vatManualModal">
    <div class="modal" style="max-width:500px">
      <div class="modal-header">
        <h3>✏️ إدخال يدوي — إقرار ${mon}</h3>
        <button onclick="document.getElementById('vatManualModal').remove()" class="modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">

        <div style="background:#fff7ed;border-radius:10px;padding:12px;font-size:12px;color:#92400e;border:1px solid #fed7aa">
          💡 استخدم هذا الخيار لو مش عندك فواتير إلكترونية مربوطة — هتدخل الأرقام مباشرة وهيتبني الإقرار عليها.
        </div>

        <!-- المبيعات -->
        <div style="background:#f0fdf4;border-radius:12px;padding:14px;border:1px solid #86efac">
          <div style="font-weight:700;color:#15803d;margin-bottom:10px;font-size:13px">📤 المبيعات</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:12px;color:#374151;display:block;margin-bottom:4px">إجمالي المبيعات الخاضعة (ج.م)</label>
              <input id="vmSalesTaxable" class="input" type="number" min="0" step="0.01" placeholder="0.00" oninput="vmCalcVat()"/>
            </div>
            <div>
              <label style="font-size:12px;color:#374151;display:block;margin-bottom:4px">ض.ق.م. المبيعات (14%) — محسوبة تلقائياً</label>
              <input id="vmSalesVat" class="input" type="number" min="0" step="0.01" placeholder="0.00" style="background:#f0fdf4"/>
            </div>
            <div>
              <label style="font-size:12px;color:#374151;display:block;margin-bottom:4px">إشعارات دائنة مبيعات (ج.م)</label>
              <input id="vmSalesCredit" class="input" type="number" min="0" step="0.01" placeholder="0.00"/>
            </div>
          </div>
        </div>

        <!-- المشتريات -->
        <div style="background:#eef1fb;border-radius:12px;padding:14px;border:1px solid #c7d3ef">
          <div style="font-weight:700;color:#1a2472;margin-bottom:10px;font-size:13px">📥 المشتريات</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:12px;color:#374151;display:block;margin-bottom:4px">إجمالي المشتريات الخاضعة (ج.م)</label>
              <input id="vmPurchTaxable" class="input" type="number" min="0" step="0.01" placeholder="0.00" oninput="vmCalcVat()"/>
            </div>
            <div>
              <label style="font-size:12px;color:#374151;display:block;margin-bottom:4px">ض.ق.م. المشتريات (14%) — محسوبة تلقائياً</label>
              <input id="vmPurchVat" class="input" type="number" min="0" step="0.01" placeholder="0.00" style="background:#eef1fb"/>
            </div>
            <div>
              <label style="font-size:12px;color:#374151;display:block;margin-bottom:4px">إشعارات دائنة مشتريات (ج.م)</label>
              <input id="vmPurchCredit" class="input" type="number" min="0" step="0.01" placeholder="0.00"/>
            </div>
          </div>
        </div>

        <!-- صافي مستحق -->
        <div id="vmNetPreview" style="background:#f8fafc;border-radius:10px;padding:12px;text-align:center;border:1px solid #e2e8f0">
          <div style="font-size:12px;color:#64748b">صافي الضريبة المستحقة</div>
          <div id="vmNetAmt" style="font-size:28px;font-weight:900;color:#1e293b;margin-top:4px">٠ ج.م</div>
        </div>

        <div>
          <label style="font-size:12px;color:#374151;display:block;margin-bottom:4px">ملاحظات (اختياري)</label>
          <input id="vmNotes" class="input" placeholder="مثال: أرقام من كشف البنك أو الدفاتر اليدوية"/>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="document.getElementById('vatManualModal').remove()" class="btn btn-secondary">إلغاء</button>
        <button onclick="window.tcVatBuildManual()" class="btn btn-primary">⚡ بناء الإقرار</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.vmCalcVat = function() {
  const salesTaxable = parseFloat(document.getElementById('vmSalesTaxable')?.value || 0);
  const purchTaxable = parseFloat(document.getElementById('vmPurchTaxable')?.value || 0);
  const salesVat  = Math.round(salesTaxable * 0.14 * 100) / 100;
  const purchVat  = Math.round(purchTaxable * 0.14 * 100) / 100;
  const salesCredit = parseFloat(document.getElementById('vmSalesCredit')?.value || 0);
  const purchCredit = parseFloat(document.getElementById('vmPurchCredit')?.value || 0);
  if (document.getElementById('vmSalesVat')) document.getElementById('vmSalesVat').value = salesVat || '';
  if (document.getElementById('vmPurchVat')) document.getElementById('vmPurchVat').value = purchVat || '';
  const net = (salesVat - salesCredit) - (purchVat - purchCredit);
  const netEl = document.getElementById('vmNetAmt');
  if (netEl) {
    netEl.textContent = money(Math.max(0, net));
    netEl.style.color = net > 0 ? '#dc2626' : '#15803d';
    document.getElementById('vmNetPreview').style.background = net > 0 ? '#fef2f2' : '#f0fdf4';
  }
};

window.tcVatBuildManual = async function() {
  const salesTaxable = parseFloat(document.getElementById('vmSalesTaxable')?.value || 0);
  const salesVat     = parseFloat(document.getElementById('vmSalesVat')?.value    || 0);
  const salesCredit  = parseFloat(document.getElementById('vmSalesCredit')?.value  || 0);
  const purchTaxable = parseFloat(document.getElementById('vmPurchTaxable')?.value || 0);
  const purchVat     = parseFloat(document.getElementById('vmPurchVat')?.value     || 0);
  const purchCredit  = parseFloat(document.getElementById('vmPurchCredit')?.value  || 0);
  const notes        = document.getElementById('vmNotes')?.value || 'إدخال يدوي';

  try {
    const r = await api('POST', '/api/tax-center/vat/build', {
      client_id: +_tcClientId, year: _tcYear, month: _tcMonth,
      force_rebuild: true,
      manual_output_vat: salesVat - salesCredit,
      manual_input_vat:  purchVat - purchCredit,
      manual_sales_taxable: salesTaxable,
      manual_purch_taxable: purchTaxable,
      manual_notes: notes,
    });
    document.getElementById('vatManualModal')?.remove();
    toast(`✅ تم بناء الإقرار يدوياً — صافي مستحق: ${money(r.net_vat_due||0)}`);
    await _tcVatLoadList();
  } catch(e) { toast(e.message, 'error'); }
};

window.tcVatBuild = async function() {
  const btn = event?.target;
  if (btn) { btn.disabled=true; btn.textContent='جاري البناء...'; }
  try {
    const r = await api('POST', `/api/tax-center/vat/build`, {
      client_id: +_tcClientId, year: _tcYear, month: _tcMonth,
      force_rebuild: true,
    });
    toast(`✅ تم بناء إقرار ${TC_MONTH_AR[_tcMonth]} ${_tcYear} — صافي مستحق: ${money(r.net_vat_due||0)}`);
    await _tcVatLoadList();
  } catch(e) {
    toast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.textContent=`⚡ بناء إقرار ${TC_MONTH_AR[_tcMonth]} ${_tcYear}`; }
  }
};

// ══════════════════════════════════════════════════════════════
// 📋 VAT WORKFLOW — صفحة مراجعة الإقرار الاحترافية
// ══════════════════════════════════════════════════════════════
window.tcVatWorkflow = async function(id) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" style="max-width:860px;max-height:95vh;overflow-y:auto;padding:0">
    <div style="padding:16px 20px;border-bottom:1px solid #e8edf3;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;z-index:10">
      <h2 style="font-size:16px;font-weight:800;color:#1e293b;margin:0">🧾 مراجعة إقرار ض.ق.م.</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#64748b">✕</button>
    </div>
    <div id="vatWfBody" style="padding:20px"><div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div></div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
  await _renderVatWorkflow(id);
};

async function _renderVatWorkflow(id) {
  const el = document.getElementById('vatWfBody');
  if (!el) return;
  try {
    const [ret, lines] = await Promise.all([
      api('GET', `/api/tax-center/vat/${id}/detail`),
      api('GET', `/api/tax-center/vat/${id}/lines`).catch(()=>[]),
    ]);
    const s = VAT_STATUS[ret.status] || VAT_STATUS.draft;
    const isAdmin = currentUser?.role === 'admin';

    // ── Step Indicator ─────────────────────────────────────
    const steps = [
      {key:'draft',     icon:'📝', label:'مسودة'},
      {key:'reviewed',  icon:'👀', label:'مراجعة'},
      {key:'approved',  icon:'✅', label:'اعتماد'},
      {key:'submitted', icon:'📤', label:'إرسال'},
      {key:'paid',      icon:'💚', label:'سداد'},
    ];
    const curStep = s.step || 0;
    const stepHtml = `
    <div style="display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:24px;flex-wrap:wrap">
      ${steps.map((st,i) => {
        const done = i < curStep;
        const active = i === curStep;
        const clr = done||active ? '#1a2472' : '#94a3b8';
        const bg = done ? '#1a2472' : active ? '#eef1fb' : '#f8fafc';
        const border = active ? '2px solid #1a2472' : done ? '2px solid #1a2472' : '2px solid #e2e8f0';
        return `<div style="display:flex;align-items:center">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 12px">
            <div style="width:36px;height:36px;border-radius:50%;background:${bg};border:${border};display:flex;align-items:center;justify-content:center;font-size:16px">${done?'✓':st.icon}</div>
            <div style="font-size:11px;font-weight:${active?'700':'500'};color:${clr}">${st.label}</div>
          </div>
          ${i<steps.length-1?`<div style="width:30px;height:2px;background:${done?'#1a2472':'#e2e8f0'};margin-bottom:18px"></div>`:''}
        </div>`;
      }).join('')}
    </div>`;

    // ── Numbers Summary ────────────────────────────────────
    const row = (lbl, val, color='#1e293b') =>
      `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9">
         <span style="color:#64748b;font-size:13px">${lbl}</span>
         <strong style="color:${color};font-size:13px">${val}</strong>
       </div>`;

    const srcBadge = (n, lbl) => n > 0
      ? `<span style="background:#eef1fb;color:#1a2472;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600">${lbl}: ${n} مستند</span>`
      : '';

    const numbersHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <!-- Output -->
      <div style="background:#f0fdf4;border-radius:14px;padding:16px;border:1.5px solid #86efac">
        <div style="font-weight:800;color:#15803d;font-size:14px;margin-bottom:12px">📤 ضريبة المخرجات (Output)</div>
        ${row('إجمالي المبيعات الخاضعة', money(ret.out_std_taxable||0))}
        ${row('ض.ق.م. على المبيعات', money(ret.out_std_vat||0), '#15803d')}
        ${ret.out_credit_vat ? row('إشعارات دائنة مبيعات', `(${money(ret.out_credit_vat)})`, '#d97706') : ''}
        ${ret.out_manual_adjustment ? row('تعديل يدوي', money(ret.out_manual_adjustment||0), '#7c3aed') : ''}
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #86efac;margin-top:4px">
          <strong style="color:#15803d">إجمالي ضريبة المخرجات</strong>
          <strong style="color:#15803d;font-size:16px">${money(ret.total_output_vat||0)}</strong>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          ${srcBadge(ret.eta_outgoing_doc_count, 'فواتير ETA')}
          ${!ret.eta_outgoing_doc_count && ret.out_std_vat > 0 ? srcBadge(lines?.filter(l=>l.line_type?.startsWith('output')).length||0, 'قيود محاسبية') : ''}
        </div>
      </div>
      <!-- Input -->
      <div style="background:#eef1fb;border-radius:14px;padding:16px;border:1.5px solid #c7d3ef">
        <div style="font-weight:800;color:#1a2472;font-size:14px;margin-bottom:12px">📥 ضريبة المدخلات (Input)</div>
        ${row('إجمالي المشتريات الخاضعة', money(ret.in_std_taxable||0))}
        ${row('ض.ق.م. على المشتريات', money(ret.in_std_vat||0), '#1a2472')}
        ${ret.in_capital_vat ? row('ض.ق.م. أصول رأسمالية', money(ret.in_capital_vat||0), '#1a2472') : ''}
        ${ret.in_credit_vat ? row('إشعارات دائنة مشتريات', `(${money(ret.in_credit_vat)})`, '#d97706') : ''}
        ${ret.in_manual_adjustment ? row('تعديل يدوي', money(ret.in_manual_adjustment||0), '#7c3aed') : ''}
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #c7d3ef;margin-top:4px">
          <strong style="color:#1a2472">إجمالي ضريبة المدخلات</strong>
          <strong style="color:#1a2472;font-size:16px">${money(ret.total_input_vat||0)}</strong>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          ${srcBadge(ret.eta_incoming_doc_count, 'فواتير ETA')}
        </div>
      </div>
    </div>

    <!-- Editable Adjustments: رصيد دائن + إجمالي مشتريات -->
    ${(ret.status === 'draft' || ret.status === 'reviewed') ? `
    <div style="background:#f8fafc;border-radius:14px;padding:16px;margin-bottom:20px;border:1.5px solid #e2e8f0">
      <div style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:12px">✏️ تعديلات يدوية على الإقرار</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:12px;font-weight:700;color:#1a2472;display:block;margin-bottom:4px">💳 رصيد دائن من فترة سابقة (ج.م)</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input id="vatCreditInput" type="number" min="0" step="0.01" class="input" style="flex:1;font-size:13px"
              placeholder="0.00" value="${ret.previous_period_credit||0}"
              oninput="document.getElementById('vatCreditSaveBtn').style.background='#1a2472';document.getElementById('vatCreditSaveBtn').disabled=false"/>
            <button id="vatCreditSaveBtn" onclick="window.vatSaveCredit(${id})" class="btn btn-primary" style="font-size:12px;padding:6px 10px;white-space:nowrap">💾 حفظ</button>
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:3px">لو الشركة عندها رصيد دائن من الشهر اللي فات</div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#1a2472;display:block;margin-bottom:4px">🛒 إجمالي المشتريات الخاضعة (ج.م)</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input id="vatPurchInput" type="number" min="0" step="0.01" class="input" style="flex:1;font-size:13px"
              placeholder="0.00" value="${ret.in_std_taxable||0}"
              oninput="document.getElementById('vatPurchSaveBtn').style.background='#1a2472';document.getElementById('vatPurchSaveBtn').disabled=false"/>
            <button id="vatPurchSaveBtn" onclick="window.vatSavePurch(${id})" class="btn btn-primary" style="font-size:12px;padding:6px 10px;white-space:nowrap">💾 حفظ</button>
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:3px">سيتم إعادة حساب ض.ق.م. تلقائياً (14%)</div>
        </div>
      </div>
    </div>` : ''}

    <!-- Net VAT Due -->
    <div style="background:${(ret.net_vat_due||0)>0?'#fef2f2':'#f0fdf4'};border-radius:16px;padding:20px;text-align:center;margin-bottom:20px;border:2px solid ${(ret.net_vat_due||0)>0?'#fca5a5':'#86efac'}">
      <div style="font-size:12px;color:#64748b;margin-bottom:6px">صافي الضريبة المستحقة</div>
      <div style="font-size:38px;font-weight:900;color:${(ret.net_vat_due||0)>0?'#dc2626':'#15803d'}">${money(ret.net_vat_due||0)}</div>
      ${ret.previous_period_credit > 0 ? `<div style="font-size:12px;color:#1a2472;margin-top:4px">رصيد دائن من الفترة السابقة: ${money(ret.previous_period_credit)}</div>` : ''}
      ${ret.carry_forward_amount > 0 ? `<div style="font-size:12px;color:#15803d;margin-top:4px">رصيد دائن ينتقل للفترة القادمة: ${money(ret.carry_forward_amount)}</div>` : ''}
      <div style="font-size:12px;color:#64748b;margin-top:6px">
        تاريخ الاستحقاق: <strong>${dateAr(ret.due_date)}</strong>
        ${ret.late_days > 0 ? `— <span style="color:#dc2626">⚠️ متأخر ${ret.late_days} يوم · غرامة: ${money(ret.penalty_amount||0)}</span>` : ' — <span style="color:#15803d">✓ في الموعد</span>'}
      </div>
    </div>`;

    // ── Source documents table ──────────────────────────────
    const linesHtml = lines?.length ? `
    <div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:800;color:#1e293b;margin-bottom:10px">📑 مصدر الأرقام — المستندات (${lines.length})</div>
      <div style="overflow-x:auto;max-height:220px;overflow-y:auto;border-radius:10px;border:1px solid #e8edf3">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#f8fafc;position:sticky;top:0">
            <tr><th style="padding:8px;text-align:right">النوع</th><th style="padding:8px;text-align:right">الطرف</th><th style="padding:8px;text-align:right">الرقم الضريبي</th><th style="padding:8px">الخاضع</th><th style="padding:8px">الضريبة</th><th style="padding:8px">الحالة</th></tr>
          </thead>
          <tbody>
            ${lines.slice(0,100).map(l => {
              const isOut = l.line_type?.startsWith('output');
              return `<tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:6px 8px;font-size:11px"><span style="background:${isOut?'#f0fdf4':'#eef1fb'};color:${isOut?'#15803d':'#1a2472'};padding:2px 6px;border-radius:8px">${isOut?'📤 مخرجات':'📥 مدخلات'}</span></td>
                <td style="padding:6px 8px;font-size:12px">${escH(l.counterparty_name||'—')}</td>
                <td style="padding:6px 8px;font-size:11px;font-family:monospace;color:#64748b">${escH(l.counterparty_tin||'—')}</td>
                <td style="padding:6px 8px;text-align:right">${money(l.taxable_amount||0)}</td>
                <td style="padding:6px 8px;text-align:right;font-weight:700;color:${isOut?'#15803d':'#1a2472'}">${money(l.vat_amount||0)}</td>
                <td style="padding:6px 8px">${l.is_excluded ? '<span style="color:#dc2626;font-size:11px">⛔ مستبعد</span>' : l.is_rejected ? '<span style="color:#d97706;font-size:11px">⚠️ مرفوض</span>' : '<span style="color:#15803d;font-size:11px">✓</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

    // ── Audit Trail ────────────────────────────────────────
    const auditHtml = ret.audit_trail?.length ? `
    <div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:800;color:#1e293b;margin-bottom:10px">📜 سجل المراجعة (Audit Log)</div>
      <div style="background:#f8fafc;border-radius:10px;padding:12px;border:1px solid #e8edf3">
        ${ret.audit_trail.map(log => {
          const actionMap = {
            created:'أنشأ الإقرار', status_changed:'غيّر الحالة', approved:'اعتمد الإقرار',
            submitted:'أرسل الإقرار', paid:'سجّل السداد', rebuilt:'أعاد بناء الإقرار',
          };
          const actionLabel = actionMap[log.action] || log.action;
          return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #e8edf3;last-child:border-0">
            <div style="width:32px;height:32px;border-radius:50%;background:#eef1fb;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">👤</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:700;color:#1e293b">${escH(log.actor||'النظام')} <span style="font-weight:400;color:#64748b">${actionLabel}</span></div>
              ${log.notes ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${escH(log.notes)}</div>` : ''}
              <div style="font-size:11px;color:#94a3b8;margin-top:2px">${log.created_at?.slice(0,16)?.replace('T',' ')}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

    // ── Action Buttons ─────────────────────────────────────
    const st = ret.status;
    let actionsHtml = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding-top:16px;border-top:2px solid #e8edf3">`;

    if (st === 'draft') {
      actionsHtml += `
        <span style="font-size:12px;color:#64748b;font-weight:600">الإقرار في مرحلة المسودة:</span>
        <button class="btn btn-secondary" onclick="tcVatSaveDraft(${id})" style="gap:6px">📝 حفظ كمسودة</button>
        <button class="btn btn-primary" onclick="tcVatSendReview(${id})" style="gap:6px">👀 إرسال للمراجعة</button>`;
    } else if (st === 'reviewed') {
      actionsHtml += `
        <span style="font-size:12px;color:#64748b;font-weight:600">الإقرار قيد المراجعة:</span>
        ${isAdmin ? `<button class="btn btn-success" onclick="tcVatApprove(${id})" style="gap:6px">✅ اعتماد الإقرار</button>` : `<span style="color:#d97706;font-size:12px">⏳ في انتظار اعتماد المدير</span>`}
        <button class="btn btn-secondary" onclick="tcVatBackDraft(${id})" style="gap:6px;font-size:12px">↩️ إعادة للمسودة</button>`;
    } else if (st === 'approved') {
      actionsHtml += `
        <span style="font-size:12px;color:#15803d;font-weight:600">✅ معتمد — جاهز للإرسال:</span>
        <button class="btn btn-primary" onclick="tcVatSubmitModal(${id})" style="gap:6px;background:#1a2472">📤 إرسال للبوابة الحكومية</button>
        <button class="btn btn-secondary" onclick="window.open('https://mytax.eta.gov.eg','_blank')" style="gap:6px">🌐 فتح mytax.eta.gov.eg</button>`;
    } else if (st === 'submitted') {
      actionsHtml += `
        <span style="font-size:12px;color:#1d4ed8;font-weight:600">📤 تم الإرسال — رقم المرجع: ${escH(ret.submission_ref||'—')}</span>
        <button class="btn btn-success" onclick="tcVatMarkPaid(${id})" style="gap:6px">💚 تسجيل السداد</button>`;
    } else if (st === 'paid') {
      actionsHtml += `<span style="font-size:13px;color:#065f46;font-weight:700">💚 تم السداد بتاريخ ${dateAr(ret.paid_at)}</span>`;
    }
    actionsHtml += `</div>`;

    el.innerHTML = stepHtml + numbersHtml + linesHtml + auditHtml + actionsHtml;

    // Store id for action functions
    el._vatId = id;

  } catch(e) {
    const isNotFound = e.message?.includes('404') || e.message?.toLowerCase().includes('not found');
    el.innerHTML = `<div style="padding:30px;text-align:center">
      <div style="font-size:36px;margin-bottom:12px">${isNotFound?'🗑️':'❌'}</div>
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:8px">${isNotFound?'الإقرار غير موجود':'خطأ في تحميل الإقرار'}</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:16px">${isNotFound?'ربما تم حذف هذا الإقرار أو لم يتم بناؤه بعد. اضغط "بناء إقرار" لإنشاء إقرار جديد.':escH(e.message)}</div>
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay')?.remove();tcVatBuild()">⚡ بناء إقرار جديد</button>
    </div>`;
  }
}

window.tcVatSaveDraft = async function(id) {
  toast('📝 الإقرار محفوظ كمسودة');
  await _tcVatLoadList();
};

window.tcVatSendReview = async function(id) {
  try {
    await api('POST', `/api/tax-center/vat/${id}/review`);
    toast('👀 تم إرسال الإقرار للمراجعة');
    await _renderVatWorkflow(id);
    await _tcVatLoadList();
  } catch(e) { toast(e.message, 'error'); }
};

window.tcVatApprove = async function(id) {
  if (!await confirmDlg('تأكيد اعتماد هذا الإقرار؟\nبعد الاعتماد يصبح جاهزاً للإرسال للبوابة الحكومية.')) return;
  try {
    // If still draft, review first
    const ret = await api('GET', `/api/tax-center/vat/${id}/detail`).catch(()=>null);
    if (ret?.status === 'draft') await api('POST', `/api/tax-center/vat/${id}/review`);
    await api('POST', `/api/tax-center/vat/${id}/approve`);
    toast('✅ تم اعتماد الإقرار — جاهز للإرسال للبوابة');
    await _renderVatWorkflow(id);
    await _tcVatLoadList();
  } catch(e) { toast(e.message, 'error'); }
};

window.tcVatBackDraft = async function(id) {
  if (!await confirmDlg('إعادة الإقرار للمسودة؟')) return;
  try {
    await api('PUT', `/api/tax-center/vat/${id}`, {status:'draft'});
    toast('↩️ أُعيد الإقرار للمسودة');
    await _renderVatWorkflow(id);
    await _tcVatLoadList();
  } catch(e) { toast(e.message, 'error'); }
};

window.tcVatSubmitModal = function(id) {
  const html = `
  <div class="modal-backdrop" id="vatSubmitModal">
    <div class="modal" style="max-width:460px">
      <div class="modal-header"><h3>📤 إرسال الإقرار للبوابة الحكومية</h3>
        <button onclick="document.getElementById('vatSubmitModal').remove()" class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div style="background:#fff7ed;border-radius:10px;padding:12px;font-size:13px;color:#92400e;border:1px solid #fed7aa">
          ⚠️ هذا الإجراء نهائي — يرجى التأكد من مراجعة كل الأرقام قبل الإرسال.
        </div>
        <div>
          <label class="label" style="font-weight:700;color:#1e293b">📎 رفع ملف الإقرار الضريبي (PDF) — مطلوب *</label>
          <div style="border:2px dashed #c7d3ef;border-radius:10px;padding:16px;text-align:center;background:#f8fafc;cursor:pointer;transition:all .2s"
               onclick="document.getElementById('vatPdfInput').click()"
               ondragover="event.preventDefault();this.style.background='#eef2ff';this.style.borderColor='#1a2472'"
               ondragleave="this.style.background='#f8fafc';this.style.borderColor='#c7d3ef'"
               ondrop="event.preventDefault();this.style.background='#f8fafc';this.style.borderColor='#c7d3ef';window.vatHandlePdfDrop(event)">
            <input id="vatPdfInput" type="file" accept=".pdf" style="display:none" onchange="window.vatHandlePdfSelect(this)"/>
            <div id="vatPdfPreview" style="color:#64748b;font-size:13px">
              <div style="font-size:28px;margin-bottom:6px">📄</div>
              <div style="font-weight:600;color:#374151">اسحب ملف PDF هنا أو اضغط للاختيار</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:4px">مثال: إقرار قيمة مضافة شركة بوكو لينك.pdf</div>
            </div>
          </div>
        </div>
        <div>
          <label class="label">رقم المرجع / رقم الإيصال من البوابة</label>
          <input id="vatSubmitRef" class="input" placeholder="مثال: ETA-2025-001234" />
        </div>
        <div>
          <label class="label">ملاحظات (اختياري)</label>
          <input id="vatSubmitNotes" class="input" placeholder="أي ملاحظات إضافية"/>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="document.getElementById('vatSubmitModal').remove()" class="btn btn-secondary">إلغاء</button>
        <button id="vatSubmitConfirmBtn" onclick="window.tcVatDoSubmit(${id})" class="btn btn-primary" style="background:#94a3b8;cursor:not-allowed" disabled title="يجب رفع ملف PDF أولاً">📎 ارفع PDF أولاً</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  window._vatPdfFile = null;
  window.vatHandlePdfSelect = function(inp) {
    const file = inp.files[0];
    if (!file) return;
    window._vatPdfFile = file;
    window._vatUpdatePdfPreview(file.name);
  };
  window.vatHandlePdfDrop = function(e) {
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.pdf')) { toast('يرجى اختيار ملف PDF فقط','error'); return; }
    window._vatPdfFile = file;
    window._vatUpdatePdfPreview(file.name);
  };
  window._vatUpdatePdfPreview = function(name) {
    document.getElementById('vatPdfPreview').innerHTML = `
      <div style="font-size:28px;margin-bottom:6px">✅</div>
      <div style="font-weight:700;color:#15803d;font-size:13px">تم اختيار الملف:</div>
      <div style="font-size:12px;color:#1e293b;margin-top:4px;word-break:break-all;font-weight:600">${escH(name)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px">اضغط مرة أخرى لتغيير الملف</div>`;
    const btn = document.getElementById('vatSubmitConfirmBtn');
    if (btn) { btn.disabled=false; btn.style.background='#1a2472'; btn.style.cursor='pointer'; btn.textContent='📤 اكتمل وإرسال'; }
  };
};

window.tcVatDoSubmit = async function(id) {
  const ref = document.getElementById('vatSubmitRef')?.value?.trim();
  if (!ref) { toast('أدخل رقم المرجع من البوابة', 'error'); return; }
  if (!window._vatPdfFile) { toast('يجب رفع ملف PDF أولاً', 'error'); return; }
  const btn = document.getElementById('vatSubmitConfirmBtn');
  if (btn) { btn.disabled=true; btn.textContent='⏳ جاري الرفع...'; }
  try {
    // Upload PDF first
    const fd = new FormData();
    fd.append('file', window._vatPdfFile);
    if (_tcClientId) fd.append('client_id', _tcClientId);
    fd.append('category', 'tax_return');
    fd.append('description', window._vatPdfFile.name);
    const token = localStorage.getItem('ms_token');
    const uploadRes = await fetch(API + '/api/documents/upload', {
      method:'POST', headers:{'Authorization':'Bearer '+token}, body:fd
    });
    if (!uploadRes.ok) { const err=await uploadRes.json(); const msg=Array.isArray(err.detail)?err.detail[0]?.msg:err.detail; throw new Error(msg||'فشل رفع الملف'); }
    // Submit VAT return
    await api('POST', `/api/tax-center/vat/${id}/submit`, {submission_ref: ref});
    document.getElementById('vatSubmitModal')?.remove();
    toast('📤 تم إرسال الإقرار ورفع PDF بنجاح — رقم المرجع: ' + ref);
    await _renderVatWorkflow(id);
    await _tcVatLoadList();
  } catch(e) {
    toast(e.message, 'error');
    if (btn) { btn.disabled=false; btn.style.background='#1a2472'; btn.textContent='📤 اكتمل وإرسال'; }
  }
};

window.tcVatMarkPaid = async function(id) {
  const ref = prompt('رقم إيصال السداد (اختياري):') || 'PAID';
  try {
    await api('POST', `/api/tax-center/vat/${id}/pay`, {payment_ref: ref, payment_amount: 0});
    toast('💚 تم تسجيل السداد');
    await _renderVatWorkflow(id);
    await _tcVatLoadList();
  } catch(e) { toast(e.message, 'error'); }
};

// legacy alias
window.tcVatView = window.tcVatWorkflow;

window.vatSaveCredit = async function(id) {
  const val = parseFloat(document.getElementById('vatCreditInput')?.value || 0);
  try {
    await api('PUT', `/api/tax-center/vat/${id}`, {previous_period_credit: val});
    toast('✅ تم حفظ الرصيد الدائن');
    await _renderVatWorkflow(id);
  } catch(e) { toast(e.message, 'error'); }
};

window.vatSavePurch = async function(id) {
  const val = parseFloat(document.getElementById('vatPurchInput')?.value || 0);
  try {
    await api('PUT', `/api/tax-center/vat/${id}`, {in_std_taxable: val});
    toast('✅ تم حفظ إجمالي المشتريات — الضريبة أُعيد حسابها');
    await _renderVatWorkflow(id);
  } catch(e) { toast(e.message, 'error'); }
};

// ── VAT EXCEL UPLOAD ─────────────────────────────────────────────────────────
window.tcVatExcelModal = function() {
  const curYear = _tcYear || new Date().getFullYear();
  const curMonth = _tcMonth || (new Date().getMonth() + 1);
  const monthOpts = Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===curMonth?'selected':''}>${TC_MONTH_AR[i+1]}</option>`).join('');
  const yearOpts = [curYear-1, curYear, curYear+1].map(y=>`<option value="${y}" ${y===curYear?'selected':''}>${y}</option>`).join('');

  const html = `
  <div class="modal-backdrop" id="vatExcelModal">
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <h3>📊 رفع ملف Excel مجمع — فواتير المبيعات والمشتريات</h3>
        <button onclick="document.getElementById('vatExcelModal').remove()" class="modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
        <div style="background:#f0fdf4;border-radius:10px;padding:12px;font-size:13px;color:#15803d;border:1px solid #86efac">
          💡 ارفع ملف Excel يحتوي على كافة فواتير المبيعات والمشتريات — الملف سيتم حفظه وتنظيمه تلقائياً حسب الشهر.
        </div>
        <!-- الشهر والسنة -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label class="label" style="font-weight:700">📅 الشهر</label>
            <select id="vatExcelMonth" class="input">${monthOpts}</select>
          </div>
          <div>
            <label class="label" style="font-weight:700">📅 السنة</label>
            <select id="vatExcelYear" class="input">${yearOpts}</select>
          </div>
        </div>
        <!-- نوع الملف -->
        <div>
          <label class="label" style="font-weight:700">📂 نوع الملف</label>
          <select id="vatExcelType" class="input">
            <option value="all">📊 مجمع (مبيعات + مشتريات)</option>
            <option value="sales">📤 فواتير مبيعات فقط</option>
            <option value="purchases">📥 فواتير مشتريات فقط</option>
          </select>
        </div>
        <!-- رفع الملف -->
        <div>
          <label class="label" style="font-weight:700">📎 اختر ملف Excel (.xlsx / .xls)</label>
          <div style="border:2px dashed #86efac;border-radius:10px;padding:16px;text-align:center;background:#f0fdf4;cursor:pointer;transition:all .2s"
               onclick="document.getElementById('vatExcelFileInput').click()"
               ondragover="event.preventDefault();this.style.borderColor='#15803d'"
               ondragleave="this.style.borderColor='#86efac'"
               ondrop="event.preventDefault();this.style.borderColor='#86efac';window._vatExcelHandleDrop(event)">
            <input id="vatExcelFileInput" type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="window._vatExcelHandleSelect(this)"/>
            <div id="vatExcelPreview">
              <div style="font-size:28px;margin-bottom:6px">📊</div>
              <div style="font-weight:600;color:#374151;font-size:13px">اسحب ملف Excel هنا أو اضغط للاختيار</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:4px">.xlsx, .xls, .csv</div>
            </div>
          </div>
        </div>
        <!-- قائمة الملفات المرفوعة لهذا العميل -->
        <div id="vatExcelExistingArea"></div>
      </div>
      <div class="modal-footer">
        <button onclick="document.getElementById('vatExcelModal').remove()" class="btn btn-secondary">إغلاق</button>
        <button id="vatExcelUploadBtn" class="btn btn-primary" style="background:#94a3b8;cursor:not-allowed" disabled onclick="window.tcVatExcelUpload()">📎 اختر ملف أولاً</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  window._vatExcelFile = null;

  window._vatExcelHandleSelect = function(inp) {
    const f = inp.files[0]; if (!f) return;
    window._vatExcelFile = f;
    window._vatExcelUpdatePreview(f.name, f.size);
  };
  window._vatExcelHandleDrop = function(e) {
    const f = e.dataTransfer.files[0]; if (!f) return;
    window._vatExcelFile = f;
    window._vatExcelUpdatePreview(f.name, f.size);
  };
  window._vatExcelUpdatePreview = function(name, size) {
    const kb = (size/1024).toFixed(1);
    document.getElementById('vatExcelPreview').innerHTML = `
      <div style="font-size:28px;margin-bottom:6px">✅</div>
      <div style="font-weight:700;color:#15803d;font-size:13px">تم اختيار الملف:</div>
      <div style="font-size:12px;color:#1e293b;font-weight:600;margin-top:4px;word-break:break-all">${escH(name)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">${kb} KB — اضغط لتغيير الملف</div>`;
    const btn = document.getElementById('vatExcelUploadBtn');
    if (btn) { btn.disabled=false; btn.style.background='#15803d'; btn.style.cursor='pointer'; btn.textContent='📊 رفع الملف'; }
  };

  // Load existing excel files for this client
  window._vatExcelLoadExisting();
};

window._vatExcelLoadExisting = async function() {
  const area = document.getElementById('vatExcelExistingArea');
  if (!area || !_tcClientId) return;
  try {
    const res = await api('GET', `/api/documents?client_id=${_tcClientId}&category=TAX&page_size=50`);
    const excelFiles = (res.items||[]).filter(d => d.name?.includes('فواتير') || d.tags?.includes('vat_invoices') || ['.xlsx','.xls','.csv'].some(e => d.name?.endsWith(e)));
    if (!excelFiles.length) return;
    area.innerHTML = `
      <div>
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px">📁 ملفات Excel المرفوعة سابقاً</div>
        <div style="max-height:160px;overflow-y:auto;border-radius:8px;border:1px solid #e2e8f0">
          ${excelFiles.map(d=>`
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px">
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
              <span style="font-size:16px">📊</span>
              <div style="min-width:0">
                <div style="font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(d.name)}</div>
                <div style="color:#64748b;font-size:11px">${d.year?TC_MONTH_AR[d.month]+' '+d.year:''} — ${d.uploaded_by||''} — ${d.created_at?.slice(0,10)||''}</div>
              </div>
            </div>
          </div>`).join('')}
        </div>
      </div>`;
  } catch(e) {}
};

window.tcVatExcelUpload = async function() {
  if (!window._vatExcelFile) { toast('اختر ملف أولاً', 'error'); return; }
  const month = parseInt(document.getElementById('vatExcelMonth')?.value);
  const year  = parseInt(document.getElementById('vatExcelYear')?.value);
  const type  = document.getElementById('vatExcelType')?.value || 'all';
  const typeLabel = type==='sales'?'مبيعات':type==='purchases'?'مشتريات':'مبيعات ومشتريات';
  const btn = document.getElementById('vatExcelUploadBtn');
  if (btn) { btn.disabled=true; btn.textContent='⏳ جاري الرفع...'; }
  try {
    const fd = new FormData();
    fd.append('file', window._vatExcelFile);
    if (_tcClientId) fd.append('client_id', _tcClientId);
    fd.append('category', 'tax_return');
    fd.append('description', `فواتير ${typeLabel} — ${TC_MONTH_AR[month]} ${year} — ${escH(_tcClientName||'')}`);
    fd.append('tags', `vat_invoices,${type},${year},${month}`);
    fd.append('year', year);
    fd.append('month', month);
    const token = localStorage.getItem('ms_token');
    const res = await fetch(API + '/api/documents/upload', {
      method:'POST', headers:{'Authorization':'Bearer '+token}, body:fd
    });
    if (!res.ok) { const err=await res.json(); const msg=Array.isArray(err.detail)?err.detail[0]?.msg:err.detail; throw new Error(msg||'فشل الرفع'); }
    toast(`✅ تم رفع ملف فواتير ${TC_MONTH_AR[month]} ${year} بنجاح`);
    document.getElementById('vatExcelModal')?.remove();
  } catch(e) {
    toast(e.message, 'error');
    if (btn) { btn.disabled=false; btn.style.background='#15803d'; btn.textContent='📊 رفع الملف'; }
  }
};

// ── WITHHOLDING ─────────────────────────────────────────────────────────────
async function _tcRenderWht(el) {
  if (!_tcClientId) { el.innerHTML = _tcNeedClient(); return; }

  el.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div style="font-size:15px;font-weight:700;color:#1e293b">✂️ أسس توحيد المرتبات — ${escH(_tcClientName)}</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary" onclick="tcWhtAddEntry()">+ قيد جديد</button>
      <button class="btn btn-primary" onclick="tcWhtBuildReturn()">🏗️ بناء الإقرار الشهري</button>
    </div>
  </div>
  <div id="tcWhtArea"><div style="display:flex;justify-content:center;padding:40px"><div class="spinner"></div></div></div>`;

  await _tcWhtLoad();
}

async function _tcWhtLoad() {
  const el = document.getElementById('tcWhtArea');
  if (!el) return;
  try {
    const [entries, returns, types] = await Promise.all([
      api('GET', `/api/tax-center/withholding/entries?client_id=${_tcClientId}&year=${_tcYear}&month=${_tcMonth}`),
      api('GET', `/api/tax-center/withholding/returns?client_id=${_tcClientId}&year=${_tcYear}`),
      api('GET', '/api/tax-center/withholding/types'),
    ]);
    window._tcWhtTypes = types?.items || types || [];
    const eRows = (entries?.items || entries || []);
    const rRows = (returns?.items || returns || []);

    el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px">قيود ${TC_MONTH_AR[_tcMonth]} ${_tcYear} (${eRows.length})</div>
        <div class="card" style="overflow:hidden">
          <table style="font-size:12px">
            <thead><tr><th>نوع الخدمة</th><th>المستفيد</th><th>المبلغ</th><th>ض.خ.</th><th>%</th></tr></thead>
            <tbody>
              ${!eRows.length ? `<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8">لا قيود — اضغط "+ قيد جديد"</td></tr>` :
                eRows.map(e=>`<tr>
                  <td style="padding:5px 8px">${escH(e.transaction_type||'')}</td>
                  <td style="padding:5px 8px">${escH(e.payee_name||'')}</td>
                  <td style="padding:5px 8px;text-align:left">${money(e.gross_amount||0)}</td>
                  <td style="padding:5px 8px;text-align:left;font-weight:700;color:#7c3aed">${money(e.withholding_amount||0)}</td>
                  <td style="padding:5px 8px">${e.rate||0}%</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px">إقرارات شهرية ${_tcYear}</div>
        <div class="card" style="overflow:hidden">
          <table style="font-size:12px">
            <thead><tr><th>الشهر</th><th>إجمالي</th><th>ضريبة</th><th>الاستحقاق</th><th>الحالة</th></tr></thead>
            <tbody>
              ${!rRows.length ? `<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8">لا إقرارات — ابدأ بإضافة قيود</td></tr>` :
                rRows.map(r=>`<tr>
                  <td style="padding:5px 8px;font-weight:600">${TC_MONTH_AR[r.period_month]||r.period_month}</td>
                  <td style="padding:5px 8px;text-align:left">${money(r.total_gross||0)}</td>
                  <td style="padding:5px 8px;text-align:left;font-weight:700;color:#7c3aed">${money(r.total_withholding||0)}</td>
                  <td style="padding:5px 8px;font-size:11px">${dateAr(r.due_date)}</td>
                  <td style="padding:5px 8px"><span class="badge ${r.status==='submitted'?'badge-green':'badge-yellow'}" style="font-size:10px">${r.status||'draft'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:16px">❌ ${escH(e.message)}</div>`;
  }
}

window.tcWhtAddEntry = async function() {
  const types = window._tcWhtTypes || [];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" style="max-width:500px">
    <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:16px;font-weight:700;margin:0">✂️ قيد أسس توحيد المرتبات جديد</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="padding:20px;display:grid;gap:12px">
      <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">نوع الخدمة / المعاملة *</label>
        <select id="whtType" class="input" onchange="whtCalc()">
          <option value="">— اختر —</option>
          ${types.map(t=>`<option value="${t.code}">${escH(t.name_ar||t.code)}</option>`).join('')}
        </select></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">نوع المستفيد</label>
          <select id="whtPayeeType" class="input" onchange="whtCalc()">
            <option value="company">شركة (0.5%)</option>
            <option value="individual">فرد</option>
            <option value="foreign">أجنبي (20%)</option>
          </select></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">اسم المستفيد</label>
          <input id="whtPayeeName" class="input" placeholder="اسم المستفيد"/></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">المبلغ الإجمالي (ج.م.) *</label>
          <input id="whtGross" class="input" type="number" placeholder="0" oninput="whtCalc()"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">تاريخ المعاملة</label>
          <input id="whtDate" class="input" type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
      </div>
      <div id="whtCalcResult" style="background:#f8fafc;border-radius:8px;padding:12px;font-size:13px;color:#64748b;text-align:center">أدخل المبلغ لحساب الضريبة تلقائياً</div>
      <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">ملاحظات</label>
        <input id="whtNotes" class="input" placeholder="وصف اختياري"/></div>
    </div>
    <div style="padding:12px 20px;border-top:1px solid #f1f5f9;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="whtSaveBtn" class="btn btn-primary">💾 حفظ القيد</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };

  window.whtCalc = function() {
    const gross = parseFloat(document.getElementById('whtGross')?.value)||0;
    const typeCode = document.getElementById('whtType')?.value;
    const payeeType = document.getElementById('whtPayeeType')?.value || 'company';
    const el = document.getElementById('whtCalcResult');
    if (!el || !typeCode || !gross) return;
    const t = types.find(x=>x.code===typeCode);
    const rate = payeeType==='company'?(t?.rate_company||0):payeeType==='individual'?(t?.rate_individual||0):(t?.rate_foreign||20);
    const wht = gross < 300 ? 0 : Math.round(gross * rate / 100 * 100)/100;
    const net = gross - wht;
    el.style.background = wht>0?'#fef9c3':'#f0fdf4';
    el.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
      <div><div style="font-weight:800;color:#1e293b">${money(gross)}</div><div style="font-size:11px;color:#64748b">إجمالي</div></div>
      <div><div style="font-weight:800;color:#7c3aed">${money(wht)}</div><div style="font-size:11px;color:#64748b">ضريبة (${rate}%)</div></div>
      <div><div style="font-weight:800;color:#15803d">${money(net)}</div><div style="font-size:11px;color:#64748b">صافي للمستفيد</div></div>
    </div>${gross<300?'<div style="margin-top:6px;font-size:11px;color:#94a3b8">المبلغ أقل من حد التطبيق (300 ج.م.)</div>':''}`;
    window._whtCurrent = {rate, wht, net};
  };

  document.getElementById('whtSaveBtn').onclick = async() => {
    const btn = document.getElementById('whtSaveBtn');
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    const gross = parseFloat(document.getElementById('whtGross')?.value)||0;
    const txType = document.getElementById('whtType')?.value;
    if (!txType || !gross) { toast('أدخل نوع المعاملة والمبلغ','error'); btn.disabled=false; return; }
    try {
      await api('POST', `/api/tax-center/withholding/entries`, {
        client_id: +_tcClientId,
        transaction_type: txType,
        payee_type: document.getElementById('whtPayeeType')?.value,
        payee_name: document.getElementById('whtPayeeName')?.value,
        gross_amount: gross,
        transaction_date: document.getElementById('whtDate')?.value,
        period_year: _tcYear, period_month: _tcMonth,
        notes: document.getElementById('whtNotes')?.value,
      });
      toast('✅ تم حفظ قيد الخصم والإضافة');
      overlay.remove();
      await _tcWhtLoad();
    } catch(e) { toast(e.message,'error'); btn.disabled=false; btn.textContent='💾 حفظ القيد'; }
  };
};

window.tcWhtBuildReturn = async function() {
  try {
    const r = await api('POST', `/api/tax-center/withholding/returns/build?client_id=${_tcClientId}&year=${_tcYear}&month=${_tcMonth}`);
    toast(`✅ تم بناء إقرار ${TC_MONTH_AR[_tcMonth]} — إجمالي ضريبة: ${money(r.total_withholding||0)}`);
    await _tcWhtLoad();
  } catch(e) { toast(e.message,'error'); }
};

// ── CORPORATE TAX ───────────────────────────────────────────────────────────
async function _tcRenderCorporate(el) {
  if (!_tcClientId) { el.innerHTML = _tcNeedClient(); return; }
  let est = null;
  try { est = await api('GET', `/api/tax-center/corporate/${_tcClientId}/${_tcYear}`); } catch(e) {}

  const f = (id, label, val=0, hint='') => `
    <div>
      <label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:3px">${label}${hint?`<span style="color:#94a3b8;font-weight:400"> (${hint})</span>`:''}</label>
      <input id="corp_${id}" class="input" type="number" value="${val||0}" style="font-size:13px"/>
    </div>`;

  el.innerHTML = `
  <div style="max-width:900px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="font-size:15px;font-weight:700;color:#1e293b">🏢 تقدير ضريبة الدخل — ${escH(_tcClientName)} — ${_tcYear}</div>
      <button class="btn btn-primary" onclick="tcCorpSave()">💾 حساب وحفظ</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <!-- Revenues -->
      <div class="card" style="padding:16px">
        <div style="font-size:13px;font-weight:700;color:#15803d;margin-bottom:12px">📈 الإيرادات</div>
        <div style="display:grid;gap:8px">
          ${f('revenue_domestic_taxable','إيرادات محلية خاضعة',est?.revenue_domestic_taxable)}
          ${f('revenue_domestic_exempt','إيرادات محلية معفاة',est?.revenue_domestic_exempt)}
          ${f('revenue_export','إيرادات تصدير',est?.revenue_export)}
          ${f('revenue_other','إيرادات أخرى',est?.revenue_other)}
          ${f('cogs','تكلفة البضاعة المباعة',est?.cogs)}
        </div>
      </div>
      <!-- Expenses -->
      <div class="card" style="padding:16px">
        <div style="font-size:13px;font-weight:700;color:#1a2472;margin-bottom:12px">📉 المصروفات القابلة للخصم</div>
        <div style="display:grid;gap:8px">
          ${f('exp_salaries','مرتبات وأجور',est?.exp_salaries)}
          ${f('exp_social_insurance','تأمينات اجتماعية',est?.exp_social_insurance)}
          ${f('exp_rent','إيجارات',est?.exp_rent)}
          ${f('exp_utilities','مرافق وخدمات',est?.exp_utilities)}
          ${f('exp_depreciation_accounting','إهلاك محاسبي',est?.exp_depreciation_accounting)}
          ${f('exp_depreciation_tax','إهلاك ضريبي',est?.exp_depreciation_tax,'م.25 ق.91')}
          ${f('exp_advertising','إعلانات وتسويق',est?.exp_advertising)}
          ${f('exp_other_deductible','مصروفات أخرى مقبولة',est?.exp_other_deductible)}
        </div>
      </div>
      <!-- Non-deductible -->
      <div class="card" style="padding:16px">
        <div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:12px">🚫 المصروفات غير مقبولة ضريبياً</div>
        <div style="display:grid;gap:8px">
          ${f('nd_entertainment','استضافة وترفيه (50% غير مقبول)',est?.nd_entertainment)}
          ${f('nd_fines_penalties','غرامات وعقوبات',est?.nd_fines_penalties)}
          ${f('nd_donations_non_approved','تبرعات غير معتمدة',est?.nd_donations_non_approved)}
          ${f('nd_other','أخرى غير مقبولة',est?.nd_other)}
        </div>
      </div>
      <!-- Other -->
      <div class="card" style="padding:16px">
        <div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:12px">🔧 تسويات أخرى</div>
        <div style="display:grid;gap:8px">
          ${f('exempt_dividends','أرباح موزعة معفاة',est?.exempt_dividends)}
          ${f('exempt_other','إعفاءات أخرى',est?.exempt_other)}
          ${f('prior_year_losses','خسائر سنوات سابقة',est?.prior_year_losses,'تُرحَّل 5 سنوات')}
          ${f('withholding_credited','خصم وإضافة محتسب',est?.withholding_credited)}
          ${f('advance_payments_made','دفعات مقدمة',est?.advance_payments_made)}
        </div>
      </div>
    </div>

    ${est ? `
    <div style="background:#f8fafc;border:2px solid #e8edf3;border-radius:12px;padding:20px;margin-top:16px">
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:14px">📊 نتائج الحساب</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;font-size:13px">
        ${[
          ['الربح المحاسبي', est.accounting_profit, '#374151'],
          ['الدخل الخاضع', est.taxable_income, '#1a2472'],
          ['إجمالي الضريبة (22.5%)', est.gross_tax, '#dc2626'],
          ['صافي الضريبة المستحقة', est.final_tax_due, '#dc2626'],
          ['ضريبة مؤجلة صافية', est.deferred_tax_net, '#7c3aed'],
        ].map(([l,v,c])=>`<div style="background:white;border-radius:8px;padding:12px;border:1px solid #e8edf3">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">${l}</div>
          <div style="font-size:17px;font-weight:800;color:${c}">${money(v||0)}</div>
        </div>`).join('')}
      </div>
      <div style="margin-top:14px">
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px">📅 الدفعات المقدمة الربعية</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          ${[['Q1','15 أبريل',est.q1_tax_amount],['Q2','15 يوليو',est.q2_tax_amount],['Q3','15 أكتوبر',est.q3_tax_amount],['Q4','15 يناير',est.q4_tax_amount]].map(([q,d,v])=>`
          <div style="background:white;border-radius:8px;padding:10px;border:1px solid #e8edf3;text-align:center">
            <div style="font-size:12px;font-weight:700;color:#1a2472">${q}</div>
            <div style="font-size:15px;font-weight:800;color:#dc2626;margin:4px 0">${money(v||0)}</div>
            <div style="font-size:10px;color:#94a3b8">${d}</div>
          </div>`).join('')}
        </div>
        <div style="font-size:12px;color:#64748b;margin-top:8px">📋 موعد الإقرار السنوي: 30 أبريل ${_tcYear+1} — التقديم عبر <a href="https://mytax.eta.gov.eg" target="_blank" style="color:#1a2472">mytax.eta.gov.eg</a></div>
      </div>
    </div>` : ''}
  </div>`;
}

window.tcCorpSave = async function() {
  const btn = event?.target;
  if (btn) { btn.disabled=true; btn.textContent='جاري الحساب...'; }
  const fields = ['revenue_domestic_taxable','revenue_domestic_exempt','revenue_export','revenue_other','cogs',
    'exp_salaries','exp_social_insurance','exp_rent','exp_utilities','exp_depreciation_accounting',
    'exp_depreciation_tax','exp_advertising','exp_other_deductible',
    'nd_entertainment','nd_fines_penalties','nd_donations_non_approved','nd_other',
    'exempt_dividends','exempt_other','prior_year_losses','withholding_credited','advance_payments_made'];
  const body = {};
  fields.forEach(f => body[f] = parseFloat(document.getElementById('corp_'+f)?.value)||0);
  try {
    await api('PUT', `/api/tax-center/corporate/${_tcClientId}/${_tcYear}`, body);
    toast('✅ تم حساب وحفظ تقدير ضريبة الدخل');
    await _tcRenderCorporate(document.getElementById('taxTabContent'));
  } catch(e) {
    toast(e.message,'error');
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='💾 حساب وحفظ'; }
  }
};

// ── SALARY TAX ──────────────────────────────────────────────────────────────
async function _tcRenderSalary(el) {
  if (!_tcClientId) { el.innerHTML = _tcNeedClient(); return; }

  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:30px"><div class="spinner"></div></div>`;

  let emps = [];
  try { emps = await api('GET', `/api/payroll/employees?client_id=${_tcClientId}`); } catch(e) {}

  // ── حساب الإجماليات ─────────────────────────────
  const totals = emps.reduce((acc, e) => {
    acc.gross       += (e.gross       || 0);
    acc.variable    += (e.variable    || 0);
    acc.ins_emp     += (e.ins_emp     || 0);
    acc.ins_comp    += (e.ins_comp    || 0);
    acc.monthly_tax += (e.monthly_tax || 0);
    acc.net         += (e.net         || 0);
    return acc;
  }, {gross:0, variable:0, ins_emp:0, ins_comp:0, monthly_tax:0, net:0});

  const totalRequired = totals.net + totals.ins_emp + totals.ins_comp + totals.monthly_tax;

  el.innerHTML = `
  <div>
    <!-- فورم الإضافة السريعة -->
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:#1a2472;margin-bottom:12px">➕ إضافة موظف جديد</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:10px">
        <div><label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:3px">الاسم *</label>
          <input id="srEmpName" class="input" style="font-size:12px" placeholder="اسم الموظف"/></div>
        <div><label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:3px">الرقم القومي</label>
          <input id="srEmpNID" class="input" style="font-size:12px" placeholder="14 رقم"/></div>
        <div><label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:3px">رقم التأمين</label>
          <input id="srEmpIns" class="input" style="font-size:12px" placeholder="رقم التأمين"/></div>
        <div><label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:3px">تاريخ الاشتراك</label>
          <input id="srEmpInsDate" class="input" type="date" style="font-size:12px"/></div>
        <div><label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:3px">الراتب الأساسي *</label>
          <input id="srEmpBase" class="input" type="number" min="0" style="font-size:12px" placeholder="0"/></div>
        <div><label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:3px">متغيرات / حوافز</label>
          <input id="srEmpVar" class="input" type="number" min="0" style="font-size:12px" placeholder="0"/></div>
        <div><label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:3px">بدلات معفاة</label>
          <input id="srEmpAllow" class="input" type="number" min="0" style="font-size:12px" placeholder="0"/></div>
      </div>
      <button class="btn btn-primary btn-sm" id="srSaveEmpBtn">💾 حفظ وإضافة</button>
    </div>

    <!-- جدول الموظفين -->
    <div class="card" style="overflow:auto;margin-bottom:16px">
      <table style="width:100%;border-collapse:collapse;min-width:900px">
        <thead>
          <tr style="background:#1a2472;color:white;font-size:11px">
            <th style="padding:8px 10px;text-align:right">الاسم</th>
            <th style="padding:8px 10px;text-align:right">الرقم القومي</th>
            <th style="padding:8px 10px;text-align:right">رقم التأمين</th>
            <th style="padding:8px 10px;text-align:right">تاريخ الاشتراك</th>
            <th style="padding:8px 10px;text-align:left">راتب أساسي</th>
            <th style="padding:8px 10px;text-align:left">متغيرات</th>
            <th style="padding:8px 10px;text-align:left">بدلات</th>
            <th style="padding:8px 10px;text-align:left">ضريبة موظف</th>
            <th style="padding:8px 10px;text-align:left">تأمين موظف</th>
            <th style="padding:8px 10px;text-align:left">تأمين شركة</th>
            <th style="padding:8px 10px;text-align:left">صافي الراتب</th>
            <th style="padding:8px 4px"></th>
          </tr>
        </thead>
        <tbody id="srEmpTableBody">
          ${!emps.length
            ? `<tr><td colspan="12" style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">لا يوجد موظفون — أضف أول موظف بالفورم أعلاه</td></tr>`
            : emps.map((e,i) => `<tr style="background:${i%2?'#f8fafc':'white'};font-size:12px;border-bottom:1px solid #f1f5f9">
                <td style="padding:8px 10px;font-weight:600">${escH(e.name)}</td>
                <td style="padding:8px 10px;color:#64748b;direction:ltr">${e.national_id||'—'}</td>
                <td style="padding:8px 10px;color:#64748b">${e.insurance_number||'—'}</td>
                <td style="padding:8px 10px;color:#64748b">${e.insurance_start_date?dateAr(e.insurance_start_date):'—'}</td>
                <td style="padding:8px 10px;font-weight:600;color:#1e293b">${money(e.base_salary)}</td>
                <td style="padding:8px 10px;color:#7c3aed">${money(e.variable||0)}</td>
                <td style="padding:8px 10px;color:#64748b">${money(e.allowances||0)}</td>
                <td style="padding:8px 10px;color:#dc2626;font-weight:600">${money(e.monthly_tax||0)}</td>
                <td style="padding:8px 10px;color:#7c3aed">${money(e.ins_emp||0)}</td>
                <td style="padding:8px 10px;color:#5b8ec4">${money(e.ins_comp||0)}</td>
                <td style="padding:8px 10px;color:#16a34a;font-weight:700">${money(e.net||0)}</td>
                <td style="padding:4px 6px">
                  <button onclick="window._srDeleteEmp(${e.id})" style="background:#fee2e2;border:none;color:#dc2626;padding:3px 7px;border-radius:5px;cursor:pointer;font-size:11px">🗑</button>
                </td>
              </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- إجماليات / ملخص الالتزامات -->
    <div class="card" style="padding:16px;background:#eef1fb">
      <div style="font-size:13px;font-weight:700;color:#1a2472;margin-bottom:12px">📊 ملخص الالتزامات الشهرية</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
        ${[
          ['إجمالي الرواتب',  totals.gross,       '#1e293b', '#f8fafc'],
          ['إجمالي المتغيرات', totals.variable,    '#7c3aed', '#faf5ff'],
          ['ضرائب الموظفين',  totals.monthly_tax, '#dc2626', '#fff5f5'],
          ['التزامات الموظفين (تأمين)', totals.ins_emp,  '#7c3aed', '#faf5ff'],
          ['التزامات الشركة (تأمين)',   totals.ins_comp, '#5b8ec4', '#eff6ff'],
          ['صافي المدفوع للموظفين',     totals.net,      '#16a34a', '#f0fdf4'],
        ].map(([l,v,c,bg])=>`
        <div style="background:${bg};border-radius:10px;padding:12px;text-align:center;border:1px solid #e8edf3">
          <div style="font-size:16px;font-weight:800;color:${c}">${money(v)}</div>
          <div style="font-size:10px;color:#64748b;margin-top:3px">${l}</div>
        </div>`).join('')}
        <div style="background:#fefce8;border-radius:10px;padding:12px;text-align:center;border:2px solid #fde047">
          <div style="font-size:18px;font-weight:800;color:#d97706">${money(totalRequired)}</div>
          <div style="font-size:10px;color:#92400e;margin-top:3px;font-weight:600">💰 المبلغ المطلوب الإجمالي</div>
        </div>
      </div>
      <div style="margin-top:10px;font-size:11px;color:#64748b">
        المبلغ المطلوب = صافي المدفوع + تأمينات موظفين + تأمينات شركة + ضرائب دخل
      </div>
    </div>

    <!-- شرائح الضريبة مرجع -->
    <details style="margin-top:12px">
      <summary style="font-size:12px;font-weight:600;color:#1a2472;cursor:pointer;padding:8px;background:#eef1fb;border-radius:8px">📋 شرائح ضريبة المرتبات (تعديل يوليو 2023)</summary>
      <div style="background:#eef1fb;border-radius:0 0 8px 8px;padding:10px;font-size:12px">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#1a2472;color:white"><th style="padding:6px;text-align:right">الشريحة السنوية</th><th style="padding:6px">النسبة</th></tr></thead>
          <tbody>${[['0 – 40,000','0%'],['40,001 – 55,000','10%'],['55,001 – 75,000','15%'],['75,001 – 95,000','20%'],['95,001 – 195,000','22.5%'],['195,001 – 400,000','25%'],['أكثر من 400,000','27.5%']].map(([r,p],i)=>`<tr style="background:${i%2?'#f8fafc':'white'}"><td style="padding:5px 8px">${r}</td><td style="padding:5px 8px;text-align:center;font-weight:700;color:#1a2472">${p}</td></tr>`).join('')}</tbody>
        </table>
        <div style="margin-top:6px;color:#64748b">الإعفاء الشخصي: 20,000 ج.م./سنة | تأمينات الموظف: 11% | تأمينات الشركة: 18.75%</div>
      </div>
    </details>
  </div>`;

  // Save employee handler
  document.getElementById('srSaveEmpBtn').onclick = async () => {
    const name = document.getElementById('srEmpName').value.trim();
    const base = parseFloat(document.getElementById('srEmpBase').value) || 0;
    if (!name) { toast('اسم الموظف مطلوب', 'error'); return; }
    if (!base)  { toast('الراتب الأساسي مطلوب', 'error'); return; }
    const btn = document.getElementById('srSaveEmpBtn');
    btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
    try {
      await api('POST', '/api/payroll/employees', {
        client_id:            _tcClientId,
        name,
        national_id:          document.getElementById('srEmpNID').value.trim() || null,
        insurance_number:     document.getElementById('srEmpIns').value.trim() || null,
        insurance_start_date: document.getElementById('srEmpInsDate').value || null,
        base_salary:          base,
        variable_pay:         parseFloat(document.getElementById('srEmpVar').value)   || 0,
        allowances:           parseFloat(document.getElementById('srEmpAllow').value) || 0,
      });
      toast('تم إضافة الموظف');
      // Clear fields
      ['srEmpName','srEmpNID','srEmpIns','srEmpInsDate','srEmpBase','srEmpVar','srEmpAllow']
        .forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
      // Refresh
      const tcContent = document.getElementById('taxTabContent');
      if (tcContent) await _tcRenderSalary(tcContent);
    } catch(e) { toast(e.message,'error'); }
    finally { const b=document.getElementById('srSaveEmpBtn'); if(b){b.disabled=false;b.textContent='💾 حفظ وإضافة';} }
  };
}

window._srDeleteEmp = async (empId) => {
  if (!confirm('حذف هذا الموظف من سجل ضريبة المرتبات؟')) return;
  try {
    await api('DELETE', `/api/payroll/employees/${empId}`);
    toast('تم الحذف');
    const tcContent = document.getElementById('taxTabContent');
    if (tcContent) await _tcRenderSalary(tcContent);
  } catch(e) { toast(e.message,'error'); }
};

window.tcSalCalc = function() {
  const base = parseFloat(document.getElementById('salBase')?.value)||0;
  const varPay = parseFloat(document.getElementById('salVar')?.value)||0;
  const allow = parseFloat(document.getElementById('salAllow')?.value)||0;
  const gross = base + varPay;
  const insBase = Math.min(Math.max(base, 2500), 9400);
  const insEmp = Math.round(insBase * 0.11 * 100)/100;
  const taxable = Math.max(0, gross - allow - insEmp - 1666.67);
  const annualTax = _calcProgressiveTax(taxable * 12);
  const monthlyTax = Math.round(annualTax / 12 * 100)/100;
  const net = Math.round((gross - insEmp - monthlyTax) * 100)/100;

  const el = document.getElementById('salResult');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `<div class="card" style="padding:16px">
    <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:10px">نتيجة الحساب الأولي</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:13px">
      ${[['راتب إجمالي',money(gross),'#1e293b'],['تأمينات موظف (11%)',money(insEmp),'#7c3aed'],['ضريبة شهرية',money(monthlyTax),'#dc2626'],['صافي الراتب',money(net),'#15803d']].map(([l,v,c])=>`
      <div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;border:1px solid #e8edf3">
        <div style="font-size:16px;font-weight:800;color:${c}">${v}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px">${l}</div>
      </div>`).join('')}
    </div>
  </div>`;
};

function _calcProgressiveTax(annualTaxable) {
  const exempt = 20000;
  let taxable = Math.max(0, annualTaxable - exempt);
  const brackets = [[40000,0],[15000,10],[20000,15],[20000,20],[100000,22.5],[205000,25]];
  let tax = 0;
  for (const [size, rate] of brackets) {
    if (taxable <= 0) break;
    const portion = Math.min(taxable, size);
    tax += Math.round(portion * rate / 100 * 100)/100;
    taxable -= portion;
  }
  if (taxable > 0) tax += Math.round(taxable * 27.5 / 100 * 100)/100;
  return tax;
}

window.tcSalCalcServer = async function() {
  const base = parseFloat(document.getElementById('salBase')?.value)||0;
  if (!base) { toast('أدخل الراتب الأساسي','error'); return; }
  const varPay = parseFloat(document.getElementById('salVar')?.value)||0;
  const allow = parseFloat(document.getElementById('salAllow')?.value)||0;
  if (!_tcClientId) { tcSalCalc(); return; }
  try {
    const r = await api('POST', `/api/tax-center/salary/calculate`, {
      gross_monthly: base, variable_pay: varPay, allowances: allow,
    });
    const el = document.getElementById('salResult');
    el.style.display = 'block';
    el.innerHTML = `<div class="card" style="padding:16px">
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:10px">📊 نتيجة الحساب التفصيلي (Server)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
        ${[['راتب إجمالي',money(r.gross_salary),'#1e293b'],['وعاء التأمينات',money(r.social_insurance_base),'#374151'],['تأمينات موظف (11%)',money(r.insurance_employee),'#7c3aed'],['تأمينات شركة (18.75%)',money(r.insurance_company),'#5b8ec4'],['وعاء الضريبة الشهري',money(r.taxable_monthly),'#374151'],['ضريبة دخل شهرية',money(r.monthly_income_tax),'#dc2626'],['صافي الراتب',money(r.net_salary),'#15803d'],].map(([l,v,c])=>`
        <div style="background:#f8fafc;border-radius:8px;padding:10px;border:1px solid #e8edf3">
          <div style="font-size:11px;color:#64748b;margin-bottom:2px">${l}</div>
          <div style="font-size:16px;font-weight:800;color:${c}">${v}</div>
        </div>`).join('')}
      </div>
    </div>`;
  } catch(e) { tcSalCalc(); }
};

// ── CALENDAR ────────────────────────────────────────────────────────────────
async function _tcRenderCalendar(el) {
  if (!_tcClientId) { el.innerHTML = _tcNeedClient(); return; }
  try {
    const events = await api('GET', `/api/tax-center/calendar?client_id=${_tcClientId}&year=${_tcYear}`);
    const items = events?.items || events || [];
    const today = new Date();
    const grouped = {};
    items.forEach(ev => {
      const m = ev.due_date?.substring(5,7) || '00';
      if (!grouped[m]) grouped[m] = [];
      grouped[m].push(ev);
    });

    const urgColor = (dateStr) => {
      const d = new Date(dateStr);
      const diff = Math.ceil((d - today) / 86400000);
      if (diff < 0) return '#dc2626';
      if (diff <= 3) return '#dc2626';
      if (diff <= 7) return '#d97706';
      return '#15803d';
    };

    const statusBadge = s => `<span class="badge ${s==='done'||s==='paid'?'badge-green':s==='late'?'badge-red':'badge-yellow'}" style="font-size:10px">${s}</span>`;

    el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="font-size:15px;font-weight:700;color:#1e293b">📅 التقويم الضريبي ${_tcYear} — ${escH(_tcClientName)}</div>
      <button class="btn btn-secondary" onclick="tcGenCalendar()">🔄 توليد التقويم التلقائي</button>
    </div>
    ${!items.length ? `<div style="text-align:center;padding:40px;color:#94a3b8">
      <div style="font-size:40px;margin-bottom:8px">📅</div>
      <div>لا يوجد تقويم ضريبي — اضغط "توليد التقويم التلقائي"</div>
    </div>` : `<div style="display:grid;gap:12px">
      ${Object.keys(grouped).sort().map(m => `
      <div class="card" style="padding:16px">
        <div style="font-size:13px;font-weight:700;color:#1a2472;margin-bottom:10px">${TC_MONTH_AR[+m]||m} ${_tcYear}</div>
        <div style="display:grid;gap:6px">
          ${grouped[m].map(ev => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f8fafc;border-radius:8px;border-right:3px solid ${urgColor(ev.due_date)}">
            <div style="font-size:18px">${ev.event_type?.includes('vat')?'🧾':ev.event_type?.includes('wht')?'✂️':ev.event_type?.includes('corp')?'🏢':'📋'}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:#1e293b">${escH(ev.title||ev.event_type||'')}</div>
              <div style="font-size:11px;color:#64748b">${dateAr(ev.due_date)} ${ev.amount?'— '+money(ev.amount):''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              ${statusBadge(ev.status||'pending')}
              ${ev.status!=='done'?`<button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="tcCalDone(${ev.id})">✅</button>`:''}
            </div>
          </div>`).join('')}
        </div>
      </div>`).join('')}
    </div>`}`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:16px">❌ ${escH(e.message)}</div>`;
  }
}

window.tcGenCalendar = async function() {
  if (!_tcClientId) return;
  try {
    await api('POST', `/api/tax-center/calendar/generate/${_tcClientId}?year=${_tcYear}`);
    toast('✅ تم توليد التقويم الضريبي');
    await _tcRenderCalendar(document.getElementById('taxTabContent'));
  } catch(e) { toast(e.message,'error'); }
};
window.tcCalDone = async function(id) {
  try {
    await api('POST', `/api/tax-center/calendar/events/${id}/done`);
    toast('✅ تم تسجيل الإنجاز');
    await _tcRenderCalendar(document.getElementById('taxTabContent'));
  } catch(e) { toast(e.message,'error'); }
};

// ── PORTALS ─────────────────────────────────────────────────────────────────
function _tcRenderPortals(el) {
  const portals = [
    {icon:'🌐',title:'الهيئة العامة للضرائب (ETA)',sub:'eta.gov.eg',desc:'الموقع الرسمي للهيئة، أخبار ضريبية، إرشادات، التواصل مع الدعم',url:'https://eta.gov.eg/ar/home',color:'#1a2472',bg:'#eef1fb',btn:'فتح الموقع'},
    {icon:'📊',title:'بوابة ضريبة الدخل',sub:'eservice.incometax.gov.eg',desc:'تقديم إقرارات ضريبة الدخل، الاستعلام، المدفوعات',url:'https://eservice.incometax.gov.eg/etax',color:'#15803d',bg:'#f0fdf4',btn:'فتح البوابة'},
    {icon:'🏛️',title:'بوابة الجهاز العام للاستثمار (GAFI)',sub:'portal.gafi.gov.eg',desc:'تسجيل الشركات، التراخيص، الاستثمار، تأسيس المنشآت',url:'https://portal.gafi.gov.eg/auth/register',color:'#7c3aed',bg:'#ede9fe',btn:'فتح البوابة'},
    {icon:'🧾',title:'منظومة الفواتير الإلكترونية',sub:'invoicing.eta.gov.eg',desc:'رفع الفواتير والإشعارات، مزامنة المستندات، إدارة API',url:'https://invoicing.eta.gov.eg',color:'#d97706',bg:'#fef9c3',btn:'فتح المنظومة'},
    {icon:'🧾',title:'منظومة الإيصالات الإلكترونية',sub:'receipts.eta.gov.eg',desc:'إدارة نقاط البيع، الإيصالات، بيانات الـ POS',url:'https://receipts.eta.gov.eg',color:'#0369a1',bg:'#eff6ff',btn:'فتح المنظومة'},
  ];
  // render after DOM insert so onclick handlers fire as user gestures
  el.innerHTML = `
  <div style="max-width:800px">
    <div style="background:#f0f7ff;border-right:4px solid #1a73e8;border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:13px;color:#1a2472">
      💡 <strong>تنبيه:</strong> تقديم الإقرارات الضريبية يتم يدوياً عبر البوابات الرسمية. يقوم النظام بإعداد الأرقام فقط.
    </div>
    <div style="display:grid;gap:12px" id="portalsGrid"></div>
  </div>`;

  // build cards — plain <a> links, no JS tricks
  const grid = el.querySelector('#portalsGrid');
  portals.forEach(p => {
    const card = document.createElement('div');
    card.style.cssText = 'background:white;border-radius:12px;padding:16px 18px;border:1.5px solid #e8edf3;transition:all .15s';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:48px;height:48px;background:${p.bg};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${p.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:#1e293b">${p.title}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">${p.desc}</div>
        </div>
      </div>
      <div style="margin-top:12px;background:#f8fafc;border-radius:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #e2e8f0">
        <a href="${p.url}" target="_blank" rel="noopener noreferrer"
           style="font-size:13px;font-family:monospace;color:${p.color};font-weight:600;word-break:break-all;text-decoration:underline">
          ${p.url}
        </a>
        <a href="${p.url}" target="_blank" rel="noopener noreferrer"
           style="flex-shrink:0;background:${p.color};color:white;padding:7px 16px;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none;white-space:nowrap">
          فتح ↗
        </a>
      </div>`;
    card.addEventListener('mouseover', () => { card.style.borderColor = p.color; card.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)'; });
    card.addEventListener('mouseout',  () => { card.style.borderColor = '#e8edf3'; card.style.boxShadow = 'none'; });
    grid.appendChild(card);
  });
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function _tcNeedClient() {
  return `<div style="text-align:center;padding:60px 20px;color:#94a3b8">
    <div style="font-size:48px;margin-bottom:12px">👆</div>
    <div style="font-size:15px;font-weight:600;color:#64748b">اختر عميلاً من القائمة أعلاه</div>
  </div>`;
}

// Legacy compat
async function submitTaxReturn(id) {
  try {
    await api('PUT', `/api/tax/${id}`, {status:'submitted', submission_date: new Date().toISOString().split('T')[0]});
    toast('تم تقديم الإقرار الضريبي بنجاح');
  } catch(e) { toast(e.message, 'error'); }
}
function showTaxModal() { switchTaxTab('vat'); }


// ── REPORTS ────────────────────────────────────────
async function loadReports() {
  try {
    const [stats, chart] = await Promise.all([
      api('GET','/api/dashboard/stats'),
      api('GET','/api/dashboard/revenue-chart'),
    ]);
    if(!stats) return;
    const main=document.getElementById('main');
    main.className='page';
    const months=Array.isArray(chart)?chart:(chart?.months||[]);
    main.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div class="card" style="padding:20px">
        <h3 class="section-title" style="font-size:15px">📈 مقارنة الإيرادات الشهرية</h3>
        <canvas id="reportBarChart" style="max-height:250px"></canvas>
      </div>
      <div class="card" style="padding:20px">
        <h3 class="section-title" style="font-size:15px">📊 الأداء المالي</h3>
        <canvas id="reportLineChart" style="max-height:250px"></canvas>
      </div>
    </div>
    <div class="card" style="padding:20px">
      <h3 class="section-title" style="font-size:15px">📋 ملخص المؤشرات</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px">
        ${[
          {label:'إجمالي الفواتير',value:money(stats.financial.total_invoiced),icon:'📄',color:'#1a2472'},
          {label:'المحصّل',value:money(stats.financial.total_collected),icon:'✅',color:'#16a34a'},
          {label:'المستحق',value:money(stats.financial.total_outstanding),icon:'⏳',color:'#d97706'},
          {label:'المتأخرات',value:money(stats.financial.total_overdue),icon:'⚠',color:'#dc2626'},
          {label:'العملاء النشطون',value:stats.clients.active,icon:'👥',color:'#5b8ec4'},
          {label:'المهام المعلقة',value:stats.tasks.pending,icon:'📋',color:'#0369a1'},
        ].map(kpi=>`<div style="padding:16px;background:#f8fafc;border-radius:10px;border:1px solid #e8edf3">
          <div style="font-size:24px;margin-bottom:8px">${kpi.icon}</div>
          <div style="font-size:18px;font-weight:800;color:${kpi.color}">${kpi.value}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">${kpi.label}</div>
        </div>`).join('')}
      </div>
    </div>`;

    const ctx1=document.getElementById('reportBarChart').getContext('2d');
    chartInstances.reportBar=new Chart(ctx1,{
      type:'bar',
      data:{labels:months.map(m=>m.month),datasets:[
        {label:'فواتير',data:months.map(m=>m.invoiced||0),backgroundColor:'rgba(37,99,235,.2)',borderColor:'#1a2472',borderWidth:2,borderRadius:6},
        {label:'محصّل',data:months.map(m=>m.revenue||m.collected||0),backgroundColor:'rgba(22,163,74,.2)',borderColor:'#16a34a',borderWidth:2,borderRadius:6}
      ]},
      options:{responsive:true,plugins:{legend:{labels:{font:{family:'Cairo',size:11}}}},scales:{x:{grid:{display:false},ticks:{font:{family:'Cairo',size:10}}},y:{grid:{color:'#f1f5f9'},ticks:{font:{family:'Cairo',size:10}}}}}
    });

    const ctx2=document.getElementById('reportLineChart').getContext('2d');
    chartInstances.reportLine=new Chart(ctx2,{
      type:'line',
      data:{labels:months.map(m=>m.month),datasets:[
        {label:'صافي الإيرادات',data:months.map(m=>m.revenue||m.collected||0),borderColor:'#5b8ec4',backgroundColor:'rgba(124,58,237,.1)',fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:'#5b8ec4'}
      ]},
      options:{responsive:true,plugins:{legend:{labels:{font:{family:'Cairo',size:11}}}},scales:{x:{grid:{display:false},ticks:{font:{family:'Cairo',size:10}}},y:{grid:{color:'#f1f5f9'},ticks:{font:{family:'Cairo',size:10}}}}}
    });
  } catch(e){toast(e.message,'error')}
}

// ── LEADS (CRM) ────────────────────────────────────
// ── LEADS GRID ─────────────────────────────────────

/**
 * تحويل أي صيغة رقم مصري إلى الصيغة الدولية لواتساب (201XXXXXXXXX)
 * يتعامل مع: 01x... / 1x... / 201x... / +201x...
 */
function toWAPhone(raw) {
  let d = (raw || '').replace(/\D/g, ''); // احذف كل حرف غير رقمي
  if (!d) return null;
  // إذا كان الرقم يبدأ بـ 20 وطوله 12 → صحيح مباشرة
  if (d.startsWith('20') && d.length === 12) return d;
  // إذا بدأ بـ 0 وطوله 11 → 01XXXXXXXXX → نحذف الصفر ونضيف 20
  if (d.startsWith('0') && d.length === 11) return '20' + d.slice(1);
  // إذا بدأ بـ 1 وطوله 10 → 1XXXXXXXXX → نضيف 20 مباشرة
  if (d.startsWith('1') && d.length === 10) return '20' + d;
  // أي حالة أخرى → احذف الأصفار الأولى وأضف 20
  return '20' + d.replace(/^0+/, '');
}
const LEAD_STATUS_COLORS={new:'#6b7280',interested:'#15803d',not_answered:'#6b7280',call_later:'#d97706',quotation_sent:'#f97316',under_establishment:'#06b6d4',lost:'#ef4444'};
const LEAD_STATUS_LABEL={interested:'مهتم',not_answered:'لم يرد',call_later:'كلمني لاحقاً',quotation_sent:'عرض مرسل',under_establishment:'قيد التأسيس',lost:'خسارة'};
const LEAD_ROW_BG={new:'#f1f5f9',interested:'#f0fdf4',not_answered:'#f1f5f9',call_later:'#fefce8',quotation_sent:'#fff7ed',under_establishment:'#ecfeff',lost:'#fef2f2'};
const LEAD_ROW_BG_ALT={new:'#e2e8f0',interested:'#dcfce7',not_answered:'#e2e8f0',call_later:'#fef9c3',quotation_sent:'#ffedd5',under_establishment:'#cffafe',lost:'#fee2e2'};

const LEAD_DEFAULT_DELIVERABLES = [
  'عقد تأسيس',
  'صحيفة استثمار',
  'وثيقة بيانات',
  'طلب القيد في وزارة التجارة الداخلية',
  'البطاقة الضريبية',
  'السجل التجاري',
];
const LEAD_DEFAULT_REQUIRED_DOCS = [
  'توكيل تأسيس شركات',
  'صورة البطاقة الشخصية للشركاء',
  'عقد إيجار',
  'إيصال كهرباء',
];
// In-memory store for expanded-panel state (deliverables, required docs, extra fields)
// Keyed by lead id
const _leadExpandState = {};
const COMPANY_TYPE_OPTS={'':'—',llc:'ش.م.م',jsc:'ش.م.م.ع',sole:'فردي',ngo:'جمعية',branch:'فرع',rep:'مكتب تمثيلي',other:'أخرى'};
const COMPANY_TYPE_FULL={'':'',llc:'شركة ذات مسؤولية محدودة',jsc:'شركة مساهمة',sole:'مؤسسة فردية',ngo:'جمعية أهلية',branch:'فرع شركة أجنبية',rep:'مكتب تمثيلي',other:''};

function escH(v){if(v==null)return '';return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

let leadsData=[], leadsSearch='', leadsStatusFilter='', leadsUsersData=[], _leadNewSaving=false;
let leadsDateFilter='all', leadsDateFrom='', leadsDateTo='';
let _newRowCounter=0; // counter for unique temp IDs for new rows

const LEADS_DATE_LABELS={
  today:'اليوم', yesterday:'أمس', this_week:'هذا الأسبوع', last_week:'الأسبوع الماضي',
  this_month:'هذا الشهر', last_month:'الشهر الماضي', this_year:'هذه السنة',
  last_year:'السنة الماضية', all:'جميع البيانات', custom:'تاريخ مخصص'
};

