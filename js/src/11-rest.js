async function loadCollections(silent=false) {
  const main = document.getElementById('main');
  main.className = 'page';
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const _isOwner = currentUser?.role === 'admin';

  const selectors = _isOwner ? `
      <select id="cMonthSel" onchange="window._collChangeMonth()" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
        ${_COLL_MONTHS.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===_collMonth?'selected':''}>${m}</option>`).join('')}
      </select>
      <select id="cYearSel" onchange="window._collChangeMonth()" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
        ${[2024,2025,2026].map(y=>`<option ${y===_collYear?'selected':''}>${y}</option>`).join('')}
      </select>
      <button onclick="window._collExport()" style="height:32px;padding:0 12px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#475569;cursor:pointer">📤 تصدير</button>` : `
      <input type="text" id="collSName" placeholder="🔍 بحث باسم العميل..." value="${escH(_collSearchName)}" oninput="window._collOnSearch('name',this.value)" style="height:32px;padding:0 10px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;min-width:160px;background:#fff"/>
      <input type="date" id="collSFrom" value="${_collFromDate}" onchange="window._collOnSearch('from',this.value)" title="من تاريخ" style="height:32px;padding:0 6px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff"/>
      <input type="date" id="collSTo" value="${_collToDate}" onchange="window._collOnSearch('to',this.value)" title="إلى تاريخ" style="height:32px;padding:0 6px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff"/>
      <select id="cMonthSel" onchange="window._collChangeMonth()" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
        <option value="0" ${_collMonth===0?'selected':''}>كل الشهور</option>
        ${_COLL_MONTHS.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===_collMonth?'selected':''}>${m}</option>`).join('')}
      </select>
      <select id="cYearSel" onchange="window._collChangeMonth()" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
        ${[2024,2025,2026].map(y=>`<option ${y===_collYear?'selected':''}>${y}</option>`).join('')}
      </select>
      <button onclick="window._collClearSearch()" style="height:32px;padding:0 10px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#64748b;cursor:pointer" title="إعادة الضبط">↺</button>`;

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div style="font-size:16px;font-weight:700;color:#1e293b">💵 الأتعاب والتحصيلات</div>
    <div style="display:flex;gap:6px;align-items:center">${selectors}</div>
  </div>

  <div style="display:flex;gap:0;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:3px;width:fit-content;margin-bottom:12px" id="collTabs">
    <button onclick="window._collSwitch('acc')" id="cTab_acc" style="padding:7px 20px;font-size:13px;border-radius:8px;border:none;cursor:pointer;font-weight:700;background:#1a2472;color:#fff;white-space:nowrap">💼 تحصيل حسابات</button>
    <button onclick="window._collSwitch('est')" id="cTab_est" style="padding:7px 20px;font-size:13px;border-radius:8px;border:none;cursor:pointer;font-weight:500;background:none;color:#64748b;white-space:nowrap">🏢 تحصيل تأسيس</button>
  </div>

  <div id="collKpis" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px"></div>

  <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
      <div id="collSheetTitle" style="font-size:13px;font-weight:700;color:#1e293b">سجل تحصيل الحسابات</div>
      <div style="font-size:11px;color:#94a3b8">اكتب في السطر الأخضر واضغط <span style="background:#1d9e75;color:#fff;padding:1px 7px;border-radius:4px;font-weight:700;font-size:10px">Enter</span> للحفظ الفوري</div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;min-width:620px">
        <thead id="collThead"></thead>
        <tbody id="collTbody"></tbody>
        <tfoot id="collTfoot"></tfoot>
      </table>
    </div>
  </div>`;

  window._collChangeMonth = () => {
    _collMonth = +document.getElementById('cMonthSel').value;
    _collYear  = +document.getElementById('cYearSel').value;
    _collFetch();
  };

  window._collSwitch = (mode) => {
    _collMode = mode;
    ['acc','est'].forEach(m => {
      const b = document.getElementById(`cTab_${m}`);
      if (!b) return;
      if (m === mode) { b.style.background='#1a2472'; b.style.color='#fff'; b.style.fontWeight='700'; }
      else            { b.style.background='none';    b.style.color='#64748b'; b.style.fontWeight='500'; }
    });
    _collRender();
    setTimeout(()=>document.getElementById('nr-client')?.focus(), 50);
  };

  window._collExport = () => {
    const rows = _collRows.filter(r=>r.collection_type===_collMode);
    let csv = 'التاريخ,العميل,' + (_collMode==='acc'?'الشهر':'الخدمة') + ',المبلغ,الطريقة,ملاحظة\n';
    rows.forEach(r=>{ csv += `${r.date},${r.client_name},${r.billing_month_label||r.note||''},${r.amount},${_COLL_PAY[r.payment_method]||r.payment_method},${r.note||''}\n`; });
    const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`تحصيل_${_collMode==='acc'?'حسابات':'تأسيس'}_${_COLL_MONTHS[_collMonth]}_${_collYear}.csv`;
    a.click();
  };

  await _collFetch();
}

async function _collFetch() {
  try {
    const _isOwner = currentUser?.role === 'admin';
    let url;
    if (_isOwner) {
      url = `/api/finance/collections?month=${_collMonth}&year=${_collYear}`;
    } else {
      // fetch all when month=0 OR when search is active (to search across all history)
      const _searchActive = !!((_collSearchName||'').trim() || _collFromDate || _collToDate);
      url = (_collMonth === 0 || _searchActive)
        ? '/api/finance/collections'
        : `/api/finance/collections?month=${_collMonth}&year=${_collYear}`;
    }
    const data = await api('GET', url);
    _collRows = data || [];
    if (!_isOwner) {
      // filter by client name
      if (_collSearchName.trim()) {
        const q = _collSearchName.trim().toLowerCase();
        _collRows = _collRows.filter(r => (r.client_name||'').toLowerCase().includes(q));
      }
      // filter by date range
      if (_collFromDate) _collRows = _collRows.filter(r => (r.date||'') >= _collFromDate);
      if (_collToDate)   _collRows = _collRows.filter(r => (r.date||'') <= _collToDate);
    }
  } catch(e) { _collRows = []; }
  _collRender();
}

function _collRender() {
  const mode = _collMode;
  const _searchActive = !!((_collSearchName||'').trim() || _collFromDate || _collToDate);
  // when searching: show all types; otherwise: filter by current tab
  const rows = _searchActive ? _collRows : _collRows.filter(r => r.collection_type === mode);
  const total = rows.reduce((s,r)=>s+r.amount,0);
  const avg   = rows.length ? Math.round(total/rows.length) : 0;
  const color = mode==='acc'?'#0f6e56':'#185fa5';

  // title
  const tEl = document.getElementById('collSheetTitle');
  if (tEl) tEl.textContent = _searchActive ? `نتائج البحث — ${rows.length} سجل` : (mode==='acc'?'سجل تحصيل الحسابات':'سجل تحصيل التأسيس');

  // kpis
  const kEl = document.getElementById('collKpis');
  if (kEl && currentUser?.role !== 'admin') {
    // non-owner: show total only (no %, no averages)
    kEl.style.display = 'grid';
    kEl.style.gridTemplateColumns = '1fr';
    kEl.innerHTML = `
    <div style="background:#fff;border-radius:8px;padding:10px 14px;border:1px solid #e2e8f0">
      <div style="font-size:10px;color:#94a3b8;margin-bottom:3px">إجمالي التحصيل</div>
      <div style="font-size:20px;font-weight:700;color:${color}">${total.toLocaleString('ar-EG')} <span style="font-size:11px;font-weight:400;color:#94a3b8">ج.م</span></div>
    </div>`;
  } else if (kEl) kEl.innerHTML = `
    <div style="background:#fff;border-radius:8px;padding:10px 14px;border:1px solid #e2e8f0">
      <div style="font-size:10px;color:#94a3b8;margin-bottom:3px">إجمالي التحصيل</div>
      <div style="font-size:20px;font-weight:700;color:${color}">${total.toLocaleString('ar-EG')} <span style="font-size:11px;font-weight:400;color:#94a3b8">ج.م</span></div>
    </div>
    <div style="background:#fff;border-radius:8px;padding:10px 14px;border:1px solid #e2e8f0">
      <div style="font-size:10px;color:#94a3b8;margin-bottom:3px">عدد التحصيلات</div>
      <div style="font-size:20px;font-weight:700;color:${color}">${rows.length}</div>
    </div>
    <div style="background:#fff;border-radius:8px;padding:10px 14px;border:1px solid #e2e8f0">
      <div style="font-size:10px;color:#94a3b8;margin-bottom:3px">متوسط التحصيل</div>
      <div style="font-size:20px;font-weight:700;color:${color}">${avg.toLocaleString('ar-EG')} <span style="font-size:11px;font-weight:400;color:#94a3b8">ج.م</span></div>
    </div>`;

  // thead
  const col3 = mode==='acc'?'عن شهر':'نوع الخدمة';
  const thEl = document.getElementById('collThead');
  if (thEl) thEl.innerHTML = `<tr style="background:#f8fafc">
    <th style="padding:8px 10px;text-align:right;font-size:10px;color:#94a3b8;font-weight:700;border-bottom:2px solid #e2e8f0;width:95px">التاريخ</th>
    <th style="padding:8px 10px;text-align:right;font-size:10px;color:#94a3b8;font-weight:700;border-bottom:2px solid #e2e8f0">اسم العميل</th>
    ${_searchActive?'<th style="padding:8px 10px;text-align:right;font-size:10px;color:#94a3b8;font-weight:700;border-bottom:2px solid #e2e8f0;width:80px">النوع</th>':''}
    <th style="padding:8px 10px;text-align:right;font-size:10px;color:#94a3b8;font-weight:700;border-bottom:2px solid #e2e8f0;width:120px">${col3}</th>
    <th style="padding:8px 10px;text-align:center;font-size:10px;color:#94a3b8;font-weight:700;border-bottom:2px solid #e2e8f0;width:100px">المبلغ (ج.م)</th>
    <th style="padding:8px 10px;text-align:right;font-size:10px;color:#94a3b8;font-weight:700;border-bottom:2px solid #e2e8f0;width:105px">الطريقة</th>
    <th style="padding:8px 10px;text-align:right;font-size:10px;color:#94a3b8;font-weight:700;border-bottom:2px solid #e2e8f0">ملاحظة</th>
    <th style="width:32px;border-bottom:2px solid #e2e8f0"></th>
  </tr>`;

  // tbody — saved rows + new row
  const tbEl = document.getElementById('collTbody');
  if (!tbEl) return;
  const today = new Date().toISOString().slice(0,10);
  const rowsHTML = rows.map((r,i) => `<tr style="border-bottom:1px solid #f8fafc" id="crow_${r.id}">
    <td style="padding:0"><input value="${r.date}" onchange="window._collUpdate(${r.id},'date',this.value)" style="width:100%;height:36px;padding:0 8px;font-size:12px;border:none;background:transparent;outline:none;color:#64748b" /></td>
    <td style="padding:0"><input value="${escH(r.client_name)}" onchange="window._collUpdate(${r.id},'client_name',this.value)" style="width:100%;height:36px;padding:0 10px;font-size:12px;border:none;background:transparent;outline:none;font-weight:600;color:#1e293b" /></td>
    ${_searchActive?`<td style="padding:0 8px;vertical-align:middle"><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;background:${r.collection_type==='acc'?'#d1fae5':'#dbeafe'};color:${r.collection_type==='acc'?'#065f46':'#1d4ed8'}">${r.collection_type==='acc'?'حسابات':'تأسيس'}</span></td>`:''}
    <td style="padding:0"><input value="${r.billing_month_label||''}" style="width:100%;height:36px;padding:0 8px;font-size:12px;border:none;background:transparent;outline:none;color:#475569" /></td>
    <td style="padding:0"><input value="${r.amount}" onchange="window._collUpdate(${r.id},'amount',this.value)" style="width:100%;height:36px;padding:0 8px;font-size:13px;font-weight:700;color:#0f6e56;border:none;background:transparent;outline:none;text-align:center" /></td>
    <td style="padding:2px 6px"><select onchange="window._collUpdate(${r.id},'payment_method',this.value)" style="width:100%;height:28px;font-size:11px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;color:#1e293b">
      ${Object.entries(_COLL_PAY).map(([v,l])=>`<option value="${v}" ${r.payment_method===v?'selected':''}>${l}</option>`).join('')}
    </select></td>
    <td style="padding:0"><input value="${escH(r.note||'')}" style="width:100%;height:36px;padding:0 8px;font-size:11px;border:none;background:transparent;outline:none;color:#94a3b8" /></td>
    <td style="padding:0;text-align:center"><button onclick="window._collDel(${r.id})" style="background:none;border:none;color:#e2e8f0;cursor:pointer;font-size:14px;padding:4px" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#e2e8f0'">✕</button></td>
  </tr>`).join('');

  // new row (green)
  const newRowHTML = `<tr style="background:#f0fdf4" id="new-coll-row">
    <td style="padding:0"><input id="nr-date" value="${today.slice(8,10)}/${today.slice(5,7)}" style="width:100%;height:36px;padding:0 8px;font-size:12px;border:none;background:transparent;outline:none;color:#64748b" /></td>
    <td style="padding:0"><input id="nr-client" placeholder="اكتب اسم العميل..." onkeydown="window._collNewKey(event)" style="width:100%;height:36px;padding:0 10px;font-size:12px;border:none;background:transparent;outline:none;color:#1e293b;font-weight:600" /></td>
    <td style="padding:0"><input id="nr-month" placeholder="${mode==='acc'?'مثال: يونيو 2025':'نوع الشركة'}" onkeydown="window._collNewKey(event)" style="width:100%;height:36px;padding:0 8px;font-size:12px;border:none;background:transparent;outline:none;color:#475569" /></td>
    <td style="padding:0"><input id="nr-amt" type="number" placeholder="0" onkeydown="window._collNewKey(event)" style="width:100%;height:36px;padding:0 8px;font-size:13px;font-weight:700;color:#0f6e56;border:none;background:transparent;outline:none;text-align:center" /></td>
    <td style="padding:4px 8px"><select id="nr-method" style="width:100%;height:28px;font-size:11px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;color:#1e293b">
      <option value="cash">كاش</option>
      <option value="transfer">تحويل بنكي</option>
      <option value="instapay">إنستاباي</option>
      <option value="check">شيك</option>
      <option value="wallet">محفظة إلكترونية</option>
    </select></td>
    <td style="padding:0"><input id="nr-note" placeholder="ملاحظة..." onkeydown="window._collNewKey(event)" style="width:100%;height:36px;padding:0 8px;font-size:11px;border:none;background:transparent;outline:none;color:#94a3b8" /></td>
    <td></td>
  </tr>`;

  tbEl.innerHTML = newRowHTML + rowsHTML;

  // tfoot
  const tfEl = document.getElementById('collTfoot');
  if (tfEl && rows.length) tfEl.innerHTML = `<tr style="background:#f0fdf4;border-top:2px solid #bbf7d0">
    <td colspan="3" style="padding:8px 10px;font-weight:700;font-size:13px;color:#0f6e56">الإجمالي</td>
    <td style="padding:8px 10px;font-weight:700;font-size:14px;color:#0f6e56;text-align:center">${total.toLocaleString('ar-EG')}</td>
    <td colspan="3"></td>
  </tr>`;
  else if (tfEl) tfEl.innerHTML = '';

  // focus inputs
  setTimeout(()=>{
    const inputs = document.querySelectorAll('#collTbody input, #collTbody select');
    inputs.forEach(inp => {
      inp.addEventListener('focus', ()=>{ inp.style.background='#fffbeb'; inp.style.boxShadow='inset 0 0 0 2px #1d9e75'; });
      inp.addEventListener('blur',  ()=>{ inp.style.background='transparent'; inp.style.boxShadow='none'; });
    });
  }, 50);
}

window._collNewKey = async function(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const client = document.getElementById('nr-client')?.value.trim();
  const amt    = parseFloat(document.getElementById('nr-amt')?.value || '0');
  if (!client) { document.getElementById('nr-client')?.focus(); return; }
  if (!amt || amt <= 0) { document.getElementById('nr-amt')?.focus(); return; }

  const today = new Date();
  const body = {
    date: today.toISOString().slice(0,10),
    client_name: client,
    billing_month: _collMonth,
    billing_year:  _collYear,
    amount: amt,
    collection_type: _collMode,
    payment_method: document.getElementById('nr-method')?.value || 'cash',
    note: document.getElementById('nr-note')?.value || null,
  };

  try {
    const saved = await api('POST', '/api/finance/collections', body);
    _collRows.unshift(saved);
    _collRender();
    // flash last added row
    const row = document.getElementById(`crow_${saved.id}`);
    if (row) {
      row.querySelectorAll('td').forEach(td=>td.style.background='#d1fae5');
      setTimeout(()=>row.querySelectorAll('td').forEach(td=>td.style.background=''),500);
    }
    document.getElementById('nr-client')?.focus();
    toast('✓ تم الحفظ');
  } catch(err) { toast(err.message||'خطأ في الحفظ','error'); }
};

window._collDel = async function(id) {
  if (!confirm('حذف هذا التحصيل؟')) return;
  await api('DELETE', `/api/finance/collections/${id}`).catch(()=>{});
  _collRows = _collRows.filter(r=>r.id!==id);
  _collRender();
  toast('تم الحذف');
};

const _collSaveTimers = {};
window._collUpdate = function(id, field, val) {
  const row = _collRows.find(r=>r.id===id);
  if (row) row[field] = field === 'amount' ? parseFloat(val)||0 : val;
  clearTimeout(_collSaveTimers[id]);
  _collSaveTimers[id] = setTimeout(async () => {
    try {
      await api('PUT', `/api/finance/collections/${id}`, {[field]: field==='amount'?parseFloat(val)||0:val});
    } catch(e) { toast(e.message||'خطأ في الحفظ','error'); }
  }, 600);
};

window._collFetch = _collFetch;

window._collOnSearch = function(field, val) {
  if (field === 'name') _collSearchName = val;
  else if (field === 'from') _collFromDate = val;
  else if (field === 'to')   _collToDate   = val;
  _collFetch();
};

window._collClearSearch = function() {
  _collSearchName = '';
  _collFromDate   = '';
  _collToDate     = '';
  _collMonth      = new Date().getMonth() + 1;
  _collYear       = new Date().getFullYear();
  loadCollections();
};

// keep old refs working (modal functions still referenced elsewhere)
var collectionsData=[], collectionsTab='establishment', collectionsSearch='';
function switchCollTab(t){ collectionsTab=t; }
function setCollSearch(v){ collectionsSearch=v; }

async function showCollectionModal(type='establishment') {
  let clients=[];
  try{clients=await getClients();}catch(e){}
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:580px">
    <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:17px;font-weight:700;color:#1e293b;margin:0">${type==='monthly_fee'?'🔄 أتعاب شهرية':'🏢 تحصيل تأسيس'} — خدمة جديدة</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div style="padding:20px 24px;display:flex;flex-direction:column;gap:13px">

      <!-- اسم العميل — حر أو من القائمة -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
          <label style="font-size:12px;font-weight:600;color:#374151">اسم العميل *</label>
          <label style="font-size:11px;color:#1a2472;cursor:pointer;display:flex;align-items:center;gap:4px">
            <input type="checkbox" id="colUseDropdown" onchange="window._colToggleClient(this.checked)" style="accent-color:#1a2472"/>
            اختر من قائمة العملاء
          </label>
        </div>
        <input id="colClientFree" class="input" placeholder="اكتب اسم العميل بحرية..." style=""/>
        <select id="colClientDrop" class="input" style="display:none;margin-top:6px">
          <option value="">— اختر العميل —</option>
          ${clients.map(c=>`<option value="${c.id}">${escH(c.name)}</option>`).join('')}
        </select>
      </div>

      <!-- وصف الخدمة -->
      <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">وصف الخدمة *</label>
        <input id="colTitle" class="input" placeholder="${type==='monthly_fee'?'أتعاب محاسبة شهرية — 2026':'تأسيس شركة ذات مسئولية محدودة'}"/></div>

      <!-- المبالغ -->
      <div class="form-row">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">إجمالي المبلغ المتفق عليه (ج.م.) *</label>
          <input id="colAgreed" class="input" type="number" min="0" placeholder="${type==='monthly_fee'?'24000':'15000'}"/></div>
        ${type==='monthly_fee'?`<div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">قيمة الشهر الواحد (ج.م.)</label>
          <input id="colMonthly" class="input" type="number" min="0" placeholder="2000"/></div>`:'<div></div>'}
      </div>

      ${type==='monthly_fee'?`<div style="display:flex;align-items:center;gap:10px">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="colRecurring" checked style="width:15px;height:15px;accent-color:#1a2472"> توليد استحقاقات شهرية تلقائياً
        </label>
      </div>`:''}

      <!-- التواريخ -->
      <div class="form-row">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تاريخ البداية</label>
          <input id="colStart" class="input" type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تاريخ الانتهاء</label>
          <input id="colEnd" class="input" type="date"/></div>
      </div>

      <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">ملاحظات</label>
        <textarea id="colNotes" class="input" rows="2" placeholder="ملاحظات..."></textarea></div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="saveColBtn" class="btn btn-primary">💾 إنشاء الخدمة</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};

  window._colToggleClient = (useDropdown) => {
    document.getElementById('colClientFree').style.display = useDropdown ? 'none' : '';
    document.getElementById('colClientDrop').style.display = useDropdown ? '' : 'none';
  };

  document.getElementById('saveColBtn').onclick=async()=>{
    const btn=document.getElementById('saveColBtn');
    const useDropdown = document.getElementById('colUseDropdown').checked;
    const clientId = useDropdown ? parseInt($('#colClientDrop',overlay).value)||null : null;
    const clientNameFree = !useDropdown ? $('#colClientFree',overlay).value.trim() : null;
    const title=$('#colTitle',overlay).value.trim();
    const agreed=parseFloat($('#colAgreed',overlay).value);
    if(!clientId && !clientNameFree){toast('اسم العميل مطلوب','error');return;}
    if(!title){toast('وصف الخدمة مطلوب','error');return;}
    if(!agreed||agreed<=0){toast('المبلغ المتفق عليه مطلوب','error');return;}
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    try {
      const monthly=type==='monthly_fee'?parseFloat($('#colMonthly',overlay)?.value)||0:0;
      const recurring=type==='monthly_fee'&&(document.getElementById('colRecurring')?.checked||false);
      await api('POST','/api/collections',{
        client_id: clientId||null,
        client_name_free: clientNameFree||null,
        collection_type:type,
        title,
        agreed_amount:agreed,
        monthly_amount:monthly,
        is_recurring:recurring,
        start_date:$('#colStart',overlay).value||null,
        end_date:$('#colEnd',overlay).value||null,
        notes:$('#colNotes',overlay).value||null,
      });
      toast('تم إنشاء الخدمة بنجاح');
      overlay.remove(); loadCollections(true);
    } catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent='💾 إنشاء الخدمة';}
  };
}

async function showCollectionPaymentModal(contractId, remaining, title, isMonthly=false) {
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  const now=new Date();
  overlay.innerHTML=`<div class="modal" style="max-width:440px">
    <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">💵 تسجيل دفعة</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div style="padding:16px 24px">
      <div style="font-size:13px;color:#64748b;margin-bottom:14px">${escH(title)}</div>
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">المبلغ (ج.م.) *</label>
        <input id="cpAmount" class="input" type="number" value="${remaining}" placeholder="المبلغ"/></div>
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تاريخ الدفعة</label>
        <input id="cpDate" class="input" type="date" value="${now.toISOString().split('T')[0]}"/></div>
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">طريقة الدفع</label>
        <select id="cpMethod" class="input">
          <option value="cash">نقدي</option>
          <option value="bank_transfer">تحويل بنكي</option>
          <option value="check">شيك</option>
          <option value="instapay">InstaPay</option>
          <option value="vodafone_cash">Vodafone Cash</option>
        </select></div>
      ${isMonthly?`
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الشهر</label>
          <select id="cpMonth" class="input">
            ${['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'].map((m,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${m}</option>`).join('')}
          </select></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">السنة</label>
          <input id="cpYear" class="input" type="number" value="${now.getFullYear()}" min="2020" max="2030"/></div>
      </div>`:''}
      <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">مرجع / رقم شيك</label>
        <input id="cpRef" class="input" placeholder="اختياري"/></div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="savePayColBtn" class="btn btn-success">💵 تسجيل الدفعة</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  document.getElementById('savePayColBtn').onclick=async()=>{
    const btn=document.getElementById('savePayColBtn');
    const amount=parseFloat($('#cpAmount',overlay).value);
    if(!amount||amount<=0){toast('أدخل مبلغاً صحيحاً','error');return;}
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    try {
      const body={
        contract_id:contractId,
        amount,
        payment_date:$('#cpDate',overlay).value,
        payment_method:$('#cpMethod',overlay).value,
        reference:$('#cpRef',overlay).value||null,
      };
      if(isMonthly){
        body.period_month=parseInt($('#cpMonth',overlay).value);
        body.period_year=parseInt($('#cpYear',overlay).value);
      }
      await api('POST','/api/collections/payments',body);
      toast('تم تسجيل الدفعة بنجاح');
      overlay.remove(); loadCollections(true);
    } catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent='💵 تسجيل الدفعة';}
  };
}

async function showCollectionEditModal(contractId) {
  let c;
  try { c = await api('GET',`/api/collections/${contractId}`); } catch(e){toast(e.message,'error');return;}
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:500px">
    <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">✏️ تعديل العقد</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div style="padding:18px 22px;display:flex;flex-direction:column;gap:12px">
      <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">وصف العقد / الخدمة *</label>
        <input id="ceTitle" class="input" value="${escH(c.title||'')}"/></div>
      <div class="form-row">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">المبلغ المتفق عليه (ج.م.) *</label>
          <input id="ceAgreed" class="input" type="number" value="${c.agreed_amount||0}"/></div>
        ${c.collection_type==='monthly_fee'?`<div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">المبلغ الشهري (ج.م.)</label>
          <input id="ceMonthly" class="input" type="number" value="${c.monthly_amount||0}"/></div>`:''}
      </div>
      <div class="form-row">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تاريخ البداية</label>
          <input id="ceStart" class="input" type="date" value="${c.start_date||''}"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تاريخ النهاية</label>
          <input id="ceEnd" class="input" type="date" value="${c.end_date||''}"/></div>
      </div>
      <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">ملاحظات</label>
        <textarea id="ceNotes" class="input" rows="2" style="resize:vertical">${escH(c.notes||'')}</textarea></div>
      <div style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="ceActive" ${c.is_active?'checked':''} style="width:16px;height:16px;accent-color:#1a2472"/>
        <label for="ceActive" style="font-size:13px;font-weight:600;color:#374151;cursor:pointer">عقد نشط</label>
      </div>
    </div>
    <div style="padding:14px 22px;border-top:1px solid #f1f5f9;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="saveColEditBtn" class="btn btn-primary">💾 حفظ التعديلات</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  document.getElementById('saveColEditBtn').onclick=async()=>{
    const btn=document.getElementById('saveColEditBtn');
    const title=document.getElementById('ceTitle').value.trim();
    if(!title){toast('وصف العقد مطلوب','error');return;}
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    try {
      const body={
        title,
        agreed_amount:parseFloat(document.getElementById('ceAgreed').value)||0,
        start_date:document.getElementById('ceStart').value||null,
        end_date:document.getElementById('ceEnd').value||null,
        notes:document.getElementById('ceNotes').value.trim()||null,
        is_active:document.getElementById('ceActive').checked,
      };
      if(c.collection_type==='monthly_fee'){
        const mEl=document.getElementById('ceMonthly');
        if(mEl) body.monthly_amount=parseFloat(mEl.value)||0;
      }
      await api('PUT',`/api/collections/${contractId}`,body);
      toast('تم تحديث العقد بنجاح');
      overlay.remove(); loadCollections(true);
    } catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent='💾 حفظ التعديلات';}
  };
}

async function deleteCollectionContract(contractId, title) {
  if(!confirm(`هل تريد حذف العقد "${title}"؟\nسيتم حذف جميع الدفعات المسجلة المرتبطة به.`)) return;
  try {
    await api('DELETE',`/api/collections/${contractId}`);
    toast('تم حذف العقد بنجاح');
    loadCollections(true);
    loadInvoices(true);
  } catch(e){toast(e.message,'error');}
}

async function showCollectionDetail(contractId) {
  try {
    const c=await api('GET',`/api/collections/${contractId}`);
    if(!c) return;
    _renderCollectionDetail(c);
  } catch(e){toast(e.message,'error');}
}

function _renderCollectionDetail(c) {
  // Remove existing detail overlay for this contract if any
  document.querySelectorAll('.col-detail-overlay').forEach(o=>o.remove());

  const statusLabel={unpaid:'غير مدفوع',partial:'جزئي',paid:'مدفوع',overdue:'متأخر'};
  const statusColor={unpaid:'#dc2626',partial:'#d97706',paid:'#16a34a',overdue:'#dc2626'};
  const methodLabel={cash:'نقدي',bank_transfer:'تحويل بنكي',check:'شيك',instapay:'InstaPay',vodafone_cash:'Vodafone Cash'};
  const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  const totalExpenses = c.total_expenses || 0;
  const netProfit = c.net_profit || (c.total_paid - totalExpenses);
  const profitPct = c.profit_pct || (c.total_paid ? Math.round(netProfit/c.total_paid*10)/10 : 0);

  const overlay=document.createElement('div');
  overlay.className='modal-overlay col-detail-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:640px;max-height:90vh;display:flex;flex-direction:column">
    <div style="padding:18px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">${escH(c.title)}</h2>
        <div style="font-size:12px;color:#64748b;margin-top:3px">
          👤 ${escH(c.client_name||'')}
          &nbsp;·&nbsp;<span style="color:${statusColor[c.status]||'#64748b'};font-weight:600">${statusLabel[c.status]||c.status}</span>
        </div>
      </div>
      <button onclick="this.closest('.col-detail-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>

    <div style="overflow-y:auto;flex:1;padding:16px 24px;display:flex;flex-direction:column;gap:16px">

      <!-- KPI row -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        <div style="text-align:center;padding:10px 6px;background:#f8fafc;border-radius:10px">
          <div style="font-size:14px;font-weight:800;color:#1a2472">${money(c.agreed_amount)}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">المتفق عليه</div>
        </div>
        <div style="text-align:center;padding:10px 6px;background:#f0fdf4;border-radius:10px">
          <div style="font-size:14px;font-weight:800;color:#16a34a">${money(c.total_paid)}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">المحصّل</div>
        </div>
        <div style="text-align:center;padding:10px 6px;background:${c.total_remaining>0?'#fff5f5':'#f0fdf4'};border-radius:10px">
          <div style="font-size:14px;font-weight:800;color:${c.total_remaining>0?'#dc2626':'#16a34a'}">${money(c.total_remaining)}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">المتبقي</div>
        </div>
        <div style="text-align:center;padding:10px 6px;background:#fff7ed;border-radius:10px">
          <div style="font-size:14px;font-weight:800;color:#d97706">${money(totalExpenses)}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">المصروفات</div>
        </div>
      </div>

      <!-- P&L bar -->
      <div style="background:${netProfit>=0?'#f0fdf4':'#fff5f5'};border:1px solid ${netProfit>=0?'#bbf7d0':'#fecaca'};border-radius:10px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div><span style="font-size:11px;color:#64748b">إجمالي الإيراد: </span><strong style="color:#16a34a">${money(c.total_paid)}</strong></div>
          <div><span style="font-size:11px;color:#64748b">إجمالي المصروفات: </span><strong style="color:#dc2626">${money(totalExpenses)}</strong></div>
          <div><span style="font-size:11px;color:#64748b">صافي الربح: </span><strong style="color:${netProfit>=0?'#16a34a':'#dc2626'}">${money(netProfit)}</strong></div>
        </div>
        <div style="font-size:15px;font-weight:800;color:${netProfit>=0?'#16a34a':'#dc2626'}">%${profitPct}</div>
      </div>

      <!-- Payments -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#374151">💵 الدفعات (${c.payments?.length||0})</div>
          ${c.total_remaining>0?`<button class="btn btn-success btn-sm" id="addPayColBtn">+ دفعة جديدة</button>`:''}
        </div>
        <div style="border:1px solid #f1f5f9;border-radius:8px;overflow:hidden">
          ${!c.payments?.length
            ?`<div style="text-align:center;padding:16px;color:#94a3b8;font-size:13px">لا توجد دفعات بعد</div>`
            :c.payments.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #f8fafc">
                <div>
                  <span style="font-size:13px;font-weight:700;color:#16a34a">${money(p.amount)}</span>
                  <span style="font-size:11px;color:#94a3b8;margin-right:8px">${dateAr(p.payment_date)} · ${methodLabel[p.payment_method]||p.payment_method||'—'}${p.reference?' · '+p.reference:''}</span>
                  ${p.period_month?`<span style="font-size:10px;color:#5b8ec4"> (${MONTHS[p.period_month-1]} ${p.period_year})</span>`:''}
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:11px;color:#94a3b8">${escH(p.collector_name||'')}</span>
                  <button class="btn btn-sm" style="padding:2px 6px;font-size:11px;color:#dc2626;background:#fff5f5;border:1px solid #fecaca" onclick="window._colDelPayment(${p.id},${contractId})">🗑</button>
                </div>
              </div>`).join('')}
        </div>
      </div>

      <!-- Expenses -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#374151">📋 المصروفات (${c.expenses?.length||0})</div>
          <button class="btn btn-secondary btn-sm" id="addExpBtn">+ مصروف</button>
        </div>
        <div id="expensesList" style="border:1px solid #f1f5f9;border-radius:8px;overflow:hidden">
          ${!c.expenses?.length
            ?`<div style="text-align:center;padding:16px;color:#94a3b8;font-size:13px">لا توجد مصروفات مسجلة</div>`
            :c.expenses.map(e=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #f8fafc">
                <div>
                  <span style="font-size:13px;font-weight:600;color:#1e293b">${escH(e.description)}</span>
                  ${e.category?`<span style="font-size:10px;color:#64748b;margin-right:6px;background:#f1f5f9;padding:1px 6px;border-radius:4px">${escH(e.category)}</span>`:''}
                  ${e.expense_date?`<span style="font-size:10px;color:#94a3b8;margin-right:4px">${dateAr(e.expense_date)}</span>`:''}
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:13px;font-weight:700;color:#d97706">${money(e.amount)}</span>
                  <button class="btn btn-sm" style="padding:2px 6px;font-size:11px;color:#dc2626;background:#fff5f5;border:1px solid #fecaca" onclick="window._colDelExpense(${e.id},${contractId})">🗑</button>
                </div>
              </div>`).join('')}
        </div>
        <!-- Add expense inline form -->
        <div id="addExpForm" style="display:none;margin-top:8px;background:#f8fafc;border-radius:8px;padding:12px;display:none">
          <div class="form-row" style="margin-bottom:8px">
            <input id="expDesc" class="input" placeholder="وصف المصروف *" style="font-size:12px"/>
            <select id="expCat" class="input" style="font-size:12px">
              <option value="">— نوع المصروف —</option>
              <option value="انتقالات">انتقالات</option>
              <option value="رسوم حكومية">رسوم حكومية</option>
              <option value="أتعاب خارجية">أتعاب خارجية</option>
              <option value="متفرقات">متفرقات</option>
            </select>
          </div>
          <div class="form-row">
            <input id="expAmount" class="input" type="number" min="0" placeholder="المبلغ *" style="font-size:12px"/>
            <input id="expDate" class="input" type="date" value="${new Date().toISOString().split('T')[0]}" style="font-size:12px"/>
            <button class="btn btn-primary btn-sm" id="saveExpBtn" style="white-space:nowrap">💾 حفظ</button>
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('addExpForm').style.display='none'">إلغاء</button>
          </div>
        </div>
      </div>

    </div>

    <div style="padding:14px 24px;border-top:1px solid #f1f5f9;display:flex;gap:8px;flex-shrink:0">
      ${c.total_remaining>0?`<button class="btn btn-success" id="addPayColBtnFoot">💵 تسجيل دفعة</button>`:''}
      <button class="btn btn-secondary" onclick="this.closest('.col-detail-overlay').remove()">إغلاق</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};

  // Pay buttons
  const payHandler = () => { overlay.remove(); showCollectionPaymentModal(c.id,c.total_remaining,c.title,c.collection_type==='monthly_fee'); };
  overlay.querySelector('#addPayColBtn')?.addEventListener('click', payHandler);
  overlay.querySelector('#addPayColBtnFoot')?.addEventListener('click', payHandler);

  // Add expense toggle
  overlay.querySelector('#addExpBtn')?.addEventListener('click', ()=>{
    const f=document.getElementById('addExpForm');
    f.style.display = f.style.display==='none'?'block':'none';
  });

  // Save expense
  overlay.querySelector('#saveExpBtn')?.addEventListener('click', async()=>{
    const desc=document.getElementById('expDesc').value.trim();
    const amt=parseFloat(document.getElementById('expAmount').value);
    if(!desc){toast('وصف المصروف مطلوب','error');return;}
    if(!amt||amt<=0){toast('المبلغ مطلوب','error');return;}
    try {
      await api('POST',`/api/collections/${c.id}/expenses`,{
        description:desc,
        category:document.getElementById('expCat').value||null,
        amount:amt,
        expense_date:document.getElementById('expDate').value||null,
      });
      toast('تم إضافة المصروف');
      overlay.remove();
      const updated = await api('GET',`/api/collections/${c.id}`);
      _renderCollectionDetail(updated);
    } catch(ex){toast(ex.message,'error');}
  });
}

window._colDelPayment = async(payId, contractId)=>{
  if(!confirm('حذف هذه الدفعة؟')) return;
  try {
    await api('DELETE',`/api/collections/payments/${payId}`);
    toast('تم حذف الدفعة');
    const updated = await api('GET',`/api/collections/${contractId}`);
    _renderCollectionDetail(updated);
  } catch(e){toast(e.message,'error');}
};

window._colDelExpense = async(expId, contractId)=>{
  if(!confirm('حذف هذا المصروف؟')) return;
  try {
    await api('DELETE',`/api/collections/${contractId}/expenses/${expId}`);
    toast('تم حذف المصروف');
    const updated = await api('GET',`/api/collections/${contractId}`);
    _renderCollectionDetail(updated);
  } catch(e){toast(e.message,'error');}
};

// ── DATA IMPORT ────────────────────────────────────
let importPreviewData = null;
let importCsvText = '';

async function loadImport() {
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML = `
  <div style="max-width:900px">
    <div class="card" style="padding:24px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
        <div style="width:48px;height:48px;background:#eef1fb;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px">📥</div>
        <div>
          <h2 style="font-size:18px;font-weight:800;color:#1a2472;margin:0">استيراد البيانات من Google Sheets</h2>
          <p style="font-size:13px;color:#64748b;margin:4px 0 0">قراءة الشركات والعملاء وإنشاؤهم تلقائياً في النظام</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">رابط Google Sheet</label>
          <input id="sheetUrl" class="input" value="https://docs.google.com/spreadsheets/d/1ZLwHba3F5jrGQkCvVd7mTcbCCp3OWuaJ_e929XdyxUA/export?format=csv&gid=600176975" style="font-size:11px"/>
        </div>
        <div style="display:flex;flex-direction:column;justify-content:flex-end">
          <button id="fetchSheetBtn" class="btn btn-primary" onclick="fetchAndPreview()">🔄 جلب البيانات وعرض المعاينة</button>
        </div>
      </div>
      <div style="font-size:12px;color:#94a3b8;background:#f8fafc;padding:10px 14px;border-radius:8px;border-right:3px solid #4478b0">
        ℹ️ سيتم تحليل البيانات وعرض معاينة كاملة قبل تنفيذ الاستيراد الفعلي. لا يتم إنشاء أي سجلات حتى تؤكد.
      </div>
    </div>
    <div id="importPreviewArea"></div>
  </div>`;
}

async function fetchAndPreview() {
  const btn = document.getElementById('fetchSheetBtn');
  const url = document.getElementById('sheetUrl')?.value?.trim();
  if (!url) { toast('أدخل رابط الشيت', 'error'); return; }
  btn.disabled = true; btn.textContent = '⏳ جاري التحميل...';
  const area = document.getElementById('importPreviewArea');
  area.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:#94a3b8"><div style="font-size:32px;margin-bottom:12px">⏳</div>جاري جلب وتحليل البيانات...</div>`;
  try {
    // Convert share URL to CSV export URL if needed
    let csvUrl = url;
    if (url.includes('/edit') || url.includes('/view')) {
      const match = url.match(/spreadsheets\/d\/([^/]+)/);
      const gidMatch = url.match(/[#&]gid=(\d+)/);
      if (match) {
        csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gidMatch ? '&gid='+gidMatch[1] : ''}`;
      }
    }
    // Fetch CSV via backend proxy
    const csvResp = await fetch(csvUrl);
    if (!csvResp.ok) throw new Error('فشل في جلب البيانات من Google Sheets');
    importCsvText = await csvResp.text();
    // Send to preview endpoint
    const preview = await api('POST', '/api/import/preview', { csv_text: importCsvText });
    importPreviewData = preview;
    renderImportPreview(preview);
  } catch(e) {
    area.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:#ef4444">❌ ${escH(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '🔄 جلب البيانات وعرض المعاينة';
  }
}

function renderImportPreview(data) {
  const area = document.getElementById('importPreviewArea');
  if (!area) return;
  const STATUS_LABEL = {ACTIVE:'نشط', INACTIVE:'غير نشط', PROSPECT:'محتمل'};
  const STATUS_COLOR = {ACTIVE:'#10b981', INACTIVE:'#ef4444', PROSPECT:'#f59e0b'};
  const PAY_LABEL = {paid:'مدفوع', sent:'غير مدفوع', partial:'جزئي'};
  const PAY_COLOR = {paid:'#10b981', sent:'#ef4444', partial:'#f59e0b'};
  const rows = data.rows || [];
  const totalFees = rows.reduce((s,r) => s + (r.contract_value||0), 0);
  const paidFees = rows.filter(r=>r.payment_status==='paid').reduce((s,r) => s + (r.contract_value||0), 0);
  const unpaidFees = totalFees - paidFees;

  area.innerHTML = `
  <!-- Stats -->
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px">
    ${[
      {label:'إجمالي الشركات', val:data.total, icon:'🏢', color:'#1a2472'},
      {label:'جاهزة للاستيراد', val:data.clean, icon:'✅', color:'#10b981'},
      {label:'بها ملاحظات', val:data.with_issues, icon:'⚠️', color:'#f59e0b'},
      {label:'غير نشطة', val:data.inactive_count, icon:'🔴', color:'#94a3b8'},
      {label:'مكررة محتملة', val:data.duplicates, icon:'🔁', color:'#8b5cf6'},
    ].map(k=>`<div class="stat-card" style="padding:14px">
      <div style="font-size:22px;margin-bottom:6px">${k.icon}</div>
      <div style="font-size:22px;font-weight:800;color:${k.color}">${k.val}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">${k.label}</div>
    </div>`).join('')}
  </div>

  <!-- Financial Summary -->
  <div class="card" style="padding:16px 20px;margin-bottom:20px;display:flex;gap:24px;align-items:center;flex-wrap:wrap">
    <div style="font-size:13px;font-weight:600;color:#374151">💰 ملخص الاتعاب:</div>
    ${[
      {label:'إجمالي الاتعاب', val:totalFees, color:'#1a2472'},
      {label:'مدفوع', val:paidFees, color:'#10b981'},
      {label:'غير مدفوع', val:unpaidFees, color:'#ef4444'},
    ].map(k=>`<div style="text-align:center;padding:8px 16px;background:#f8fafc;border-radius:8px;flex:1">
      <div style="font-size:16px;font-weight:700;color:${k.color}">${k.val.toLocaleString('ar-EG')} ج.م.</div>
      <div style="font-size:11px;color:#94a3b8">${k.label}</div>
    </div>`).join('')}
  </div>

  <!-- Filter tabs -->
  <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
    <button onclick="filterImportRows('all')" id="iTab_all" class="btn btn-primary btn-sm">الكل (${data.total})</button>
    <button onclick="filterImportRows('clean')" id="iTab_clean" class="btn btn-secondary btn-sm">✅ جاهزة (${data.clean})</button>
    <button onclick="filterImportRows('issues')" id="iTab_issues" class="btn btn-secondary btn-sm">⚠️ بها ملاحظات (${data.with_issues})</button>
    <button onclick="filterImportRows('inactive')" id="iTab_inactive" class="btn btn-secondary btn-sm">🔴 غير نشطة (${data.inactive_count})</button>
    ${data.duplicates>0?`<button onclick="filterImportRows('dup')" id="iTab_dup" class="btn btn-secondary btn-sm">🔁 مكررة (${data.duplicates})</button>`:''}
  </div>

  <!-- Data Table -->
  <div class="card" style="overflow:hidden;margin-bottom:20px">
    <div style="overflow-x:auto">
      <table id="importTable">
        <thead>
          <tr>
            <th style="width:40px">#</th>
            <th>اسم الشركة</th>
            <th>المدير</th>
            <th>الهاتف</th>
            <th>النوع</th>
            <th>الحالة</th>
            <th>الاتعاب</th>
            <th>السداد</th>
            <th>الملاحظات</th>
          </tr>
        </thead>
        <tbody id="importTbody">
          ${rows.map(r => {
            const isDup = r.is_duplicate;
            const hasIssue = r.issues && r.issues.length > 0;
            const rowClass = isDup ? 'dup-row' : hasIssue ? 'issue-row' : 'clean-row';
            const rowStatus = isDup ? 'dup' : hasIssue ? 'issues' : 'clean';
            const inactive = r.status === 'INACTIVE';
            const bgColor = isDup ? '#fdf4ff' : inactive ? '#f8fafc' : hasIssue ? '#fffbeb' : '#fff';
            return `<tr class="import-row" data-status="${rowStatus}" data-inactive="${inactive}" style="background:${bgColor}">
              <td style="font-size:11px;color:#94a3b8">${r.row_num}</td>
              <td>
                <div style="font-weight:600;color:#1e293b;font-size:13px">${escH(r.name)}</div>
                ${isDup?`<div style="font-size:10px;color:#8b5cf6">🔁 ${escH(r.duplicate_reason)}</div>`:''}
                ${hasIssue?`<div style="font-size:10px;color:#d97706">⚠️ ${r.issues.join('، ')}</div>`:''}
              </td>
              <td style="font-size:12px;color:#64748b">${escH(r.manager||'—')}</td>
              <td style="font-size:12px;direction:ltr">${escH(r.phone||'—')}</td>
              <td style="font-size:11px">${escH(r.legal_type||'—')}</td>
              <td><span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${STATUS_COLOR[r.status]+'22'};color:${STATUS_COLOR[r.status]};font-weight:600">${STATUS_LABEL[r.status]||r.status}</span></td>
              <td style="font-size:12px;font-weight:600;color:#1a2472">${r.contract_value ? r.contract_value.toLocaleString('ar-EG')+' ج.م.' : '—'}</td>
              <td>${r.payment_status?`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${PAY_COLOR[r.payment_status]+'22'};color:${PAY_COLOR[r.payment_status]}">${PAY_LABEL[r.payment_status]}</span>`:'—'}</td>
              <td style="font-size:10px;color:#94a3b8;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escH(r.notes||'')}">${escH((r.notes||'').split('\n')[0]||'—')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Import Options + Confirm Button -->
  <div class="card" style="padding:20px">
    <h3 class="section-title" style="font-size:14px">⚙️ خيارات الاستيراد</h3>
    <div style="display:flex;gap:20px;margin-bottom:20px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#374151">
        <input type="checkbox" id="skipDup" checked style="width:16px;height:16px;accent-color:#1a2472">
        تجاهل الشركات المكررة (${data.duplicates} مكررة)
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#374151">
        <input type="checkbox" id="importIssues" checked style="width:16px;height:16px;accent-color:#1a2472">
        استيراد الشركات ذات الملاحظات (${data.with_issues} بها ملاحظات)
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#374151">
        <input type="checkbox" id="importInactive" checked style="width:16px;height:16px;accent-color:#1a2472">
        استيراد الشركات غير النشطة (${data.inactive_count} غير نشطة)
      </label>
    </div>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:6px">⚠️ تنبيه مهم قبل الاستيراد</div>
      <div style="font-size:12px;color:#7f1d1d;line-height:1.8">
        • سيتم إنشاء <strong>${data.total} عميل/شركة</strong> جديدة في النظام<br>
        • سيتم إنشاء فواتير تلقائية لـ <strong>${rows.filter(r=>r.contract_value&&r.payment_status).length} عميل</strong> لديهم اتعاب مسجلة<br>
        • سيتم إنشاء مجلد أرشيف لكل عميل<br>
        • لا يمكن التراجع عن هذه العملية بسهولة
      </div>
    </div>
    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="loadImport()">🔄 إعادة المعاينة</button>
      <button id="confirmImportBtn" class="btn btn-primary" style="background:#10b981;border-color:#10b981;font-size:14px;padding:10px 24px" onclick="confirmImport()">
        ✅ تأكيد الاستيراد (${data.total - data.duplicates} شركة)
      </button>
    </div>
  </div>`;
}

function filterImportRows(filter) {
  // Update active tab
  ['all','clean','issues','inactive','dup'].forEach(t => {
    const btn = document.getElementById('iTab_'+t);
    if (btn) btn.className = 'btn btn-sm ' + (t === filter ? 'btn-primary' : 'btn-secondary');
  });
  document.querySelectorAll('.import-row').forEach(row => {
    const s = row.dataset.status;
    const inactive = row.dataset.inactive === 'true';
    let show = false;
    if (filter === 'all') show = true;
    else if (filter === 'clean') show = s === 'clean' && !inactive;
    else if (filter === 'issues') show = s === 'issues';
    else if (filter === 'inactive') show = inactive;
    else if (filter === 'dup') show = s === 'dup';
    row.style.display = show ? '' : 'none';
  });
}

async function confirmImport() {
  if (!importCsvText) { toast('لا توجد بيانات. أعد المعاينة أولاً', 'error'); return; }
  const skipDup = document.getElementById('skipDup')?.checked !== false;
  const importIssues = document.getElementById('importIssues')?.checked !== false;
  const btn = document.getElementById('confirmImportBtn');
  if (!await confirmDlg(`هل أنت متأكد من استيراد ${importPreviewData?.total || 0} شركة؟\nهذه العملية لا يمكن التراجع عنها.`)) return;
  btn.disabled = true; btn.textContent = '⏳ جاري الاستيراد...';
  try {
    const result = await api('POST', '/api/import/confirm', {
      csv_text: importCsvText,
      skip_duplicates: skipDup,
      import_with_issues: importIssues,
    });
    renderImportResult(result);
  } catch(e) {
    toast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = '✅ تأكيد الاستيراد';
  }
}

function renderImportResult(result) {
  const area = document.getElementById('importPreviewArea');
  if (!area) return;
  area.innerHTML = `
  <div class="card" style="padding:32px;text-align:center">
    <div style="font-size:56px;margin-bottom:16px">${result.errors > 0 ? '⚠️' : '🎉'}</div>
    <h2 style="font-size:22px;font-weight:700;color:#1e293b;margin:0 0 8px">
      ${result.errors > 0 ? 'اكتمل الاستيراد مع بعض الأخطاء' : 'تم الاستيراد بنجاح!'}
    </h2>
    <p style="font-size:14px;color:#64748b;margin:0 0 24px">تم معالجة بيانات Google Sheet وإنشاء السجلات</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:500px;margin:0 auto 24px">
      ${[
        {label:'تم استيراده', val:result.imported, icon:'✅', color:'#10b981'},
        {label:'تم تجاهله (مكرر)', val:result.skipped, icon:'🔁', color:'#94a3b8'},
        {label:'أخطاء', val:result.errors, icon:'❌', color:'#ef4444'},
      ].map(k=>`<div style="padding:16px;background:#f8fafc;border-radius:10px;border:2px solid ${k.color}22">
        <div style="font-size:28px;font-weight:800;color:${k.color}">${k.val}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px">${k.label} ${k.icon}</div>
      </div>`).join('')}
    </div>
    <div style="display:flex;gap:12px;justify-content:center">
      <button class="btn btn-primary" onclick="navigate('clients')">👥 عرض قائمة العملاء</button>
      <button class="btn btn-secondary" onclick="navigate('invoices')">💳 عرض الفواتير</button>
    </div>
    ${result.errors_list?.length ? `
    <div style="margin-top:20px;text-align:right;background:#fef2f2;padding:14px;border-radius:8px">
      <div style="font-size:12px;font-weight:600;color:#dc2626;margin-bottom:6px">الأخطاء:</div>
      ${result.errors_list.map(e=>`<div style="font-size:11px;color:#7f1d1d">${escH(e.name)}: ${escH(e.error)}</div>`).join('')}
    </div>`:''
    }
  </div>`;
}

// ── MAIL — Email Composer ──────────────────────────
let mailClients = [];
let mailSelectedClient = null;

async function loadMail(silent=false) {
  const main = document.getElementById('main');
  main.className = 'page';

  // Load clients list for picker
  try {
    const d = await api('GET', '/api/clients?page_size=200');
    mailClients = d?.items || [];
  } catch(e) { mailClients = []; }

  const clientOptions = mailClients.map(c =>
    `<option value="${c.id}" data-email="${escH(c.email||'')}" data-name="${escH(c.name)}">${escH(c.name)}${c.email?' — '+escH(c.email):' ⚠️ لا يوجد إيميل'}</option>`
  ).join('');

  main.innerHTML = `
  <div style="display:grid;grid-template-columns:240px 1fr;gap:20px;align-items:start">

    <!-- Left panel: compose button + quick tips -->
    <div>
      <div class="card" style="padding:0;overflow:hidden">
        <button onclick="mailFocusCompose()" class="btn btn-primary" style="width:100%;border-radius:0;padding:14px;font-size:14px;justify-content:center;gap:8px">
          <span style="font-size:18px">✏️</span> رسالة جديدة
        </button>
        <div style="padding:16px">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">البريد الصادر</div>
          <div id="mailSentList" style="font-size:13px;color:#64748b;text-align:center;padding:20px 0">
            📭 لا توجد رسائل مُرسَلة محفوظة
          </div>
        </div>
        <div style="padding:16px;border-top:1px solid #f1f5f9">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">إجراءات سريعة</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button onclick="mailFocusCompose()" style="background:#f8fafc;border:1px solid #e8edf3;border-radius:8px;padding:8px 12px;font-size:12.5px;font-family:inherit;cursor:pointer;text-align:right;color:#374151;display:flex;align-items:center;gap:8px">
              <span>📧</span> بريد عادي
            </button>
            <button onclick="mailQuickReminder()" style="background:#f8fafc;border:1px solid #e8edf3;border-radius:8px;padding:8px 12px;font-size:12.5px;font-family:inherit;cursor:pointer;text-align:right;color:#374151;display:flex;align-items:center;gap:8px">
              <span>🔔</span> تذكير ضريبي
            </button>
            <button onclick="mailQuickInvoice()" style="background:#f8fafc;border:1px solid #e8edf3;border-radius:8px;padding:8px 12px;font-size:12.5px;font-family:inherit;cursor:pointer;text-align:right;color:#374151;display:flex;align-items:center;gap:8px">
              <span>💰</span> تذكير فاتورة
            </button>
          </div>
        </div>
      </div>

      <!-- Email tips -->
      <div class="card" style="padding:16px;margin-top:14px">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">💡 تلميحات</div>
        <div style="font-size:12px;color:#64748b;line-height:1.8">
          • اختر عميلاً من القائمة لتعبئة الإيميل تلقائياً<br>
          • يمكنك إرفاق الالتزامات والفواتير مع الرسالة<br>
          • الرسائل ترسل بصيغة HTML احترافية<br>
          • تأكد من ضبط SMTP في <a onclick="navigate('settings')" style="color:#1a2472;cursor:pointer;font-weight:600">الإعدادات</a>
        </div>
      </div>
    </div>

    <!-- Right panel: Compose area -->
    <div class="card" style="padding:0;overflow:hidden">
      <!-- Compose header -->
      <div style="padding:16px 24px;background:linear-gradient(135deg,#eef1fb,#f8fafc);border-bottom:1px solid #e8edf3;display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#1a2472,#5b8ec4);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px">📧</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#1e293b">إنشاء رسالة جديدة</div>
          <div style="font-size:11px;color:#64748b">أرسل بريداً إلكترونياً لأي عميل من هنا</div>
        </div>
      </div>

      <!-- Fields -->
      <div style="padding:20px 24px">
        <!-- Client picker -->
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">العميل (اختياري)</label>
          <select id="mailClientPicker" class="input" onchange="mailOnClientChange(this)" style="font-size:13.5px">
            <option value="">— اختر عميلاً أو اكتب الإيميل يدوياً —</option>
            ${clientOptions}
          </select>
        </div>

        <!-- To field -->
        <div style="margin-bottom:14px;display:flex;align-items:center;gap:0;border:1.5px solid #d1d5db;border-radius:10px;overflow:hidden;background:white;transition:border .15s" onfocusin="this.style.borderColor='#1a2472'" onfocusout="this.style.borderColor='#d1d5db'">
          <div style="padding:10px 14px;background:#f8fafc;border-left:1.5px solid #e8edf3;font-size:12px;font-weight:700;color:#6b7280;min-width:70px;text-align:center">إلى</div>
          <input id="mailTo" type="email" placeholder="email@example.com"
            style="flex:1;padding:10px 14px;border:none;font-size:13.5px;font-family:inherit;outline:none;color:#1e293b"/>
        </div>

        <!-- Subject field -->
        <div style="margin-bottom:14px;display:flex;align-items:center;gap:0;border:1.5px solid #d1d5db;border-radius:10px;overflow:hidden;background:white;transition:border .15s" onfocusin="this.style.borderColor='#1a2472'" onfocusout="this.style.borderColor='#d1d5db'">
          <div style="padding:10px 14px;background:#f8fafc;border-left:1.5px solid #e8edf3;font-size:12px;font-weight:700;color:#6b7280;min-width:70px;text-align:center">موضوع</div>
          <input id="mailSubject" type="text" placeholder="موضوع الرسالة..."
            style="flex:1;padding:10px 14px;border:none;font-size:13.5px;font-family:inherit;outline:none;color:#1e293b"/>
        </div>

        <!-- Body -->
        <div style="margin-bottom:16px">
          <textarea id="mailBody" rows="12"
            placeholder="اكتب رسالتك هنا...

مثال:
السادة المحترمون،

نود التذكير بموعد تقديم الإقرار الضريبي القادم...

مع تحيات،
مكتب MS Accounting"
            style="width:100%;padding:14px 16px;border:1.5px solid #d1d5db;border-radius:10px;font-size:13.5px;font-family:inherit;line-height:1.9;resize:vertical;min-height:200px;direction:rtl;box-sizing:border-box;outline:none;transition:border .15s"
            onfocus="this.style.borderColor='#1a2472';this.style.boxShadow='0 0 0 3px rgba(37,99,235,.1)'"
            onfocusout="this.style.borderColor='#d1d5db';this.style.boxShadow='none'"></textarea>
        </div>

        <!-- Attach options -->
        <div style="margin-bottom:18px;padding:14px 16px;background:#f8fafc;border-radius:10px;border:1.5px dashed #d1d5db">
          <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">إرفاق بيانات من النظام</div>
          <div style="display:flex;gap:24px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer;color:#374151">
              <input type="checkbox" id="mailInclObl" style="width:16px;height:16px;accent-color:#1a2472"/>
              🔔 الالتزامات الضريبية القادمة
            </label>
            <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer;color:#374151">
              <input type="checkbox" id="mailInclInv" style="width:16px;height:16px;accent-color:#1a2472"/>
              📄 الفواتير المعلقة
            </label>
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:8px">* البيانات ستُضاف تلقائياً في نهاية الرسالة بتنسيق احترافي</div>
        </div>

        <!-- Result -->
        <div id="mailResult" style="margin-bottom:12px"></div>

        <!-- Actions -->
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div style="display:flex;gap:8px">
            <button onclick="mailClear()" class="btn btn-secondary">
              🗑️ مسح
            </button>
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="mailSend()" id="mailSendBtn" class="btn btn-primary" style="min-width:160px;justify-content:center">
              📨 إرسال الرسالة
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function mailOnClientChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  const email = opt.dataset.email || '';
  const name = opt.dataset.name || '';
  if(email) document.getElementById('mailTo').value = email;
  if(name) {
    const sub = document.getElementById('mailSubject');
    if(!sub.value || sub.value === sub.dataset.auto) {
      const auto = `تذكير من مكتب MS Accounting — ${name}`;
      sub.value = auto;
      sub.dataset.auto = auto;
    }
  }
  mailSelectedClient = sel.value ? parseInt(sel.value) : null;
}

function mailFocusCompose() {
  document.getElementById('mailBody')?.focus();
}

function mailQuickReminder() {
  const body = document.getElementById('mailBody');
  if(body && !body.value) {
    body.value = `السادة المحترمون،

نود التذكير بأن لديكم التزامات ضريبية قادمة تستوجب التقديم في المواعيد المحددة، لتجنب الغرامات والعقوبات المقررة قانوناً.

نرجو التكرم بمراجعتنا في أقرب وقت للاستعداد لهذه الالتزامات.

مع خالص التقدير،
مكتب MS Accounting`;
    document.getElementById('mailInclObl').checked = true;
  }
  body?.focus();
}

function mailQuickInvoice() {
  const body = document.getElementById('mailBody');
  if(body && !body.value) {
    body.value = `السادة المحترمون،

نود التذكير بوجود فواتير مستحقة السداد، ونأمل منكم التفضل بتسوية المستحقات في أقرب وقت ممكن.

لأي استفسار، يرجى التواصل مع مكتبنا.

مع خالص التقدير،
مكتب MS Accounting`;
    document.getElementById('mailInclInv').checked = true;
  }
  body?.focus();
}

function mailClear() {
  document.getElementById('mailClientPicker').value = '';
  document.getElementById('mailTo').value = '';
  document.getElementById('mailSubject').value = '';
  document.getElementById('mailBody').value = '';
  document.getElementById('mailInclObl').checked = false;
  document.getElementById('mailInclInv').checked = false;
  document.getElementById('mailResult').innerHTML = '';
  mailSelectedClient = null;
}

async function mailSend() {
  const btn = document.getElementById('mailSendBtn');
  const resultDiv = document.getElementById('mailResult');
  const toEmail = document.getElementById('mailTo')?.value?.trim();
  const subject = document.getElementById('mailSubject')?.value?.trim();
  const body = document.getElementById('mailBody')?.value?.trim();
  const inclObl = document.getElementById('mailInclObl')?.checked;
  const inclInv = document.getElementById('mailInclInv')?.checked;

  if(!toEmail) {
    resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px 14px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca">⚠️ يرجى إدخال البريد الإلكتروني للمستلم</div>`;
    document.getElementById('mailTo')?.focus(); return;
  }
  if(!subject) {
    resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px 14px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca">⚠️ يرجى إدخال موضوع الرسالة</div>`;
    document.getElementById('mailSubject')?.focus(); return;
  }
  if(!body) {
    resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px 14px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca">⚠️ يرجى كتابة نص الرسالة</div>`;
    document.getElementById('mailBody')?.focus(); return;
  }

  btn.disabled = true;
  btn.innerHTML = '⏳ جارٍ الإرسال...';
  resultDiv.innerHTML = '';

  try {
    const r = await api('POST', '/api/notifications/compose', {
      to_email: toEmail,
      subject: subject,
      body: body,
      client_id: mailSelectedClient || null,
      include_obligations: inclObl,
      include_invoices: inclInv,
    });
    resultDiv.innerHTML = `<div style="color:#16a34a;font-size:13.5px;padding:12px 16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;display:flex;align-items:center;gap:8px">
      <span style="font-size:18px">✅</span>
      <div><strong>تم الإرسال بنجاح!</strong><br><span style="font-size:12px;color:#15803d">${escH(r.message)}</span></div>
    </div>`;
    btn.innerHTML = '✅ تم الإرسال';
    // Log to sent list visually
    const sentList = document.getElementById('mailSentList');
    if(sentList) {
      const now = new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
      const item = document.createElement('div');
      item.style.cssText = 'padding:8px 10px;border-radius:7px;background:#f0fdf4;border:1px solid #bbf7d0;margin-bottom:6px;font-size:12px;color:#374151';
      item.innerHTML = `<div style="font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(subject)}</div>
        <div style="color:#16a34a;font-size:11px;margin-top:2px">📧 ${escH(toEmail)} · ${now}</div>`;
      sentList.innerHTML = '';
      sentList.prepend(item);
    }
    // Reset after 3s
    setTimeout(()=>{
      btn.disabled = false;
      btn.innerHTML = '📨 إرسال الرسالة';
    }, 3000);
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px 14px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca">
      <strong>❌ فشل الإرسال</strong><br><span style="font-size:12px">${escH(e.message)}</span>
    </div>`;
    btn.disabled = false;
    btn.innerHTML = '📨 إرسال الرسالة';
  }
}
window.mailSend = mailSend;
window.mailClear = mailClear;
window.mailFocusCompose = mailFocusCompose;
window.mailQuickReminder = mailQuickReminder;
window.mailQuickInvoice = mailQuickInvoice;
window.mailOnClientChange = mailOnClientChange;

// ── QUOTATIONS — عروض أسعار التأسيس ───────────────
// Status labels & colors
const QUO_STATUS = {
  draft:       {label:'مسودة',       color:'#6b7280', bg:'#f3f4f6', icon:'📝'},
  sent:        {label:'مُرسَل',       color:'#1a2472', bg:'#eef1fb', icon:'📨'},
  opened:      {label:'تم الفتح',    color:'#7c3aed', bg:'#ede9fe', icon:'👁'},
  replied:     {label:'ردَّ العميل',  color:'#0369a1', bg:'#e0f2fe', icon:'💬'},
  accepted:    {label:'مقبول ✓',    color:'#15803d', bg:'#dcfce7', icon:'✅'},
  rejected:    {label:'مرفوض',      color:'#dc2626', bg:'#fee2e2', icon:'❌'},
  negotiation: {label:'تفاوض',      color:'#d97706', bg:'#fef9c3', icon:'🤝'},
  expired:     {label:'منتهي',      color:'#94a3b8', bg:'#f8fafc', icon:'⏰'},
  cancelled:   {label:'ملغي',       color:'#6b7280', bg:'#f3f4f6', icon:'🚫'},
};

// Built-in templates cache
let quoTemplates = {builtin:[], custom:[]};
let quoCurrentData = null; // currently editing/viewing

async function loadQuotations() {
  const main = document.getElementById('main');
  main.className = 'page';

  // Load stats and templates in parallel
  const activeStatus = document.getElementById('quoStatusFilter')?.value || '';
  const activeSearch = document.getElementById('quoSearch')?.value?.trim() || '';
  let stats = {total:0, by_status:{}, total_value:0, accepted_value:0, conversion_rate:0};
  let data  = {total:0, items:[]};
  try {
    let listUrl = '/api/quotations?page_size=50';
    if(activeStatus) listUrl += `&status=${encodeURIComponent(activeStatus)}`;
    if(activeSearch) listUrl += `&q=${encodeURIComponent(activeSearch)}`;
    [stats, data, quoTemplates] = await Promise.all([
      api('GET', '/api/quotations/stats').catch(()=>({total:0,by_status:{},total_value:0,accepted_value:0,conversion_rate:0})),
      api('GET', listUrl).catch(()=>({total:0,items:[]})),
      api('GET', '/api/quotations/templates').catch(()=>({builtin:[],custom:[]})),
    ]);
  } catch(e) {}

  const items = data.items || [];

  main.innerHTML = `
  <!-- Stats row -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px">
    ${[
      {k:'total',       label:'إجمالي العروض',    icon:'💼', val:stats.total||0,       color:'#1a2472'},
      {k:'sent',        label:'مُرسَلة',           icon:'📨', val:stats.by_status?.sent||0,     color:'#1a2472'},
      {k:'negotiation', label:'تفاوض',             icon:'🤝', val:stats.by_status?.negotiation||0, color:'#d97706'},
      {k:'accepted',    label:'مقبولة',            icon:'✅', val:stats.by_status?.accepted||0,  color:'#15803d'},
      {k:'total_val',   label:'قيمة العروض',       icon:'💰', val:money(stats.total_value||0),   color:'#0369a1'},
      {k:'conv',        label:'نسبة التحويل',      icon:'📈', val:(stats.conversion_rate||0)+'%', color:'#7c3aed'},
    ].map(s=>`
      <div class="stat-card" style="padding:16px;border-right:3px solid ${s.color}">
        <div style="font-size:20px;margin-bottom:6px">${s.icon}</div>
        <div style="font-size:22px;font-weight:800;color:#1e293b;line-height:1">${s.val}</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px">${s.label}</div>
      </div>`).join('')}
  </div>

  <!-- Actions bar -->
  <div class="card" style="padding:16px 20px;margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-primary" onclick="showQuotationForm()" style="gap:8px">
      <span style="font-size:16px">✏️</span> إنشاء عرض سعر جديد
    </button>
    <input id="quoSearch" class="input" style="max-width:280px" placeholder="بحث باسم العميل أو رقم العرض..." oninput="quoSearchDebounce(this.value)"/>
    <select id="quoStatusFilter" class="input" style="max-width:160px" onchange="loadQuotations()">
      <option value="">كل الحالات</option>
      ${Object.entries(QUO_STATUS).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
    </select>
  </div>

  <!-- Quotations table -->
  <div class="card" style="overflow:hidden">
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>رقم العرض</th>
          <th>العميل</th>
          <th>الكيان القانوني</th>
          <th>النشاط</th>
          <th>الإجمالي</th>
          <th>الحالة</th>
          <th>التاريخ</th>
          <th>الإجراءات</th>
        </tr>
      </thead>
      <tbody>
        ${items.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:40px;color:#94a3b8">
          <div style="font-size:40px;margin-bottom:10px">💼</div>
          <div>لا توجد عروض أسعار بعد</div>
          <button class="btn btn-primary" style="margin-top:14px" onclick="showQuotationForm()">✏️ أنشئ أول عرض</button>
        </td></tr>` : items.map(q => {
          const st = QUO_STATUS[q.status] || QUO_STATUS.draft;
          return `<tr style="cursor:pointer" onclick="showQuotationDetail(${q.id})">
            <td style="font-weight:700;color:#1a2472">${escH(q.quote_number||'')}</td>
            <td>
              <div style="font-weight:600">${escH(q.client_name||'')}</div>
              ${q.client_phone?`<div style="font-size:11px;color:#94a3b8">${escH(q.client_phone)}</div>`:''}
            </td>
            <td><span style="font-size:12px;background:#eef1fb;color:#1a2472;padding:3px 8px;border-radius:6px">${escH(q.legal_entity||'—')}</span></td>
            <td style="font-size:12px;color:#64748b;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(q.activity||'—')}</td>
            <td style="font-weight:700;color:#15803d">${q.expenses_total?money(q.expenses_total):'—'}</td>
            <td onclick="event.stopPropagation()">
              <select onchange="quickStatusUpdate(${q.id},this.value)" style="font-size:12px;border:1.5px solid ${st.color};border-radius:8px;padding:3px 8px;background:${st.bg};color:${st.color};font-family:inherit;cursor:pointer;outline:none">
                ${Object.entries(QUO_STATUS).map(([k,v])=>`<option value="${k}" ${q.status===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
              </select>
            </td>
            <td style="font-size:12px;color:#94a3b8">${q.created_at?new Date(q.created_at).toLocaleDateString('ar-EG'):'—'}</td>
            <td onclick="event.stopPropagation()">
              <div style="display:flex;gap:5px">
                <button class="btn btn-secondary btn-sm" onclick="showQuotationDetail(${q.id})" title="عرض التفاصيل">👁</button>
                <button class="btn btn-secondary btn-sm" onclick="showQuotationPreview(${q.id})" title="معاينة وطباعة PDF">🖨️</button>
                <button class="btn btn-secondary btn-sm" onclick="duplicateQuotation(${q.id})" title="نسخ العرض">📋</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
  </div>`;

  // Set up search
  window._quoSearchTimeout = null;
}

window.quoSearchDebounce = function(val) {
  clearTimeout(window._quoSearchTimeout);
  window._quoSearchTimeout = setTimeout(async ()=>{
    const status = document.getElementById('quoStatusFilter')?.value || '';
    let url = `/api/quotations?page_size=50`;
    if(val) url += `&q=${encodeURIComponent(val)}`;
    if(status) url += `&status=${status}`;
    try {
      const data = await api('GET', url);
      const tbody = document.querySelector('#main table tbody');
      if(!tbody) return;
      const items = data.items || [];
      if(!items.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8">لا توجد نتائج</td></tr>`;
        return;
      }
      tbody.innerHTML = items.map(q => {
        const st = QUO_STATUS[q.status] || QUO_STATUS.draft;
        return `<tr style="cursor:pointer" onclick="showQuotationDetail(${q.id})">
          <td style="font-weight:700;color:#1a2472">${escH(q.quote_number||'')}</td>
          <td><div style="font-weight:600">${escH(q.client_name||'')}</div>${q.client_phone?`<div style="font-size:11px;color:#94a3b8">${escH(q.client_phone)}</div>`:''}</td>
          <td><span style="font-size:12px;background:#eef1fb;color:#1a2472;padding:3px 8px;border-radius:6px">${escH(q.legal_entity||'—')}</span></td>
          <td style="font-size:12px;color:#64748b">${escH(q.activity||'—')}</td>
          <td style="font-weight:700;color:#15803d">${q.expenses_total?money(q.expenses_total):'—'}</td>
          <td><select onchange="quickStatusUpdate(${q.id},this.value)" style="font-size:12px;border:1.5px solid ${st.color};border-radius:8px;padding:3px 8px;background:${st.bg};color:${st.color};font-family:inherit;cursor:pointer;outline:none">
            ${Object.entries(QUO_STATUS).map(([k,v])=>`<option value="${k}" ${q.status===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
          </select></td>
          <td style="font-size:12px;color:#94a3b8">${q.created_at?new Date(q.created_at).toLocaleDateString('ar-EG'):'—'}</td>
          <td onclick="event.stopPropagation()"><div style="display:flex;gap:5px">
            <button class="btn btn-secondary btn-sm" onclick="showQuotationDetail(${q.id})">👁</button>
            <button class="btn btn-secondary btn-sm" onclick="showQuotationPreview(${q.id})">🖨️</button>
            ${q.client_phone?`<button title="واتساب" style="background:#25d366;color:white;border:none;border-radius:7px;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center" onclick="sendQuotationWhatsApp(${q.id},'${escH(q.client_phone)}','${escH(q.client_name||'')}','${escH(q.quote_number||'')}',${q.expenses_total||0},'${escH(q.legal_entity||'')}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.527 5.845L.057 23.786a.5.5 0 0 0 .637.637l5.941-1.47A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.806 9.806 0 0 1-5.007-1.374l-.359-.213-3.723.921.937-3.625-.234-.374A9.819 9.819 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/></svg>
            </button>`:''}
          </div></td>
        </tr>`;
      }).join('');
    } catch(e) {}
  }, 300);
};

async function quickStatusUpdate(qid, status) {
  try {
    await api('PATCH', `/api/quotations/${qid}/status`, {status});
    toast(`تم تحديث حالة العرض إلى: ${QUO_STATUS[status]?.label||status}`);
  } catch(e) { toast(e.message,'error'); }
}

// ── Create / Edit Quotation Form ──────────────────────────────────────────
async function showQuotationForm(existingId = null) {
  // Load templates if not loaded
  if(!quoTemplates.builtin?.length) {
    try { quoTemplates = await api('GET', '/api/quotations/templates'); } catch(e) {}
  }

  let existing = null;
  if(existingId) {
    try { existing = await api('GET', `/api/quotations/${existingId}`); } catch(e) {}
  }

  const allTemplates = [...(quoTemplates.builtin||[]), ...(quoTemplates.custom||[])];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" style="max-width:700px;max-height:95vh">
    <div style="padding:18px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#1a2472,#152060);border-radius:18px 18px 0 0">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:24px">💼</div>
        <div>
          <h2 style="font-size:15px;font-weight:700;color:white;margin:0">${existingId?'تعديل عرض السعر':'إنشاء عرض سعر جديد'}</h2>
          <div style="font-size:11px;color:#b3c4e8">عروض أسعار تأسيس الشركات — Smart Quotation System</div>
        </div>
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.15);border:none;width:32px;height:32px;border-radius:8px;font-size:16px;cursor:pointer;color:white">✕</button>
    </div>
    <div style="padding:20px 24px;overflow-y:auto;max-height:calc(95vh - 80px)">

      <!-- Template picker -->
      <div style="margin-bottom:18px;padding:14px 16px;background:#f0f4ff;border-radius:10px;border:1.5px dashed #b3c4e8">
        <div style="font-size:11px;font-weight:700;color:#1a2472;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">⚡ قوالب سريعة — اختر نوع الشركة</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${allTemplates.map(t=>`
            <button onclick="applyQuoTemplate('${t.id}')" style="padding:6px 12px;border-radius:8px;font-size:12px;font-family:inherit;cursor:pointer;border:1.5px solid #d1d5db;background:white;color:#374151;transition:all .15s" onmouseover="this.style.background='#1a2472';this.style.color='white';this.style.borderColor='#1a2472'" onmouseout="this.style.background='white';this.style.color='#374151';this.style.borderColor='#d1d5db'">${t.name}</button>
          `).join('')}
        </div>
      </div>

      <!-- Client info -->
      <div style="margin-bottom:16px;padding:14px 16px;background:#f8fafc;border-radius:10px;border:1px solid #e8edf3">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">بيانات العميل</div>
        <div class="form-row" style="grid-template-columns:1fr 1fr">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">اسم العميل *</label>
            <input id="qClientName" class="input" value="${escH(existing?.client_name||'')}" placeholder="مثال: أحمد محمد علي"/>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">رقم الهاتف</label>
            <input id="qClientPhone" class="input" type="tel" value="${escH(existing?.client_phone||'')}" placeholder="01xxxxxxxxx"/>
          </div>
        </div>
        <div style="margin-top:10px">
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">البريد الإلكتروني</label>
          <input id="qClientEmail" class="input" type="email" value="${escH(existing?.client_email||'')}" placeholder="client@example.com"/>
        </div>
      </div>

      <!-- Company details -->
      <div style="margin-bottom:16px;padding:14px 16px;background:#f8fafc;border-radius:10px;border:1px solid #e8edf3">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">بيانات الشركة</div>
        <div class="form-row" style="grid-template-columns:1fr 1fr">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الكيان القانوني</label>
            <select id="qLegalEntity" class="input">
              <option value="">— اختر —</option>
              ${['شركة شخص واحد','شركة ذات مسؤولية محدودة','منشأة فردية','شركة مساهمة','شركة توصية بالأسهم','شركة تضامن','فرع شركة أجنبية','شركة قابضة'].map(e=>`<option value="${e}" ${existing?.legal_entity===e?'selected':''}>${e}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">مقر النشاط</label>
            <select id="qActivityLocation" class="input">
              <option value="">— اختر —</option>
              ${['افتراضي','مكتب خاص','وحدة سكنية','محل تجاري','مصنع / مستودع','مركز أعمال'].map(l=>`<option value="${l}" ${existing?.activity_location===l?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-top:10px">
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">النشاط التجاري</label>
          <input id="qActivity" class="input" value="${escH(existing?.activity||'')}" placeholder="مثال: توريدات عمومية / كيماويات / تصدير"/>
        </div>
        <div style="margin-top:10px">
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">رأس المال (جنيه)</label>
          <input id="qCapital" class="input" type="number" value="${existing?.capital||''}" placeholder="150000"/>
        </div>
      </div>

      <!-- Deliverables -->
      <div style="margin-bottom:16px;padding:14px 16px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.5px">📦 ما يستلمه العميل منا</div>
          <button onclick="addQuoItem('qDeliverables')" style="background:#16a34a;color:white;border:none;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;font-family:inherit">+ إضافة</button>
        </div>
        <div id="qDeliverables">
          ${(existing?.deliverables||[]).map((d,i)=>quoItemRow('qDeliverables',d,i)).join('')}
        </div>
      </div>

      <!-- Requirements -->
      <div style="margin-bottom:16px;padding:14px 16px;background:#fffbeb;border-radius:10px;border:1px solid #fde68a">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.5px">📌 المطلوب من العميل</div>
          <button onclick="addQuoItem('qRequirements')" style="background:#d97706;color:white;border:none;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;font-family:inherit">+ إضافة</button>
        </div>
        <div id="qRequirements">
          ${(existing?.requirements||[]).map((r,i)=>quoItemRow('qRequirements',r,i)).join('')}
        </div>
      </div>

      <!-- Pricing -->
      <div style="margin-bottom:16px;padding:14px 16px;background:#f8fafc;border-radius:10px;border:1px solid #e8edf3">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">💰 التسعير والأتعاب</div>
        <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">رسوم حكومية</label>
            <input id="qGovFees" class="input" type="number" value="${existing?.government_fees||0}" oninput="calcQuoTotal()"/>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">أتعاب المكتب</label>
            <input id="qOfficeFees" class="input" type="number" value="${existing?.office_fees||0}" oninput="calcQuoTotal()"/>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">إجمالي المصاريف والأتعاب *</label>
            <input id="qTotal" class="input" type="number" value="${existing?.expenses_total||0}" style="font-weight:700;font-size:15px;border-color:#1a2472"/>
          </div>
        </div>
      </div>

      <!-- Greeting + Advisor + Notes -->
      <div style="margin-bottom:16px;padding:14px 16px;background:#f8fafc;border-radius:10px;border:1px solid #e8edf3">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">التوقيع والملاحظات</div>
        <div class="form-row" style="grid-template-columns:1fr 1fr">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">التحية</label>
            <select id="qGreeting" class="input">
              ${['مساء الخير','صباح الخير','السادة المحترمون','مرحباً بكم'].map(g=>`<option value="${g}" ${(existing?.greeting||'مساء الخير')===g?'selected':''}>${g}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">اسم المستشار</label>
            <input id="qAdvisor" class="input" value="${escH(existing?.advisor_name||currentUser?.name||'')}" placeholder="المستشار / عمرو شعبان"/>
          </div>
        </div>
        <div style="margin-top:10px">
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">ملاحظات إضافية</label>
          <textarea id="qNotes" class="input" rows="2" placeholder="أي ملاحظات أو شروط إضافية...">${escH(existing?.notes||'')}</textarea>
        </div>
      </div>

      <div id="quoFormResult" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        ${existingId?`<button class="btn btn-secondary" onclick="saveQuotationForm(${existingId}, true)">💾 حفظ وإغلاق</button>`:''}
        <button class="btn btn-primary" onclick="saveQuotationForm(${existingId||'null'})" style="min-width:160px">
          ${existingId?'💾 حفظ التعديلات':'📋 إنشاء عرض السعر'}
        </button>
      </div>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };

  // Store template data globally for apply function
  window._quoTemplateData = allTemplates;
}

function quoItemRow(containerId, text='', idx=0) {
  return `<div style="display:flex;gap:6px;margin-bottom:6px" id="${containerId}_item_${idx}">
    <input class="input" style="flex:1;font-size:13px" value="${escH(text)}" placeholder="أضف بنداً..."/>
    <button onclick="this.parentElement.remove()" style="background:#fee2e2;border:none;border-radius:6px;width:30px;cursor:pointer;font-size:14px;color:#dc2626">×</button>
  </div>`;
}

function addQuoItem(containerId) {
  const container = document.getElementById(containerId);
  if(!container) return;
  const idx = container.children.length;
  container.insertAdjacentHTML('beforeend', quoItemRow(containerId, '', idx));
}

function calcQuoTotal() {
  const gov = parseFloat(document.getElementById('qGovFees')?.value||0);
  const off = parseFloat(document.getElementById('qOfficeFees')?.value||0);
  const total = document.getElementById('qTotal');
  if(total && (gov+off > 0)) total.value = gov + off;
}

function getQuoItems(containerId) {
  const container = document.getElementById(containerId);
  if(!container) return [];
  return Array.from(container.querySelectorAll('input')).map(i=>i.value.trim()).filter(Boolean);
}

function applyQuoTemplate(templateId) {
  const all = window._quoTemplateData || [];
  const t = all.find(x => x.id === templateId || x.id === String(templateId));
  if(!t) return;

  // Fill legal entity
  const le = document.getElementById('qLegalEntity');
  if(le && t.legal_entity) le.value = t.legal_entity;

  // Fill greeting
  const gr = document.getElementById('qGreeting');
  if(gr && t.greeting) gr.value = t.greeting;

  // Fill total
  const tot = document.getElementById('qTotal');
  if(tot && t.default_expenses) tot.value = t.default_expenses;

  // Fill deliverables
  const deliv = document.getElementById('qDeliverables');
  if(deliv && t.deliverables?.length) {
    deliv.innerHTML = t.deliverables.map((d,i)=>quoItemRow('qDeliverables',d,i)).join('');
  }

  // Fill requirements
  const reqs = document.getElementById('qRequirements');
  if(reqs && t.requirements?.length) {
    reqs.innerHTML = t.requirements.map((r,i)=>quoItemRow('qRequirements',r,i)).join('');
  }

  toast(`تم تطبيق قالب: ${t.name}`);
}

async function saveQuotationForm(existingId, closeAfter = false) {
  const resultDiv = document.getElementById('quoFormResult');
  const btn = event?.target;
  const clientName = document.getElementById('qClientName')?.value?.trim();
  if(!clientName) {
    resultDiv.innerHTML = `<div style="color:#dc2626;padding:8px 12px;background:#fef2f2;border-radius:6px">⚠️ اسم العميل مطلوب</div>`;
    return;
  }

  const payload = {
    client_name: clientName,
    client_phone: document.getElementById('qClientPhone')?.value?.trim()||null,
    client_email: document.getElementById('qClientEmail')?.value?.trim()||null,
    legal_entity: document.getElementById('qLegalEntity')?.value||null,
    activity: document.getElementById('qActivity')?.value?.trim()||null,
    activity_location: document.getElementById('qActivityLocation')?.value||null,
    capital: parseFloat(document.getElementById('qCapital')?.value||0),
    deliverables: getQuoItems('qDeliverables'),
    requirements: getQuoItems('qRequirements'),
    expenses_total: parseFloat(document.getElementById('qTotal')?.value||0),
    government_fees: parseFloat(document.getElementById('qGovFees')?.value||0),
    office_fees: parseFloat(document.getElementById('qOfficeFees')?.value||0),
    notes: document.getElementById('qNotes')?.value?.trim()||null,
    greeting: document.getElementById('qGreeting')?.value||'مساء الخير',
    advisor_name: document.getElementById('qAdvisor')?.value?.trim()||null,
  };

  if(btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ الحفظ...'; }
  resultDiv.innerHTML = '';

  try {
    let result;
    if(existingId) {
      result = await api('PUT', `/api/quotations/${existingId}`, payload);
      toast('تم تحديث عرض السعر بنجاح ✅');
    } else {
      result = await api('POST', '/api/quotations', payload);
      toast('تم إنشاء عرض السعر بنجاح ✅');
    }

    const overlay = document.querySelector('.modal-overlay');
    if(overlay) overlay.remove();

    // Show the detail/preview
    if(!closeAfter) showQuotationDetail(result.id);
    else loadQuotations();
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:#dc2626;padding:8px 12px;background:#fef2f2;border-radius:6px">❌ ${escH(e.message)}</div>`;
    if(btn) { btn.disabled = false; btn.textContent = existingId ? '💾 حفظ التعديلات' : '📋 إنشاء عرض السعر'; }
  }
}

// ── Quotation Detail Modal ────────────────────────────────────────────────
async function showQuotationDetail(id) {
  let q;
  try { q = await api('GET', `/api/quotations/${id}`); } catch(e) { toast(e.message,'error'); return; }

  const st = QUO_STATUS[q.status] || QUO_STATUS.draft;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" style="max-width:640px;max-height:92vh">
    <div style="padding:18px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#1a2472,#152060);border-radius:18px 18px 0 0">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:22px">💼</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:white">${escH(q.quote_number||'')} — الإصدار ${q.version||1}</div>
          <div style="font-size:11px;color:#b3c4e8">${escH(q.client_name)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="background:${st.bg};color:${st.color};font-size:12px;font-weight:700;padding:4px 10px;border-radius:8px">${st.icon} ${st.label}</span>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.15);border:none;width:32px;height:32px;border-radius:8px;font-size:16px;cursor:pointer;color:white">✕</button>
      </div>
    </div>
    <div style="padding:20px 24px;overflow-y:auto;max-height:calc(92vh - 80px)">

      <!-- Quick info -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:#f8fafc;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:4px">العميل</div>
          <div style="font-weight:700;color:#1e293b">${escH(q.client_name)}</div>
          ${q.client_phone?`<div style="font-size:12px;color:#64748b">📞 ${escH(q.client_phone)}</div>`:''}
          ${q.client_email?`<div style="font-size:12px;color:#64748b">📧 ${escH(q.client_email)}</div>`:''}
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:4px">تفاصيل الشركة</div>
          ${q.legal_entity?`<div style="font-size:12px;color:#1e293b;font-weight:600">${escH(q.legal_entity)}</div>`:''}
          ${q.activity?`<div style="font-size:12px;color:#64748b">${escH(q.activity)}</div>`:''}
          ${q.activity_location?`<div style="font-size:12px;color:#64748b">📍 ${escH(q.activity_location)}</div>`:''}
          ${q.capital?`<div style="font-size:12px;color:#64748b">💰 رأس المال: ${money(q.capital)}</div>`:''}
        </div>
      </div>

      <!-- Pricing highlight -->
      <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:11px;color:#15803d;font-weight:700">إجمالي المصاريف والأتعاب</div>
          <div style="font-size:28px;font-weight:800;color:#15803d">${money(q.expenses_total||0)}</div>
          ${(q.government_fees||q.office_fees)?`<div style="font-size:11px;color:#6b7280">رسوم حكومية: ${money(q.government_fees||0)} | أتعاب المكتب: ${money(q.office_fees||0)}</div>`:''}
        </div>
        <div style="font-size:40px">💰</div>
      </div>

      <!-- Deliverables + Requirements -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        ${q.deliverables?.length?`<div style="background:#f0fdf4;border-right:3px solid #16a34a;border-radius:8px;padding:12px 14px">
          <div style="font-size:11px;font-weight:700;color:#15803d;margin-bottom:8px">📦 ما يستلمه العميل</div>
          <ul style="margin:0;padding-right:16px;font-size:12px;color:#374151;line-height:1.9">
            ${q.deliverables.map(d=>`<li>${escH(d)}</li>`).join('')}
          </ul>
        </div>`:''}
        ${q.requirements?.length?`<div style="background:#fffbeb;border-right:3px solid #d97706;border-radius:8px;padding:12px 14px">
          <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:8px">📌 المطلوب من العميل</div>
          <ul style="margin:0;padding-right:16px;font-size:12px;color:#374151;line-height:1.9">
            ${q.requirements.map(r=>`<li>${escH(r)}</li>`).join('')}
          </ul>
        </div>`:''}
      </div>

      ${q.notes?`<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:#374151"><strong>ملاحظات:</strong> ${escH(q.notes)}</div>`:''}

      <!-- Tracking / status -->
      <div style="background:#f8fafc;border-radius:8px;padding:12px 14px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">متابعة الحالة</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${Object.entries(QUO_STATUS).map(([k,v])=>`
            <button onclick="quoUpdateStatus(${q.id},'${k}')" style="padding:4px 10px;border-radius:7px;font-size:12px;font-family:inherit;cursor:pointer;border:1.5px solid ${q.status===k?v.color:'#d1d5db'};background:${q.status===k?v.bg:'white'};color:${q.status===k?v.color:'#374151'};font-weight:${q.status===k?'700':'400'}">
              ${v.icon} ${v.label}
            </button>`).join('')}
        </div>
        ${q.sent_at?`<div style="font-size:11px;color:#94a3b8">📨 أُرسل في: ${new Date(q.sent_at).toLocaleDateString('ar-EG')}</div>`:''}
        ${q.opened_at?`<div style="font-size:11px;color:#94a3b8">👁 فُتح في: ${new Date(q.opened_at).toLocaleDateString('ar-EG')}</div>`:''}
        ${q.last_contact_at?`<div style="font-size:11px;color:#94a3b8">💬 آخر تواصل: ${new Date(q.last_contact_at).toLocaleDateString('ar-EG')}</div>`:''}
      </div>

      ${q.client_notes?`<div style="background:#eef1fb;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:#374151"><strong>ملاحظات العميل:</strong> ${escH(q.client_notes)}</div>`:''}

      <!-- Action buttons -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;border-top:1px solid #f1f5f9;padding-top:16px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();showQuotationPreview(${q.id})" style="gap:6px">🖨️ معاينة وطباعة PDF</button>
          <button class="btn btn-secondary" onclick="sendQuotationEmail(${q.id},'${escH(q.client_email||'')}')">📧 إرسال بإيميل</button>
          <button class="btn btn-sm" style="background:#25d366;color:white;border:none;font-weight:700;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-family:inherit;cursor:pointer;font-size:13px" onclick="sendQuotationWhatsApp(${q.id},'${escH(q.client_phone||'')}','${escH(q.client_name||'')}','${escH(q.quote_number||'')}',${q.expenses_total||0},'${escH(q.legal_entity||'')}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.527 5.845L.057 23.786a.5.5 0 0 0 .637.637l5.941-1.47A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.806 9.806 0 0 1-5.007-1.374l-.359-.213-3.723.921.937-3.625-.234-.374A9.819 9.819 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/></svg>
            واتساب
          </button>
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove();showQuotationForm(${q.id})">✏️ تعديل</button>
          <button class="btn btn-secondary" onclick="duplicateQuotation(${q.id})">📋 نسخ</button>
        </div>
        ${q.status==='accepted'&&!q.client_id?`<button class="btn btn-success" onclick="convertQuotationToClient(${q.id})" style="gap:6px">🚀 تحويل إلى عميل</button>`:
          q.client_id?`<span style="font-size:12px;color:#16a34a;font-weight:600">✅ تم التحويل إلى عميل</span>`:''}
      </div>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };
}

async function quoUpdateStatus(id, status) {
  try {
    await api('PATCH', `/api/quotations/${id}/status`, {status});
    toast(`${QUO_STATUS[status]?.icon||''} تم تحديث الحالة: ${QUO_STATUS[status]?.label||status}`);
    // Refresh detail modal
    document.querySelector('.modal-overlay')?.remove();
    showQuotationDetail(id);
  } catch(e) { toast(e.message,'error'); }
}

async function sendQuotationEmail(id, currentEmail) {
  const email = prompt('إيميل المستلم:', currentEmail || '');
  if(!email) return;
  try {
    const r = await api('POST', `/api/quotations/${id}/send`, {to_email: email});
    toast(r.message || '✅ تم الإرسال بنجاح');
  } catch(e) { toast(e.message,'error'); }
}

function sendQuotationWhatsApp(id, phone, clientName, quoteNumber, total, legalEntity) {
  // ── تنسيق رقم الهاتف للواتساب (مصري → دولي)
  const num = toWAPhone(phone);
  if(!num){ toast('لا يوجد رقم هاتف مسجّل لهذا العميل','error'); return; }
  // ── رسالة واتساب جاهزة
  const entityAr = {
    llc:'شركة ذات مسؤولية محدودة',
    one_person:'شركة شخص واحد',
    sole:'مؤسسة فردية',
    limited_partnership:'شركة توصية بسيطة',
    joint_stock:'شركة مساهمة',
    branch:'فرع شركة أجنبية',
  }[legalEntity] || legalEntity || 'شركة';
  const totalFmt = total ? Number(total).toLocaleString('ar-EG') + ' جنيه' : '—';
  const msg = [
    `السلام عليكم ورحمة الله وبركاته 🌟`,
    ``,
    `السيد / ${clientName}`,
    ``,
    `نشكركم على تواصلكم مع مكتب MS Accounting للمحاسبة والضرائب.`,
    ``,
    `يسعدنا تقديم عرض السعر الخاص بتأسيس ${entityAr}،`,
    `وقد تم إعداده بعناية ليشمل جميع الخدمات المطلوبة.`,
    ``,
    `📋 رقم العرض: ${quoteNumber}`,
    `💰 إجمالي الأتعاب: ${totalFmt}`,
    ``,
    `نرجو مراجعة التفاصيل والتواصل معنا لأي استفسار.`,
    `نحن هنا لخدمتكم 🤝`,
    ``,
    `مكتب MS Accounting`,
  ].join('\n');

  const url = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');

  // سجّل آخر تواصل في النظام
  api('PATCH', `/api/quotations/${id}/status`, {status: 'sent'}).catch(()=>{});
}

async function duplicateQuotation(id) {
  try {
    const r = await api('POST', `/api/quotations/${id}/duplicate`);
    toast('تم نسخ عرض السعر ✅');
    document.querySelector('.modal-overlay')?.remove();
    showQuotationDetail(r.id);
  } catch(e) { toast(e.message,'error'); }
}

async function convertQuotationToClient(id) {
  if(!await confirmDlg('هل تريد تحويل عرض السعر إلى عميل جديد؟ سيتم إنشاء ملف العميل وبدء workflow التأسيس تلقائياً.')) return;
  try {
    const r = await api('POST', `/api/quotations/${id}/convert`);
    toast(r.message);
    document.querySelector('.modal-overlay')?.remove();
    if(r.client_id) setTimeout(()=>{ navigate('clients'); setTimeout(()=>showClientDetail(r.client_id),500); }, 300);
  } catch(e) { toast(e.message,'error'); }
}

// ── PDF Preview (HTML print template) ───────────────────────────────────────
async function showQuotationPreview(id) {
  let q;
  try { q = await api('GET', `/api/quotations/${id}`); } catch(e) { toast(e.message,'error'); return; }

  const capFmt = q.capital ? q.capital.toLocaleString('ar-EG') + ' جنيه' : '—';
  const totalFmt = q.expenses_total ? q.expenses_total.toLocaleString('ar-EG') + ' جنيه' : '—';
  const today = new Date().toLocaleDateString('ar-EG', {year:'numeric',month:'long',day:'numeric'});

  const delivHtml = (q.deliverables||[]).map(d=>`<li>${d}</li>`).join('');
  const reqHtml   = (q.requirements||[]).map(r=>`<li>${r}</li>`).join('');
  const extraHtml = (q.extra_services||[]).map(s=>`<li>${s}</li>`).join('');

  const printHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>عرض سعر — ${q.quote_number}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
  * { font-family: 'Cairo', sans-serif; box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; color: #1e293b; direction: rtl; font-size: 14px; line-height: 1.6; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 0; background: white; position: relative; }

  /* Header */
  .header { background: linear-gradient(135deg, #1a2472 0%, #152060 60%, #0f1848 100%); color: white; padding: 32px 40px 24px; }
  .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .company-name { font-size: 26px; font-weight: 800; letter-spacing: 1px; }
  .company-sub  { font-size: 12px; color: #b3c4e8; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
  .quote-meta { text-align: left; }
  .quote-number { font-size: 20px; font-weight: 800; color: #fbbf24; }
  .quote-date   { font-size: 12px; color: #b3c4e8; margin-top: 4px; }
  .header-divider { border-top: 1px solid rgba(255,255,255,.2); margin: 16px 0; }
  .quote-title  { font-size: 16px; font-weight: 600; color: #b3c4e8; text-align: center; }

  /* Body */
  .body { padding: 32px 40px; }
  .greeting { font-size: 17px; font-weight: 600; color: #1a2472; margin-bottom: 4px; }
  .greeting-sub { font-size: 14px; color: #64748b; margin-bottom: 24px; }

  /* Info block */
  .info-block { background: linear-gradient(135deg, #eef1fb, #f0f4ff); border: 1.5px solid #c7d2fe; border-radius: 10px; padding: 20px 24px; margin-bottom: 24px; }
  .info-title  { font-size: 13px; font-weight: 700; color: #1a2472; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 14px; border-bottom: 1px solid #c7d2fe; padding-bottom: 8px; }
  .info-row    { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; font-size: 13.5px; }
  .info-label  { color: #64748b; min-width: 120px; }
  .info-value  { font-weight: 700; color: #1e293b; flex: 1; }

  /* Total */
  .total-block { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 2px solid #86efac; border-radius: 10px; padding: 18px 24px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; }
  .total-label { font-size: 13px; color: #15803d; font-weight: 600; }
  .total-amount { font-size: 30px; font-weight: 800; color: #15803d; }
  .total-breakdown { font-size: 11px; color: #6b7280; margin-top: 4px; }

  /* Lists */
  .section-title { font-size: 13px; font-weight: 700; color: #1a2472; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
  .list-block  { margin-bottom: 22px; }
  .list-box    { background: #f8fafc; border-radius: 8px; padding: 14px 18px; border-right: 4px solid #1a2472; }
  .list-box.green { border-right-color: #16a34a; background: #f0fdf4; }
  .list-box.orange { border-right-color: #d97706; background: #fffbeb; }
  .list-box ul { margin: 0; padding-right: 20px; }
  .list-box li { font-size: 13px; color: #374151; margin-bottom: 5px; }

  /* Notes */
  .notes-block { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; font-size: 13px; color: #92400e; }

  /* Signature */
  .signature-block { border-top: 2px solid #e8edf3; padding-top: 20px; margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sig-side { text-align: center; }
  .sig-line { border-top: 1px solid #94a3b8; width: 180px; margin: 0 auto 6px; padding-top: 8px; font-size: 12px; color: #64748b; }
  .sig-name { font-weight: 700; font-size: 13px; color: #1e293b; }

  /* Footer */
  .footer { background: #1a2472; color: white; padding: 14px 40px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #b3c4e8; }

  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { margin: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="header-top">
      <div>
        <div class="company-name">🏛️ MS Accounting</div>
        <div class="company-sub">Corporate Accounting & Business Setup</div>
      </div>
      <div class="quote-meta">
        <div class="quote-number">${q.quote_number}</div>
        <div class="quote-date">📅 ${today}</div>
        ${q.valid_until?`<div class="quote-date">صالح حتى: ${q.valid_until}</div>`:''}
      </div>
    </div>
    <div class="header-divider"></div>
    <div class="quote-title">عرض سعر — تأسيس شركة</div>
  </div>

  <div class="body">
    <!-- Greeting -->
    <div class="greeting">${q.greeting||'مساء الخير'}</div>
    <div class="greeting-sub">مع حضرتك / ${q.client_name}</div>

    <!-- Company info -->
    <div class="info-block">
      <div class="info-title">📋 تفاصيل عرض السعر</div>
      ${q.legal_entity?`<div class="info-row"><span class="info-label">الكيان القانوني:</span><span class="info-value">${q.legal_entity}</span></div>`:''}
      ${q.activity?`<div class="info-row"><span class="info-label">النشاط:</span><span class="info-value">${q.activity}</span></div>`:''}
      ${q.activity_location?`<div class="info-row"><span class="info-label">مقر النشاط:</span><span class="info-value">${q.activity_location}</span></div>`:''}
      ${q.capital?`<div class="info-row"><span class="info-label">رأس المال:</span><span class="info-value">${capFmt}</span></div>`:''}
      <div class="info-row"><span class="info-label">اسم العميل:</span><span class="info-value">${q.client_name}</span></div>
      ${q.client_phone?`<div class="info-row"><span class="info-label">رقم الهاتف:</span><span class="info-value">${q.client_phone}</span></div>`:''}
    </div>

    <!-- Total -->
    <div class="total-block">
      <div>
        <div class="total-label">إجمالي المصاريف والأتعاب</div>
        <div class="total-amount">${totalFmt}</div>
        ${(q.government_fees||q.office_fees)?`<div class="total-breakdown">رسوم حكومية: ${(q.government_fees||0).toLocaleString('ar-EG')} جنيه — أتعاب المكتب: ${(q.office_fees||0).toLocaleString('ar-EG')} جنيه</div>`:''}
      </div>
      <div style="font-size:40px">💰</div>
    </div>

    <!-- Deliverables -->
    ${delivHtml?`<div class="list-block">
      <div class="section-title">✅ حضرتك هتستلم مننا</div>
      <div class="list-box green"><ul>${delivHtml}</ul></div>
    </div>`:''}

    <!-- Extra services -->
    ${extraHtml?`<div class="list-block">
      <div class="section-title">⭐ خدمات إضافية</div>
      <div class="list-box"><ul>${extraHtml}</ul></div>
    </div>`:''}

    <!-- Requirements -->
    ${reqHtml?`<div class="list-block">
      <div class="section-title">📌 المطلوب من حضرتكم</div>
      <div class="list-box orange"><ul>${reqHtml}</ul></div>
    </div>`:''}

    <!-- Notes -->
    ${q.notes?`<div class="notes-block"><strong>ملاحظات:</strong> ${q.notes}</div>`:''}

    <!-- Signature -->
    <div class="signature-block">
      <div class="sig-side">
        <div class="sig-line">العميل</div>
        <div class="sig-name">${q.client_name}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:3px">التوقيع والتاريخ</div>
      </div>
      <div style="text-align:center;color:#64748b;font-size:12px">
        <div style="font-size:24px;margin-bottom:6px">🏛️</div>
        <div style="font-weight:700;color:#1a2472">MS Accounting</div>
        <div style="font-size:11px">مكتب محاسبة متخصص</div>
      </div>
      <div class="sig-side">
        <div class="sig-line">المستشار</div>
        <div class="sig-name">${q.advisor_name||'المستشار'}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:3px">التوقيع والتاريخ</div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>MS Accounting — نظام إدارة مكتب المحاسبة</div>
    <div>${q.quote_number} | ${today}</div>
    <div>هذا العرض سري وخاص بالعميل المُشار إليه</div>
  </div>
</div>

<!-- Print button (hidden on print) -->
<div class="no-print" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:10px;background:white;padding:12px 20px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.2)">
  <button onclick="window.print()" style="background:linear-gradient(135deg,#1a2472,#152060);color:white;border:none;border-radius:9px;padding:10px 24px;font-size:14px;font-family:'Cairo',sans-serif;cursor:pointer;font-weight:700">🖨️ طباعة / حفظ PDF</button>
  <button onclick="window.close()" style="background:#f1f5f9;color:#374151;border:1.5px solid #d1d5db;border-radius:9px;padding:10px 24px;font-size:14px;font-family:'Cairo',sans-serif;cursor:pointer">إغلاق</button>
</div>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=1000,scrollbars=yes');
  if(!w) { toast('يرجى السماح بفتح نوافذ منبثقة في المتصفح','error'); return; }
  w.document.write(printHtml);
  w.document.close();
}

// expose globals
window.loadQuotations    = loadQuotations;
window.showQuotationForm = showQuotationForm;
window.showQuotationDetail = showQuotationDetail;
window.showQuotationPreview = showQuotationPreview;
window.saveQuotationForm = saveQuotationForm;
window.applyQuoTemplate  = applyQuoTemplate;
window.addQuoItem        = addQuoItem;
window.calcQuoTotal      = calcQuoTotal;
window.quickStatusUpdate = quickStatusUpdate;
window.quoUpdateStatus   = quoUpdateStatus;
window.sendQuotationEmail = sendQuotationEmail;
window.sendQuotationWhatsApp = sendQuotationWhatsApp;
window.duplicateQuotation = duplicateQuotation;
window.convertQuotationToClient = convertQuotationToClient;

// ── SETTINGS ───────────────────────────────────────
async function loadSettings(activeTab) {
  const main=document.getElementById('main');
  main.className='page';

  let emailCfg={configured:false,smtp_host:'smtp.gmail.com',smtp_port:587,smtp_user:'',from_name:'MS Accounting'};
  try { emailCfg=await api('GET','/api/notifications/settings'); } catch(e){}
  const statusBadge=emailCfg.configured
    ?`<span style="display:inline-flex;align-items:center;gap:5px;background:#f0fdf4;color:#16a34a;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">✅ مُفعَّل</span>`
    :`<span style="display:inline-flex;align-items:center;gap:5px;background:#fef2f2;color:#dc2626;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">❌ غير مُفعَّل</span>`;

  const tab = activeTab || 'general';
  const tabBtn = (id, icon, label) => `<button id="stab-btn-${id}" onclick="switchStab('${id}')"
    style="padding:10px 18px;font-size:13px;font-weight:700;font-family:inherit;border:none;border-bottom:2.5px solid ${tab===id?'#1a2472':'transparent'};background:transparent;cursor:pointer;color:${tab===id?'#1a2472':'#64748b'};margin-bottom:-2px;transition:all .15s;display:flex;align-items:center;gap:6px">
    ${icon} ${label}</button>`;

  main.innerHTML=`
  <!-- Tab bar -->
  <div style="display:flex;gap:0;border-bottom:2px solid #e8edf3;margin-bottom:24px">
    ${tabBtn('general','👤','الحساب')}
    ${tabBtn('notifications','📧','الإشعارات')}
    ${tabBtn('whatsapp','💬','واتساب')}
    ${tabBtn('team','👥','الفريق')}
    ${tabBtn('import','📥','الاستيراد')}
    ${tabBtn('backup','🗄️','النسخ الاحتياطي')}
    <div style="margin-right:auto;display:flex;align-items:center">
      <button onclick="if(confirm('هل تريد تسجيل الخروج؟'))logout()" style="display:flex;align-items:center;gap:7px;padding:8px 18px;background:#fff1f2;border:1.5px solid #fecdd3;border-radius:10px;color:#e11d48;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;transition:background .15s" onmouseover="this.style.background='#ffe4e6'" onmouseout="this.style.background='#fff1f2'">
        🚪 تسجيل الخروج
      </button>
    </div>
  </div>

  <!-- General tab -->
  <div id="stab-general" style="display:${tab==='general'?'block':'none'};max-width:640px">
    <div class="card" style="padding:24px;margin-bottom:20px">
      <h3 style="font-size:16px;font-weight:700;color:#1a2472;margin:0 0 20px;padding-bottom:12px;border-bottom:2px solid #eef1fb;padding-right:12px;border-right:3px solid #1a2472">👤 البيانات الشخصية</h3>
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الاسم</label>
          <input id="profName" class="input" value="${escH(currentUser?.name||'')}"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">البريد الإلكتروني</label>
          <input id="profEmail" class="input" value="${escH(currentUser?.email||'')}" disabled style="background:#f8fafc;color:#94a3b8"/></div>
      </div>
      <div style="margin-bottom:20px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الهاتف</label>
        <input id="profPhone" class="input" value="${escH(currentUser?.phone||'')}" placeholder="01xxxxxxxxx"/></div>
      <button class="btn btn-primary" onclick="saveProfile()">💾 حفظ التعديلات</button>
    </div>
    <div class="card" style="padding:24px;margin-bottom:20px">
      <h3 style="font-size:16px;font-weight:700;color:#1a2472;margin:0 0 20px;padding-bottom:12px;border-bottom:2px solid #eef1fb;padding-right:12px;border-right:3px solid #1a2472">🔒 تغيير كلمة المرور</h3>
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">كلمة المرور الحالية</label>
        <input id="curPass" class="input" type="password" placeholder="••••••••"/></div>
      <div class="form-row" style="margin-bottom:20px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">كلمة المرور الجديدة</label>
          <input id="newPass" class="input" type="password" placeholder="••••••••"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تأكيد كلمة المرور</label>
          <input id="confPass" class="input" type="password" placeholder="••••••••"/></div>
      </div>
      <button class="btn btn-primary" onclick="savePassword()">🔒 تغيير كلمة المرور</button>
    </div>
    <div class="card" style="padding:24px">
      <h3 style="font-size:16px;font-weight:700;color:#1a2472;margin:0 0 16px;padding-bottom:12px;border-bottom:2px solid #eef1fb;padding-right:12px;border-right:3px solid #1a2472">ℹ️ معلومات النظام</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${[['النظام','MS Accounting v2.0'],['الخادم','FastAPI + Railway'],['قاعدة البيانات','PostgreSQL'],['التاريخ',new Date().toLocaleDateString('ar-EG')]].map(([k,v])=>`<div style="padding:12px;background:#f8fafc;border-radius:8px"><div style="font-size:11px;color:#94a3b8;margin-bottom:2px">${k}</div><div style="font-size:13px;font-weight:600;color:#374151">${v}</div></div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Notifications tab -->
  <div id="stab-notifications" style="display:${tab==='notifications'?'block':'none'};max-width:640px">
    <div class="card" style="padding:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid #f1f5f9;margin-bottom:20px">
        <h3 style="font-size:16px;font-weight:700;color:#1a2472;margin:0;padding-right:12px;border-right:3px solid #1a2472">📧 إشعارات البريد الإلكتروني</h3>
        ${statusBadge}
      </div>
      <div style="background:#eef1fb;border:1px solid #b3c4e8;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#152060;line-height:1.6">
        <strong>كيفية الإعداد:</strong><br>
        ١. سجّل دخول إلى Gmail → الإعدادات → الأمان → كلمات المرور للتطبيقات<br>
        ٢. أنشئ كلمة مرور تطبيق جديدة (16 حرف) وانسخها هنا
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">حساب Gmail (المُرسِل)</label>
          <input id="smtpUser" class="input" type="email" value="${escH(emailCfg.smtp_user||'')}" placeholder="office@gmail.com"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">كلمة مرور التطبيق</label>
          <input id="smtpPass" class="input" type="password" placeholder="xxxx xxxx xxxx xxxx"/></div>
      </div>
      <div class="form-row" style="margin-bottom:20px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">اسم المُرسِل</label>
          <input id="smtpFromName" class="input" value="${escH(emailCfg.from_name||'MS Accounting')}" placeholder="MS Accounting"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">بريد اختبار الإشعار</label>
          <input id="testEmailAddr" class="input" type="email" value="${escH(currentUser?.email||'')}" placeholder="test@gmail.com"/></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="saveEmailSettings()" style="flex:1;min-width:160px">💾 حفظ وتفعيل</button>
        <button class="btn" onclick="testEmailNow()" style="flex:1;min-width:160px;border:1.5px solid #1a2472;color:#1a2472;background:#fff">📨 إرسال بريد تجريبي</button>
      </div>
      <div id="emailSettingsMsg" style="margin-top:12px"></div>
    </div>
  </div>

  <!-- WhatsApp tab -->
  <div id="stab-whatsapp" style="display:${tab==='whatsapp'?'block':'none'}">

    <!-- Status bar -->
    <div id="waStatusBar" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span id="waBadge" style="display:inline-flex;align-items:center;gap:5px;background:#fef2f2;color:#dc2626;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700">⏳ جاري التحميل...</span>
      <div id="waStatsInline" style="display:flex;gap:16px;flex:1;flex-wrap:wrap"></div>
      <button onclick="_loadWhatsAppStatus()" style="background:none;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;color:#64748b">🔄 تحديث</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">

      <!-- Settings card -->
      <div class="card" style="padding:20px">
        <h3 style="font-size:14px;font-weight:700;color:#1a2472;margin:0 0 14px;padding-right:10px;border-right:3px solid #25d366">⚙️ إعدادات الاتصال</h3>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-bottom:14px;font-size:11px;color:#14532d;line-height:1.7">
          ١. سجّل على <strong>green-api.com</strong> → أنشئ Instance → امسح QR بواتساب الشغل<br>
          ٢. انسخ <strong>instanceId</strong> و <strong>apiTokenInstance</strong> أدناه<br>
          ٣. أو أضفهم مباشرةً في Railway → Variables
        </div>
        <div style="margin-bottom:10px">
          <label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:4px">Instance ID</label>
          <input id="waInstanceId" class="input" style="font-size:12px" placeholder="مثال: 1101234567"/>
        </div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:4px">API Token</label>
          <input id="waToken" class="input" type="password" style="font-size:12px" placeholder="الـ token من لوحة green-api"/>
        </div>
        <button class="btn btn-primary" onclick="saveWhatsAppSettings()" style="width:100%;font-size:12px">💾 حفظ وتفعيل</button>
        <div id="waSettingsMsg" style="margin-top:8px"></div>
      </div>

      <!-- Test card -->
      <div class="card" style="padding:20px">
        <h3 style="font-size:14px;font-weight:700;color:#1a2472;margin:0 0 14px;padding-right:10px;border-right:3px solid #25d366">📤 إرسال رسالة اختبار</h3>
        <div style="margin-bottom:10px">
          <label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:4px">رقم الهاتف</label>
          <input id="waTestPhone" class="input" style="font-size:12px" placeholder="01xxxxxxxxx"/>
        </div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:4px">الرسالة</label>
          <textarea id="waTestMsg" class="input" rows="3" style="font-size:12px;resize:none">✅ اختبار من MS Accounting</textarea>
        </div>
        <button class="btn" onclick="testWhatsApp()" style="width:100%;background:#25D366;color:white;border:none;font-size:12px;font-weight:700">📲 إرسال مباشر — بدون فتح واتساب</button>
        <div id="waTestResult" style="margin-top:10px;font-size:12px"></div>
      </div>
    </div>

    <!-- Logs -->
    <div class="card" style="padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:14px;font-weight:700;color:#1a2472;margin:0;padding-right:10px;border-right:3px solid #25d366">📋 سجل الرسائل</h3>
        <button onclick="_loadWALogs()" style="background:none;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;color:#64748b">🔄 تحديث</button>
      </div>
      <div id="waLogsTable" style="font-size:11px;color:#94a3b8;text-align:center;padding:20px">جاري التحميل...</div>
    </div>
  </div>

  <!-- Team tab -->
  <div id="stab-team" style="display:${tab==='team'?'block':'none'}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <h2 style="font-size:18px;font-weight:800;color:#1a2472;margin:0;padding-right:14px;border-right:4px solid #1a2472">👥 إدارة الفريق</h2>
        <p style="font-size:13px;color:#94a3b8;margin:4px 0 0">توزيع المهام والتخصصات والعبء الوظيفي</p>
      </div>
      ${currentUser?.role==='admin'?`<button class="btn btn-primary" onclick="showEmployeeModal()">+ إضافة موظف</button>`:''}
    </div>
    <div id="empGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px">
      <div style="text-align:center;padding:60px;color:#94a3b8;grid-column:1/-1">⏳ جاري التحميل...</div>
    </div>
  </div>

  <!-- Import tab -->
  <div id="stab-import" style="display:${tab==='import'?'block':'none'};max-width:900px">
    <div class="card" style="padding:24px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
        <div style="width:48px;height:48px;background:#eef1fb;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px">📥</div>
        <div>
          <h2 style="font-size:18px;font-weight:800;color:#1a2472;margin:0">استيراد البيانات من Google Sheets</h2>
          <p style="font-size:13px;color:#64748b;margin:4px 0 0">قراءة الشركات والعملاء وإنشاؤهم تلقائياً في النظام</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">رابط Google Sheet</label>
          <input id="sheetUrl" class="input" value="https://docs.google.com/spreadsheets/d/1ZLwHba3F5jrGQkCvVd7mTcbCCp3OWuaJ_e929XdyxUA/export?format=csv&gid=600176975" style="font-size:11px"/>
        </div>
        <div style="display:flex;flex-direction:column;justify-content:flex-end">
          <button id="fetchSheetBtn" class="btn btn-primary" onclick="fetchAndPreview()">🔄 جلب البيانات وعرض المعاينة</button>
        </div>
      </div>
      <div style="font-size:12px;color:#94a3b8;background:#f8fafc;padding:10px 14px;border-radius:8px;border-right:3px solid #4478b0">
        ℹ️ سيتم تحليل البيانات وعرض معاينة كاملة قبل تنفيذ الاستيراد الفعلي.
      </div>
    </div>
    <div id="importPreviewArea"></div>
  </div>

  <!-- Backup tab -->
  <div id="stab-backup" style="display:${tab==='backup'?'block':'none'};max-width:700px">
    <div class="card" style="padding:24px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
        <div style="width:48px;height:48px;background:#eef1fb;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px">🗄️</div>
        <div>
          <h2 style="font-size:18px;font-weight:800;color:#1a2472;margin:0">النسخ الاحتياطي</h2>
          <p style="font-size:13px;color:#64748b;margin:4px 0 0">نسخة احتياطية تلقائية أسبوعية + تحميل يدوي</p>
        </div>
      </div>
      <div style="background:#f0f7ff;border-right:4px solid #1a73e8;border-radius:8px;padding:14px 16px;margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:#1a2472;margin-bottom:4px">൑ النسخ الاحتياطي التلقائي</div>
        <div style="font-size:12px;color:#475569;line-height:1.6">
          • يعمل تلقائياً كل يوم <strong>الأحد الساعة 2 صباحاً</strong><br>
          • يُرسَل ملف SQL مضغوط إلى بريد المدير الإلكتروني<br>
          • يتطلب إعداد SMTP في تاب الإشعارات
        </div>
      </div>
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:14px;font-weight:700;color:#1e293b">النسخ المحفوظة محلياً</span>
          <button class="btn btn-secondary btn-sm" onclick="loadBackupList()">🔄 تحديث</button>
        </div>
        <div id="backupListArea" style="min-height:60px;background:#f8fafc;border-radius:8px;padding:12px;font-size:13px;color:#94a3b8;text-align:center">
          جاري التحميل...
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="downloadBackup(this)">⬇️ تحميل نسخة الآن</button>
        <button class="btn btn-secondary" onclick="triggerBackupEmail(this)">📧 إرسال نسخة بالبريد</button>
      </div>
      <div id="backupMsg" style="margin-top:12px"></div>
    </div>
  </div>`;

  // Load team data if team tab is active
  if(tab === 'team') _loadSettingsTeam();
}

function switchStab(tabId) {
  ['general','notifications','whatsapp','team','import','backup'].forEach(id => {
    const el = document.getElementById('stab-'+id);
    const btn = document.getElementById('stab-btn-'+id);
    if(el) el.style.display = id===tabId ? 'block' : 'none';
    if(btn){ btn.style.borderBottomColor = id===tabId?'#1a2472':'transparent'; btn.style.color = id===tabId?'#1a2472':'#64748b'; }
  });
  if(tabId==='team') _loadSettingsTeam();
  if(tabId==='backup') loadBackupList();
  if(tabId==='whatsapp') _loadWhatsAppStatus();
}

async function _loadWhatsAppStatus() {
  const badge = document.getElementById('waBadge');
  const statsEl = document.getElementById('waStatsInline');
  try {
    // Try full status endpoint first (has logs)
    let r;
    try {
      r = await api('GET', '/api/notifications/whatsapp-status');
    } catch(e) {
      r = await api('GET', '/api/notifications/whatsapp-settings');
    }
    if (badge) {
      if (r.configured) {
        badge.innerHTML = '🟢 متصل ويعمل';
        badge.style.background = '#f0fdf4'; badge.style.color = '#16a34a';
      } else {
        badge.innerHTML = '🔴 غير مُفعَّل — أضف GREENAPI_INSTANCE_ID في Railway';
        badge.style.background = '#fef2f2'; badge.style.color = '#dc2626';
      }
    }
    if (statsEl) {
      const sent = r.sent_today ?? '—';
      const failed = r.failed_today ?? '—';
      const lastAt = r.last_sent_at ? new Date(r.last_sent_at).toLocaleString('ar-EG') : '—';
      const lastTo = r.last_sent_to || '—';
      statsEl.innerHTML = `
        <span style="font-size:11px;color:#475569">📤 أُرسل اليوم: <strong style="color:#1d4ed8">${sent}</strong></span>
        <span style="font-size:11px;color:#475569">❌ فشل اليوم: <strong style="color:#dc2626">${failed}</strong></span>
        <span style="font-size:11px;color:#475569">🕐 آخر إرسال: <strong>${lastAt}</strong> → ${escH(String(lastTo))}</span>
      `;
    }
    const instanceEl = document.getElementById('waInstanceId');
    if (instanceEl && r.instance_id) instanceEl.value = r.instance_id;
    _loadWALogs();
  } catch(e) {
    if(badge){ badge.innerHTML='⚠️ تعذّر الاتصال بالسيرفر'; badge.style.background='#fef9c3'; badge.style.color='#a16207'; }
  }
}

async function _loadWALogs() {
  const el = document.getElementById('waLogsTable'); if(!el) return;
  try {
    const logs = await api('GET', '/api/notifications/whatsapp-logs');
    if(!logs || !logs.length) { el.innerHTML='<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px">لا توجد رسائل مسجلة بعد</div>'; return; }
    el.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:#f1f5f9;text-align:right">
        <th style="padding:7px 10px;border:1px solid #e2e8f0;font-weight:600">الوقت</th>
        <th style="padding:7px 10px;border:1px solid #e2e8f0;font-weight:600">المستلم</th>
        <th style="padding:7px 10px;border:1px solid #e2e8f0;font-weight:600">الرقم</th>
        <th style="padding:7px 10px;border:1px solid #e2e8f0;font-weight:600">الرسالة</th>
        <th style="padding:7px 10px;border:1px solid #e2e8f0;font-weight:600;text-align:center">الحالة</th>
        <th style="padding:7px 10px;border:1px solid #e2e8f0;font-weight:600">الخطأ</th>
      </tr></thead>
      <tbody>${logs.map(l=>`<tr style="background:${l.success?'white':'#fff5f5'}">
        <td style="padding:6px 10px;border:1px solid #e2e8f0;white-space:nowrap;color:#64748b">${l.created_at?new Date(l.created_at).toLocaleString('ar-EG',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'numeric'}):'—'}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:600">${escH(l.recipient||'—')}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;direction:ltr;text-align:left">${escH(l.phone||'—')}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;color:#475569;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escH(l.message)}">${escH(l.message)}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center">${l.success?'<span style="color:#16a34a;font-weight:700">✅ نجح</span>':'<span style="color:#dc2626;font-weight:700">❌ فشل</span>'}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;color:#dc2626;font-size:10px">${escH(l.error||'')}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  } catch(e) { el.innerHTML=`<div style="color:#dc2626;font-size:11px;padding:10px">تعذّر تحميل السجل: ${e.message}</div>`; }
}

async function saveWhatsAppSettings() {
  const instanceId = document.getElementById('waInstanceId')?.value?.trim();
  const token = document.getElementById('waToken')?.value?.trim();
  const msgEl = document.getElementById('waSettingsMsg');
  if (!instanceId || !token) { if(msgEl) msgEl.innerHTML = '<span style="color:#dc2626;font-size:11px">⚠️ أدخل instanceId و token</span>'; return; }
  try {
    const r = await api('POST', '/api/notifications/whatsapp-settings', {instance_id: instanceId, token});
    if(msgEl) msgEl.innerHTML = `<span style="color:#16a34a;font-size:11px;font-weight:600">${r.message}</span>`;
    _loadWhatsAppStatus();
  } catch(e) { if(msgEl) msgEl.innerHTML = `<span style="color:#dc2626;font-size:11px">${e.message}</span>`; }
}

async function testWhatsApp() {
  const phone = document.getElementById('waTestPhone')?.value?.trim();
  const msg = document.getElementById('waTestMsg')?.value?.trim();
  const resultEl = document.getElementById('waTestResult');
  if (!phone) { if(resultEl) resultEl.innerHTML = '<span style="color:#dc2626;font-size:11px">⚠️ أدخل رقم الهاتف</span>'; return; }
  if(resultEl) resultEl.innerHTML = '<span style="color:#64748b;font-size:11px">⏳ جاري الإرسال المباشر...</span>';
  try {
    const r = await api('POST', '/api/notifications/whatsapp-test', {phone, message: msg || 'اختبار من MS Accounting'});
    if(resultEl) resultEl.innerHTML = `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:10px;font-size:12px;color:#15803d;font-weight:700">
      ✅ تم الإرسال بنجاح إلى ${escH(phone)}<br>
      <span style="font-size:10px;font-weight:400;color:#64748b">${new Date().toLocaleString('ar-EG')}</span>
    </div>`;
    setTimeout(_loadWALogs, 1000);
  } catch(e) {
    if(resultEl) resultEl.innerHTML = `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px;font-size:12px;color:#dc2626">
      ❌ فشل الإرسال: ${escH(e.message)}<br>
      <span style="font-size:10px">تحقق من instanceId و token وتأكد أن الرقم متصل بالإنترنت</span>
    </div>`;
    setTimeout(_loadWALogs, 1000);
  }
}

async function _loadSettingsTeam() {
  try {
    const users = await api('GET','/api/users');
    renderEmployeeGrid(users);
  } catch(e){ toast(e.message,'error'); }
}

async function showClientEmailModal(clientId, clientName, clientEmail) {
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  const noEmail = !clientEmail;
  overlay.innerHTML=`<div class="modal" style="max-width:600px">
    <div style="padding:18px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#eef1fb,#f8fafc);border-radius:18px 18px 0 0">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:38px;height:38px;background:linear-gradient(135deg,#1a2472,#5b8ec4);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">📧</div>
        <div>
          <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:0">رسالة إلكترونية جديدة</h2>
          <div style="font-size:11px;color:#64748b;margin-top:1px">إلى: ${escH(clientName)}</div>
        </div>
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:#f1f5f9;border:none;width:32px;height:32px;border-radius:8px;font-size:16px;cursor:pointer;color:#64748b;display:flex;align-items:center;justify-content:center">✕</button>
    </div>
    <div style="padding:20px 24px">
      <!-- To field -->
      <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f8fafc;border:1.5px solid #e8edf3;border-radius:10px">
        <span style="font-size:12px;font-weight:700;color:#6b7280;min-width:32px">إلى:</span>
        <input id="composeToEmail" type="email" value="${escH(clientEmail)}" placeholder="client@example.com"
          style="flex:1;border:none;background:transparent;font-size:13.5px;font-family:inherit;outline:none;color:#1e293b"/>
        ${noEmail?'<span style="font-size:11px;color:#f59e0b;white-space:nowrap">⚠️ لا يوجد إيميل مسجَّل</span>':'<span style="font-size:11px;color:#16a34a">✓ مُسجَّل</span>'}
      </div>
      <!-- Subject field -->
      <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f8fafc;border:1.5px solid #e8edf3;border-radius:10px">
        <span style="font-size:12px;font-weight:700;color:#6b7280;min-width:32px">موضوع:</span>
        <input id="composeSubject" type="text" placeholder="موضوع الرسالة..."
          style="flex:1;border:none;background:transparent;font-size:13.5px;font-family:inherit;outline:none;color:#1e293b"/>
      </div>
      <!-- Body -->
      <div style="margin-bottom:14px">
        <textarea id="composeBody" class="input" rows="8"
          placeholder="اكتب رسالتك هنا..."
          style="resize:vertical;font-size:13.5px;line-height:1.8;direction:rtl"></textarea>
      </div>
      <!-- Attach options -->
      <div style="margin-bottom:16px;padding:12px 14px;background:#f8fafc;border-radius:10px;border:1.5px dashed #d1d5db">
        <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">إرفاق بيانات من النظام</div>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:#374151">
            <input type="checkbox" id="composeInclObl" style="width:15px;height:15px;accent-color:#1a2472"/>
            🔔 الالتزامات الضريبية القادمة
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:#374151">
            <input type="checkbox" id="composeInclInv" style="width:15px;height:15px;accent-color:#1a2472"/>
            📄 الفواتير المعلقة
          </label>
        </div>
      </div>
      <div id="composeResult" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;align-items:center">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button id="composeSendBtn" class="btn btn-primary" style="min-width:140px" onclick="doComposeEmail(${clientId})">
          <span>📨</span> إرسال الرسالة
        </button>
      </div>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  // Auto-fill subject if client name is known
  const subjectEl = document.getElementById('composeSubject');
  if(subjectEl && clientName) subjectEl.value = `تذكير من مكتب MS Accounting — ${clientName}`;
  setTimeout(()=>document.getElementById('composeBody')?.focus(), 100);
}

async function doComposeEmail(clientId) {
  const btn=document.getElementById('composeSendBtn');
  const resultDiv=document.getElementById('composeResult');
  const toEmail=document.getElementById('composeToEmail')?.value?.trim();
  const subject=document.getElementById('composeSubject')?.value?.trim();
  const body=document.getElementById('composeBody')?.value?.trim();
  const inclObl=document.getElementById('composeInclObl')?.checked;
  const inclInv=document.getElementById('composeInclInv')?.checked;

  if(!toEmail){resultDiv.innerHTML=`<div style="color:#dc2626;font-size:13px;padding:8px 12px;background:#fef2f2;border-radius:6px">⚠️ أدخل البريد الإلكتروني</div>`;return;}
  if(!subject){resultDiv.innerHTML=`<div style="color:#dc2626;font-size:13px;padding:8px 12px;background:#fef2f2;border-radius:6px">⚠️ أدخل موضوع الرسالة</div>`;return;}
  if(!body){resultDiv.innerHTML=`<div style="color:#dc2626;font-size:13px;padding:8px 12px;background:#fef2f2;border-radius:6px">⚠️ اكتب نص الرسالة</div>`;return;}

  btn.disabled=true;
  btn.innerHTML='<span>⏳</span> جارٍ الإرسال...';
  resultDiv.innerHTML='';
  try {
    const r=await api('POST','/api/notifications/compose',{
      to_email: toEmail,
      subject: subject,
      body: body,
      client_id: clientId||null,
      include_obligations: inclObl,
      include_invoices: inclInv,
    });
    resultDiv.innerHTML=`<div style="color:#16a34a;font-size:13px;background:#f0fdf4;padding:10px 12px;border-radius:6px;display:flex;align-items:center;gap:6px"><span>✅</span> ${escH(r.message)}</div>`;
    btn.innerHTML='<span>✅</span> تم الإرسال';
    setTimeout(()=>{document.querySelector('.modal-overlay')?.remove();},2200);
  } catch(e){
    resultDiv.innerHTML=`<div style="color:#dc2626;font-size:13px;padding:8px 12px;background:#fef2f2;border-radius:6px">❌ ${escH(e.message)}</div>`;
    btn.disabled=false;
    btn.innerHTML='<span>📨</span> إرسال الرسالة';
  }
}

async function doSendClientReminder(clientId) {
  // Legacy — redirect to doComposeEmail
  return doComposeEmail(clientId);
}

async function saveEmailSettings() {
  const user=document.getElementById('smtpUser')?.value?.trim();
  const pass=document.getElementById('smtpPass')?.value?.trim();
  const fromName=document.getElementById('smtpFromName')?.value?.trim()||'MS Accounting';
  const msg=document.getElementById('emailSettingsMsg');
  if(!user||!pass){
    msg.innerHTML=`<div style="color:#dc2626;font-size:13px">⚠️ يرجى إدخال حساب Gmail وكلمة مرور التطبيق</div>`;
    return;
  }
  msg.innerHTML=`<div style="color:#64748b;font-size:13px">⏳ جارٍ الحفظ والاختبار…</div>`;
  try {
    const r=await api('POST','/api/notifications/save-settings',{
      smtp_user:user, smtp_pass:pass, from_name:fromName,
      smtp_host:'smtp.gmail.com', smtp_port:587
    });
    msg.innerHTML=`<div style="color:#16a34a;font-size:13px">✅ ${escH(r.message||'تم الحفظ بنجاح')}</div>`;
    // reload page to update badge
    setTimeout(()=>loadSettings(),1500);
  } catch(e){
    msg.innerHTML=`<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message||'فشل الحفظ')}</div>`;
  }
}

async function testEmailNow() {
  const to=document.getElementById('testEmailAddr')?.value?.trim();
  const msg=document.getElementById('emailSettingsMsg');
  if(!to){msg.innerHTML=`<div style="color:#dc2626;font-size:13px">⚠️ أدخل عنوان البريد الإلكتروني للاختبار</div>`;return;}
  msg.innerHTML=`<div style="color:#64748b;font-size:13px">⏳ جارٍ الإرسال إلى ${escH(to)}…</div>`;
  try {
    const r=await api('POST','/api/notifications/test-email',{to_email:to});
    msg.innerHTML=`<div style="color:#16a34a;font-size:13px">✅ ${escH(r.message||'تم الإرسال')}</div>`;
  } catch(e){
    msg.innerHTML=`<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message||'فشل الإرسال — تحقق من بيانات SMTP')}</div>`;
  }
}

async function saveProfile() {
  try {
    const name=document.getElementById('profName')?.value?.trim();
    const phone=document.getElementById('profPhone')?.value?.trim();
    if(!name){toast('الاسم مطلوب','error');return}
    await api('PUT',`/api/users/${currentUser.id}`,{name,phone:phone||null});
    currentUser={...currentUser,name,phone};
    localStorage.setItem('ms_user',JSON.stringify(currentUser));
    toast('تم حفظ البيانات الشخصية بنجاح');
    renderApp();
  } catch(e){toast(e.message,'error')}
}

async function savePassword() {
  try {
    const cur=document.getElementById('curPass')?.value;
    const nw=document.getElementById('newPass')?.value;
    const cf=document.getElementById('confPass')?.value;
    if(!cur||!nw){toast('أدخل كلمات المرور','error');return}
    if(nw!==cf){toast('كلمتا المرور غير متطابقتين','error');return}
    if(nw.length<6){toast('كلمة المرور قصيرة جداً','error');return}
    await api('POST','/api/auth/change-password',{current_password:cur,new_password:nw});
    toast('تم تغيير كلمة المرور بنجاح');
    document.getElementById('curPass').value='';
    document.getElementById('newPass').value='';
    document.getElementById('confPass').value='';
  } catch(e){toast(e.message,'error')}
}

// ── Mobile Sidebar ────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}
// Close sidebar on nav click (mobile)
document.addEventListener('click', e => {
  if (e.target.closest('.sidebar-link') && window.innerWidth <= 768) closeSidebar();
});

// ── Safe onclick helpers (avoid = in onclick which Chrome blocks as "cookie data") ──
window.setEmpTab      = (tab) => { window._empTab = tab; window.renderEmployeeTasks(); };
window.backToTasks    = ()    => { window._taskEmpFilter = null; window._empTab = 'pending'; window.loadTasks && window.loadTasks(); };
window.showKanban     = ()    => { window._taskViewMode = 'kanban'; window.renderKanban(); };
window.showFolders    = ()    => { window._taskViewMode = 'folders'; window._taskEmpFilter = null; window.renderTaskFolders ? window.renderTaskFolders() : (window.loadTasks && window.loadTasks()); };
window.setApptFilter  = (id)  => { window._apptFilter = id; window.renderAppointments && window.renderAppointments(); };
window.setPapersStatus= (id)  => { window._papersStatus = id; window.renderGovernmentPapers && window.renderGovernmentPapers(); };
window.setPostalStatus= (s)   => { window._postalStatus = s; window.loadPostal && window.loadPostal(); };
window.setSettlDate   = (v)   => { window._settlDailyDate = v; window._refreshDailyView && window._refreshDailyView(); };
window.setSettlToday  = ()    => { const t=new Date().toISOString().split('T')[0]; const el=document.getElementById('settlDailyPicker'); if(el) el.value=t; window._settlDailyDate=t; window._refreshDailyView && window._refreshDailyView(); };
window.toggleSpecLabel= (el)  => { const chk=el.querySelector('input'); if(!chk) return; const checked=chk.checked; el.style.background=checked?'#fff':'#eef1fb'; el.style.borderColor=checked?'#e2e8f0':'#4478b0'; };

// ── Client/company filter for tasks ──
window._taskClientFilter = '';
window.filterTasksByClient = (val) => {
  window._taskClientFilter = val.trim().toLowerCase();
  _renderKeepFocus(() => {
    if(window._taskViewMode === 'kanban') window.renderKanban && window.renderKanban();
    else window.renderTaskFolders && window.renderTaskFolders();
  });
};

// ── رسالة الغد — copy tomorrow's tasks grouped by employee ──
window.copyTomorrowMsg = async () => {
  const tasks = window.tasksData || [];
  // كل المهام المعلقة (مش خلصت ومش ملغاة) — بتتحدث تلقائي لما توزع شغل جديد
  const pendingTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.assigned_to);
  if(!pendingTasks.length){
    toast('لا توجد مهام معلقة حالياً 🎉');
    return;
  }
  // group by assigned_to_name
  const groups = {};
  const groupOrder = [];
  pendingTasks.forEach(t => {
    const name = t.assigned_to_name || ('موظف #' + t.assigned_to);
    if(!groups[name]){ groups[name] = []; groupOrder.push(name); }
    groups[name].push(t);
  });
  const today = new Date();
  const dateStr = today.toLocaleDateString('ar-EG', {weekday:'long', day:'numeric', month:'long'});
  let msg = '📋 *شغل الفريق — ' + dateStr + '*\n';
  msg += '━━━━━━━━━━━━━━━━\n';
  groupOrder.forEach(emp => {
    msg += '\n👤 *' + emp + '*\n';
    groups[emp].forEach((t,i) => {
      const client = t.client_name ? ' — ' + t.client_name : '';
      msg += (i+1) + '. ' + t.title + client + '\n';
    });
  });
  msg += '\n━━━━━━━━━━━━━━━━\n✅ وفقكم الله';
  try {
    await navigator.clipboard.writeText(msg);
    toast('✅ تم نسخ الرسالة — جاهزة للإرسال على الجروب');
  } catch(e) {
    const ta = document.createElement('textarea');
    ta.value = msg; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('✅ تم نسخ الرسالة');
  }
};

// expose functions globally (required for inline onclick in module scripts)
window.logout=logout;
window.openSidebar=openSidebar;
window.closeSidebar=closeSidebar;
window.saveProfile=saveProfile;
window.savePassword=savePassword;
window.saveEmailSettings=saveEmailSettings;
window.testEmailNow=testEmailNow;
window.saveWhatsAppSettings=saveWhatsAppSettings;
window.testWhatsApp=testWhatsApp;
window._loadWhatsAppStatus=_loadWhatsAppStatus;
window.showClientEmailModal=showClientEmailModal;
window.doComposeEmail=doComposeEmail;
window.doSendClientReminder=doSendClientReminder;
window.items=[];
// clients
window.showClientDetail=showClientDetail;

window.showPortalCredentials = async function(clientId, clientName) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal" style="max-width:600px;max-height:90vh;overflow-y:auto">
    <div style="padding:18px 24px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
      <div>
        <h2 style="font-size:17px;font-weight:700;color:#1e293b;margin:0">🔐 بيانات البوابات</h2>
        <div style="font-size:12px;color:#64748b;margin-top:2px">${escH(clientName)} — سري — أدمن فقط</div>
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div id="portalCredBody" style="padding:20px 24px">
      <div style="text-align:center;color:#94a3b8;padding:30px">⏳ جاري التحميل...</div>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #f1f5f9;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="savePortalCredentials(${clientId})">💾 حفظ</button>
      <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if(e.target===ov) ov.remove(); };

  let existing = {};
  try { existing = await api('GET', `/api/portal-credentials/${clientId}`) || {}; } catch(e){}

  function field(id, label, val, type='text') {
    return `<div>
      <div style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:4px">${label}</div>
      <input id="pc_${id}" class="input" type="${type}" value="${escH(val||'')}" style="font-size:13px"/>
    </div>`;
  }
  function section(title, fields) {
    return `<div style="margin-bottom:18px">
      <div style="font-size:12px;font-weight:800;color:#1a2472;margin-bottom:10px;padding-bottom:5px;border-bottom:2px solid #eef1fb">${title}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${fields}</div>
    </div>`;
  }

  document.getElementById('portalCredBody').innerHTML = `
    ${section('👤 بيانات العميل الشخصي', [
      field('contact_person','اسم العميل المسؤول', existing.contact_person),
      field('national_id','الرقم القومي', existing.national_id),
    ].join(''))}
    ${section('🏛️ منظومة ساب / اي سيرفيس', [
      field('portal_system','نوع المنظومة', existing.portal_system),
      field('declaration_type','نوع الإقرار', existing.declaration_type),
      field('portal_username','اسم المستخدم', existing.portal_username),
      field('portal_password','الباسورد', existing.portal_password, 'password'),
    ].join(''))}
    ${section('🧾 الفاتورة الإلكترونية', [
      field('einvoice_email','إيميل الفاتورة الإلكترونية', existing.einvoice_email),
      field('einvoice_password','باسورد الفاتورة', existing.einvoice_password, 'password'),
    ].join(''))}
    ${section('📧 الإيميل', [
      field('email_address','الإيميل', existing.email_address),
      field('email_password','باسورد الإيميل', existing.email_password, 'password'),
    ].join(''))}
    ${section('💼 توحيد المرتبات', [
      field('payroll_type','نوع الاشتراك', existing.payroll_type),
      field('payroll_username','اسم المستخدم', existing.payroll_username),
      field('payroll_password','الباسورد', existing.payroll_password, 'password'),
    ].join(''))}
    ${section('📝 ملاحظات', field('notes','ملاحظات', existing.notes))}
    <div id="pcSaveMsg" style="display:none;padding:8px 12px;border-radius:8px;font-size:13px;font-weight:600;margin-top:4px"></div>
  `;

  // Toggle password visibility
  ov.querySelectorAll('input[type=password]').forEach(inp => {
    const wrap = inp.parentElement;
    const eye = document.createElement('span');
    eye.textContent = '👁️';
    eye.style = 'cursor:pointer;font-size:14px;margin-top:4px;display:block;text-align:right';
    eye.onclick = () => { inp.type = inp.type==='password'?'text':'password'; };
    wrap.appendChild(eye);
  });
};

window.savePortalCredentials = async function(clientId) {
  const fields = ['contact_person','national_id','portal_system','declaration_type',
    'portal_username','portal_password','einvoice_email','einvoice_password',
    'email_address','email_password','payroll_type','payroll_username','payroll_password','notes'];
  const payload = {};
  fields.forEach(f => {
    const el = document.getElementById('pc_'+f);
    if(el && el.value.trim()) payload[f] = el.value.trim();
  });
  const msg = document.getElementById('pcSaveMsg');
  try {
    await api('PUT', `/api/portal-credentials/${clientId}`, payload);
    if(msg){ msg.style.display='block'; msg.style.background='#f0fdf4'; msg.style.color='#15803d'; msg.textContent='✅ تم الحفظ بنجاح'; setTimeout(()=>msg.style.display='none',3000); }
  } catch(e) {
    if(msg){ msg.style.display='block'; msg.style.background='#fff5f5'; msg.style.color='#dc2626'; msg.textContent='❌ خطأ في الحفظ — '+e.message; }
  }
};
window.autoGenClientObligations=autoGenClientObligations;
window.showTaskModalForClient=function(clientId, clientName) {
  // Navigate to tasks then open modal pre-filled with client
  const origEmpFilter = _taskEmpFilter;
  navigate('tasks');
  setTimeout(async ()=>{
    let clients=[];
    try { clients=await getClients(); } catch(e){}
    const users = tasksUsersData;
    const overlay=document.createElement('div');
    overlay.className='modal-overlay';
    overlay.innerHTML=`<div class="modal" style="max-width:520px">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
        <h2 style="font-size:17px;font-weight:700;color:#1e293b;margin:0">مهمة جديدة — ${escH(clientName)}</h2>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="padding:20px 24px">
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">عنوان المهمة *</label>
          <input id="qtTitle" class="input" placeholder="عنوان المهمة"/>
        </div>
        <div class="form-row" style="margin-bottom:14px">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">👷 الموظف المسؤول</label>
            <select id="qtAssignee" class="input">
              <option value="">— بلا موظف —</option>
              ${users.map(u=>`<option value="${u.id}">${escH(u.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الأولوية</label>
            <select id="qtPriority" class="input">
              <option value="urgent">🔴 عاجل</option>
              <option value="high">🟠 عالي</option>
              <option value="medium" selected>🟡 متوسط</option>
              <option value="low">🟢 منخفض</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تاريخ الاستحقاق</label>
          <input id="qtDue" class="input" type="date"/>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تفاصيل</label>
          <textarea id="qtNotes" class="input" rows="2" placeholder="تفاصيل المهمة..."></textarea>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button id="qtSaveBtn" class="btn btn-primary">💾 إضافة مهمة</button>
      </div>
    </div>`;
    document.body.append(overlay);
    overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
    document.getElementById('qtSaveBtn').onclick=async()=>{
      const btn=document.getElementById('qtSaveBtn');
      btn.disabled=true;
      try {
        const body={
          title: document.getElementById('qtTitle').value.trim(),
          client_id: clientId,
          assigned_to: parseInt(document.getElementById('qtAssignee').value)||null,
          priority: document.getElementById('qtPriority').value,
          due_date: document.getElementById('qtDue').value||null,
          description: document.getElementById('qtNotes').value||null,
          status: 'todo',
        };
        if(!body.title){toast('عنوان المهمة مطلوب','error');btn.disabled=false;return;}
        await api('POST','/api/tasks',body);
        toast('✅ تم إضافة المهمة');
        overlay.remove();
        _AC.invalidate('/api/tasks');
        loadTasks(true);
      } catch(e){toast(e.message,'error');btn.disabled=false;}
    };
  }, 400);
};
window.showClientTimeline=showClientTimeline;
window.showClientModal=showClientModal;
window.addInvoiceForClient=addInvoiceForClient;
// invoices
window.showInvoiceModal=showInvoiceModal;
window.showPaymentModal=showPaymentModal;
// tasks
window.updateTaskStatus=updateTaskStatus;
window.showTaskModal=showTaskModal;
window.deleteTask=deleteTask;
window.renderTaskFolders=renderTaskFolders;
window.renderKanban=renderKanban;
window.renderDailySheet=renderDailySheet;
window.renderOverdueBoard=renderOverdueBoard;
window.loadTasks=loadTasks;
window._assignTask=_assignTask;
window._restoreTask=_restoreTask;
window._markDone=window._markDone||function(){};
window._addEmpTask=window._addEmpTask||function(){};
window._empWA=window._empWA||function(){};
window._empDelAll=window._empDelAll||function(){};
// expose module-scoped task vars as window setters so onclick can mutate them
Object.defineProperty(window,'_taskViewMode',{get:()=>_taskViewMode,set:v=>{_taskViewMode=v;},configurable:true});
Object.defineProperty(window,'_taskEmpFilter',{get:()=>_taskEmpFilter,set:v=>{_taskEmpFilter=v;},configurable:true});
window.quickDoneTaskBoard=function(id){window._toggleTaskDone(id,'in_progress');};
window.openEmployeeTasks=openEmployeeTasks;
window.renderEmployeeTasks=renderEmployeeTasks;
window.quickDoneTask=quickDoneTask;
// documents
window.showUploadModal=showUploadModal;
window.openDoc=openDoc;
window.downloadDoc=downloadDoc;
// tax
window.submitTaxReturn=submitTaxReturn;
window.showTaxModal=showTaxModal;
// leads grid + detail
window.addLeadRow=addLeadRow;
window.deleteLeadRow=deleteLeadRow;
window.saveLeadCell=saveLeadCell;
window.showLeadDetail=showLeadDetail;
window.saveLeadInfo=saveLeadInfo;
window.saveLeadQuote=saveLeadQuote;
window.sendLeadQuoteEmail=sendLeadQuoteEmail;
window.sendLeadWhatsApp=sendLeadWhatsApp;
window.sendLeadNoAnswerWhatsApp=sendLeadNoAnswerWhatsApp;
window.toggleLeadExpand=toggleLeadExpand;
window.sendLeadEmailDirect=sendLeadEmailDirect;
window.previewLeadQuotePDF=previewLeadQuotePDF;
window.printLeadQuote=printLeadQuote;
window._ldTab=_ldTab;
window._qsCalc=_qsCalc;
window._qsAddService=_qsAddService;
window._qsAddDoc=_qsAddDoc;
// leads bridge functions (fix module scoping for inline handlers)
window.loadLeads=loadLeads;
window.setLeadsStatusFilter=v=>{leadsStatusFilter=(leadsStatusFilter===v&&v!=='')?'':v;loadLeads();};
window.setLeadsDateFilter=v=>{leadsDateFilter=v;loadLeads();};
window.setLeadsDateFrom=v=>{leadsDateFrom=v;loadLeads();};
window.setLeadsDateTo=v=>{leadsDateTo=v;loadLeads();};
window.setLeadsSearch=v=>{leadsSearch=v;loadLeads();};

// ── بدء التأسيس — تحويل عميل محتمل إلى قيد التأسيس ──────────────────────────
async function markLeadUnderEstablishment(id, e) {
  if(e) e.stopPropagation();
  if(!confirm('تحويل هذا العميل إلى "قيد التأسيس"؟')) return;
  try {
    const res = await api('PATCH', `/api/leads/${id}`, {status:'under_establishment'});
    const lead = leadsData.find(l=>l.id===id);
    if(lead) lead.status = 'under_establishment';
    // إعادة بناء الصف في الجدول
    const tbody = document.getElementById('leadsGridBody');
    const oldRow = tbody?.querySelector(`tr[data-id="${id}"]`);
    if(oldRow && lead) {
      const tmp = document.createElement('tbody');
      tmp.innerHTML = _buildLeadRow(lead, Array.from(tbody.querySelectorAll('tr[data-id]')).indexOf(oldRow));
      oldRow.replaceWith(...tmp.children);
    }
    toast('✅ تم تحويل العميل إلى قيد التأسيس', 'success');
  } catch(err) { toast('حدث خطأ: ' + (err.message||err), 'error'); }
}
window.markLeadUnderEstablishment = markLeadUnderEstablishment;

// ── صفحة عملاء تحت التأسيس ────────────────────────────────────────────────────
async function loadUnderEstablishmentClients(silent) {
  if(!silent) showPageLoading();
  var data;
  try {
    data = await api('GET', '/api/leads?status=under_establishment&limit=500');
  } catch(err) {
    setPageContent('<div style="padding:40px;text-align:center;color:#ef4444">فشل تحميل البيانات: ' + (err.message||err) + '</div>');
    return;
  }
  var leads = Array.isArray(data) ? data : (data.items || data.leads || []);
  try {
    renderUnderEstablishmentClients(leads);
  } catch(err2) {
    setPageContent('<div style="padding:40px;text-align:center;color:#ef4444">خطأ في عرض البيانات: ' + (err2.message||err2) + '</div>');
  }
}

function _ueRow(l, i) {
  const bg = i % 2 === 0 ? '#f0fdf4' : '#dcfce7';
  const notes80 = escH((l.notes || '').substring(0, 80)) + ((l.notes || '').length > 80 ? '...' : '');
  const notesEsc = (l.notes || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const nameCell = l.suggested_name
    ? '<span style="background:#dcfce7;color:#15803d;border:1px solid #86efac;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">' + escH(l.suggested_name) + '</span>'
    : '<button onclick="ueSetName(' + l.id + ')" style="background:#f0fdf4;color:#15803d;border:1px dashed #86efac;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;font-family:inherit">+ إضافة</button>';
  const phone = escH((l.phone || '').replace(/\D/g, ''));
  const dt = l.updated_at ? new Date(l.updated_at).toLocaleDateString('ar-EG') : '—';
  return '<tr style="background:' + bg + ';border-bottom:1px solid #bbf7d0;transition:filter .15s" onmouseover="this.style.filter=\'brightness(0.97)\'" onmouseout="this.style.filter=\'\'">'
    + '<td style="padding:10px 12px;font-weight:700;color:#15803d">' + escH(l.name || '—') + '</td>'
    + '<td style="padding:8px 12px;text-align:center;direction:ltr;font-size:12px">' + escH(l.phone || '—') + '</td>'
    + '<td style="padding:8px 12px;text-align:center;font-size:11px;white-space:nowrap">' + escH(l.quote_legal_entity || l.company_type || '—') + '</td>'
    + '<td style="padding:8px 12px;text-align:center;font-size:12px">' + escH(l.assigned_user_name || l.assigned_to_name || '—') + '</td>'
    + '<td style="padding:8px 12px;text-align:center">' + nameCell + '</td>'
    + '<td style="padding:8px 12px;text-align:center;font-weight:700;color:#0891b2;direction:ltr">' + (l.quote_total_fees ? money(l.quote_total_fees) : '—') + '</td>'
    + '<td style="padding:8px 12px;max-width:200px"><div style="font-size:11px;color:#475569;line-height:1.4">' + notes80 + '</div>'
    + '<button onclick="ueEditNotes(' + l.id + ',\'' + notesEsc + '\')" style="background:none;border:none;color:#0891b2;font-size:10px;cursor:pointer;padding:2px 0;font-family:inherit">✏️ تعديل</button></td>'
    + '<td style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b">' + dt + '</td>'
    + '<td style="padding:8px 12px;text-align:center"><div style="display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap">'
    + '<button onclick="openLeadDetail(' + l.id + ')" style="background:#eef1fb;color:#1a2472;border:1px solid #c7d3ef;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit" title="تفاصيل">👁️</button>'
    + '<button onclick="sendUEWhatsApp(' + l.id + ',\'' + phone + '\')" style="background:#25d366;color:white;border:none;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center" title="واتساب">📱</button>'
    + '<button onclick="navigate(\'company_names\')" style="background:#7c3aed;color:white;border:none;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center" title="مولد الأسماء">🏢</button>'
    + '<button onclick="revertLeadToLead(' + l.id + ')" style="background:#fff7ed;color:#d97706;border:1px solid #fed7aa;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit" title="إعادة لعميل محتمل">↩️</button>'
    + '</div></td></tr>';
}

function renderUnderEstablishmentClients(leads) {
  const count = leads.length;
  const withDeposit = leads.filter(function(l){return l.quote_total_fees>0;}).length;
  const withName    = leads.filter(function(l){return l.suggested_name;}).length;
  const emptyHtml = '<div style="text-align:center;padding:80px 20px;color:#94a3b8">'
    + '<div style="font-size:48px;margin-bottom:12px">⭐</div>'
    + '<div style="font-size:16px;font-weight:700;color:#475569;margin-bottom:6px">لا يوجد عملاء تحت التأسيس حالياً</div>'
    + '<div style="font-size:13px;margin-bottom:20px">اضغط زر ⭐ على أي عميل محتمل لبدء التأسيس معه</div>'
    + '<button onclick="navigate(\'leads\')" style="background:#0891b2;color:white;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">← العملاء المحتملين</button></div>';
  const tableHtml = '<div style="overflow-x:auto;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 4px #0001">'
    + '<table style="width:100%;border-collapse:collapse;min-width:1000px"><thead>'
    + '<tr style="background:#0891b2;color:white;font-size:12px">'
    + '<th style="padding:10px 12px;text-align:right;font-weight:700">الاسم</th>'
    + '<th style="padding:10px 12px;text-align:center;font-weight:700">الهاتف</th>'
    + '<th style="padding:10px 12px;text-align:center;font-weight:700">الكيان</th>'
    + '<th style="padding:10px 12px;text-align:center;font-weight:700">الموظف المسؤول</th>'
    + '<th style="padding:10px 12px;text-align:center;font-weight:700">الاسم المقترح</th>'
    + '<th style="padding:10px 12px;text-align:center;font-weight:700">الأتعاب المقدرة</th>'
    + '<th style="padding:10px 12px;text-align:right;font-weight:700">ملاحظات التأسيس</th>'
    + '<th style="padding:10px 12px;text-align:center;font-weight:700">تاريخ التحويل</th>'
    + '<th style="padding:10px 12px;text-align:center;font-weight:700">إجراءات</th>'
    + '</tr></thead><tbody>'
    + leads.map(_ueRow).join('')
    + '</tbody></table></div>';
  setPageContent('<div style="padding:20px">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">'
    + '<div><h2 style="margin:0;font-size:22px;font-weight:800;color:#0891b2">⭐ عملاء تحت التأسيس</h2>'
    + '<p style="margin:4px 0 0;font-size:13px;color:#64748b">العملاء الذين بدأت معهم إجراءات التأسيس الفعلية</p></div>'
    + '<div style="display:flex;gap:10px">'
    + '<button onclick="navigate(\'leads\')" style="background:#eef1fb;color:#1a2472;border:1px solid #c7d3ef;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">← العملاء المحتملين</button>'
    + '<button onclick="navigate(\'establishment\')" style="background:#0891b2;color:white;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📋 ملفات التأسيس</button>'
    + '</div></div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">'
    + '<div class="stat-card"><div style="font-size:24px;font-weight:800;color:#0891b2">' + count + '</div><div style="font-size:11px;color:#64748b;margin-top:2px">تحت التأسيس ⭐</div></div>'
    + '<div class="stat-card"><div style="font-size:24px;font-weight:800;color:#15803d">' + leads.filter(function(l){return l.assigned_to;}).length + '</div><div style="font-size:11px;color:#64748b;margin-top:2px">مسند لموظف</div></div>'
    + '<div class="stat-card"><div style="font-size:24px;font-weight:800;color:#d97706">' + leads.filter(function(l){return !l.assigned_to;}).length + '</div><div style="font-size:11px;color:#64748b;margin-top:2px">غير مسند ⚠️</div></div>'
    + '<div class="stat-card"><div style="font-size:24px;font-weight:800;color:#7c3aed">' + withDeposit + '</div><div style="font-size:11px;color:#64748b;margin-top:2px">لهم أتعاب 📄</div></div>'
    + '<div class="stat-card"><div style="font-size:24px;font-weight:800;color:#0891b2">' + withName + '</div><div style="font-size:11px;color:#64748b;margin-top:2px">اسم مقترح 🏷️</div></div>'
    + '</div>'
    + (count === 0 ? emptyHtml : tableHtml)
    + '</div>');
}

async function ueEditNotes(id, currentNotes) {
  const newNotes = prompt('ملاحظات التأسيس:', currentNotes);
  if(newNotes === null) return;
  try {
    await api('PATCH', `/api/leads/${id}`, {notes: newNotes});
    toast('✅ تم حفظ الملاحظات', 'success');
    loadUnderEstablishmentClients(true);
  } catch(err) { toast('حدث خطأ', 'error'); }
}

async function ueSetName(id) {
  const name = prompt('الاسم التجاري المقترح للشركة:');
  if(!name || !name.trim()) return;
  try {
    await api('PATCH', `/api/leads/${id}`, {suggested_name: name.trim()});
    toast('✅ تم حفظ الاسم المقترح', 'success');
    loadUnderEstablishmentClients(true);
  } catch(err) { toast('حدث خطأ', 'error'); }
}

function openLeadDetail(id) {
  navigate('leads');
  setTimeout(() => {
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if(row) row.scrollIntoView({behavior:'smooth', block:'center'});
  }, 400);
}

window.ueEditNotes = ueEditNotes;
window.ueSetName = ueSetName;
window.openLeadDetail = openLeadDetail;

async function revertLeadToLead(id) {
  if(!confirm('إعادة هذا العميل إلى "العملاء المحتملين"؟')) return;
  try {
    await api('PATCH', `/api/leads/${id}`, {status:'interested'});
    toast('✅ تم إعادة العميل للعملاء المحتملين', 'success');
    loadUnderEstablishmentClients();
  } catch(err) { toast('حدث خطأ', 'error'); }
}

function sendUEWhatsApp(id, phone) {
  if(!phone) { toast('لا يوجد رقم هاتف', 'warning'); return; }
  const p = phone.startsWith('0') ? '2' + phone : (phone.startsWith('20') ? phone : '20'+phone);
  window.open(`https://wa.me/${p}`, '_blank');
}

window.loadUnderEstablishmentClients = loadUnderEstablishmentClients;
window.revertLeadToLead = revertLeadToLead;
window.sendUEWhatsApp = sendUEWhatsApp;

// ── Manual Refresh Button ─────────────────────────────────────────────────────
// Cache prefixes per page — cleared before force-reload so we never get stale data
const _PAGE_CACHE_PREFIXES = {
  dashboard:            ['/api/dashboard','/api/clients','/api/invoices','/api/tasks','/api/leads'],
  clients:              ['/api/clients'],
  leads:                ['/api/leads'],
  invoices:             ['/api/invoices'],
  collections:          ['/api/collections','/api/invoices'],
  tasks:                ['/api/tasks'],
  obligations:          ['/api/obligations'],
  formation_obligations:['/api/formation_obligations'],
  documents:            ['/api/documents','/api/folders'],
  payroll:              ['/api/payroll','/api/employees'],
  settlements:          ['/api/settlements'],
  mail:                 ['/api/mail'],
  quotations:           ['/api/quotations'],
  appointments:         ['/api/appointments'],
  government_papers:    ['/api/government_papers','/api/government-papers'],
  postal:               ['/api/postal'],
  statements:           ['/api/statements'],
  timesheet:            ['/api/timesheet'],
  office_services:      ['/api/office_services','/api/office-services'],
  fin_reports:          ['/api/fin_reports','/api/assets'],
  accounting:           ['/api/accounting'],
  establishment:        ['/api/formation'],
  tax:                  ['/api/tax','/api/declarations','/api/vat'],
  client_portal:        ['/api/client_portal','/api/portal'],
  permissions:          ['/api/permissions','/api/users'],
  settings:             ['/api/settings','/api/company'],
};

function _clearPageCache(page) {
  const prefixes = _PAGE_CACHE_PREFIXES[page] || [];
  prefixes.forEach(p => _AC.invalidate(p));
}

// Same page→function map as navigate() — must stay in sync
const _REFRESH_FN_MAP = {
  dashboard:            ()=>loadDashboard(),
  clients:              ()=>loadClients(),
  leads:                ()=>loadLeads(),
  under_establishment_clients: ()=>loadUnderEstablishmentClients(),
  invoices:             ()=>loadInvoices(),
  collections:          ()=>loadCollections(),
  tasks:                ()=>loadTasks(),
  obligations:          ()=>loadObligations(),
  formation_obligations:()=>loadFormationObligations(),
  documents:            ()=>loadDocuments(),
  payroll:              ()=>loadPayroll(),
  settlements:          ()=>loadSettlements(),
  mail:                 ()=>loadMail(),
  quotations:           ()=>loadQuotations(),
  appointments:         ()=>loadAppointments(),
  government_papers:    ()=>loadGovernmentPapers(),
  postal:               ()=>loadPostal(),
  statements:           ()=>loadStatements(),
  timesheet:            ()=>loadTimesheet(),
  office_services:      ()=>loadOfficeServices(),
  fin_reports:          ()=>loadFinReports(),
  accounting:           ()=>typeof accRender==='function'?accRender():Promise.resolve(),
  establishment:        ()=>loadEstablishment(),
  tax:                  ()=>loadTax(),
  client_portal:        ()=>loadClientPortal(),
  permissions:          ()=>loadPermissions(),
  settings:             ()=>loadSettings(),
};

window.refreshCurrentPage = async function() {
  const icon = document.getElementById('refreshIcon');
  const btn  = document.getElementById('refreshBtn');
  if (btn)  btn.disabled = true;
  if (icon) icon.style.animation = 'spin 0.7s linear infinite';
  try {
    _clearPageCache(currentPage);
    const fn = _REFRESH_FN_MAP[currentPage];
    if (fn) {
      const main = document.getElementById('main');
      if (main) main.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
      await fn();
      toast('تم التحديث ✓', 'success');
    } else {
      toast('هذه الصفحة لا تدعم التحديث', 'info');
    }
  } catch(e) { toast('فشل التحديث','error'); }
  finally {
    if (btn)  btn.disabled = false;
    if (icon) icon.style.animation = '';
  }
};

// ── Hard Refresh — مسح الكاش بالكامل وإعادة التحميل ────────────────────────
window.hardRefresh = async function() {
  try {
    toast('جاري مسح الكاش وإعادة التحميل...', 'info');
    // 1. Clear sessionStorage (API cache)
    sessionStorage.clear();
    // 2. Clear all service worker caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    // 3. Unregister service worker (will re-register on next load)
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    // 4. Hard reload — bypass browser cache
    setTimeout(() => location.reload(true), 300);
  } catch(e) {
    location.reload(true);
  }
};

// formation pipeline
window._fmFilterStage=_fmFilterStage;
window._fmSearchChange=_fmSearchChange;
window.showMoveStageModal=showMoveStageModal;
window._fmDoMoveStage=_fmDoMoveStage;
window.showFormationDetail=showFormationDetail;
window._fmAddNote=_fmAddNote;
window.showFormationModal=showFormationModal;
window.showFormationEditModal=showFormationEditModal;
// obligations + notifications
window.submitObligation=submitObligation;
window.showObligationModal=showObligationModal;
window.showUpdateOblModal=showUpdateOblModal;
window.runBulkGenerate=runBulkGenerate;
window.runRefreshNotifs=runRefreshNotifs;
window.toggleNotifDropdown=toggleNotifDropdown;
window.markNotifRead=markNotifRead;
window.markAllNotifsRead=markAllNotifsRead;
window.closeNotifDropdown=closeNotifDropdown;
window.navigate=navigate;
window.openGlobalSearch=openGlobalSearch;
window.closeGlobalSearch=closeGlobalSearch;
// obligations
window.loadObligations=loadObligations;
// UI helpers (used in inline onclick)
window._hideStaleBanner=_hideStaleBanner;
window.closeModal=closeModal;
window.quickAdd=quickAdd;
window.toggleFab=toggleFab;
// settings tabs
window.loadImport=loadImport;
window.loadBackupList=loadBackupList;
window.downloadBackup=downloadBackup;
window.triggerBackupEmail=triggerBackupEmail;
// fees & invoices tabs
window.renderInvoices=renderInvoices;
window._switchFeesTab=function(tabId){_feesTab=tabId;renderInvoices(window._feesSummaryCache||null);};
// collections
window.showCollectionModal=showCollectionModal;
window.showCollectionPaymentModal=showCollectionPaymentModal;
window.showCollectionDetail=showCollectionDetail;
window.showCollectionEditModal=showCollectionEditModal;
window.deleteCollectionContract=deleteCollectionContract;
// ── Search/filter bridge functions (inline handlers cannot access module-level vars) ──
window.renderObligations=renderObligations;
window.renderDocuments=renderDocuments;
window.setOblSearch=v=>{oblSearchQ=v;renderObligations();};
window.setOblTypeFilter=v=>{oblTypeFilter=v;renderObligations();};
window.setOblStatusFilter=v=>{const kv=v==='overdue'?'overdue_kpi':v;oblStatusFilter=(oblStatusFilter===kv?'':kv);renderObligations();};
window.clearOblFilters=()=>{oblSearchQ='';oblTypeFilter='';oblStatusFilter='';renderObligations();};
// ── focus-preserving render wrapper (fixes search input losing focus on re-render)
function _renderKeepFocus(fn) {
  const el = document.activeElement;
  const id = el?.id;
  const ss = el?.selectionStart;
  const se = el?.selectionEnd;
  fn();
  if (id) {
    const restored = document.getElementById(id);
    if (restored) {
      restored.focus();
      try { restored.setSelectionRange(ss, se); } catch(e) {}
    }
  }
}
window.setDocSearch=v=>{docSearchQ=v;_renderKeepFocus(()=>renderDocuments());};
window.setDocCatFilter=v=>{docCatFilter=v;_renderKeepFocus(()=>renderDocuments());};
window.setDocClientFilter=v=>{docClientFilter=v;_renderKeepFocus(()=>renderDocuments());};
window.setFeesSearch=v=>{_feesSearchQ=v;_renderKeepFocus(()=>renderInvoices(window._feesSummaryCache||null));};
// import
window.fetchAndPreview=fetchAndPreview;
window.filterImportRows=filterImportRows;
window.confirmImport=confirmImport;
window.renderImportResult=renderImportResult;
// employees + settings tabs
window.showEmployeeModal=showEmployeeModal;
window.deactivateEmployee=deactivateEmployee;
window.showAssignTaskModal=showAssignTaskModal;
window.showEmployeeTasks=showEmployeeTasks;

async function loadBackupList() {
  const area = document.getElementById('backupListArea');
  if(!area) return;
  area.innerHTML = '<div style="text-align:center;color:#94a3b8">جاري التحميل...</div>';
  try {
    const d = await api('GET', '/api/backup/list');
    if(!d.backups || !d.backups.length) {
      area.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:10px">لا توجد نسخ محفوظة محلياً بعد</div>';
      return;
    }
    area.innerHTML = d.backups.map(b =>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px">
        <span style="font-family:monospace;color:#374151">${escH(b.filename)}</span>
        <span style="color:#64748b;margin-right:12px">${b.size_kb} KB — ${escH(b.created_at)}</span>
      </div>`).join('');
  } catch(e) {
    area.innerHTML = '<div style="color:#dc2626;text-align:center;font-size:12px">تعذّر التحميل — '+escH(e.message)+'</div>';
  }
}

async function downloadBackup(btn) {
  btn.disabled=true; btn.textContent='⏳ جاري الإنشاء...';
  try {
    const token=localStorage.getItem('ms_token');
    const resp=await fetch(getApiBase()+'/api/backup/download',{
      headers:{'Authorization':'Bearer '+token},
      signal:AbortSignal.timeout(180000),
    });
    if(!resp.ok){const e=await resp.json();throw new Error(e.detail||'فشل التحميل');}
    const blob=await resp.blob();
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const ts=new Date().toISOString().slice(0,16).replace('T','_').replace(':','');
    a.href=url; a.download='ms_backup_'+ts+'.sql.gz';
    a.click(); URL.revokeObjectURL(url);
    toast('تم تحميل النسخة الاحتياطية بنجاح');
  } catch(e){toast(e.message,'error');}
  finally{btn.disabled=false; btn.textContent='⬇️ تحميل نسخة الآن';}
}

async function triggerBackupEmail(btn) {
  btn.disabled=true; btn.textContent='⏳ جاري الإرسال...';
  try {
    const r=await api('POST','/api/backup/trigger');
    toast(r.message||'تم إرسال النسخة الاحتياطية');
    setTimeout(loadBackupList,3000);
  } catch(e){toast(e.message,'error');}
  finally{btn.disabled=false; btn.textContent='📧 إرسال نسخة بالبريد';}
}

window.switchTaxTab=switchTaxTab;
window.submitTaxReturn=submitTaxReturn;
window.showTaxModal=showTaxModal;
window.switchStab=switchStab;
window._loadSettingsTeam=_loadSettingsTeam;
window.oblTab='upcoming';
window.oblDays=30;
window.collectionsTab='establishment';

// ── Boot ───────────────────────────────────────────
renderApp();
// Apply saved language after app renders
setTimeout(()=>{
  if(localStorage.getItem('ms_lang')==='en') toggleLanguage();
}, 300);

// ══════════════════════════════════════════════════════════════════════════════
// 🏛️ ACCOUNTING MODULE — نظام الحسابات الكامل لكل شركة
// ══════════════════════════════════════════════════════════════════════════════

const ACC_TYPES = {
  asset:     {label:'أصول',           color:'#1a2472', bg:'#eef1fb'},
  liability: {label:'خصوم',           color:'#dc2626', bg:'#fef2f2'},
  equity:    {label:'حقوق ملكية',     color:'#7c3aed', bg:'#ede9fe'},
  revenue:   {label:'إيرادات',        color:'#15803d', bg:'#dcfce7'},
  expense:   {label:'مصروفات',        color:'#d97706', bg:'#fef9c3'},
};

const ACC_TX_TYPES = {
  sale:     {label:'بيع / إيراد',    icon:'📈', color:'#15803d'},
  purchase: {label:'مشتريات',        icon:'📦', color:'#1a2472'},
  expense:  {label:'مصروفات',        icon:'💸', color:'#d97706'},
  asset:    {label:'أصول ثابتة',     icon:'🏭', color:'#0369a1'},
  salary:   {label:'مرتبات',         icon:'👥', color:'#7c3aed'},
  tax:      {label:'ضرائب',          icon:'📋', color:'#dc2626'},
  receipt:  {label:'تحصيل',          icon:'💰', color:'#0369a1'},
  payment:  {label:'سداد',           icon:'💳', color:'#dc2626'},
};

let _accClientId = null;
let _accClientName = '';
let _accTab = 'dashboard';
let _accAccounts = [];
let _accYear = new Date().getFullYear();

// ── Entry Point ───────────────────────────────────────────────────────────────
async function openClientAccounting(clientId, clientName) {
  _accClientId = clientId;
  _accClientName = clientName;
  _accTab = 'dashboard';

  // Close any existing modal
  document.querySelector('.modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'accOverlay';
  overlay.style.cssText = 'background:rgba(0,0,0,.55);z-index:1100';

  overlay.innerHTML = `
  <div class="modal" style="max-width:1100px;width:96%;height:94vh;max-height:94vh;display:flex;flex-direction:column;padding:0;overflow:hidden">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a2472,#152060);padding:14px 22px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;border-radius:18px 18px 0 0">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:26px">🏛️</div>
        <div>
          <div style="color:white;font-size:15px;font-weight:800">الحسابات — ${escH(clientName)}</div>
          <div style="color:#b3c4e8;font-size:11px">نظام محاسبي متكامل | ${_accYear}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select id="accYearSel" onchange="_accYear=+this.value;accRender()" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:white;border-radius:8px;padding:5px 10px;font-family:inherit;font-size:13px">
          ${[2023,2024,2025,2026].map(y=>`<option value="${y}" ${y===_accYear?'selected':''}>${y}</option>`).join('')}
        </select>
        <button onclick="document.getElementById('accOverlay').remove()" style="background:rgba(255,255,255,.15);border:none;width:34px;height:34px;border-radius:8px;font-size:18px;cursor:pointer;color:white">✕</button>
      </div>
    </div>

    <!-- Tabs -->
    <div style="background:#f8fafc;border-bottom:2px solid #e8edf3;padding:0 16px;display:flex;gap:2px;overflow-x:auto;flex-shrink:0">
      ${[
        ['dashboard','📊','الرئيسية'],
        ['journal','📋','القيود'],
        ['sales','📈','المبيعات'],
        ['purchases','📦','المشتريات'],
        ['expenses','💸','المصروفات'],
        ['assets','🏭','أصول ثابتة'],
        ['salaries','👥','مرتبات'],
        ['taxes','📋','ضرائب'],
        ['trial','⚖️','ميزان المراجعة'],
        ['income','📄','قائمة الدخل'],
        ['balance','🏛️','الميزانية'],
        ['vat','🧾','ض ق م'],
        ['accounts','📚','دليل الحسابات'],
        ['eta','🇪🇬','المنظومة الإلكترونية'],
        ['ledger','📖','دفتر الأستاذ'],
        ['treasury','🏦','الخزينة والبنوك'],
        ['checks','🔖','الشيكات'],
        ['advances','💼','العهد والسلف'],
        ['arap','👤','عملاء / موردين'],
        ['cashflow','💧','التدفقات النقدية'],
      ].map(([id,icon,label])=>`
        <button id="accTab_${id}" onclick="switchAccTab('${id}')"
          style="padding:10px 14px;border:none;background:transparent;font-family:inherit;font-size:13px;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;font-weight:500;transition:all .15s">
          ${icon} ${label}
        </button>`).join('')}
    </div>

    <!-- Content -->
    <div id="accContent" style="flex:1;overflow-y:auto;padding:20px 22px;background:#f1f5f9"></div>
  </div>`;

  document.body.append(overlay);
  overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };

  await accRender();
}

function switchAccTab(tab) {
  _accTab = tab;
  accRender();
}

async function accRender() {
  // Highlight active tab
  document.querySelectorAll('[id^="accTab_"]').forEach(b => {
    const tid = b.id.replace('accTab_','');
    b.style.color = tid === _accTab ? '#1a2472' : '#64748b';
    b.style.borderBottomColor = tid === _accTab ? '#1a2472' : 'transparent';
    b.style.fontWeight = tid === _accTab ? '700' : '500';
    b.style.background = tid === _accTab ? 'white' : 'transparent';
  });
  const content = document.getElementById('accContent');
  if(!content) return;
  content.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  try {
    switch(_accTab) {
      case 'dashboard':  content.innerHTML = await accDashboard(); break;
      case 'journal':    content.innerHTML = await accJournal(); break;
      case 'sales':      content.innerHTML = await accTransactions('sale'); break;
      case 'purchases':  content.innerHTML = await accTransactions('purchase'); break;
      case 'expenses':   content.innerHTML = await accTransactions('expense'); break;
      case 'assets':     content.innerHTML = await accTransactions('asset'); break;
      case 'salaries':   content.innerHTML = await accTransactions('salary'); break;
      case 'taxes':      content.innerHTML = await accTransactions('tax'); break;
      case 'trial':      content.innerHTML = await accTrialBalance(); break;
      case 'income':     content.innerHTML = await accIncomeStatement(); break;
      case 'balance':    content.innerHTML = await accBalanceSheet(); break;
      case 'vat':        content.innerHTML = await accVatSummary(); break;
      case 'accounts':   content.innerHTML = await accChartOfAccounts(); break;
      case 'eta':        content.innerHTML = await accETA(); break;
      case 'ledger':     await accGeneralLedger(); break;
      case 'treasury':   content.innerHTML = await accTreasury(); break;
      case 'checks':     content.innerHTML = await accChecks(); break;
      case 'advances':   content.innerHTML = await accAdvances(); break;
      case 'arap':       content.innerHTML = await accArAp(); break;
      case 'cashflow':   content.innerHTML = await accCashFlow(); break;
    }
  } catch(e) {
    content.innerHTML = `<div style="color:#dc2626;padding:20px">❌ خطأ: ${escH(e.message)}</div>`;
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function accDashboard() {
  const s = await api('GET', `/api/accounting/${_accClientId}/summary?year=${_accYear}`);
  const hasData = s.tx_count > 0;

  return `
  <div style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
    <h2 style="font-size:16px;font-weight:800;color:#1e293b;margin:0">📊 لوحة تحكم — ${_accClientName} (${_accYear})</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <label style="background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;border:none;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:6px">
        🤖 رفع فاتورة (AI)
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none" onchange="accImportInvoice(this.files[0])">
      </label>
      <label style="background:white;border:1.5px solid #e8edf3;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;color:#1a2472;font-weight:600">
        📎 استيراد Excel
        <input type="file" accept=".xlsx,.xls" style="display:none" onchange="accImportExcel(this.files[0])">
      </label>
      ${window._lastImportIds?.length ? `<button onclick="undoLastImport()" style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;color:#dc2626;font-weight:600">🗑 تراجع عن آخر استيراد (${window._lastImportIds.length})</button>` : ''}
      ${!hasData && s.acc_count === 0 ? `<button onclick="accInstallDefaults()" class="btn btn-primary" style="font-size:13px">🏗️ تثبيت دليل الحسابات الافتراضي</button>` : ''}
    </div>
  </div>

  <!-- KPI Grid -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px">
    ${[
      {label:'المبيعات',        val:money(s.sales),          icon:'📈', color:'#15803d', bg:'#f0fdf4'},
      {label:'المشتريات',       val:money(s.purchases),      icon:'📦', color:'#1a2472', bg:'#eef1fb'},
      {label:'المصروفات',       val:money(s.expenses),       icon:'💸', color:'#d97706', bg:'#fef9c3'},
      {label:'مجمل الربح',      val:money(s.gross_profit),   icon:'💰', color: s.gross_profit>=0?'#15803d':'#dc2626', bg: s.gross_profit>=0?'#f0fdf4':'#fef2f2'},
      {label:'صافي الربح',      val:money(s.net_profit),     icon:'🏆', color: s.net_profit>=0?'#15803d':'#dc2626', bg: s.net_profit>=0?'#f0fdf4':'#fef2f2'},
      {label:'صافي ض ق م',      val:money(s.net_vat),        icon:'🧾', color:'#7c3aed', bg:'#ede9fe'},
    ].map(k=>`
      <div style="background:${k.bg};border-radius:12px;padding:16px;border-right:3px solid ${k.color}">
        <div style="font-size:22px;margin-bottom:6px">${k.icon}</div>
        <div style="font-size:20px;font-weight:800;color:${k.color}">${k.val}</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px">${k.label}</div>
      </div>`).join('')}
  </div>

  <!-- Quick actions -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
    ${[
      ['📈','مبيعات','sales'],
      ['📦','مشتريات','purchases'],
      ['💸','مصروفات','expenses'],
      ['🏭','أصول ثابتة','assets'],
      ['👥','مرتبات','salaries'],
      ['📋','ضرائب','taxes'],
      ['📋','القيود اليومية','journal'],
      ['⚖️','ميزان المراجعة','trial'],
      ['📄','قائمة الدخل','income'],
      ['🏛️','الميزانية','balance'],
      ['🧾','ض ق م','vat'],
      ['📖','دفتر الأستاذ','ledger'],
    ].map(([icon,label,tab])=>`
      <button onclick="switchAccTab('${tab}')" style="background:white;border:1.5px solid #e8edf3;border-radius:10px;padding:14px;font-family:inherit;cursor:pointer;text-align:center;transition:all .15s" onmouseover="this.style.borderColor='#1a2472'" onmouseout="this.style.borderColor='#e8edf3'">
        <div style="font-size:22px;margin-bottom:6px">${icon}</div>
        <div style="font-size:12px;font-weight:600;color:#1e293b">${label}</div>
      </button>`).join('')}
  </div>

  ${!hasData ? `<div style="margin-top:20px;padding:20px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e">
    <strong>💡 للبدء:</strong> ارفع ملف Excel (أي تنسيق) أو أدخل المعاملات يدوياً — يتولد القيد المحاسبي تلقائياً.
  </div>` : ''}`;
}

// ── Transactions Grid (Sales / Purchases / Expenses) ──────────────────────────
async function accTransactions(type) {
  const data = await api('GET', `/api/accounting/${_accClientId}/transactions?transaction_type=${type}&year=${_accYear}&page_size=100`);
  const items = data.items || [];
  const typeInfo = ACC_TX_TYPES[type];

  const headers = type === 'expense'
    ? ['التاريخ','الجهة / المصروف','نوع المصروف','المبلغ','ملاحظات','']
    : ['التاريخ','اسم الشركة','رقم التسجيل','رقم المستند','القيمة','ض ق م','الإجمالي','خصم وإضافة','صافي الإجمالي',''];

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">${typeInfo.icon} ${typeInfo.label} — ${_accYear}</h3>
    <div style="display:flex;gap:8px">
      <div style="background:${typeInfo.color};color:white;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700">
        إجمالي: ${money(data.totals?.amount || 0)}
      </div>
      <button onclick="showAddTransaction('${type}')" class="btn btn-primary" style="font-size:13px">+ إضافة</button>
    </div>
  </div>

  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8fafc">
          ${headers.map(h=>`<th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:right;white-space:nowrap;border-bottom:2px solid #e8edf3">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${items.length === 0 ? `<tr><td colspan="${headers.length}" style="text-align:center;padding:40px;color:#94a3b8">
          <div style="font-size:36px;margin-bottom:10px">${typeInfo.icon}</div>
          لا توجد ${typeInfo.label} بعد — اضغط "+ إضافة"
        </td></tr>` : items.map(t => {
          if(type === 'expense') return `<tr style="border-bottom:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:9px 12px;white-space:nowrap">${t.date||'—'}</td>
            <td style="padding:9px 12px;font-weight:600">${escH(t.partner_name||'—')}</td>
            <td style="padding:9px 12px"><span style="font-size:11px;background:#fef9c3;color:#92400e;padding:2px 8px;border-radius:6px">${escH(t.expense_category||'—')}</span></td>
            <td style="padding:9px 12px;font-weight:700;color:#d97706">${money(t.amount)}</td>
            <td style="padding:9px 12px;color:#94a3b8;font-size:12px">${escH(t.notes||'')}</td>
            <td style="padding:9px 12px;white-space:nowrap">
              <button onclick="showEditTransaction(${t.id},'expense')" style="background:#eff6ff;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;color:#1a2472;margin-left:4px">✏️</button>
              <button onclick="deleteAccTx(${t.id})" style="background:#fee2e2;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;color:#dc2626">🗑</button>
            </td>
          </tr>`;
          return `<tr style="border-bottom:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:9px 12px;white-space:nowrap">${t.date||'—'}</td>
            <td style="padding:9px 12px;font-weight:600;max-width:200px">${escH(t.partner_name||'—')}</td>
            <td style="padding:9px 12px;font-size:11px;color:#94a3b8">${escH(t.partner_tax_id||'—')}</td>
            <td style="padding:9px 12px;font-weight:600;color:#1a2472">${escH(t.doc_number||'—')}</td>
            <td style="padding:9px 12px;font-weight:700">${money(t.amount)}</td>
            <td style="padding:9px 12px;color:#7c3aed">${money(t.vat_amount)}</td>
            <td style="padding:9px 12px">${money(t.total_amount)}</td>
            <td style="padding:9px 12px;color:#dc2626">${money(t.withholding_amount)}</td>
            <td style="padding:9px 12px;font-weight:700;color:${type==='sale'?'#15803d':'#dc2626'}">${money(t.net_amount)}</td>
            <td style="padding:9px 12px;white-space:nowrap">
              <button onclick="showEditTransaction(${t.id},'${type}')" style="background:#eff6ff;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;color:#1a2472;margin-left:4px">✏️</button>
              <button onclick="deleteAccTx(${t.id})" style="background:#fee2e2;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;color:#dc2626">🗑</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
      ${items.length > 0 && type !== 'expense' ? `
      <tfoot>
        <tr style="background:#f8fafc;font-weight:700">
          <td colspan="4" style="padding:10px 12px;color:#64748b">الإجمالي (${items.length} معاملة)</td>
          <td style="padding:10px 12px">${money(items.reduce((s,t)=>s+t.amount,0))}</td>
          <td style="padding:10px 12px;color:#7c3aed">${money(items.reduce((s,t)=>s+t.vat_amount,0))}</td>
          <td style="padding:10px 12px">${money(items.reduce((s,t)=>s+t.total_amount,0))}</td>
          <td style="padding:10px 12px;color:#dc2626">${money(items.reduce((s,t)=>s+t.withholding_amount,0))}</td>
          <td style="padding:10px 12px;font-size:15px;color:${type==='sale'?'#15803d':'#dc2626'}">${money(items.reduce((s,t)=>s+t.net_amount,0))}</td>
          <td></td>
        </tr>
      </tfoot>` : ''}
    </table>
    </div>
  </div>`;
}

// ── Add Transaction Modal ─────────────────────────────────────────────────────
function showAddTransaction(type) {
  const typeInfo = ACC_TX_TYPES[type];
  const isSimple = ['expense','asset','salary','tax'].includes(type);  // no VAT fields
  const isSale   = type === 'sale';
  const today = new Date().toISOString().split('T')[0];

  const categoryPlaceholder = {
    expense: 'إيجار / كهرباء / اتصالات...',
    asset:   'مكيف / سيارة / معدات...',
    salary:  'مرتبات شهر يونيو...',
    tax:     'ضريبة قيمة مضافة / دخل...',
  }[type] || '';

  const partnerPlaceholder = {
    sale:     'اسم العميل أو الشركة',
    purchase: 'اسم المورد أو الشركة',
    expense:  'اسم الجهة (اختياري)',
    asset:    'المورد / جهة الشراء (اختياري)',
    salary:   'قسم / موظف (اختياري)',
    tax:      'مصلحة الضرائب (اختياري)',
  }[type] || '';

  // JE preview lines (shown as info)
  const jePreview = {
    sale:     'مدين: عملاء (1220) | دائن: مبيعات (4100) + ض.ق.م (2120)',
    purchase: 'مدين: مشتريات (5110) + ض.ق.م (1250) | دائن: موردون (2110)',
    expense:  'مدين: مصروفات (5200) | دائن: نقدية (1210)',
    asset:    'مدين: أصول ثابتة (1110) | دائن: نقدية (1210)',
    salary:   'مدين: رواتب (5220) | دائن: نقدية (1210)',
    tax:      'مدين: ضرائب مستحقة (2140) | دائن: نقدية (1210)',
  }[type] || '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `<div class="modal" style="max-width:580px">
    <div style="padding:16px 22px;background:linear-gradient(135deg,#1a2472,#152060);border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white;font-size:14px;font-weight:700">${typeInfo.icon} إضافة ${typeInfo.label}</div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white;font-size:16px">✕</button>
    </div>
    <div style="padding:20px 22px">

      <!-- القيد المتوقع -->
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:11px;color:#1e40af">
        🔄 <strong>القيد الذي سيُنشأ تلقائياً:</strong> ${jePreview}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">التاريخ *</label>
          <input id="txDate" type="date" class="input" value="${today}"/></div>
        ${isSimple ? `
          <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">التصنيف / الوصف</label>
            <input id="txCategory" class="input" placeholder="${categoryPlaceholder}"/></div>
        ` : `
          <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">رقم المستند</label>
            <input id="txDocNum" class="input" placeholder="1"/></div>
        `}
      </div>

      <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">الجهة / الاسم</label>
        <input id="txPartner" class="input" placeholder="${partnerPlaceholder}"/></div>

      ${!isSimple ? `<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">رقم التسجيل الضريبي</label>
        <input id="txTaxId" class="input" placeholder="758833555"/></div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">المبلغ *</label>
          <input id="txAmount" type="number" class="input" placeholder="0" oninput="calcTxTotals('${type}')"/></div>
        ${!isSimple ? `<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">نسبة ض ق م %</label>
          <input id="txVatRate" type="number" class="input" value="14" oninput="calcTxTotals('${type}')"/></div>` : '<div></div>'}
      </div>

      ${!isSimple ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">ض ق م</label>
          <input id="txVatAmt" type="number" class="input" placeholder="0"/></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">خصم وإضافة</label>
          <input id="txWhtAmt" type="number" class="input" value="0" oninput="calcTxTotals('${type}')"/></div>
      </div>
      <div style="background:#f0fdf4;border-radius:8px;padding:12px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><div style="font-size:11px;color:#6b7280;margin-bottom:2px">الإجمالي (شامل ض ق م)</div>
          <div id="txTotal" style="font-size:16px;font-weight:800;color:#1e293b">0 ج.م.</div></div>
        <div><div style="font-size:11px;color:#6b7280;margin-bottom:2px">الإجمالي بعد الخصم</div>
          <div id="txNet" style="font-size:16px;font-weight:800;color:#15803d">0 ج.م.</div></div>
      </div>` : ''}

      <div style="margin-bottom:16px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">ملاحظات</label>
        <input id="txNotes" class="input" placeholder="ملاحظات اختيارية"/></div>
      <div id="txResult" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveAccTransaction('${type}')">💾 حفظ وتوليد القيد</button>
      </div>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };
}

function calcTxTotals(type) {
  if(['expense','asset','salary','tax'].includes(type)) return;
  const amt = parseFloat(document.getElementById('txAmount')?.value || 0);
  const vatRate = parseFloat(document.getElementById('txVatRate')?.value || 14) / 100;
  const vatAmt = amt * vatRate;
  const wht = parseFloat(document.getElementById('txWhtAmt')?.value || 0);
  const total = amt + vatAmt;
  const net = total - wht;
  if(document.getElementById('txVatAmt')) document.getElementById('txVatAmt').value = vatAmt.toFixed(4);
  if(document.getElementById('txTotal')) document.getElementById('txTotal').textContent = money(total);
  if(document.getElementById('txNet')) document.getElementById('txNet').textContent = money(net);
}

async function saveAccTransaction(type) {
  const resultDiv = document.getElementById('txResult');
  const isSimple = ['expense','asset','salary','tax'].includes(type);
  const amt = parseFloat(document.getElementById('txAmount')?.value || 0);
  if(!amt) { resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px">⚠️ أدخل المبلغ</div>`; return; }

  const vatRate = isSimple ? 0 : (parseFloat(document.getElementById('txVatRate')?.value || 14) / 100);
  const vatAmt  = isSimple ? 0 : parseFloat(document.getElementById('txVatAmt')?.value || amt * vatRate);
  const whtAmt  = isSimple ? 0 : parseFloat(document.getElementById('txWhtAmt')?.value || 0);
  const total   = amt + vatAmt;
  const net     = total - whtAmt;

  const payload = {
    transaction_type: type,
    date: document.getElementById('txDate')?.value,
    partner_name: document.getElementById('txPartner')?.value?.trim() || null,
    partner_tax_id: document.getElementById('txTaxId')?.value?.trim() || null,
    doc_number: document.getElementById('txDocNum')?.value?.trim() || null,
    expense_category: document.getElementById('txCategory')?.value?.trim() || null,
    amount: amt,
    vat_rate: vatRate,
    vat_amount: vatAmt,
    withholding_rate: 0,
    withholding_amount: whtAmt,
    total_amount: isSimple ? amt : total,
    net_amount: isSimple ? amt : net,
    notes: document.getElementById('txNotes')?.value?.trim() || null,
  };

  try {
    const r = await api('POST', `/api/accounting/${_accClientId}/transactions`, payload);
    resultDiv.innerHTML = `<div style="color:#16a34a;font-size:13px">✅ ${escH(r.message)}</div>`;
    setTimeout(() => { document.querySelector('.modal-overlay:last-child')?.remove(); accRender(); }, 1200);
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`;
  }
}

async function deleteAccTx(txId) {
  if(!await confirmDlg('حذف هذه المعاملة وقيدها اليومي؟')) return;
  try {
    await api('DELETE', `/api/accounting/${_accClientId}/transactions/${txId}`);
    toast('تم الحذف');
    accRender();
  } catch(e) { toast(e.message, 'error'); }
}

// ── Edit Transaction Modal ─────────────────────────────────────────────────────
async function showEditTransaction(txId, type) {
  let t;
  try { t = await api('GET', `/api/accounting/${_accClientId}/transactions/${txId}`); }
  catch(e) { toast(e.message,'error'); return; }
  const typeInfo = ACC_TX_TYPES[type];
  const isExpense = type === 'expense';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `<div class="modal" style="max-width:580px">
    <div style="padding:16px 22px;background:linear-gradient(135deg,#1a2472,#152060);border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white;font-size:14px;font-weight:700">✏️ تعديل ${typeInfo.label}</div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white;font-size:16px">✕</button>
    </div>
    <div style="padding:20px 22px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">التاريخ *</label>
          <input id="etxDate" type="date" class="input" value="${t.date||''}"/></div>
        ${isExpense ? `
          <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">نوع المصروف</label>
            <input id="etxCategory" class="input" value="${escH(t.expense_category||'')}"/></div>
        ` : `
          <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">رقم المستند</label>
            <input id="etxDocNum" class="input" value="${escH(t.doc_number||'')}"/></div>
        `}
      </div>
      <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">${isExpense ? 'الجهة / الوصف' : 'اسم الشركة *'}</label>
        <input id="etxPartner" class="input" value="${escH(t.partner_name||'')}"/></div>
      ${!isExpense ? `<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">رقم التسجيل الضريبي</label>
        <input id="etxTaxId" class="input" value="${escH(t.partner_tax_id||'')}"/></div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">القيمة (قبل الضريبة) *</label>
          <input id="etxAmount" type="number" class="input" value="${t.amount||0}" oninput="calcEditTxTotals('${type}')"/></div>
        ${!isExpense ? `<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">نسبة ض ق م %</label>
          <input id="etxVatRate" type="number" class="input" value="${Math.round((t.vat_rate||0.14)*100)}" oninput="calcEditTxTotals('${type}')"/></div>` : '<div></div>'}
      </div>
      ${!isExpense ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">ض ق م</label>
          <input id="etxVatAmt" type="number" class="input" value="${t.vat_amount||0}"/></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">خصم وإضافة</label>
          <input id="etxWhtAmt" type="number" class="input" value="${t.withholding_amount||0}" oninput="calcEditTxTotals('${type}')"/></div>
      </div>
      <div style="background:#f0fdf4;border-radius:8px;padding:12px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><div style="font-size:11px;color:#6b7280;margin-bottom:2px">الإجمالي (شامل ض ق م)</div>
          <div id="etxTotal" style="font-size:16px;font-weight:800;color:#1e293b">${money(t.total_amount||0)}</div></div>
        <div><div style="font-size:11px;color:#6b7280;margin-bottom:2px">الإجمالي بعد الخصم</div>
          <div id="etxNet" style="font-size:16px;font-weight:800;color:#15803d">${money(t.net_amount||0)}</div></div>
      </div>` : ''}
      <div style="margin-bottom:16px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">ملاحظات</label>
        <input id="etxNotes" class="input" value="${escH(t.notes||'')}"/></div>
      <div id="etxResult" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveEditTransaction(${txId},'${type}')">💾 حفظ التعديل</button>
      </div>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };
}

function calcEditTxTotals(type) {
  if(type === 'expense') return;
  const amt = parseFloat(document.getElementById('etxAmount')?.value || 0);
  const vatRate = parseFloat(document.getElementById('etxVatRate')?.value || 14) / 100;
  const vatAmt = amt * vatRate;
  const wht = parseFloat(document.getElementById('etxWhtAmt')?.value || 0);
  const total = amt + vatAmt;
  const net = total - wht;
  if(document.getElementById('etxVatAmt')) document.getElementById('etxVatAmt').value = vatAmt.toFixed(4);
  if(document.getElementById('etxTotal')) document.getElementById('etxTotal').textContent = money(total);
  if(document.getElementById('etxNet')) document.getElementById('etxNet').textContent = money(net);
}

async function saveEditTransaction(txId, type) {
  const resultDiv = document.getElementById('etxResult');
  const isExpense = type === 'expense';
  const amt = parseFloat(document.getElementById('etxAmount')?.value || 0);
  if(!amt) { resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px">⚠️ أدخل القيمة</div>`; return; }

  const vatRate = isExpense ? 0 : (parseFloat(document.getElementById('etxVatRate')?.value || 14) / 100);
  const vatAmt  = isExpense ? 0 : parseFloat(document.getElementById('etxVatAmt')?.value || amt * vatRate);
  const whtAmt  = isExpense ? 0 : parseFloat(document.getElementById('etxWhtAmt')?.value || 0);
  const total   = amt + vatAmt;
  const net     = total - whtAmt;

  const payload = {
    transaction_type: type,
    date: document.getElementById('etxDate')?.value,
    partner_name: document.getElementById('etxPartner')?.value?.trim() || null,
    partner_tax_id: document.getElementById('etxTaxId')?.value?.trim() || null,
    doc_number: document.getElementById('etxDocNum')?.value?.trim() || null,
    expense_category: document.getElementById('etxCategory')?.value?.trim() || null,
    amount: amt,
    vat_rate: vatRate,
    vat_amount: vatAmt,
    withholding_rate: 0,
    withholding_amount: whtAmt,
    total_amount: isExpense ? amt : total,
    net_amount: isExpense ? amt : net,
    notes: document.getElementById('etxNotes')?.value?.trim() || null,
  };

  try {
    const r = await api('PUT', `/api/accounting/${_accClientId}/transactions/${txId}`, payload);
    resultDiv.innerHTML = `<div style="color:#16a34a;font-size:13px">✅ ${escH(r.message)}</div>`;
    setTimeout(() => { document.querySelector('.modal-overlay:last-child')?.remove(); accRender(); }, 1200);
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`;
  }
}

// ── Journal Entries ────────────────────────────────────────────────────────────
async function accJournal() {
  const data = await api('GET', `/api/accounting/${_accClientId}/journal-entries?year=${_accYear}&page_size=100`);
  const items = data.items || [];
  const STATUS = {draft:'مسودة',posted:'مرحَّل',reviewed:'مراجَع'};
  const STATUS_COLOR = {draft:'#94a3b8',posted:'#15803d',reviewed:'#1a2472'};

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">📋 القيود اليومية — ${_accYear}</h3>
    <button onclick="showAddJournalEntry()" class="btn btn-primary" style="font-size:13px">+ قيد يدوي</button>
  </div>
  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc">
        <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:right;border-bottom:2px solid #e8edf3">رقم القيد</th>
        <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:right;border-bottom:2px solid #e8edf3">التاريخ</th>
        <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:right;border-bottom:2px solid #e8edf3">الوصف</th>
        <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:right;border-bottom:2px solid #e8edf3">مدين</th>
        <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:right;border-bottom:2px solid #e8edf3">دائن</th>
        <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:right;border-bottom:2px solid #e8edf3">الحالة</th>
        <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#64748b;text-align:right;border-bottom:2px solid #e8edf3"></th>
      </tr></thead>
      <tbody>
        ${items.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:#94a3b8">لا توجد قيود — تُولَّد تلقائياً من المعاملات أو أضف يدوياً</td></tr>` :
          items.map(je => `<tr style="border-bottom:1px solid #f1f5f9;cursor:pointer" onclick="showJournalDetail(${je.id})" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:9px 12px;font-weight:700;color:#1a2472">${escH(je.entry_number||'')}</td>
            <td style="padding:9px 12px">${je.date||'—'}</td>
            <td style="padding:9px 12px;max-width:250px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(je.description||'')}</td>
            <td style="padding:9px 12px;font-weight:600">${money(je.total_debit)}</td>
            <td style="padding:9px 12px;font-weight:600">${money(je.total_credit)}</td>
            <td style="padding:9px 12px">
              <span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;background:${STATUS_COLOR[je.status]+'22'};color:${STATUS_COLOR[je.status]}">
                ${je.is_balanced ? '' : '⚠️ '} ${STATUS[je.status]||je.status}
              </span>
            </td>
            <td style="padding:9px 12px;white-space:nowrap" onclick="event.stopPropagation()">
              ${je.status === 'draft' ? `<button onclick="postJournalEntry(${je.id})" style="background:#dcfce7;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;color:#15803d;font-family:inherit;margin-left:4px">ترحيل</button>` : ''}
              <button onclick="copyJournalEntry(${je.id})" style="background:#eef1fb;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;color:#1a2472;font-family:inherit" title="نسخ القيد">📋</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

async function showJournalDetail(jeId) {
  try {
    const je = await api('GET', `/api/accounting/${_accClientId}/journal-entries/${jeId}`);
    const overlay2 = document.createElement('div');
    overlay2.className = 'modal-overlay';
    overlay2.style.zIndex = '1300';
    overlay2.innerHTML = `<div class="modal" style="max-width:640px">
      <div style="padding:14px 20px;background:#1a2472;border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center">
        <div style="color:white;font-weight:700;font-size:14px">📋 ${escH(je.entry_number)} — ${je.date}</div>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white">✕</button>
      </div>
      <div style="padding:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:700;padding:3px 10px;border-radius:8px;background:${je.status==='posted'?'#f0fdf4':je.status==='draft'?'#fff9c4':'#f8fafc'};color:${je.status==='posted'?'#15803d':je.status==='draft'?'#92400e':'#64748b'}">
            ${je.status==='posted'?'✅ مرحَّل':je.status==='draft'?'📝 مسودة':'📋 '+je.status}
          </span>
          <span style="font-size:12px;color:#64748b">${je.entry_type||''}</span>
          ${je.reference?`<span style="font-size:12px;color:#64748b">مرجع: ${escH(je.reference)}</span>`:''}
          ${je.notes?`<span style="font-size:11px;color:#94a3b8">${escH(je.notes)}</span>`:''}
        </div>
        <div style="font-size:13px;color:#374151;margin-bottom:16px">${escH(je.description||'')}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f8fafc">
            <th style="padding:8px 10px;text-align:right;border-bottom:1.5px solid #e8edf3">الحساب</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:1.5px solid #e8edf3">مدين</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:1.5px solid #e8edf3">دائن</th>
          </tr></thead>
          <tbody>
            ${je.lines.map(l=>`<tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:8px 10px;font-weight:${l.debit>0?'700':'400'};padding-right:${l.debit>0?'10':'30'}px">
                <span style="font-size:11px;color:#94a3b8">${l.account_code||''}</span> ${escH(l.account_name||'')}
              </td>
              <td style="padding:8px 10px;color:#1a2472;font-weight:700">${l.debit>0?money(l.debit):''}</td>
              <td style="padding:8px 10px;color:#dc2626;font-weight:700">${l.credit>0?money(l.credit):''}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#f8fafc;font-weight:700">
              <td style="padding:8px 10px">الإجمالي ${je.is_balanced?'✅ متوازن':'⚠️ غير متوازن'}</td>
              <td style="padding:8px 10px;color:#1a2472">${money(je.total_debit)}</td>
              <td style="padding:8px 10px;color:#dc2626">${money(je.total_credit)}</td>
            </tr>
          </tfoot>
        </table>
        <!-- Actions -->
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
          ${je.status==='draft'?`<button onclick="postJournalEntry(${je.id});this.closest('.modal-overlay').remove()" style="padding:7px 16px;background:#1a2472;color:white;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">🚀 ترحيل القيد</button>`:''}
          ${je.status==='posted'?`<button onclick="reverseJournalEntry(${je.id},this.closest('.modal-overlay'))" style="padding:7px 16px;background:#dc262618;color:#dc2626;border:1.5px solid #fca5a5;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">↩️ قيد عكسي</button>`:''}
          <button onclick="copyJournalEntry(${je.id});this.closest('.modal-overlay').remove()" style="padding:7px 16px;background:#f1f5f9;color:#475569;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">📋 نسخ كمسودة</button>
          ${je.status==='draft'?`<button onclick="deleteJournalEntry(${je.id},this.closest('.modal-overlay'))" style="padding:7px 16px;background:#fee2e2;color:#dc2626;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">🗑️ حذف</button>`:''}
        </div>
      </div>
    </div>`;
    document.body.append(overlay2);
    overlay2.onclick = e => { if(e.target===overlay2) overlay2.remove(); };
  } catch(e) { toast(e.message,'error'); }
}

async function postJournalEntry(jeId) {
  try {
    const r = await api('PATCH', `/api/accounting/${_accClientId}/journal-entries/${jeId}/post`);
    toast(r.message);
    accRender();
  } catch(e) { toast(e.message,'error'); }
}

async function copyJournalEntry(jeId) {
  try {
    const r = await api('POST', `/api/accounting/${_accClientId}/journal-entries/${jeId}/copy`);
    toast(r.message || '✅ تم نسخ القيد كمسودة');
    _AC.invalidate(`/api/accounting/${_accClientId}`);
    accRender();
  } catch(e) { toast(e.message,'error'); }
}

async function reverseJournalEntry(jeId, overlay) {
  if (!await confirmDlg('إنشاء قيد عكسي؟ سيتم عكس جميع المدين والدائن في قيد جديد مرحَّل بتاريخ اليوم.')) return;
  try {
    const r = await api('POST', `/api/accounting/${_accClientId}/journal-entries/${jeId}/reverse`);
    toast(r.message || '✅ تم إنشاء القيد العكسي');
    overlay?.remove();
    _AC.invalidate(`/api/accounting/${_accClientId}`);
    accRender();
  } catch(e) { toast(e.message,'error'); }
}

async function deleteJournalEntry(jeId, overlay) {
  if (!await confirmDlg('حذف هذا القيد نهائياً؟')) return;
  try {
    await api('DELETE', `/api/accounting/${_accClientId}/journal-entries/${jeId}`);
    toast('تم حذف القيد');
    overlay?.remove();
    _AC.invalidate(`/api/accounting/${_accClientId}`);
    accRender();
  } catch(e) { toast(e.message,'error'); }
}

function showAddJournalEntry() {
  const today = new Date().toISOString().split('T')[0];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `<div class="modal" style="max-width:680px">
    <div style="padding:14px 20px;background:#1a2472;border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white;font-weight:700;font-size:14px">📋 إضافة قيد يدوي</div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white">✕</button>
    </div>
    <div style="padding:20px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">التاريخ *</label>
          <input id="jeDate" type="date" class="input" value="${today}"/></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">المرجع</label>
          <input id="jeRef" class="input" placeholder="رقم الفاتورة أو المستند"/></div>
      </div>
      <div style="margin-bottom:14px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">الوصف</label>
        <input id="jeDesc" class="input" placeholder="وصف القيد..."/></div>

      <!-- Lines -->
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">أسطر القيد (مدين / دائن)</div>
      <div style="background:#f8fafc;border-radius:8px;padding:10px;margin-bottom:14px">
        <div style="display:grid;grid-template-columns:3fr 1.5fr 1.5fr 30px;gap:6px;font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:6px">
          <div>اسم الحساب</div><div>مدين</div><div>دائن</div><div></div>
        </div>
        <div id="jeLines">
          ${[1,2,3,4].map(i=>`<div style="display:grid;grid-template-columns:3fr 1.5fr 1.5fr 30px;gap:6px;margin-bottom:6px">
            <input class="input je-acct" style="font-size:13px" placeholder="اسم الحساب..."/>
            <input class="input je-debit" type="number" style="font-size:13px" placeholder="0" oninput="calcJeBalance()"/>
            <input class="input je-credit" type="number" style="font-size:13px" placeholder="0" oninput="calcJeBalance()"/>
            <button onclick="this.parentElement.remove();calcJeBalance()" style="background:#fee2e2;border:none;border-radius:6px;cursor:pointer;color:#dc2626">×</button>
          </div>`).join('')}
        </div>
        <button onclick="addJeLine()" style="background:#eef1fb;border:none;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;color:#1a2472;margin-top:4px">+ سطر</button>
      </div>
      <div id="jeBalance" style="font-size:13px;font-weight:700;color:#374151;margin-bottom:14px;padding:10px;background:#f8fafc;border-radius:8px">
        المدين: 0 | الدائن: 0 | الفرق: 0
      </div>
      <div id="jeResult" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveManualJE()">💾 حفظ القيد</button>
      </div>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
}

function addJeLine() {
  const container = document.getElementById('jeLines');
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:3fr 1.5fr 1.5fr 30px;gap:6px;margin-bottom:6px';
  div.innerHTML = `
    <input class="input je-acct" style="font-size:13px" placeholder="اسم الحساب..."/>
    <input class="input je-debit" type="number" style="font-size:13px" placeholder="0" oninput="calcJeBalance()"/>
    <input class="input je-credit" type="number" style="font-size:13px" placeholder="0" oninput="calcJeBalance()"/>
    <button onclick="this.parentElement.remove();calcJeBalance()" style="background:#fee2e2;border:none;border-radius:6px;cursor:pointer;color:#dc2626">×</button>`;
  container.append(div);
}

function calcJeBalance() {
  const debits  = Array.from(document.querySelectorAll('.je-debit')).reduce((s,i)=>s+(parseFloat(i.value)||0),0);
  const credits = Array.from(document.querySelectorAll('.je-credit')).reduce((s,i)=>s+(parseFloat(i.value)||0),0);
  const diff = Math.abs(debits - credits);
  const bal = document.getElementById('jeBalance');
  if(bal) bal.innerHTML = `المدين: <strong>${money(debits)}</strong> | الدائن: <strong>${money(credits)}</strong> | الفرق: <strong style="color:${diff<0.01?'#15803d':'#dc2626'}">${money(diff)} ${diff<0.01?'✅ متوازن':'⚠️'}</strong>`;
}

async function saveManualJE() {
  const resultDiv = document.getElementById('jeResult');
  const accInputs   = Array.from(document.querySelectorAll('.je-acct'));
  const debitInputs = Array.from(document.querySelectorAll('.je-debit'));
  const creditInputs= Array.from(document.querySelectorAll('.je-credit'));
  const lines = [];
  for(let i=0; i<accInputs.length; i++) {
    const name = accInputs[i].value.trim();
    const d = parseFloat(debitInputs[i].value)||0;
    const c = parseFloat(creditInputs[i].value)||0;
    if(!name && d===0 && c===0) continue;
    if(!name) { resultDiv.innerHTML=`<div style="color:#dc2626;font-size:13px">⚠️ أدخل اسم الحساب لكل سطر</div>`; return; }
    lines.push({account_name: name, debit: d, credit: c});
  }
  if(lines.length < 2) { resultDiv.innerHTML=`<div style="color:#dc2626;font-size:13px">⚠️ القيد يحتاج سطرين على الأقل</div>`; return; }
  try {
    const r = await api('POST', `/api/accounting/${_accClientId}/journal-entries`, {
      date: document.getElementById('jeDate')?.value,
      description: document.getElementById('jeDesc')?.value?.trim(),
      reference: document.getElementById('jeRef')?.value?.trim(),
      entry_type: 'manual',
      lines,
    });
    resultDiv.innerHTML = `<div style="color:#16a34a;font-size:13px">✅ ${escH(r.message)}</div>`;
    setTimeout(()=>{ document.querySelector('.modal-overlay:last-child')?.remove(); accRender(); }, 1200);
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`;
  }
}

// ── Trial Balance ─────────────────────────────────────────────────────────────
async function accTrialBalance() {
  const data = await api('GET', `/api/accounting/${_accClientId}/trial-balance?year=${_accYear}`);
  const rows = data.rows || [];
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">⚖️ ميزان المراجعة — ${_accYear}</h3>
    <span style="font-size:12px;padding:4px 12px;border-radius:8px;background:${data.is_balanced?'#dcfce7':'#fee2e2'};color:${data.is_balanced?'#15803d':'#dc2626'};font-weight:700">
      ${data.is_balanced ? '✅ الميزان متوازن' : '⚠️ الميزان غير متوازن'}
    </span>
  </div>
  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc">
        <th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b">كود</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b">اسم الحساب</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b">النوع</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#1a2472">مدين</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#dc2626">دائن</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#374151">الرصيد</th>
      </tr></thead>
      <tbody>
        ${rows.length === 0 ? `<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">لا توجد قيود مرحَّلة لعام ${_accYear}</td></tr>` :
          rows.map(r => {
            const t = ACC_TYPES[r.account_type] || ACC_TYPES.asset;
            return `<tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:9px 14px;font-size:11px;color:#94a3b8;font-weight:600">${r.code}</td>
              <td style="padding:9px 14px;font-weight:600">${escH(r.name)}</td>
              <td style="padding:9px 14px"><span style="font-size:11px;padding:2px 8px;border-radius:6px;background:${t.bg};color:${t.color};font-weight:600">${t.label}</span></td>
              <td style="padding:9px 14px;color:#1a2472;font-weight:700">${r.debit > 0 ? money(r.debit) : '—'}</td>
              <td style="padding:9px 14px;color:#dc2626;font-weight:700">${r.credit > 0 ? money(r.credit) : '—'}</td>
              <td style="padding:9px 14px;font-weight:700;color:${r.balance>0?'#1a2472':r.balance<0?'#dc2626':'#6b7280'}">${money(Math.abs(r.balance))} ${r.balance>0?'د':r.balance<0?'ك':''}</td>
            </tr>`;
          }).join('')}
      </tbody>
      ${rows.length>0?`<tfoot><tr style="background:#f8fafc;font-weight:700">
        <td colspan="3" style="padding:10px 14px;color:#64748b">الإجمالي (${rows.length} حساب)</td>
        <td style="padding:10px 14px;color:#1a2472;font-size:15px">${money(data.total_debit)}</td>
        <td style="padding:10px 14px;color:#dc2626;font-size:15px">${money(data.total_credit)}</td>
        <td style="padding:10px 14px"></td>
      </tr></tfoot>`:''}
    </table>
  </div>`;
}

// ── Income Statement ──────────────────────────────────────────────────────────
async function accIncomeStatement() {
  const d = await api('GET', `/api/accounting/${_accClientId}/reports/income?year=${_accYear}`);
  const row = (label, val, bold=false, indent=false, color='#1e293b') =>
    `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:10px 16px${indent?';padding-right:28px':''};font-size:13px;font-weight:${bold?'700':'400'};color:#374151">${label}</td>
      <td style="padding:10px 16px;text-align:left;font-size:${bold?'15':'13'}px;font-weight:${bold?'800':'600'};color:${color}">${val}</td>
    </tr>`;
  return `
  <div style="max-width:600px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">📄 قائمة الدخل — ${_accYear}</h3>
      <div style="font-size:11px;color:#94a3b8">الأرقام بالجنيه المصري</div>
    </div>
    <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="background:#1a2472;padding:12px 16px;color:white;font-size:13px;font-weight:700">
        قائمة الدخل عن الفترة من 1/1/${_accYear} حتى 31/12/${_accYear}
      </div>
      <table style="width:100%;border-collapse:collapse">
        ${row('الإيرادات (المبيعات)', money(d.tx_sales), true, false, '#15803d')}
        ${row('(يخصم) تكلفة المبيعات / المشتريات', `(${money(d.tx_purchases)})`, false, true, '#dc2626')}
        ${row('مجمل الربح', money(d.gross_profit), true, false, d.gross_profit>=0?'#15803d':'#dc2626')}
        ${row('(يخصم) المصروفات العمومية', `(${money(d.tx_expenses)})`, false, true, '#d97706')}
        <tr style="background:${d.net_profit>=0?'#f0fdf4':'#fef2f2'}">
          <td style="padding:14px 16px;font-size:15px;font-weight:800;color:${d.net_profit>=0?'#15803d':'#dc2626'}">صافي الربح (الخسارة)</td>
          <td style="padding:14px 16px;text-align:left;font-size:18px;font-weight:800;color:${d.net_profit>=0?'#15803d':'#dc2626'}">${money(d.net_profit)}</td>
        </tr>
      </table>
    </div>
  </div>`;
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────
async function accBalanceSheet() {
  const d = await api('GET', `/api/accounting/${_accClientId}/reports/balance-sheet?year=${_accYear}`);

  // Helper: group asset items into current/fixed
  const isCurrentAsset = (code) => {
    if(!code) return true;
    const n = parseInt(code);
    return (n >= 1100 && n < 1300); // cash, receivables, VAT debit = current
  };
  const currentAssets = (d.assets.items||[]).filter(i => isCurrentAsset(i.code));
  const fixedAssets   = (d.assets.items||[]).filter(i => !isCurrentAsset(i.code));

  const isCurrentLiab = (code) => {
    if(!code) return true;
    const n = parseInt(code);
    return (n >= 2100 && n < 2300);
  };
  const currentLiabs  = (d.liabilities.items||[]).filter(i => isCurrentLiab(i.code));
  const longLiabs     = (d.liabilities.items||[]).filter(i => !isCurrentLiab(i.code));

  const totalCurrAssets = currentAssets.reduce((s,i)=>s+Math.abs(i.balance),0);
  const totalFixedAssets= fixedAssets.reduce((s,i)=>s+Math.abs(i.balance),0);
  const totalCurrLiabs  = currentLiabs.reduce((s,i)=>s+Math.abs(i.balance),0);
  const totalLongLiabs  = longLiabs.reduce((s,i)=>s+Math.abs(i.balance),0);

  const rows = (items) => items.length === 0 ? '' : items.map(i=>`
    <tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px 16px 8px 28px;font-size:13px;color:#374151">${escH(i.code?`${i.code} — ${i.name}`:i.name)}</td>
      <td style="padding:8px 16px;text-align:left;font-size:13px;font-weight:600;color:#1e293b">${money(Math.abs(i.balance))}</td>
    </tr>`).join('');

  const subHeader = (title, bg='#f8fafc', color='#64748b') =>
    `<tr><td colspan="2" style="padding:9px 16px;font-size:12px;font-weight:800;color:${color};background:${bg};border-bottom:1px solid #e8edf3;border-top:1px solid #e8edf3;text-transform:uppercase;letter-spacing:.5px">${title}</td></tr>`;

  const subtotal = (label, amount, color='#374151') =>
    `<tr style="background:#f0f4ff"><td style="padding:9px 16px;font-size:13px;font-weight:700;color:${color}">${label}</td>
     <td style="padding:9px 16px;text-align:left;font-size:13px;font-weight:800;color:${color}">${money(amount)}</td></tr>`;

  const totalRow = (label, amount, color='#1a2472') =>
    `<tr style="background:#eef1fb"><td style="padding:11px 16px;font-size:14px;font-weight:800;color:${color}">${label}</td>
     <td style="padding:11px 16px;text-align:left;font-size:14px;font-weight:900;color:${color}">${money(amount)}</td></tr>`;

  const noData = d.assets.total === 0 && d.liabilities.total === 0 && d.net_profit === 0;

  return `
  <div style="max-width:640px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">🏛️ الميزانية العمومية — ${_accYear}</h3>
      ${noData ? `<div style="font-size:12px;color:#94a3b8">لا توجد بيانات — أضف معاملات أو ثبِّت دليل الحسابات</div>` : ''}
    </div>
    <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="background:#1a2472;padding:12px 16px;color:white;font-size:13px;font-weight:700">
        قائمة المركز المالي في 31/12/${_accYear}
      </div>
      <table style="width:100%;border-collapse:collapse">
        <!-- ═══ الأصول ═══ -->
        ${subHeader('أولاً: الأصول', '#1e293b', '#f8fafc')}

        ${subHeader('أ — الأصول المتداولة', '#f0f4ff', '#1a2472')}
        ${rows(currentAssets)}
        ${subtotal('إجمالي الأصول المتداولة', totalCurrAssets, '#1a2472')}

        ${subHeader('ب — الأصول الثابتة والطويلة الأجل', '#f0f4ff', '#1a2472')}
        ${rows(fixedAssets)}
        ${fixedAssets.length === 0 ? `<tr><td colspan="2" style="padding:8px 28px;font-size:12px;color:#94a3b8;font-style:italic">—</td></tr>` : ''}
        ${subtotal('إجمالي الأصول الثابتة', totalFixedAssets, '#1a2472')}

        ${totalRow('إجمالي الأصول', d.assets.total)}

        <!-- ═══ الخصوم ═══ -->
        ${subHeader('ثانياً: الخصوم', '#1e293b', '#f8fafc')}

        ${subHeader('أ — الخصوم المتداولة', '#fff5f5', '#dc2626')}
        ${rows(currentLiabs)}
        ${currentLiabs.length === 0 ? `<tr><td colspan="2" style="padding:8px 28px;font-size:12px;color:#94a3b8;font-style:italic">—</td></tr>` : ''}
        ${subtotal('إجمالي الخصوم المتداولة', totalCurrLiabs, '#dc2626')}

        ${subHeader('ب — الخصوم طويلة الأجل', '#fff5f5', '#dc2626')}
        ${rows(longLiabs)}
        ${longLiabs.length === 0 ? `<tr><td colspan="2" style="padding:8px 28px;font-size:12px;color:#94a3b8;font-style:italic">—</td></tr>` : ''}
        ${subtotal('إجمالي الخصوم طويلة الأجل', totalLongLiabs, '#dc2626')}

        ${totalRow('إجمالي الخصوم', d.liabilities.total, '#dc2626')}

        <!-- ═══ حقوق الملكية ═══ -->
        ${subHeader('ثالثاً: حقوق الملكية', '#1e293b', '#f8fafc')}
        ${rows(d.equity.items||[])}
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:8px 28px;font-size:13px;color:#374151">صافي الربح (الخسارة) — ${_accYear}</td>
          <td style="padding:8px 16px;text-align:left;font-size:13px;font-weight:700;color:${d.net_profit>=0?'#15803d':'#dc2626'}">${money(d.net_profit)}</td>
        </tr>
        ${totalRow('إجمالي حقوق الملكية', d.equity.total, '#7c3aed')}

        <!-- ═══ الإجمالي ═══ -->
        <tr style="background:#1a2472">
          <td style="padding:13px 16px;font-size:14px;font-weight:800;color:white">إجمالي الخصوم وحقوق الملكية</td>
          <td style="padding:13px 16px;text-align:left;font-size:16px;font-weight:900;color:#fbbf24">${money(d.total_liabilities_equity)}</td>
        </tr>
        ${Math.abs(d.assets.total - d.total_liabilities_equity) > 1 ? `<tr style="background:#fef2f2">
          <td colspan="2" style="padding:8px 16px;font-size:12px;color:#dc2626;text-align:center">
            ⚠️ الميزانية غير متوازنة — فارق: ${money(Math.abs(d.assets.total - d.total_liabilities_equity))}
          </td>
        </tr>` : `<tr style="background:#f0fdf4">
          <td colspan="2" style="padding:8px 16px;font-size:12px;color:#15803d;text-align:center">✅ الميزانية متوازنة</td>
        </tr>`}
      </table>
    </div>
  </div>`;
}

// ── VAT Summary ───────────────────────────────────────────────────────────────
async function accVatSummary() {
  const d = await api('GET', `/api/accounting/${_accClientId}/reports/vat?year=${_accYear}`);
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">🧾 ملخص ضريبة القيمة المضافة — ${_accYear}</h3>
    <div style="display:flex;gap:8px">
      <div style="padding:6px 14px;border-radius:8px;background:#dcfce7;color:#15803d;font-size:12px;font-weight:700">ض ق م مبيعات: ${money(d.total_sales_vat)}</div>
      <div style="padding:6px 14px;border-radius:8px;background:#fef2f2;color:#dc2626;font-size:12px;font-weight:700">ض ق م مشتريات: ${money(d.total_purch_vat)}</div>
      <div style="padding:6px 14px;border-radius:8px;background:${d.net_vat>=0?'#fef9c3':'#ede9fe'};color:${d.net_vat>=0?'#92400e':'#7c3aed'};font-size:12px;font-weight:700">صافي: ${money(d.net_vat)}</div>
    </div>
  </div>
  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc">
        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b">الشهر</th>
        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#15803d">مبيعات</th>
        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#15803d">ض ق م مبيعات</th>
        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#1a2472">مشتريات</th>
        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#1a2472">ض ق م مشتريات</th>
        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#374151">صافي ض ق م</th>
        <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#374151">الحالة</th>
      </tr></thead>
      <tbody>
        ${d.months.map(m => {
          const hasData = m.sales_net > 0 || m.purch_net > 0;
          return `<tr style="border-bottom:1px solid #f1f5f9;opacity:${hasData?1:.4}">
            <td style="padding:9px 12px;font-weight:600">${m.month_name}</td>
            <td style="padding:9px 12px;color:#15803d">${m.sales_net>0?money(m.sales_net):'—'}</td>
            <td style="padding:9px 12px;font-weight:700;color:#15803d">${m.sales_vat>0?money(m.sales_vat):'—'}</td>
            <td style="padding:9px 12px;color:#1a2472">${m.purch_net>0?money(m.purch_net):'—'}</td>
            <td style="padding:9px 12px;font-weight:700;color:#1a2472">${m.purch_vat>0?money(m.purch_vat):'—'}</td>
            <td style="padding:9px 12px;font-weight:700;color:${m.net_vat>0?'#dc2626':m.net_vat<0?'#15803d':'#94a3b8'}">${m.net_vat!==0?money(Math.abs(m.net_vat)):'—'}</td>
            <td style="padding:9px 12px">
              ${m.status==='—'?'' : `<span style="font-size:11px;padding:2px 8px;border-radius:6px;background:${m.net_vat>0?'#fee2e2':'#dcfce7'};color:${m.net_vat>0?'#dc2626':'#15803d'};font-weight:700">${m.status}</span>`}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

// ── Chart of Accounts ─────────────────────────────────────────────────────────
async function accChartOfAccounts() {
  const accounts = await api('GET', `/api/accounting/${_accClientId}/accounts`);
  const hasAccounts = accounts.length > 0;

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">📚 دليل الحسابات (${accounts.length} حساب)</h3>
    <div style="display:flex;gap:8px">
      ${!hasAccounts ? `<button onclick="accInstallDefaults()" class="btn btn-primary" style="font-size:13px">🏗️ تثبيت الحسابات الافتراضية</button>` : ''}
    </div>
  </div>
  ${!hasAccounts ? `<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:16px;font-size:13px;color:#92400e">
    <strong>لا يوجد دليل حسابات بعد.</strong> اضغط "تثبيت الحسابات الافتراضية" للبدء بدليل حسابات مصري معياري كامل.
  </div>` : `
  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc">
        <th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b">الكود</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b">اسم الحساب</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b">النوع</th>
        <th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b">رصيد افتتاحي</th>
      </tr></thead>
      <tbody>
        ${accounts.map(a => {
          const t = ACC_TYPES[a.account_type] || ACC_TYPES.asset;
          return `<tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:9px 14px;font-size:12px;font-weight:700;color:#94a3b8">${a.code}</td>
            <td style="padding:9px 14px;font-weight:${a.code.endsWith('00')?'700':'400'};color:${a.code.endsWith('00')?'#1e293b':'#374151'};padding-right:${a.code.length===4&&!a.code.endsWith('00')?'28':'14'}px">${escH(a.name)}</td>
            <td style="padding:9px 14px"><span style="font-size:11px;padding:2px 8px;border-radius:6px;background:${t.bg};color:${t.color};font-weight:600">${t.label}</span></td>
            <td style="padding:9px 14px;font-size:12px;color:#64748b">${a.opening_balance > 0 ? money(a.opening_balance) : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`}`;
}

async function accInstallDefaults() {
  try {
    const r = await api('POST', `/api/accounting/${_accClientId}/accounts/install-default`);
    toast(r.message || '✅ تم تثبيت دليل الحسابات');
    accRender();
  } catch(e) { toast(e.message, 'error'); }
}

async function accImportExcel(file) {
  if(!file) return;
  const formData = new FormData();
  formData.append('file', file);
  try {
    toast('⏳ جاري تحليل الملف...', 'info');
    const r = await fetch(`${API}/api/accounting/${_accClientId}/import/excel/preview`, {
      method: 'POST',
      headers: token ? {Authorization: `Bearer ${token}`} : {},
      body: formData,
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.detail || 'فشل التحليل');
    showImportPreview(data);
  } catch(e) { toast(e.message, 'error'); }
}

const TX_TYPE_LABELS = {
  sale:'مبيعات', purchase:'مشتريات', expense:'مصروفات',
  asset:'أصول ثابتة', salary:'مرتبات', tax:'ضرائب', bank_statement:'كشف بنكي'
};
const TX_TYPE_COLORS = {
  sale:'#15803d', purchase:'#1a2472', expense:'#d97706',
  asset:'#0369a1', salary:'#7c3aed', tax:'#dc2626', bank_statement:'#374151'
};

function showImportPreview(data) {
  // Store rows globally for confirm step
  window._importRows = data.rows || [];

  const confBadge = (c) => {
    const col = c >= 80 ? '#15803d' : c >= 50 ? '#d97706' : '#dc2626';
    const bg  = c >= 80 ? '#dcfce7' : c >= 50 ? '#fef9c3' : '#fef2f2';
    return `<span style="background:${bg};color:${col};padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">${c}%</span>`;
  };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '1300';
  overlay.id = 'importPreviewOverlay';

  const sheetsHtml = (data.sheets || []).map(s => `
    <div style="background:${s.error?'#fef2f2':'white'};border:1px solid #e8edf3;border-radius:10px;padding:12px 14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:700;font-size:13px;color:#1e293b">📄 ${escH(s.sheet)}</div>
        <div style="display:flex;gap:8px;align-items:center">
          ${s.error ? `<span style="color:#dc2626;font-size:12px">❌ ${escH(s.error)}</span>` : `
            <span style="background:#eff6ff;color:#1a2472;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">${TX_TYPE_LABELS[s.tx_type]||s.tx_type}</span>
            ${confBadge(s.confidence)}
            <span style="font-size:11px;color:#64748b">${s.row_count} صف</span>
          `}
        </div>
      </div>
      ${!s.error ? `
        <div style="font-size:11px;color:#64748b;margin-bottom:6px">
          <strong>الأعمدة المكتشفة:</strong>
          ${Object.entries(s.col_mapping||{}).filter(([k,v])=>v).map(([k,v])=>`<span style="background:#f1f5f9;border-radius:4px;padding:1px 6px;margin:1px">${k}: ${escH(String(v))}</span>`).join(' ')}
        </div>
        ${s.sample?.length ? `
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="background:#f8fafc">
              <th style="padding:4px 8px;text-align:right;color:#64748b;border-bottom:1px solid #e8edf3">التاريخ</th>
              <th style="padding:4px 8px;text-align:right;color:#64748b;border-bottom:1px solid #e8edf3">الجهة</th>
              <th style="padding:4px 8px;text-align:right;color:#64748b;border-bottom:1px solid #e8edf3">المبلغ</th>
              <th style="padding:4px 8px;text-align:right;color:#64748b;border-bottom:1px solid #e8edf3">ض ق م</th>
              <th style="padding:4px 8px;text-align:right;color:#64748b;border-bottom:1px solid #e8edf3">صافي</th>
            </tr></thead>
            <tbody>
              ${s.sample.map(r=>`<tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:4px 8px">${r.date||'—'}</td>
                <td style="padding:4px 8px">${escH(r.partner||r.description||'—')}</td>
                <td style="padding:4px 8px;font-weight:700">${money(r.amount)}</td>
                <td style="padding:4px 8px;color:#7c3aed">${money(r.vat)}</td>
                <td style="padding:4px 8px;color:#15803d">${money(r.net)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
      ` : ''}
    </div>
  `).join('');

  overlay.innerHTML = `<div class="modal" style="max-width:720px;max-height:90vh;display:flex;flex-direction:column">
    <div style="padding:16px 22px;background:linear-gradient(135deg,#1a2472,#152060);border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
      <div style="color:white;font-size:14px;font-weight:700">📎 معاينة الاستيراد — مراجعة قبل الاعتماد</div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white;font-size:16px">✕</button>
    </div>
    <div style="padding:16px 22px;overflow-y:auto;flex:1">

      <!-- ملخص -->
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:15px;font-weight:800;color:#1a2472">${data.total_rows} صف جاهز للاستيراد</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">${(data.sheets||[]).length} شيت — يرجى المراجعة ثم الضغط على "اعتماد وترحيل"</div>
        </div>
        <div style="font-size:11px;color:#64748b;background:white;border-radius:8px;padding:6px 10px">
          سيتم إنشاء ${data.total_rows} قيد محاسبي تلقائياً
        </div>
      </div>

      ${sheetsHtml}
    </div>

    <div style="padding:14px 22px;border-top:1px solid #e8edf3;display:flex;gap:10px;justify-content:flex-end;flex-shrink:0">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      ${data.total_rows > 0 ? `<button class="btn btn-primary" id="confirmImportBtn" onclick="confirmImportExcel()">
        ✅ اعتماد وترحيل ${data.total_rows} معاملة
      </button>` : ''}
    </div>
  </div>`;

  document.body.append(overlay);
  overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };
}

async function confirmImportExcel() {
  const rows = window._importRows || [];
  if(!rows.length) return;
  const btn = document.getElementById('confirmImportBtn');
  if(btn) { btn.disabled = true; btn.textContent = '⏳ جاري الترحيل...'; }
  try {
    const r = await api('POST', `/api/accounting/${_accClientId}/import/excel/confirm`, { rows });
    document.getElementById('importPreviewOverlay')?.remove();
    // Store imported IDs for undo
    if(r.imported_ids?.length) {
      window._lastImportIds = r.imported_ids;
      window._lastImportCount = r.total;
    }
    toast(r.message || `✅ تم استيراد ${r.total} معاملة`);
    if(r.errors_count > 0) toast(`⚠️ ${r.errors_count} أخطاء في الاستيراد`, 'warning');
    accRender();
  } catch(e) {
    toast(e.message, 'error');
    if(btn) { btn.disabled = false; btn.textContent = `✅ اعتماد وترحيل ${rows.length} معاملة`; }
  }
}

async function undoLastImport() {
  const ids = window._lastImportIds;
  if(!ids?.length) return toast('لا يوجد استيراد حديث للتراجع عنه', 'warning');
  if(!await confirmDlg(`حذف آخر استيراد (${ids.length} معاملة وقيودها)؟`)) return;
  try {
    const r = await api('POST', `/api/accounting/${_accClientId}/transactions/delete-batch`, { tx_ids: ids });
    toast(`🗑 تم مسح ${r.deleted} معاملة`);
    window._lastImportIds = null;
    accRender();
  } catch(e) { toast(e.message, 'error'); }
}

// ── AI Invoice OCR — PDF / Image Reader ───────────────────────────────────────
async function accImportInvoice(file) {
  if(!file) return;
  const formData = new FormData();
  formData.append('file', file);

  // Show loading overlay
  const loadingId = 'invoiceLoadingOverlay';
  const lo = document.createElement('div');
  lo.id = loadingId;
  lo.className = 'modal-overlay';
  lo.style.zIndex = '1400';
  lo.innerHTML = `<div style="background:white;border-radius:18px;padding:40px;text-align:center;min-width:300px">
    <div style="font-size:48px;margin-bottom:16px">🤖</div>
    <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:8px">جاري قراءة الفاتورة...</div>
    <div style="font-size:13px;color:#64748b">الذكاء الاصطناعي يحلل المستند</div>
    <div class="spinner" style="margin:20px auto 0"></div>
  </div>`;
  document.body.append(lo);

  try {
    const r = await fetch(`${API}/api/accounting/${_accClientId}/import/invoice`, {
      method: 'POST',
      headers: token ? {Authorization: `Bearer ${token}`} : {},
      body: formData,
    });
    const data = await r.json();
    lo.remove();
    if(!r.ok) throw new Error(data.detail || 'فشل تحليل الفاتورة');
    showInvoicePreview(data);
  } catch(e) {
    lo.remove();
    toast(e.message, 'error');
  }
}

function showInvoicePreview(data) {
  const typeInfo   = ACC_TX_TYPES[data.tx_type] || {icon:'📄', label:data.tx_type, color:'#374151'};
  const confColor  = data.confidence >= 80 ? '#15803d' : data.confidence >= 50 ? '#d97706' : '#dc2626';
  const confBg     = data.confidence >= 80 ? '#dcfce7' : data.confidence >= 50 ? '#fef9c3' : '#fef2f2';
  const today      = new Date().toISOString().split('T')[0];

  const jeLines = {
    sale:     [{d:'1220 عملاء',c:''},{d:'',c:'4100 مبيعات'},{d:'',c:'2120 ض.ق.م'}],
    purchase: [{d:'5110 مشتريات',c:''},{d:'1250 ض.ق.م مدين',c:''},{d:'',c:'2110 موردون'}],
    expense:  [{d:'5200 مصروفات',c:''},{d:'',c:'1210 نقدية'}],
    asset:    [{d:'1110 أصول ثابتة',c:''},{d:'',c:'1210 نقدية'}],
    salary:   [{d:'5220 رواتب',c:''},{d:'',c:'1210 نقدية'}],
    tax:      [{d:'2140 ضرائب مستحقة',c:''},{d:'',c:'1210 نقدية'}],
  }[data.tx_type] || [];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '1300';
  overlay.id = 'invoicePreviewOverlay';
  overlay.innerHTML = `<div class="modal" style="max-width:650px;max-height:92vh;display:flex;flex-direction:column">

    <!-- Header -->
    <div style="padding:16px 22px;background:linear-gradient(135deg,#7c3aed,#5b21b6);border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
      <div>
        <div style="color:white;font-size:14px;font-weight:700">🤖 نتيجة تحليل الفاتورة بالذكاء الاصطناعي</div>
        <div style="color:rgba(255,255,255,.7);font-size:11px;margin-top:2px">${escH(data.filename||'')}</div>
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white;font-size:16px">✕</button>
    </div>

    <div style="padding:18px 22px;overflow-y:auto;flex:1">

      <!-- نوع + ثقة -->
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        <div style="background:${typeInfo.color};color:white;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700">
          ${typeInfo.icon} ${typeInfo.label}
        </div>
        <div style="background:${confBg};color:${confColor};padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700">
          نسبة الثقة: ${data.confidence}%
        </div>
        ${data.notes ? `<div style="font-size:11px;color:#64748b;background:#f1f5f9;padding:4px 10px;border-radius:8px">${escH(data.notes)}</div>` : ''}
      </div>

      <!-- البيانات المستخرجة -->
      <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px">📋 البيانات المستخرجة — يمكنك التعديل قبل الاعتماد</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">التاريخ</label>
            <input id="invDate" type="date" class="input" style="font-size:13px" value="${data.date || today}"/>
          </div>
          <div>
            <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">رقم المستند</label>
            <input id="invDoc" class="input" style="font-size:13px" value="${escH(data.doc_number||'')}"/>
          </div>
          <div>
            <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">الجهة (عميل / مورد)</label>
            <input id="invPartner" class="input" style="font-size:13px" value="${escH(data.partner||'')}"/>
          </div>
          <div>
            <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">نوع المعاملة</label>
            <select id="invType" class="input" style="font-size:13px">
              ${['sale','purchase','expense','asset','salary','tax'].map(t=>
                `<option value="${t}" ${t===data.tx_type?'selected':''}>${ACC_TX_TYPES[t]?.icon||''} ${ACC_TX_TYPES[t]?.label||t}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">المبلغ (قبل الضريبة)</label>
            <input id="invAmount" type="number" class="input" style="font-size:13px;font-weight:700" value="${data.amount}"/>
          </div>
          <div>
            <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">ض.ق.م</label>
            <input id="invVat" type="number" class="input" style="font-size:13px" value="${data.vat}"/>
          </div>
          <div>
            <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">خصم / استقطاع</label>
            <input id="invWht" type="number" class="input" style="font-size:13px" value="${data.wht}"/>
          </div>
          <div>
            <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">الصافي</label>
            <input id="invNet" type="number" class="input" style="font-size:13px;color:#15803d;font-weight:700" value="${data.net}"/>
          </div>
        </div>
        <div style="margin-top:10px">
          <label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">الوصف / البيان</label>
          <input id="invDesc" class="input" style="font-size:13px" value="${escH(data.description||'')}"/>
        </div>
      </div>

      <!-- القيد المقترح -->
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:10px">🔄 القيد المحاسبي الذي سيُنشأ تلقائياً</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr>
            <th style="padding:6px 10px;text-align:right;color:#64748b;border-bottom:1px solid #bfdbfe">الحساب</th>
            <th style="padding:6px 10px;text-align:right;color:#1a2472;border-bottom:1px solid #bfdbfe">مدين ←</th>
            <th style="padding:6px 10px;text-align:right;color:#dc2626;border-bottom:1px solid #bfdbfe">→ دائن</th>
          </tr></thead>
          <tbody>
            ${jeLines.map(l=>`<tr>
              <td style="padding:5px 10px">${l.d||l.c}</td>
              <td style="padding:5px 10px;color:#1a2472;font-weight:${l.d?'700':'400'}">${l.d?'✓':''}</td>
              <td style="padding:5px 10px;color:#dc2626;font-weight:${l.c?'700':'400'}">${l.c?'✓':''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div id="invResult"></div>
    </div>

    <!-- Footer buttons -->
    <div style="padding:14px 22px;border-top:1px solid #e8edf3;display:flex;gap:10px;justify-content:flex-end;flex-shrink:0">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button class="btn btn-primary" id="confirmInvBtn" style="background:linear-gradient(135deg,#7c3aed,#5b21b6)" onclick="confirmInvoiceImport()">
        ✅ اعتماد وترحيل القيد
      </button>
    </div>
  </div>`;

  document.body.append(overlay);
  overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };
}

async function confirmInvoiceImport() {
  const btn = document.getElementById('confirmInvBtn');
  const resultDiv = document.getElementById('invResult');
  if(btn) { btn.disabled = true; btn.textContent = '⏳ جاري الترحيل...'; }

  const row = {
    date:        document.getElementById('invDate')?.value || new Date().toISOString().split('T')[0],
    amount:      parseFloat(document.getElementById('invAmount')?.value || 0),
    vat:         parseFloat(document.getElementById('invVat')?.value || 0),
    wht:         parseFloat(document.getElementById('invWht')?.value || 0),
    net:         parseFloat(document.getElementById('invNet')?.value || 0),
    partner:     document.getElementById('invPartner')?.value?.trim() || null,
    doc_number:  document.getElementById('invDoc')?.value?.trim() || null,
    description: document.getElementById('invDesc')?.value?.trim() || null,
    tx_type:     document.getElementById('invType')?.value || 'expense',
  };

  if(!row.amount) {
    if(resultDiv) resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px">⚠️ المبلغ مطلوب</div>`;
    if(btn) { btn.disabled = false; btn.textContent = '✅ اعتماد وترحيل القيد'; }
    return;
  }
  if(!row.net) row.net = row.amount + row.vat - row.wht;

  try {
    const r = await api('POST', `/api/accounting/${_accClientId}/import/excel/confirm`, { rows: [row] });
    document.getElementById('invoicePreviewOverlay')?.remove();
    toast(`✅ تم ترحيل القيد — ${ACC_TX_TYPES[row.tx_type]?.label||row.tx_type}: ${money(row.amount)}`);
    accRender();
  } catch(e) {
    if(resultDiv) resultDiv.innerHTML = `<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`;
    if(btn) { btn.disabled = false; btn.textContent = '✅ اعتماد وترحيل القيد'; }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 🇪🇬 ETA E-INVOICING MODULE — منظومة الفاتورة الإلكترونية المصرية
// ══════════════════════════════════════════════════════════════════════════════

const ETA_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const ETA_DOC_TYPES = {I:'فاتورة بيع/شراء',C:'إشعار دائن',D:'إشعار مدين'};
const ETA_STATUS_COLORS = {Valid:'#15803d',Submitted:'#1a2472',Invalid:'#dc2626',Rejected:'#dc2626',Cancelled:'#94a3b8'};
const ETA_STATUS_LABELS = {Valid:'صالحة',Submitted:'مُقدَّمة',Invalid:'غير صالحة',Rejected:'مرفوضة',Cancelled:'ملغاة'};

let _etaSubTab = 'dashboard';  // dashboard / documents / vat-return / settings

// ── Main ETA tab ───────────────────────────────────────────────────────────
async function accETA() {
  const cred = await api('GET', `/api/eta/${_accClientId}/credential`).catch(()=>({configured:false}));

  if(!cred.configured) {
    return _etaSetupScreen();
  }

  const badgeColor = cred.last_sync_status==='success'?'#15803d':cred.last_sync_status==='failed'?'#dc2626':'#94a3b8';
  const year = _accYear;

  return `
  <!-- ETA Header Banner -->
  <div style="background:linear-gradient(135deg,#006233,#c8102e);border-radius:14px;padding:16px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:32px">🇪🇬</div>
      <div>
        <div style="color:white;font-size:15px;font-weight:800">منظومة الفاتورة الإلكترونية المصرية</div>
        <div style="color:rgba(255,255,255,.8);font-size:12px">Egyptian Tax Authority — ETA E-Invoicing</div>
        ${cred.company_tin?`<div style="color:#fbbf24;font-size:11px;margin-top:2px">الرقم الضريبي: ${escH(cred.company_tin)}</div>`:''}
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="font-size:11px;padding:4px 10px;border-radius:20px;background:${badgeColor+'33'};color:white;border:1px solid ${badgeColor};font-weight:700">
        ${cred.last_sync_status==='success'?'✅ متزامن':cred.last_sync_status==='failed'?'❌ فشل المزامنة':'⏳ لم تتم المزامنة بعد'}
      </span>
      <span style="font-size:11px;color:rgba(255,255,255,.7)">${cred.total_docs_synced||0} فاتورة مزامَنة</span>
      <button onclick="etaSync()" style="background:white;border:none;border-radius:8px;padding:7px 14px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;color:#006233">🔄 مزامنة الآن</button>
      <button onclick="etaOpenSettings()" style="background:rgba(255,255,255,.2);border:none;border-radius:8px;padding:7px 12px;cursor:pointer;color:white;font-size:12px">⚙️</button>
    </div>
  </div>

  <!-- Sub-Tabs -->
  <div style="display:flex;gap:2px;background:#f8fafc;border-radius:10px;padding:4px;margin-bottom:16px;overflow-x:auto">
    ${[
      ['dashboard','📊','لوحة التحكم'],
      ['vat-return','📋','إقرار ض ق م'],
      ['documents','📄','الفواتير'],
      ['settings','⚙️','الإعدادات'],
    ].map(([id,icon,label])=>`
      <button id="etaSub_${id}" onclick="switchEtaTab('${id}')"
        style="padding:8px 16px;border:none;border-radius:8px;font-family:inherit;font-size:13px;cursor:pointer;white-space:nowrap;font-weight:600;transition:all .15s;${_etaSubTab===id?'background:#1a2472;color:white':'background:transparent;color:#64748b'}">
        ${icon} ${label}
      </button>`).join('')}
  </div>

  <!-- Sub-content -->
  <div id="etaSubContent">
    <div class="loading"><div class="spinner"></div></div>
  </div>
  <script>
    (async ()=>{
      await _loadEtaSubTab();
    })();
  </scr` + `ipt>`;
}

async function switchEtaTab(tab) {
  _etaSubTab = tab;
  document.querySelectorAll('[id^="etaSub_"]').forEach(b=>{
    const tid = b.id.replace('etaSub_','');
    if(tid===tab){ b.style.background='#1a2472'; b.style.color='white'; }
    else { b.style.background='transparent'; b.style.color='#64748b'; }
  });
  await _loadEtaSubTab();
}

async function _loadEtaSubTab() {
  const el = document.getElementById('etaSubContent');
  if(!el) return;
  el.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  try {
    switch(_etaSubTab) {
      case 'dashboard':  el.innerHTML = await _etaDashboard(); break;
      case 'vat-return': el.innerHTML = await _etaVatReturn(); break;
      case 'documents':  el.innerHTML = await _etaDocuments(); break;
      case 'settings':   el.innerHTML = _etaSettingsHtml(); break;
    }
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px;background:white;border-radius:10px">❌ ${escH(e.message)}</div>`;
  }
}

// ── Setup Screen (no credentials yet) ─────────────────────────────────────
function _etaSetupScreen() {
  return `
  <div style="max-width:560px;margin:0 auto">
    <div style="text-align:center;padding:30px 20px 20px">
      <div style="font-size:60px;margin-bottom:12px">🇪🇬</div>
      <h2 style="font-size:20px;font-weight:800;color:#1e293b;margin:0 0 8px">ربط منظومة الفاتورة الإلكترونية</h2>
      <p style="color:#64748b;font-size:13px;margin:0 0 24px">أدخل بيانات API الخاصة بالشركة من بوابة ETA لبدء المزامنة التلقائية</p>
    </div>

    <div style="background:white;border-radius:14px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,.07)">
      <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-bottom:20px;font-size:12px;color:#92400e">
        <strong>📍 كيف تحصل على Client ID و Client Secret؟</strong><br>
        ادخل بوابة ETA ← الإعدادات ← تكامل الأنظمة (System Integration) ← إنشاء بيانات API
      </div>

      <div style="margin-bottom:14px">
        <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">Client ID *</label>
        <input id="etaClientId" class="input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style="font-family:monospace;font-size:13px"/>
      </div>
      <div style="margin-bottom:20px">
        <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">Client Secret *</label>
        <input id="etaClientSecret" type="password" class="input" placeholder="••••••••••••••••••••" style="font-family:monospace"/>
      </div>

      <div id="etaSetupResult" style="margin-bottom:12px"></div>
      <button onclick="etaSaveCredential()" class="btn btn-primary" style="width:100%;font-size:14px;padding:12px">
        🔗 ربط الشركة بالمنظومة الإلكترونية
      </button>
    </div>
  </div>`;
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function _etaDashboard() {
  const d = await api('GET', `/api/eta/${_accClientId}/dashboard?year=${_accYear}`);
  const months = d.months || [];

  const maxSales = Math.max(...months.map(m=>m.sales_vat||0), 1);
  const maxPurch = Math.max(...months.map(m=>m.purch_vat||0), 1);

  return `
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:20px">
    ${[
      {label:'إجمالي المبيعات (صافي)',      val:money(d.total_sales_net),  icon:'📈', color:'#15803d', bg:'#f0fdf4'},
      {label:'ض ق م مبيعات (ضريبة ناتجة)',  val:money(d.total_sales_vat),  icon:'➕', color:'#15803d', bg:'#dcfce7'},
      {label:'إجمالي المشتريات (صافي)',      val:money(d.total_purch_net),  icon:'📦', color:'#1a2472', bg:'#eef1fb'},
      {label:'ض ق م مشتريات (ضريبة مدخلات)',val:money(d.total_purch_vat),  icon:'➖', color:'#1a2472', bg:'#dbeafe'},
      {label:'إجمالي الإشعارات الدائنة',    val:money(d.total_credit_vat), icon:'📝', color:'#d97706', bg:'#fef9c3'},
      {label:'صافي الضريبة المستحقة',        val:money(d.net_vat_annual),   icon:'🏛️', color:d.net_vat_annual>=0?'#dc2626':'#15803d', bg:d.net_vat_annual>=0?'#fef2f2':'#f0fdf4'},
    ].map(k=>`
      <div style="background:${k.bg};border-radius:12px;padding:16px;border-right:3px solid ${k.color}">
        <div style="font-size:24px;margin-bottom:6px">${k.icon}</div>
        <div style="font-size:19px;font-weight:900;color:${k.color}">${k.val}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px">${k.label}</div>
      </div>`).join('')}
  </div>

  <!-- Monthly ض ق م Chart -->
  <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:16px">
    <div style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:16px">📊 مقارنة ض ق م الشهرية — ${_accYear}</div>
    <div style="display:flex;gap:4px;align-items:flex-end;height:130px">
      ${months.map((m,i)=>{
        const maxV = Math.max(...months.map(x=>Math.max(x.sales_vat||0, x.purch_vat||0)), 1);
        const sH = Math.round(((m.sales_vat||0)/maxV)*120);
        const pH = Math.round(((m.purch_vat||0)/maxV)*120);
        const netVat = (m.net_vat||0);
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px" title="${ETA_MONTHS[m.month]}: ناتج ${money(m.sales_vat||0)} | مدخلات ${money(m.purch_vat||0)} | صافي ${money(netVat)}">
          <div style="width:100%;display:flex;align-items:flex-end;justify-content:center;gap:1px;height:120px">
            <div style="flex:1;background:#22c55e;border-radius:2px 2px 0 0;height:${sH}px;min-height:${(m.sales_vat||0)>0?2:0}px;transition:height .3s"></div>
            <div style="flex:1;background:#1a2472;border-radius:2px 2px 0 0;height:${pH}px;min-height:${(m.purch_vat||0)>0?2:0}px;transition:height .3s"></div>
          </div>
          <div style="font-size:8px;color:#94a3b8;text-align:center">${ETA_MONTHS[m.month]?.slice(0,3)}</div>
          <div style="font-size:8px;font-weight:700;color:${netVat>=0?'#dc2626':'#15803d'}">${netVat>0?'+':''}${netVat!==0?money(Math.abs(netVat)):''}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:16px;justify-content:center;margin-top:8px;font-size:11px;color:#64748b">
      <span><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;margin-left:4px"></span>ض ق م مبيعات</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#1a2472;border-radius:2px;margin-left:4px"></span>ض ق م مشتريات</span>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <!-- Top Customers -->
    <div style="background:white;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:12px">📈 أكبر العملاء (مبيعات)</div>
      ${(d.top_customers||[]).slice(0,5).map((c,i)=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9">
          <div style="font-size:12px;color:#374151;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(c.name)}</div>
          <div style="font-size:12px;font-weight:700;color:#15803d">${money(c.net||0)}</div>
        </div>`).join('') || '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:12px">لا توجد بيانات</div>'}
    </div>
    <!-- Top Suppliers -->
    <div style="background:white;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:12px">📦 أكبر الموردين (مشتريات)</div>
      ${(d.top_suppliers||[]).slice(0,5).map((s,i)=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9">
          <div style="font-size:12px;color:#374151;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(s.name)}</div>
          <div style="font-size:12px;font-weight:700;color:#1a2472">${money(s.net||0)}</div>
        </div>`).join('') || '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:12px">لا توجد بيانات</div>'}
    </div>
  </div>`;
}

// ── VAT Return ─────────────────────────────────────────────────────────────
async function _etaVatReturn() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const year  = today.getFullYear();
  return _etaVatReturnForPeriod(month, year);
}

async function _etaVatReturnForPeriod(month, year) {
  const d = await api('GET', `/api/eta/${_accClientId}/vat-return?month=${month}&year=${year}`);
  const netPositive = d.net_vat >= 0;

  const section = (title, rows, highlight=null) => `
    <div style="margin-bottom:16px">
      <div style="background:#f8fafc;border-radius:8px 8px 0 0;padding:10px 16px;font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.5px;border:1px solid #e8edf3;border-bottom:none">${title}</div>
      <div style="background:white;border-radius:0 0 8px 8px;overflow:hidden;border:1px solid #e8edf3">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${rows.map(([label,val,bold=false,indent=false,color='#1e293b'])=>`<tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:9px 16px${indent?';padding-right:28px':''};color:#374151;font-weight:${bold?'700':'400'}">${label}</td>
            <td style="padding:9px 16px;text-align:left;font-weight:${bold?'800':'600'};color:${color}">${val}</td>
          </tr>`).join('')}
        </table>
      </div>
    </div>`;

  const sales = d.sales || {};
  const purch = d.purchases || {};

  return `
  <!-- Period selector -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">📋 إقرار ض ق م — ${d.period_label||''}</h3>
    <div style="display:flex;gap:8px;align-items:center">
      <select id="vatMonth" onchange="etaLoadVatReturn()" style="font-family:inherit;font-size:13px;border:1.5px solid #e8edf3;border-radius:8px;padding:6px 10px">
        ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===month?'selected':''}>${ETA_MONTHS[i+1]}</option>`).join('')}
      </select>
      <select id="vatYear" onchange="etaLoadVatReturn()" style="font-family:inherit;font-size:13px;border:1.5px solid #e8edf3;border-radius:8px;padding:6px 10px">
        ${[2023,2024,2025,2026].map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}
      </select>
      <button onclick="etaSyncPeriod(+document.getElementById('vatMonth').value,+document.getElementById('vatYear').value)" class="btn btn-primary" style="font-size:12px">🔄 تحديث من ETA</button>
    </div>
  </div>

  ${d.is_zero ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:20px;text-align:center;margin-bottom:16px">
    <div style="font-size:40px;margin-bottom:8px">✅</div>
    <div style="font-size:16px;font-weight:800;color:#15803d">إقرار صفري</div>
    <div style="font-size:13px;color:#64748b;margin-top:4px">لا توجد فواتير خلال ${d.period_label}</div>
  </div>` : ''}

  <!-- Stats row -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px">
    ${[
      {l:'فواتير صادرة',  v:d.outgoing_invoices, c:'#15803d', bg:'#f0fdf4'},
      {l:'فواتير واردة',  v:d.incoming_invoices, c:'#1a2472', bg:'#eef1fb'},
      {l:'إشعارات دائنة', v:d.credit_notes,      c:'#d97706', bg:'#fef9c3'},
      {l:'إشعارات مدينة', v:d.debit_notes,       c:'#7c3aed', bg:'#ede9fe'},
      {l:'ملغية',         v:d.cancelled_docs,    c:'#94a3b8', bg:'#f8fafc'},
      {l:'إجمالي',        v:d.total_docs,        c:'#374151', bg:'white'},
    ].map(k=>`<div style="background:${k.bg};border-radius:8px;padding:10px 12px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:${k.c}">${k.v||0}</div>
      <div style="font-size:10px;color:#64748b">${k.l}</div>
    </div>`).join('')}
  </div>

  <div style="max-width:640px">
    ${section('القسم الأول — المبيعات (الضريبة الناتجة)',[
      ['فواتير البيع — صافي القيمة',             money(sales.invoices_net||0)],
      ['فواتير البيع — ض ق م',                  money(sales.invoices_vat||0),   false, true, '#15803d'],
      ['إشعارات دائنة صادرة — صافي',             `(${money(sales.credit_notes_net||0)})`, false, true, '#d97706'],
      ['إشعارات دائنة صادرة — ض ق م',            `(${money(sales.credit_notes_vat||0)})`, false, true, '#d97706'],
      ['صافي المبيعات الخاضعة',                   money(sales.net_sales||0),    true],
      ['إجمالي الضريبة الناتجة (Output Tax)',      money(sales.output_vat||0),   true, false, '#15803d'],
    ])}

    ${section('القسم الثاني — المشتريات (ضريبة المدخلات)',[
      ['فواتير الشراء — صافي القيمة',             money(purch.invoices_net||0)],
      ['فواتير الشراء — ض ق م',                  money(purch.invoices_vat||0),   false, true, '#1a2472'],
      ['إشعارات دائنة واردة — صافي',              `(${money(purch.credit_notes_net||0)})`, false, true, '#d97706'],
      ['إشعارات دائنة واردة — ض ق م',             `(${money(purch.credit_notes_vat||0)})`, false, true, '#d97706'],
      ['صافي المشتريات الخاضعة',                  money(purch.net_purchases||0), true],
      ['إجمالي ضريبة المدخلات (Input Tax)',        money(purch.input_vat||0),    true, false, '#1a2472'],
    ])}

    <!-- Net VAT -->
    <div style="background:${netPositive?'#fef2f2':'#f0fdf4'};border:2px solid ${netPositive?'#fca5a5':'#86efac'};border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:13px;color:#64748b;margin-bottom:8px">صافي الضريبة المستحقة (Output Tax − Input Tax)</div>
      <div style="font-size:32px;font-weight:900;color:${netPositive?'#dc2626':'#15803d'}">${money(Math.abs(d.net_vat||0))}</div>
      <div style="font-size:13px;font-weight:700;color:${netPositive?'#dc2626':'#15803d'};margin-top:6px">${d.net_vat_status||''}</div>
      <div style="font-size:12px;color:#64748b;margin-top:8px;padding:10px;background:white;border-radius:8px">${escH(d.recommendation||'')}</div>
    </div>
  </div>`;
}

window.etaLoadVatReturn = function() {
  const m = +document.getElementById('vatMonth')?.value || new Date().getMonth()+1;
  const y = +document.getElementById('vatYear')?.value  || new Date().getFullYear();
  const el = document.getElementById('etaSubContent');
  if(!el) return;
  el.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  _etaVatReturnForPeriod(m, y).then(html=>{ el.innerHTML=html; }).catch(e=>{ el.innerHTML=`<div style="color:#dc2626">${e.message}</div>`; });
};

window.etaSyncPeriod = async function(month, year) {
  try {
    toast('⏳ جارٍ المزامنة...');
    const r = await api('POST', `/api/eta/${_accClientId}/sync`, {month, year});
    toast(r.message || '✅ تمت المزامنة');
    window.etaLoadVatReturn();
  } catch(e) { toast(e.message, 'error'); }
};

// ── Documents list ─────────────────────────────────────────────────────────
async function _etaDocuments() {
  const month = new Date().getMonth()+1;
  const year  = new Date().getFullYear();
  return _etaDocsForPeriod(month, year, '', '');
}

async function _etaDocsForPeriod(month, year, direction, docType) {
  let url = `/api/eta/${_accClientId}/documents?page_size=100`;
  if(month) url += `&month=${month}`;
  if(year)  url += `&year=${year}`;
  if(direction) url += `&direction=${direction}`;
  if(docType)   url += `&doc_type=${docType}`;
  const data = await api('GET', url);
  const items = data.items || [];

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:14px;font-weight:800;color:#1e293b;margin:0">📄 الفواتير الإلكترونية (${data.total||0})</h3>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <select id="etaDocMonth" onchange="etaReloadDocs()" style="font-family:inherit;font-size:12px;border:1px solid #e8edf3;border-radius:6px;padding:5px 8px">
        ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===month?'selected':''}>${ETA_MONTHS[i+1]}</option>`).join('')}
      </select>
      <select id="etaDocYear" onchange="etaReloadDocs()" style="font-family:inherit;font-size:12px;border:1px solid #e8edf3;border-radius:6px;padding:5px 8px">
        ${[2023,2024,2025,2026].map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}
      </select>
      <select id="etaDocDir" onchange="etaReloadDocs()" style="font-family:inherit;font-size:12px;border:1px solid #e8edf3;border-radius:6px;padding:5px 8px">
        <option value="">الكل</option><option value="outgoing">صادر</option><option value="incoming">وارد</option>
      </select>
      <select id="etaDocType" onchange="etaReloadDocs()" style="font-family:inherit;font-size:12px;border:1px solid #e8edf3;border-radius:6px;padding:5px 8px">
        <option value="">كل الأنواع</option><option value="I">فواتير</option><option value="C">إشعار دائن</option><option value="D">إشعار مدين</option>
      </select>
    </div>
  </div>

  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#f8fafc">
        ${['الاتجاه','النوع','الطرف','رقم الفاتورة','التاريخ','صافي القيمة','ض ق م','الإجمالي','الحالة',''].map(h=>`<th style="padding:9px 10px;text-align:right;border-bottom:2px solid #e8edf3;font-size:11px;font-weight:700;color:#64748b;white-space:nowrap">${h}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${items.length===0?`<tr><td colspan="10" style="text-align:center;padding:40px;color:#94a3b8">
          <div style="font-size:36px;margin-bottom:10px">🇪🇬</div>
          لا توجد فواتير — قم بالمزامنة أولاً
        </td></tr>`:
          items.map(d=>{
            const statusColor = ETA_STATUS_COLORS[d.status] || '#94a3b8';
            const dirColor    = d.direction==='outgoing'?'#15803d':'#1a2472';
            const party       = d.direction==='outgoing' ? (d.receiver_name||d.receiver_tin||'—') : (d.issuer_name||d.issuer_tin||'—');
            return `<tr style="border-bottom:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
              <td style="padding:7px 10px"><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;background:${dirColor+'22'};color:${dirColor}">${d.direction==='outgoing'?'صادر':'وارد'}</span></td>
              <td style="padding:7px 10px;font-size:11px;color:#64748b">${ETA_DOC_TYPES[d.doc_type]||d.doc_type||'—'}</td>
              <td style="padding:7px 10px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">${escH(party)}</td>
              <td style="padding:7px 10px;font-size:11px;color:#1a2472;font-weight:600">${escH(d.internal_id||d.eta_uuid?.slice(0,12)||'—')}</td>
              <td style="padding:7px 10px;white-space:nowrap;color:#64748b">${d.doc_date||'—'}</td>
              <td style="padding:7px 10px;font-weight:700">${money(d.net_amount||0)}</td>
              <td style="padding:7px 10px;color:#7c3aed;font-weight:600">${money(d.vat_amount||0)}</td>
              <td style="padding:7px 10px;font-weight:800">${money(d.total_amount||0)}</td>
              <td style="padding:7px 10px"><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;background:${statusColor+'22'};color:${statusColor}">${ETA_STATUS_LABELS[d.status]||d.status||'—'}</span></td>
              <td style="padding:7px 10px">
                ${!d.journal_entry_id?`<button onclick="etaCreateJE('${d.eta_uuid}')" style="background:#eef1fb;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:10px;color:#1a2472;font-family:inherit" title="إنشاء قيد محاسبي">+ قيد</button>`:'<span style="font-size:10px;color:#15803d">✅ قيد</span>'}
              </td>
            </tr>`;
          }).join('')}
      </tbody>
      ${items.length>0?`<tfoot><tr style="background:#f8fafc;font-weight:700">
        <td colspan="5" style="padding:9px 10px;font-size:12px;color:#64748b">الإجمالي (${items.length})</td>
        <td style="padding:9px 10px">${money(items.reduce((s,d)=>s+(d.net_amount||0),0))}</td>
        <td style="padding:9px 10px;color:#7c3aed">${money(items.reduce((s,d)=>s+(d.vat_amount||0),0))}</td>
        <td style="padding:9px 10px">${money(items.reduce((s,d)=>s+(d.total_amount||0),0))}</td>
        <td colspan="2"></td>
      </tr></tfoot>`:'' }
    </table>
    </div>
  </div>`;
}

window.etaReloadDocs = function() {
  const m = +document.getElementById('etaDocMonth')?.value || 1;
  const y = +document.getElementById('etaDocYear')?.value  || 2025;
  const dir  = document.getElementById('etaDocDir')?.value  || '';
  const type = document.getElementById('etaDocType')?.value || '';
  const el = document.getElementById('etaSubContent');
  if(!el) return;
  el.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  _etaDocsForPeriod(m, y, dir, type).then(html=>el.innerHTML=html).catch(e=>{el.innerHTML=`<div style="color:#dc2626">${e.message}</div>`;});
};

window.etaCreateJE = async function(etaUuid) {
  try {
    const r = await api('POST', `/api/eta/${_accClientId}/documents/${etaUuid}/create-journal-entry`);
    toast(r.message || '✅ تم إنشاء القيد');
    window.etaReloadDocs();
  } catch(e) { toast(e.message,'error'); }
};

// ── Settings tab ───────────────────────────────────────────────────────────
function _etaSettingsHtml() {
  return `
  <div style="max-width:560px">
    <div style="background:white;border-radius:14px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0 0 20px">⚙️ إعدادات ربط ETA</h3>
      <div style="margin-bottom:14px">
        <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">Client ID *</label>
        <input id="etaClientIdEdit" class="input" placeholder="Client ID من بوابة ETA" style="font-family:monospace;font-size:13px"/>
      </div>
      <div style="margin-bottom:20px">
        <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">Client Secret * <span style="font-size:11px;color:#94a3b8">(اترك فارغاً للإبقاء على القيمة الحالية)</span></label>
        <input id="etaClientSecretEdit" type="password" class="input" placeholder="اترك فارغاً للإبقاء على السر الحالي" style="font-family:monospace"/>
      </div>
      <div id="etaSettingsResult" style="margin-bottom:12px"></div>
      <div style="display:flex;gap:10px">
        <button onclick="etaSaveCredential(true)" class="btn btn-primary" style="flex:1">💾 حفظ التعديلات</button>
        <button onclick="etaTestConnection()" style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:0 16px;cursor:pointer;color:#15803d;font-weight:700;font-family:inherit">🔗 اختبار الاتصال</button>
      </div>
    </div>

    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;padding:16px;margin-top:14px">
      <div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:8px">⚠️ حذف ربط ETA</div>
      <div style="font-size:12px;color:#374151;margin-bottom:12px">سيتم حذف بيانات الاتصال فقط. الفواتير المزامَنة ستبقى محفوظة.</div>
      <button onclick="etaDeleteCredential()" style="background:#fef2f2;border:1.5px solid #dc2626;border-radius:8px;padding:7px 16px;cursor:pointer;color:#dc2626;font-weight:700;font-family:inherit;font-size:13px">🗑 حذف ربط ETA</button>
    </div>
  </div>`;
}

// ── ETA Actions ────────────────────────────────────────────────────────────
async function etaSaveCredential(isEdit=false) {
  const idEl  = document.getElementById(isEdit?'etaClientIdEdit':'etaClientId');
  const secEl = document.getElementById(isEdit?'etaClientSecretEdit':'etaClientSecret');
  const resEl = document.getElementById(isEdit?'etaSettingsResult':'etaSetupResult');
  if(!resEl) return;

  const cid = idEl?.value?.trim();
  const sec = secEl?.value?.trim();
  if(!cid) { resEl.innerHTML=`<div style="color:#dc2626;font-size:13px">⚠️ أدخل Client ID</div>`; return; }
  if(!sec && !isEdit) { resEl.innerHTML=`<div style="color:#dc2626;font-size:13px">⚠️ أدخل Client Secret</div>`; return; }

  resEl.innerHTML=`<div style="color:#64748b;font-size:13px">⏳ جارٍ اختبار الاتصال...</div>`;
  try {
    const payload = {eta_client_id: cid, eta_client_secret: sec||'KEEP'};
    if(!sec && isEdit) {
      // Get current secret — not possible client-side; require the user to enter it
      resEl.innerHTML=`<div style="color:#d97706;font-size:13px">⚠️ يجب إدخال Client Secret للتحديث</div>`;
      return;
    }
    const r = await api('POST', `/api/eta/${_accClientId}/credential`, payload);
    resEl.innerHTML=`<div style="color:#15803d;font-size:13px">✅ ${escH(r.message)}</div>`;
    setTimeout(()=>accRender(), 1500);
  } catch(e) {
    resEl.innerHTML=`<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`;
  }
}

async function etaTestConnection() {
  const resEl = document.getElementById('etaSettingsResult');
  if(resEl) resEl.innerHTML=`<div style="color:#64748b;font-size:13px">⏳ جارٍ الاختبار...</div>`;
  try {
    const r = await api('POST', `/api/eta/${_accClientId}/test`);
    if(r.success) {
      if(resEl) resEl.innerHTML=`<div style="color:#15803d;font-size:13px">✅ الاتصال يعمل بنجاح</div>`;
      toast('✅ الاتصال بـ ETA يعمل بنجاح');
    } else {
      if(resEl) resEl.innerHTML=`<div style="color:#dc2626;font-size:13px">❌ ${escH(r.error||'فشل')}</div>`;
    }
  } catch(e) {
    if(resEl) resEl.innerHTML=`<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`;
  }
}

async function etaDeleteCredential() {
  if(!await confirmDlg('حذف ربط ETA لهذه الشركة؟ الفواتير المحفوظة ستبقى.')) return;
  try {
    await api('DELETE', `/api/eta/${_accClientId}/credential`);
    toast('✅ تم حذف ربط ETA');
    accRender();
  } catch(e) { toast(e.message,'error'); }
}

async function etaSync() {
  const today = new Date();
  try {
    toast('⏳ جارٍ المزامنة مع ETA...');
    const r = await api('POST', `/api/eta/${_accClientId}/sync/latest`);
    const results = r.results || [];
    const newDocs = results.reduce((s,x)=>s+(x.new||0), 0);
    const updated = results.reduce((s,x)=>s+(x.updated||0), 0);
    toast(`✅ تمت المزامنة — ${newDocs} جديدة + ${updated} محدَّثة`);
    accRender();
  } catch(e) { toast(e.message,'error'); }
}

function etaOpenSettings() {
  _etaSubTab = 'settings';
  switchEtaTab('settings');
}

// ── General Ledger (دفتر الأستاذ) ─────────────────────────────────────────────
let _accLedgerAccountId = null;

async function accGeneralLedger() {
  const content = document.getElementById('accContent');
  const accounts = await api('GET', `/api/accounting/${_accClientId}/accounts`);
  if(!accounts.length) {
    content.innerHTML = `<div style="padding:40px;text-align:center;color:#94a3b8">لا يوجد دليل حسابات بعد — ثبّت الحسابات الافتراضية أولاً</div>`;
    return;
  }
  if(!_accLedgerAccountId) _accLedgerAccountId = accounts[0]?.id;

  const renderLedger = async () => {
    const selEl = document.getElementById('ledgerAccSel');
    if(selEl) _accLedgerAccountId = +selEl.value;
    const data = await api('GET', `/api/accounting/${_accClientId}/ledger/${_accLedgerAccountId}?year=${_accYear}`);
    const acc = data.account || {};
    const rows = data.lines || [];
    document.getElementById('ledgerTable').innerHTML = `
      <div style="background:#eef1fb;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;gap:24px;flex-wrap:wrap">
        <div><div style="font-size:11px;color:#64748b">الحساب</div><div style="font-size:14px;font-weight:800;color:#1a2472">${escH(acc.code||'')} — ${escH(acc.name||'')}</div></div>
        <div><div style="font-size:11px;color:#64748b">رصيد افتتاحي</div><div style="font-size:14px;font-weight:700;color:#374151">${money(data.opening_balance||0)}</div></div>
        <div><div style="font-size:11px;color:#64748b">إجمالي مدين</div><div style="font-size:14px;font-weight:700;color:#1a2472">${money(data.total_debit||0)}</div></div>
        <div><div style="font-size:11px;color:#64748b">إجمالي دائن</div><div style="font-size:14px;font-weight:700;color:#dc2626">${money(data.total_credit||0)}</div></div>
        <div><div style="font-size:11px;color:#64748b">الرصيد النهائي</div><div style="font-size:16px;font-weight:800;color:${(data.closing_balance||0)>=0?'#15803d':'#dc2626'}">${money(Math.abs(data.closing_balance||0))} ${(data.closing_balance||0)>=0?'مدين':'دائن'}</div></div>
      </div>
      <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f8fafc">
            ${['التاريخ','رقم القيد','الوصف','مدين','دائن','الرصيد'].map(h=>`<th style="padding:9px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b;white-space:nowrap">${h}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${rows.length===0?`<tr><td colspan="6" style="text-align:center;padding:30px;color:#94a3b8">لا توجد حركات لهذا الحساب في ${_accYear}</td></tr>`:
              rows.map(r=>`<tr style="border-bottom:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
                <td style="padding:8px 12px;white-space:nowrap;color:#64748b">${r.date||'—'}</td>
                <td style="padding:8px 12px;font-weight:600;color:#1a2472;font-size:12px">${escH(r.entry_number||'')}</td>
                <td style="padding:8px 12px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(r.description||r.partner_name||'')}</td>
                <td style="padding:8px 12px;font-weight:700;color:#1a2472">${r.debit>0?money(r.debit):'—'}</td>
                <td style="padding:8px 12px;font-weight:700;color:#dc2626">${r.credit>0?money(r.credit):'—'}</td>
                <td style="padding:8px 12px;font-weight:800;color:${r.running_balance>=0?'#15803d':'#dc2626'}">${money(Math.abs(r.running_balance))} <span style="font-size:10px">${r.running_balance>=0?'م':'د'}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
  };

  content.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">📖 دفتر الأستاذ — ${_accYear}</h3>
    <div style="display:flex;gap:8px;align-items:center">
      <select id="ledgerAccSel" onchange="window._accLedgerReload()" style="font-family:inherit;font-size:13px;border:1.5px solid #e8edf3;border-radius:8px;padding:6px 12px;background:white;color:#1e293b;min-width:260px">
        ${accounts.map(a=>`<option value="${a.id}" ${a.id===_accLedgerAccountId?'selected':''}>${escH(a.code)} — ${escH(a.name)}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="ledgerTable"><div class="loading"><div class="spinner"></div></div></div>`;

  window._accLedgerReload = renderLedger;
  await renderLedger();
}

// ── Treasury & Bank Accounts ───────────────────────────────────────────────────
async function accTreasury() {
  const treasuries = await api('GET', `/api/accounting/${_accClientId}/treasuries`);
  const list = Array.isArray(treasuries) ? treasuries : (treasuries.items || []);

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">🏦 الخزينة والحسابات البنكية</h3>
    <button onclick="showAddTreasury()" class="btn btn-primary" style="font-size:13px">+ إضافة خزينة / بنك</button>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-bottom:24px">
    ${list.length===0?`<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;background:white;border-radius:12px">لا توجد خزائن بعد — اضغط "+ إضافة"</div>`
    : list.map(t=>`
      <div style="background:white;border-radius:14px;padding:18px;box-shadow:0 2px 8px rgba(0,0,0,.07);border-top:4px solid ${t.treasury_type==='bank'?'#1a2472':'#15803d'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-size:24px;margin-bottom:4px">${t.treasury_type==='bank'?'🏦':'💵'}</div>
            <div style="font-size:14px;font-weight:800;color:#1e293b">${escH(t.name)}</div>
            ${t.bank_name?`<div style="font-size:12px;color:#64748b">${escH(t.bank_name)}${t.account_number?' — '+escH(t.account_number):''}</div>`:''}
          </div>
          <span style="font-size:11px;padding:3px 10px;border-radius:20px;background:${t.treasury_type==='bank'?'#eef1fb':'#f0fdf4'};color:${t.treasury_type==='bank'?'#1a2472':'#15803d'};font-weight:700">${t.treasury_type==='bank'?'بنك':'نقدية'}</span>
        </div>
        <div style="font-size:22px;font-weight:900;color:#1e293b;margin-bottom:12px">${money(t.current_balance||t.opening_balance||0)}</div>
        <div style="display:flex;gap:8px">
          <button onclick="showTreasuryTxs(${t.id},'${escH(t.name)}')" style="flex:1;background:#eef1fb;border:none;border-radius:8px;padding:7px;cursor:pointer;font-family:inherit;font-size:12px;color:#1a2472;font-weight:600">📋 الحركات</button>
          <button onclick="showAddTreasuryTx(${t.id})" style="flex:1;background:#f0fdf4;border:none;border-radius:8px;padding:7px;cursor:pointer;font-family:inherit;font-size:12px;color:#15803d;font-weight:600">+ حركة</button>
        </div>
      </div>`).join('')}
  </div>`;
}

function showAddTreasury() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.zIndex = '1200';
  ov.innerHTML = `<div class="modal" style="max-width:480px">
    <div style="padding:14px 20px;background:#1a2472;border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white;font-weight:700;font-size:14px">🏦 إضافة خزينة / بنك</div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white">✕</button>
    </div>
    <div style="padding:20px">
      <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">الاسم *</label>
        <input id="trName" class="input" placeholder="الخزينة الرئيسية / البنك الأهلي"/></div>
      <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">النوع</label>
        <select id="trType" class="input" onchange="document.getElementById('trBankFields').style.display=this.value==='bank'?'block':'none'">
          <option value="cash">نقدية</option><option value="bank">حساب بنكي</option>
        </select></div>
      <div id="trBankFields" style="display:none">
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">اسم البنك</label>
          <input id="trBankName" class="input" placeholder="البنك الأهلي المصري"/></div>
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">رقم الحساب</label>
          <input id="trAccNum" class="input" placeholder="1234567890"/></div>
      </div>
      <div style="margin-bottom:16px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">الرصيد الافتتاحي</label>
        <input id="trOpenBal" type="number" class="input" value="0"/></div>
      <div id="trResult" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveTreasury()">💾 حفظ</button>
      </div>
    </div>
  </div>`;
  document.body.append(ov);
  ov.onclick = e => { if(e.target===ov) ov.remove(); };
}

async function saveTreasury() {
  const payload = {
    name: document.getElementById('trName')?.value?.trim(),
    treasury_type: document.getElementById('trType')?.value||'cash',
    bank_name: document.getElementById('trBankName')?.value?.trim()||null,
    account_number: document.getElementById('trAccNum')?.value?.trim()||null,
    opening_balance: parseFloat(document.getElementById('trOpenBal')?.value||0),
  };
  if(!payload.name) { document.getElementById('trResult').innerHTML=`<div style="color:#dc2626;font-size:13px">⚠️ أدخل الاسم</div>`; return; }
  try {
    await api('POST', `/api/accounting/${_accClientId}/treasuries`, payload);
    toast('✅ تمت الإضافة');
    document.querySelector('.modal-overlay:last-child')?.remove();
    accRender();
  } catch(e) { document.getElementById('trResult').innerHTML=`<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`; }
}

async function showTreasuryTxs(treasuryId, name) {
  const data = await api('GET', `/api/accounting/${_accClientId}/treasuries/${treasuryId}/transactions?page_size=100`);
  const txs = data.items || [];
  const TX_LABELS = {deposit:'إيداع',withdrawal:'سحب',transfer_in:'تحويل وارد',transfer_out:'تحويل صادر'};
  const TX_COLORS = {deposit:'#15803d',withdrawal:'#dc2626',transfer_in:'#1a2472',transfer_out:'#d97706'};
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.zIndex = '1200';
  ov.innerHTML = `<div class="modal" style="max-width:680px">
    <div style="padding:14px 20px;background:#1a2472;border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white;font-weight:700;font-size:14px">📋 حركات — ${escH(name)}</div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white">✕</button>
    </div>
    <div style="padding:20px;max-height:70vh;overflow-y:auto">
      <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f8fafc">
            ${['التاريخ','النوع','المبلغ','الوصف',''].map(h=>`<th style="padding:9px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b">${h}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${txs.length===0?`<tr><td colspan="5" style="text-align:center;padding:30px;color:#94a3b8">لا توجد حركات</td></tr>`:
              txs.map(t=>`<tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:8px 12px;white-space:nowrap">${t.date||'—'}</td>
                <td style="padding:8px 12px"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:${TX_COLORS[t.tx_type]+'22'};color:${TX_COLORS[t.tx_type]}">${TX_LABELS[t.tx_type]||t.tx_type}</span></td>
                <td style="padding:8px 12px;font-weight:700;color:${['deposit','transfer_in'].includes(t.tx_type)?'#15803d':'#dc2626'}">${['deposit','transfer_in'].includes(t.tx_type)?'+':'-'}${money(t.amount)}</td>
                <td style="padding:8px 12px;color:#64748b;font-size:12px">${escH(t.description||'')}</td>
                <td style="padding:8px 12px"><button onclick="deleteTreasuryTx(${t.id})" style="background:#fee2e2;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;color:#dc2626">🗑</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
  document.body.append(ov);
  ov.onclick = e => { if(e.target===ov) ov.remove(); };
}

function showAddTreasuryTx(treasuryId) {
  const today = new Date().toISOString().split('T')[0];
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.zIndex = '1300';
  ov.innerHTML = `<div class="modal" style="max-width:440px">
    <div style="padding:14px 20px;background:#1a2472;border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white;font-weight:700;font-size:14px">+ حركة خزينة</div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white">✕</button>
    </div>
    <div style="padding:20px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">التاريخ</label>
          <input id="ttDate" type="date" class="input" value="${today}"/></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">النوع</label>
          <select id="ttType" class="input">
            <option value="deposit">إيداع</option>
            <option value="withdrawal">سحب</option>
          </select></div>
      </div>
      <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">المبلغ *</label>
        <input id="ttAmount" type="number" class="input" placeholder="0"/></div>
      <div style="margin-bottom:16px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">الوصف</label>
        <input id="ttDesc" class="input" placeholder="وصف الحركة..."/></div>
      <div id="ttResult" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveTreasuryTx(${treasuryId})">💾 حفظ</button>
      </div>
    </div>
  </div>`;
  document.body.append(ov);
  ov.onclick = e => { if(e.target===ov) ov.remove(); };
}

async function saveTreasuryTx(treasuryId) {
  const amt = parseFloat(document.getElementById('ttAmount')?.value||0);
  if(!amt) { document.getElementById('ttResult').innerHTML=`<div style="color:#dc2626;font-size:13px">⚠️ أدخل المبلغ</div>`; return; }
  try {
    await api('POST', `/api/accounting/${_accClientId}/treasuries/transactions`, {
      treasury_id: treasuryId,
      date: document.getElementById('ttDate')?.value,
      tx_type: document.getElementById('ttType')?.value,
      amount: amt,
      description: document.getElementById('ttDesc')?.value?.trim()||null,
    });
    toast('✅ تمت الإضافة');
    document.querySelectorAll('.modal-overlay').forEach(o => o.remove());
    accRender();
  } catch(e) { document.getElementById('ttResult').innerHTML=`<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`; }
}

async function deleteTreasuryTx(txId) {
  if(!await confirmDlg('حذف هذه الحركة؟')) return;
  try {
    await api('DELETE', `/api/accounting/${_accClientId}/treasuries/transactions/${txId}`);
    toast('تم الحذف');
    document.querySelector('.modal-overlay')?.remove();
    accRender();
  } catch(e) { toast(e.message,'error'); }
}

// ── Checks Management ─────────────────────────────────────────────────────────
async function accChecks() {
  const [data, summary] = await Promise.all([
    api('GET', `/api/accounting/${_accClientId}/checks?page_size=200`),
    api('GET', `/api/accounting/${_accClientId}/checks/summary`).catch(()=>({})),
  ]);
  const items = data.items || [];
  const STATUS_LABEL = {pending:'قيد التحصيل',deposited:'مودَّع',cleared:'محصَّل',rejected:'مرتجع',cashed:'صُرِّف',cancelled:'ملغى'};
  const STATUS_COLOR = {pending:'#d97706',deposited:'#1a2472',cleared:'#15803d',rejected:'#dc2626',cashed:'#7c3aed',cancelled:'#94a3b8'};

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">🔖 إدارة الشيكات</h3>
    <button onclick="showAddCheck()" class="btn btn-primary" style="font-size:13px">+ إضافة شيك</button>
  </div>

  ${(summary.overdue_count||0)>0 || (summary.due_soon_count||0)>0 ? `
  <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
    ${(summary.overdue_count||0)>0?`<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;color:#dc2626">⚠️ ${summary.overdue_count} شيك متأخر — ${money(summary.overdue_amount||0)}</div>`:''}
    ${(summary.due_soon_count||0)>0?`<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;color:#92400e">⏰ ${summary.due_soon_count} شيك مستحق قريباً — ${money(summary.due_soon_amount||0)}</div>`:''}
  </div>` : ''}

  <!-- Totals -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:16px">
    ${[
      {label:'وارد قيد التحصيل',  val:money(summary.incoming_pending||0),  color:'#15803d', bg:'#f0fdf4'},
      {label:'صادر قيد السداد',   val:money(summary.outgoing_pending||0),  color:'#dc2626', bg:'#fef2f2'},
      {label:'محصَّل هذا الشهر',  val:money(summary.cleared_this_month||0),color:'#1a2472', bg:'#eef1fb'},
    ].map(k=>`<div style="background:${k.bg};border-radius:10px;padding:12px;border-right:3px solid ${k.color}">
      <div style="font-size:17px;font-weight:800;color:${k.color}">${k.val}</div>
      <div style="font-size:11px;color:#64748b;margin-top:3px">${k.label}</div>
    </div>`).join('')}
  </div>

  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc">
        ${['النوع','رقم الشيك','صاحب الشيك / المستلم','البنك','المبلغ','تاريخ الاستحقاق','الحالة',''].map(h=>`<th style="padding:9px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b;white-space:nowrap">${h}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${items.length===0?`<tr><td colspan="8" style="text-align:center;padding:40px;color:#94a3b8">لا توجد شيكات — اضغط "+ إضافة شيك"</td></tr>`:
          items.map(c=>`<tr style="border-bottom:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:8px 12px"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:${c.check_type==='incoming'?'#f0fdf4':'#fef2f2'};color:${c.check_type==='incoming'?'#15803d':'#dc2626'}">${c.check_type==='incoming'?'وارد':'صادر'}</span></td>
            <td style="padding:8px 12px;font-weight:700;color:#1a2472">${escH(c.check_number||'—')}</td>
            <td style="padding:8px 12px;font-weight:600">${escH(c.partner_name||'—')}</td>
            <td style="padding:8px 12px;font-size:12px;color:#64748b">${escH(c.bank_name||'—')}</td>
            <td style="padding:8px 12px;font-weight:800;color:#1e293b">${money(c.amount)}</td>
            <td style="padding:8px 12px;font-size:12px">${c.due_date||'—'}</td>
            <td style="padding:8px 12px">
              <select onchange="updateCheckStatus(${c.id},this.value)" style="font-family:inherit;font-size:11px;font-weight:700;border:none;border-radius:6px;padding:3px 8px;cursor:pointer;background:${STATUS_COLOR[c.status]+'22'};color:${STATUS_COLOR[c.status]}">
                ${Object.entries(STATUS_LABEL).map(([v,l])=>`<option value="${v}" ${v===c.status?'selected':''}>${l}</option>`).join('')}
              </select>
            </td>
            <td style="padding:8px 12px"><button onclick="deleteCheck(${c.id})" style="background:#fee2e2;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;color:#dc2626">🗑</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
    </div>
  </div>`;
}

function showAddCheck() {
  const today = new Date().toISOString().split('T')[0];
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.zIndex = '1200';
  ov.innerHTML = `<div class="modal" style="max-width:520px">
    <div style="padding:14px 20px;background:#1a2472;border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white;font-weight:700;font-size:14px">🔖 إضافة شيك</div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white">✕</button>
    </div>
    <div style="padding:20px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">النوع *</label>
          <select id="chkType" class="input"><option value="incoming">وارد (مقبوض)</option><option value="outgoing">صادر (مدفوع)</option></select></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">رقم الشيك</label>
          <input id="chkNum" class="input" placeholder="123456"/></div>
      </div>
      <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">الطرف الآخر (صاحب الشيك / المستلم) *</label>
        <input id="chkPartner" class="input" placeholder="اسم الشركة أو الشخص"/></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">البنك</label>
          <input id="chkBank" class="input" placeholder="البنك الأهلي"/></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">الفرع</label>
          <input id="chkBranch" class="input" placeholder="فرع..."/></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">المبلغ *</label>
          <input id="chkAmount" type="number" class="input" placeholder="0"/></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">تاريخ الاستحقاق *</label>
          <input id="chkDue" type="date" class="input" value="${today}"/></div>
      </div>
      <div id="chkResult" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveCheck()">💾 حفظ</button>
      </div>
    </div>
  </div>`;
  document.body.append(ov);
  ov.onclick = e => { if(e.target===ov) ov.remove(); };
}

async function saveCheck() {
  const amt = parseFloat(document.getElementById('chkAmount')?.value||0);
  const partner = document.getElementById('chkPartner')?.value?.trim();
  if(!amt||!partner) { document.getElementById('chkResult').innerHTML=`<div style="color:#dc2626;font-size:13px">⚠️ أدخل الطرف والمبلغ</div>`; return; }
  try {
    await api('POST', `/api/accounting/${_accClientId}/checks`, {
      check_type: document.getElementById('chkType')?.value,
      check_number: document.getElementById('chkNum')?.value?.trim()||null,
      partner_name: partner,
      bank_name: document.getElementById('chkBank')?.value?.trim()||null,
      branch: document.getElementById('chkBranch')?.value?.trim()||null,
      amount: amt,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: document.getElementById('chkDue')?.value||null,
    });
    toast('✅ تمت الإضافة');
    document.querySelector('.modal-overlay:last-child')?.remove();
    accRender();
  } catch(e) { document.getElementById('chkResult').innerHTML=`<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`; }
}

async function updateCheckStatus(checkId, status) {
  try {
    await api('PATCH', `/api/accounting/${_accClientId}/checks/${checkId}/status`, {status});
    toast('✅ تم تحديث الحالة');
    accRender();
  } catch(e) { toast(e.message,'error'); }
}

async function deleteCheck(checkId) {
  if(!await confirmDlg('حذف هذا الشيك؟')) return;
  try {
    await api('DELETE', `/api/accounting/${_accClientId}/checks/${checkId}`);
    toast('تم الحذف');
    accRender();
  } catch(e) { toast(e.message,'error'); }
}

// ── Advances & Custody ────────────────────────────────────────────────────────
async function accAdvances() {
  const data = await api('GET', `/api/accounting/${_accClientId}/advances?page_size=200`);
  const items = data.items || [];
  const STATUS_LABEL = {active:'نشطة',partially_settled:'مسدَّدة جزئياً',settled:'مسدَّدة',cancelled:'ملغاة'};
  const STATUS_COLOR = {active:'#d97706',partially_settled:'#1a2472',settled:'#15803d',cancelled:'#94a3b8'};

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">💼 العهد والسلف</h3>
    <button onclick="showAddAdvance()" class="btn btn-primary" style="font-size:13px">+ إضافة</button>
  </div>

  <!-- Totals -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:16px">
    ${[
      {label:'إجمالي نشطة',  val:money(items.filter(i=>i.status==='active').reduce((s,i)=>s+i.amount,0)),             color:'#d97706',bg:'#fef9c3'},
      {label:'متبقي غير مسدَّد',val:money(items.reduce((s,i)=>s+(i.amount-(i.settled_amount||0)),0)),              color:'#dc2626',bg:'#fef2f2'},
      {label:'مسدَّد',        val:money(items.reduce((s,i)=>s+(i.settled_amount||0),0)),                            color:'#15803d',bg:'#f0fdf4'},
    ].map(k=>`<div style="background:${k.bg};border-radius:10px;padding:14px;border-right:3px solid ${k.color}">
      <div style="font-size:18px;font-weight:800;color:${k.color}">${k.val}</div>
      <div style="font-size:11px;color:#64748b;margin-top:3px">${k.label}</div>
    </div>`).join('')}
  </div>

  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc">
        ${['النوع','الموظف','المبلغ','المسدَّد','المتبقي','تاريخ الصرف','تاريخ الاستحقاق','الغرض','الحالة',''].map(h=>`<th style="padding:9px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b;white-space:nowrap">${h}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${items.length===0?`<tr><td colspan="10" style="text-align:center;padding:40px;color:#94a3b8">لا توجد عهد أو سلف — اضغط "+ إضافة"</td></tr>`:
          items.map(a=>{
            const remaining = a.amount - (a.settled_amount||0);
            return `<tr style="border-bottom:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
              <td style="padding:8px 12px"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:#ede9fe;color:#7c3aed">${a.advance_type==='custody'?'عهدة':'سلفة'}</span></td>
              <td style="padding:8px 12px;font-weight:600">${escH(a.employee_name)}</td>
              <td style="padding:8px 12px;font-weight:700">${money(a.amount)}</td>
              <td style="padding:8px 12px;color:#15803d;font-weight:600">${money(a.settled_amount||0)}</td>
              <td style="padding:8px 12px;font-weight:700;color:${remaining>0?'#dc2626':'#15803d'}">${money(remaining)}</td>
              <td style="padding:8px 12px;font-size:12px;color:#64748b">${a.issue_date||'—'}</td>
              <td style="padding:8px 12px;font-size:12px;color:#64748b">${a.due_date||'—'}</td>
              <td style="padding:8px 12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151;font-size:12px">${escH(a.purpose||'—')}</td>
              <td style="padding:8px 12px"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:${STATUS_COLOR[a.status]+'22'};color:${STATUS_COLOR[a.status]}">${STATUS_LABEL[a.status]||a.status}</span></td>
              <td style="padding:8px 12px;white-space:nowrap">
                ${a.status!=='settled'&&a.status!=='cancelled'?`<button onclick="showSettleAdvance(${a.id},${a.amount},${a.settled_amount||0})" style="background:#f0fdf4;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;color:#15803d;margin-left:4px;font-family:inherit">تسوية</button>`:''}
                <button onclick="deleteAdvance(${a.id})" style="background:#fee2e2;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;color:#dc2626">🗑</button>
              </td>
            </tr>`;
          }).join('')}
      </tbody>
    </table>
    </div>
  </div>`;
}

function showAddAdvance() {
  const today = new Date().toISOString().split('T')[0];
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.zIndex = '1200';
  ov.innerHTML = `<div class="modal" style="max-width:480px">
    <div style="padding:14px 20px;background:#1a2472;border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white;font-weight:700;font-size:14px">💼 إضافة عهدة / سلفة</div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white">✕</button>
    </div>
    <div style="padding:20px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">النوع</label>
          <select id="advType" class="input"><option value="advance">سلفة</option><option value="custody">عهدة</option></select></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">المبلغ *</label>
          <input id="advAmount" type="number" class="input" placeholder="0"/></div>
      </div>
      <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">اسم الموظف *</label>
        <input id="advEmployee" class="input" placeholder="اسم الموظف"/></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">تاريخ الصرف *</label>
          <input id="advIssue" type="date" class="input" value="${today}"/></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">تاريخ الاستحقاق</label>
          <input id="advDue" type="date" class="input"/></div>
      </div>
      <div style="margin-bottom:16px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">الغرض</label>
        <input id="advPurpose" class="input" placeholder="مصاريف سفر / شراء مستلزمات..."/></div>
      <div id="advResult" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveAdvance()">💾 حفظ</button>
      </div>
    </div>
  </div>`;
  document.body.append(ov);
  ov.onclick = e => { if(e.target===ov) ov.remove(); };
}

async function saveAdvance() {
  const amt = parseFloat(document.getElementById('advAmount')?.value||0);
  const emp = document.getElementById('advEmployee')?.value?.trim();
  if(!amt||!emp) { document.getElementById('advResult').innerHTML=`<div style="color:#dc2626;font-size:13px">⚠️ أدخل الموظف والمبلغ</div>`; return; }
  try {
    await api('POST', `/api/accounting/${_accClientId}/advances`, {
      advance_type: document.getElementById('advType')?.value,
      employee_name: emp,
      amount: amt,
      issue_date: document.getElementById('advIssue')?.value,
      due_date: document.getElementById('advDue')?.value||null,
      purpose: document.getElementById('advPurpose')?.value?.trim()||null,
    });
    toast('✅ تمت الإضافة');
    document.querySelector('.modal-overlay:last-child')?.remove();
    accRender();
  } catch(e) { document.getElementById('advResult').innerHTML=`<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`; }
}

function showSettleAdvance(advId, total, settled) {
  const remaining = total - settled;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.zIndex = '1300';
  ov.innerHTML = `<div class="modal" style="max-width:380px">
    <div style="padding:14px 20px;background:#15803d;border-radius:18px 18px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white;font-weight:700;font-size:14px">✅ تسوية سلفة / عهدة</div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;color:white">✕</button>
    </div>
    <div style="padding:20px">
      <div style="background:#f0fdf4;border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px">
        <div>المبلغ الكلي: <strong>${money(total)}</strong></div>
        <div>تم تسوية: <strong>${money(settled)}</strong></div>
        <div>المتبقي: <strong style="color:#dc2626">${money(remaining)}</strong></div>
      </div>
      <div style="margin-bottom:14px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">مبلغ التسوية *</label>
        <input id="settleAmt" type="number" class="input" value="${remaining}" max="${remaining}"/></div>
      <div id="settleResult" style="margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button class="btn btn-primary" onclick="confirmSettleAdvance(${advId})" style="background:#15803d">✅ تأكيد التسوية</button>
      </div>
    </div>
  </div>`;
  document.body.append(ov);
  ov.onclick = e => { if(e.target===ov) ov.remove(); };
}

async function confirmSettleAdvance(advId) {
  const amt = parseFloat(document.getElementById('settleAmt')?.value||0);
  if(!amt) return;
  try {
    await api('PATCH', `/api/accounting/${_accClientId}/advances/${advId}/settle`, {amount: amt});
    toast('✅ تمت التسوية');
    document.querySelector('.modal-overlay:last-child')?.remove();
    accRender();
  } catch(e) { document.getElementById('settleResult').innerHTML=`<div style="color:#dc2626;font-size:13px">❌ ${escH(e.message)}</div>`; }
}

async function deleteAdvance(advId) {
  if(!await confirmDlg('حذف هذا السجل؟')) return;
  try {
    await api('DELETE', `/api/accounting/${_accClientId}/advances/${advId}`);
    toast('تم الحذف'); accRender();
  } catch(e) { toast(e.message,'error'); }
}

// ── AR/AP Aging ───────────────────────────────────────────────────────────────
async function accArAp() {
  const data = await api('GET', `/api/accounting/${_accClientId}/ar-ap`);
  const ar = data.ar || {items:[], totals:{}};
  const ap = data.ap || {items:[], totals:{}};
  const AGING_LABELS = ['0-30 يوم','31-60 يوم','61-90 يوم','+90 يوم'];
  const AGING_COLORS = ['#15803d','#d97706','#dc2626','#7c3aed'];

  const agingTable = (title, icon, items, totals, colorMain) => `
    <div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:800;color:#1e293b;margin-bottom:10px">${icon} ${title}</div>
      ${items.length===0?`<div style="background:white;border-radius:10px;padding:24px;text-align:center;color:#94a3b8;font-size:13px">لا توجد بيانات</div>`:`
      <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f8fafc">
            ${['الطرف','الإجمالي','0-30 يوم','31-60 يوم','61-90 يوم','+90 يوم'].map(h=>`<th style="padding:9px 12px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b;white-space:nowrap">${h}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${items.map(i=>`<tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:9px 12px;font-weight:600">${escH(i.partner_name||'—')}</td>
              <td style="padding:9px 12px;font-weight:800;color:${colorMain}">${money(i.total_amount)}</td>
              ${[i.bucket_0_30,i.bucket_31_60,i.bucket_61_90,i.bucket_90plus].map((v,idx)=>`<td style="padding:9px 12px;font-weight:${v>0?'700':'400'};color:${v>0?AGING_COLORS[idx]:'#94a3b8'}">${v>0?money(v):'—'}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
          <tfoot><tr style="background:#f8fafc;font-weight:700">
            <td style="padding:9px 12px;color:#64748b">الإجمالي (${items.length})</td>
            <td style="padding:9px 12px;color:${colorMain}">${money(totals.total_amount||0)}</td>
            ${[totals.bucket_0_30,totals.bucket_31_60,totals.bucket_61_90,totals.bucket_90plus].map((v,idx)=>`<td style="padding:9px 12px;color:${AGING_COLORS[idx]}">${v>0?money(v):'—'}</td>`).join('')}
          </tr></tfoot>
        </table>
        </div>
      </div>`}
    </div>`;

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">👤 تقرير العملاء والموردين (التقادم)</h3>
    <div style="font-size:12px;color:#64748b;background:white;border-radius:8px;padding:6px 12px;border:1px solid #e8edf3">بناءً على معاملات ${_accYear}</div>
  </div>

  <!-- AR summary cards -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:20px">
    <div style="background:#f0fdf4;border-radius:10px;padding:14px;border-right:3px solid #15803d">
      <div style="font-size:20px;font-weight:900;color:#15803d">${money(ar.totals?.total_amount||0)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:3px">إجمالي الذمم المدينة (عملاء)</div>
    </div>
    <div style="background:#fef2f2;border-radius:10px;padding:14px;border-right:3px solid #dc2626">
      <div style="font-size:20px;font-weight:900;color:#dc2626">${money(ap.totals?.total_amount||0)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:3px">إجمالي الذمم الدائنة (موردين)</div>
    </div>
    <div style="background:#eef1fb;border-radius:10px;padding:14px;border-right:3px solid #1a2472">
      <div style="font-size:20px;font-weight:900;color:#1a2472">${money((ar.totals?.total_amount||0)-(ap.totals?.total_amount||0))}</div>
      <div style="font-size:11px;color:#64748b;margin-top:3px">صافي المركز</div>
    </div>
  </div>

  ${agingTable('ذمم مدينة — العملاء','📈', ar.items||[], ar.totals||{}, '#15803d')}
  ${agingTable('ذمم دائنة — الموردين','📦', ap.items||[], ap.totals||{}, '#dc2626')}`;
}

// ── Cash Flow Statement ───────────────────────────────────────────────────────
async function accCashFlow() {
  const data = await api('GET', `/api/accounting/${_accClientId}/reports/cash-flow?year=${_accYear}`);
  const months = data.months || [];
  const MONTH_NAMES = MONTH_NAMES_AR;

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <h3 style="font-size:15px;font-weight:800;color:#1e293b;margin:0">💧 قائمة التدفقات النقدية — ${_accYear}</h3>
    <div style="display:flex;gap:10px">
      <div style="padding:6px 14px;border-radius:8px;background:#f0fdf4;color:#15803d;font-size:12px;font-weight:700">تدفقات واردة: ${money(data.total_inflow||0)}</div>
      <div style="padding:6px 14px;border-radius:8px;background:#fef2f2;color:#dc2626;font-size:12px;font-weight:700">تدفقات صادرة: ${money(data.total_outflow||0)}</div>
      <div style="padding:6px 14px;border-radius:8px;background:${(data.net_cash_flow||0)>=0?'#eef1fb':'#fef2f2'};color:${(data.net_cash_flow||0)>=0?'#1a2472':'#dc2626'};font-size:12px;font-weight:700">صافي: ${money(data.net_cash_flow||0)}</div>
    </div>
  </div>

  <!-- Bar chart visualization -->
  <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:16px">
    <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:14px">مقارنة التدفقات الشهرية</div>
    <div style="display:flex;gap:6px;align-items:flex-end;height:120px;padding-bottom:4px">
      ${months.map((m,i) => {
        const maxVal = Math.max(...months.map(x=>Math.max(x.inflow||0,x.outflow||0,1)));
        const inH = Math.round(((m.inflow||0)/maxVal)*110);
        const outH = Math.round(((m.outflow||0)/maxVal)*110);
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="width:100%;display:flex;align-items:flex-end;justify-content:center;gap:2px;height:110px">
            <div style="flex:1;background:#22c55e;border-radius:3px 3px 0 0;height:${inH}px;min-height:${(m.inflow||0)>0?2:0}px" title="وارد: ${money(m.inflow||0)}"></div>
            <div style="flex:1;background:#ef4444;border-radius:3px 3px 0 0;height:${outH}px;min-height:${(m.outflow||0)>0?2:0}px" title="صادر: ${money(m.outflow||0)}"></div>
          </div>
          <div style="font-size:9px;color:#94a3b8;text-align:center">${MONTH_NAMES[i].slice(0,3)}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:12px;justify-content:center;margin-top:8px;font-size:11px;color:#64748b">
      <span><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;margin-left:4px"></span>وارد</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;margin-left:4px"></span>صادر</span>
    </div>
  </div>

  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc">
        ${['الشهر','تدفقات واردة','تدفقات صادرة','صافي التدفق','المؤشر'].map(h=>`<th style="padding:10px 14px;text-align:right;border-bottom:2px solid #e8edf3;font-size:12px;font-weight:700;color:#64748b">${h}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${months.map((m,i) => {
          const hasData = m.inflow > 0 || m.outflow > 0;
          return `<tr style="border-bottom:1px solid #f1f5f9;opacity:${hasData?1:.4}">
            <td style="padding:9px 14px;font-weight:600">${MONTH_NAMES[i]}</td>
            <td style="padding:9px 14px;font-weight:700;color:#15803d">${m.inflow>0?money(m.inflow):'—'}</td>
            <td style="padding:9px 14px;font-weight:700;color:#dc2626">${m.outflow>0?money(m.outflow):'—'}</td>
            <td style="padding:9px 14px;font-weight:800;color:${m.net>=0?'#1a2472':'#dc2626'}">${hasData?money(m.net):'—'}</td>
            <td style="padding:9px 14px">${!hasData?'' : `
              <div style="background:#f1f5f9;border-radius:20px;height:6px;width:120px;overflow:hidden">
                <div style="background:${m.net>=0?'#22c55e':'#ef4444'};height:100%;width:${Math.min(100,Math.abs((m.net/(Math.max(m.inflow,m.outflow,1))*100)))}%;border-radius:20px"></div>
              </div>`}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot><tr style="background:#1a2472">
        <td style="padding:11px 14px;color:white;font-weight:700">الإجمالي السنوي</td>
        <td style="padding:11px 14px;color:#86efac;font-weight:800">${money(data.total_inflow||0)}</td>
        <td style="padding:11px 14px;color:#fca5a5;font-weight:800">${money(data.total_outflow||0)}</td>
        <td style="padding:11px 14px;color:${(data.net_cash_flow||0)>=0?'#fbbf24':'#fca5a5'};font-weight:800;font-size:15px">${money(data.net_cash_flow||0)}</td>
        <td></td>
      </tr></tfoot>
    </table>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// ══  تسويات الموظفين  ══════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════

let _settleEmp = null; // الموظف المفتوح حاليًا
let _settleMonth = new Date().getMonth() + 1;
let _settleYear  = new Date().getFullYear();

async function loadSettlements(silent=false) {
  const main = document.getElementById('main');
  main.className = 'page';
  if(!silent) main.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  try {
    const employees = await api('GET', '/api/settlements/employees');
    _settleEmp = null;
    renderSettlementsList(employees);
  } catch(e) {
    main.innerHTML = `<div style="color:#dc2626;padding:20px">❌ خطأ: ${escH(e.message)}</div>`;
  }
}

let _settlView = 'employees'; // 'employees' | 'daily' | 'monthly'
let _settlDailyDate = new Date().toISOString().split('T')[0];
let _settlMonthView = new Date().getMonth() + 1;
let _settlYearView  = new Date().getFullYear();

function renderSettlementsList(employees) {
  const main = document.getElementById('main');
  const total_balance = employees.reduce((s,e)=>s+(e.current_balance||0),0);
  const total_given   = employees.reduce((s,e)=>s+(e.total_given||0),0);

  const tabBtn = (id, icon, label) =>
    `<button onclick="switchSettleView('${id}')"
      style="display:flex;align-items:center;gap:6px;padding:10px 18px;font-size:13px;font-weight:700;border:none;border-bottom:2.5px solid ${_settlView===id?'#1a2472':'transparent'};background:transparent;cursor:pointer;color:${_settlView===id?'#1a2472':'#64748b'};font-family:inherit">
      ${icon} ${label}</button>`;

  main.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:4px">
    <div>
      <h2 style="font-size:18px;font-weight:800;color:#1e293b;margin:0">👷 تسويات الموظفين</h2>
      <p style="font-size:13px;color:#64748b;margin:4px 0 0">تتبع مصروفات المأموريات والعهد اليومية</p>
    </div>
    <button onclick="showAddEmployee()" class="btn btn-primary" style="font-size:13px">➕ إضافة موظف</button>
  </div>

  <!-- تبويبات العرض -->
  <div style="display:flex;gap:0;border-bottom:2px solid #e8edf3;margin-bottom:20px">
    ${tabBtn('employees','👥','الموظفون')}
    ${tabBtn('daily','📅','يومي')}
    ${tabBtn('monthly','📊','شهري')}
  </div>

  <div id="settleViewContent"></div>`;

  _renderSettleViewContent(employees);
}

function switchSettleView(v) {
  _settlView = v;
  loadSettlements(true);
}

function _renderSettleViewContent(employees) {
  const el = document.getElementById('settleViewContent');
  if (!el) return;
  if (_settlView === 'employees') _renderEmployeesGrid(el, employees);
  else if (_settlView === 'daily')   _renderDailyView(el);
  else if (_settlView === 'monthly') _renderMonthlyView(el);
}

function _renderEmployeesGrid(el, employees) {
  const total_balance = employees.reduce((s,e)=>s+(e.current_balance||0),0);
  const total_given   = employees.reduce((s,e)=>s+(e.total_given||0),0);
  el.innerHTML = `

  <!-- KPI شريط -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:24px">
    ${[
      {label:'عدد الموظفين',   val:employees.length,       icon:'👥', color:'#1a2472', bg:'#eef1fb'},
      {label:'إجمالي العهد',   val:money(total_given),     icon:'💰', color:'#15803d', bg:'#f0fdf4'},
      {label:'إجمالي المتبقي', val:money(total_balance),   icon:'💼', color:'#d97706', bg:'#fef9c3'},
    ].map(k=>`
    <div style="background:${k.bg};border-radius:14px;padding:16px 18px;border:1.5px solid ${k.color}22">
      <div style="font-size:22px;margin-bottom:4px">${k.icon}</div>
      <div style="font-size:20px;font-weight:800;color:${k.color}">${k.val}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px">${k.label}</div>
    </div>`).join('')}
  </div>

  <!-- قائمة الموظفين -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
    ${employees.length === 0 ? `
    <div style="grid-column:1/-1;text-align:center;padding:60px;color:#94a3b8">
      <div style="font-size:48px;margin-bottom:12px">👷</div>
      <div style="font-size:16px;font-weight:600">لا يوجد موظفون بعد</div>
      <div style="font-size:13px;margin-top:6px">ابدأ بإضافة موظف لتتبع تسوياته</div>
    </div>` : employees.map(emp => {
      const bal = emp.current_balance || 0;
      const balColor = bal > 0 ? '#15803d' : bal < 0 ? '#dc2626' : '#64748b';
      const empKey = encodeURIComponent(emp.employee_name);
      return `
    <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.06);border:1.5px solid #e8edf3;transition:transform .15s,box-shadow .15s"
         onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,.1)'"
         onmouseout="this.style.transform='';this.style.boxShadow='0 2px 10px rgba(0,0,0,.06)'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#1a2472,#2563eb);display:flex;align-items:center;justify-content:center;font-size:18px;color:white;font-weight:700;flex-shrink:0">
            ${escH(emp.employee_name[0])}
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;color:#1e293b">${escH(emp.employee_name)}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">آخر تسوية: ${emp.last_settlement ? dateAr(emp.last_settlement) : 'لا يوجد'}</div>
          </div>
        </div>
      </div>

      <!-- أرقام العهدة -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div style="background:#f8fafc;border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:15px;font-weight:800;color:#1a2472">${money(emp.total_given||0)}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">إجمالي العهد</div>
        </div>
        <div style="background:#f8fafc;border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:15px;font-weight:800;color:#dc2626">${money(emp.total_spent||0)}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">إجمالي الصرف</div>
        </div>
      </div>
      <div style="background:${bal>0?'#f0fdf4':bal<0?'#fef2f2':'#f8fafc'};border-radius:10px;padding:12px;text-align:center;margin-bottom:14px;border:1.5px solid ${bal>0?'#bbf7d0':bal<0?'#fecaca':'#e2e8f0'}">
        <div style="font-size:18px;font-weight:800;color:${balColor}">${money(Math.abs(bal))}</div>
        <div style="font-size:11px;color:${balColor};margin-top:2px;font-weight:600">${bal >= 0 ? '💼 رصيد العهدة المتبقي' : '⚠️ الموظف مدين'}</div>
      </div>

      <!-- أزرار -->
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="openEmployeeSettlements('${escH(emp.employee_name)}')"
          style="flex:1;padding:8px;background:linear-gradient(135deg,#1a2472,#2563eb);color:white;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">
          📋 التسويات
        </button>
        <button onclick="showCustodyTopup('${escH(emp.employee_name)}')"
          style="flex:1;padding:8px;background:#f0fdf4;color:#15803d;border:1.5px solid #bbf7d0;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">
          💰 إضافة عهدة
        </button>
        <button onclick="showEditCustody('${escH(emp.employee_name)}',${emp.current_balance||0})"
          style="flex:1;padding:8px;background:#eff6ff;color:#1d4ed8;border:1.5px solid #bfdbfe;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">
          ✏️ تعديل
        </button>
        <button onclick="resetEmployeeBalance('${escH(emp.employee_name)}')"
          title="تصفير الرصيد وحذف جميع التسويات"
          style="padding:8px 10px;background:#fef2f2;color:#dc2626;border:1.5px solid #fecaca;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">
          🔄 تصفير
        </button>
      </div>
    </div>`}).join('')}
  </div>`;
}

// ── Daily View ────────────────────────────────────────────────────
async function _renderDailyView(el) {
  el.innerHTML = `
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
    <label style="font-weight:700;font-size:13px;color:#374151">📅 اختر تاريخ:</label>
    <input type="date" id="settlDailyPicker" value="${_settlDailyDate}"
      onchange="setSettlDate(this.value)"
      style="padding:8px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;font-family:inherit;color:#1e293b">
    <button onclick="setSettlToday()"
      style="padding:8px 14px;background:#eef1fb;color:#1a2472;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">
      اليوم
    </button>
  </div>
  <div id="dailySettleBody"><div style="text-align:center;padding:40px"><div class="spinner"></div></div></div>`;
  _refreshDailyView();
}

async function _refreshDailyView() {
  const el = document.getElementById('dailySettleBody');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';
  try {
    _AC.invalidate('/api/settlements/daily');
    const data = await api('GET', `/api/settlements/daily?date_str=${_settlDailyDate}`);
    const settlements = data.settlements || [];
    const [y,m,d] = _settlDailyDate.split('-');
    const dayLabel = new Date(_settlDailyDate+'T12:00:00').toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

    if (settlements.length === 0) {
      el.innerHTML = `
      <div style="text-align:center;padding:60px;color:#94a3b8">
        <div style="font-size:48px;margin-bottom:12px">📋</div>
        <div style="font-size:16px;font-weight:600">لا توجد تسويات في ${dayLabel}</div>
        <div style="font-size:13px;margin-top:6px">لم يتم تسجيل أي مصروفات في هذا اليوم</div>
      </div>`;
      return;
    }

    el.innerHTML = `
    <!-- ملخص اليوم -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:20px">
      ${[
        {label:'تاريخ', val:dayLabel, icon:'📅', color:'#1a2472', bg:'#eef1fb', small:true},
        {label:'عدد الموظفين', val:settlements.length+' موظف', icon:'👥', color:'#7c3aed', bg:'#f5f3ff'},
        {label:'إجمالي الصرف', val:money(data.grand_total||0), icon:'💸', color:'#dc2626', bg:'#fef2f2'},
        {label:'إجمالي العهد المضافة', val:money(data.grand_custody||0), icon:'💰', color:'#15803d', bg:'#f0fdf4'},
      ].map(k=>`
      <div style="background:${k.bg};border-radius:12px;padding:14px;border:1px solid ${k.color}20">
        <div style="font-size:18px;margin-bottom:4px">${k.icon}</div>
        <div style="font-size:${k.small?'12':'17'}px;font-weight:800;color:${k.color}">${k.val}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${k.label}</div>
      </div>`).join('')}
    </div>

    <!-- تفاصيل كل موظف -->
    <div style="display:flex;flex-direction:column;gap:14px">
      ${settlements.map(s=>`
      <div style="background:white;border-radius:14px;border:1.5px solid #e8edf3;overflow:hidden">
        <!-- header الموظف -->
        <div style="background:linear-gradient(135deg,#1a2472,#2563eb);padding:12px 18px;display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:16px;color:white;font-weight:700">
              ${escH((s.employee_name||'?')[0])}
            </div>
            <div style="color:white;font-weight:700;font-size:14px">${escH(s.employee_name||'')}</div>
          </div>
          <div style="color:rgba(255,255,255,.85);font-size:13px;font-weight:700">${escH(s.reason||'مأمورية')}</div>
        </div>
        <!-- تفاصيل البنود -->
        <div style="padding:14px 18px">
          ${(s.expense_items||[]).length > 0 ? `
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:10px">
            <thead><tr style="background:#f8fafc">
              <th style="padding:6px 10px;text-align:right;color:#64748b;font-weight:600">البند</th>
              <th style="padding:6px 10px;text-align:center;color:#64748b;font-weight:600">المبلغ</th>
            </tr></thead>
            <tbody>
              ${(s.expense_items||[]).map(item=>`
              <tr style="border-top:1px solid #f1f5f9">
                <td style="padding:7px 10px;color:#374151">${escH(item.description)}</td>
                <td style="padding:7px 10px;text-align:center;font-weight:700;color:#1a2472">${money(item.amount)}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div style="color:#94a3b8;font-size:12px;margin-bottom:10px">لا توجد بنود مسجلة</div>'}
          <!-- أرصدة -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            ${[
              ['رصيد افتتاحي', s.opening_balance||0, '#64748b'],
              ['عهدة مضافة',   s.custody_added||0,   '#15803d'],
              ['إجمالي الصرف', s.total_spent||0,      '#dc2626'],
              ['رصيد ختامي',   s.closing_balance||0,  (s.closing_balance||0)>=0?'#15803d':'#dc2626'],
            ].map(([l,v,c])=>`
            <div style="background:#f8fafc;border-radius:8px;padding:8px;text-align:center">
              <div style="font-size:14px;font-weight:800;color:${c}">${money(v)}</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px">${l}</div>
            </div>`).join('')}
          </div>
          ${s.notes?`<div style="margin-top:8px;font-size:12px;color:#64748b;background:#f8fafc;border-radius:8px;padding:6px 10px">📝 ${escH(s.notes)}</div>`:''}
        </div>
      </div>`).join('')}
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px">❌ ${escH(e.message)}</div>`;
  }
}

// ── Monthly Summary View ───────────────────────────────────────────
async function _renderMonthlyView(el) {
  const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  el.innerHTML = `
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
    <label style="font-weight:700;font-size:13px;color:#374151">📊 الشهر:</label>
    <select id="settlMonthSel" onchange="_settlMonthView=+this.value;_refreshMonthlyView()"
      style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;background:white">
      ${monthNames.map((m,i)=>`<option value="${i+1}" ${i+1===_settlMonthView?'selected':''}>${m}</option>`).join('')}
    </select>
    <select id="settlYearSel" onchange="_settlYearView=+this.value;_refreshMonthlyView()"
      style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;background:white">
      ${[2023,2024,2025,2026].map(y=>`<option ${y===_settlYearView?'selected':''}>${y}</option>`).join('')}
    </select>
  </div>
  <div id="monthlySettleBody"><div style="text-align:center;padding:40px"><div class="spinner"></div></div></div>`;
  _refreshMonthlyView();
}

async function _refreshMonthlyView() {
  const el = document.getElementById('monthlySettleBody');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';
  try {
    _AC.invalidate('/api/settlements/monthly');
    const data = await api('GET', `/api/settlements/monthly/${_settlMonthView}/${_settlYearView}`);
    const emps = data.employees || [];
    const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

    if (emps.length === 0) {
      el.innerHTML = `<div style="text-align:center;padding:60px;color:#94a3b8">
        <div style="font-size:48px;margin-bottom:12px">📊</div>
        <div style="font-size:16px;font-weight:600">لا توجد تسويات في ${monthNames[_settlMonthView-1]} ${_settlYearView}</div>
      </div>`;
      return;
    }

    el.innerHTML = `
    <!-- ملخص الشهر -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:24px">
      ${[
        {label:'الشهر',        val:`${monthNames[_settlMonthView-1]} ${_settlYearView}`, icon:'📅', color:'#1a2472', bg:'#eef1fb'},
        {label:'عدد الموظفين', val:emps.length+' موظف', icon:'👥', color:'#7c3aed', bg:'#f5f3ff'},
        {label:'إجمالي الصرف', val:money(data.grand_total||0), icon:'💸', color:'#dc2626', bg:'#fef2f2'},
        {label:'عدد التسويات', val:data.count+' تسوية', icon:'📋', color:'#d97706', bg:'#fef9c3'},
      ].map(k=>`
      <div style="background:${k.bg};border-radius:12px;padding:14px;border:1px solid ${k.color}20">
        <div style="font-size:18px;margin-bottom:4px">${k.icon}</div>
        <div style="font-size:16px;font-weight:800;color:${k.color}">${k.val}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${k.label}</div>
      </div>`).join('')}
    </div>

    <!-- جدول الموظفين -->
    <div style="background:white;border-radius:14px;border:1.5px solid #e8edf3;overflow:hidden">
      <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;font-size:14px;font-weight:700;color:#1e293b">
        📊 ملخص ${monthNames[_settlMonthView-1]} ${_settlYearView} — تفاصيل كل موظف
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f8fafc">
            <th style="padding:10px 14px;text-align:right;color:#64748b;font-weight:600">الموظف</th>
            <th style="padding:10px 14px;text-align:center;color:#64748b;font-weight:600">عدد الأيام</th>
            <th style="padding:10px 14px;text-align:center;color:#64748b;font-weight:600">إجمالي الصرف</th>
          </tr></thead>
          <tbody>
            ${emps.map((e,idx)=>`
            <tr style="border-top:1px solid #f1f5f9;${idx%2===1?'background:#fafbfc':''}">
              <td style="padding:10px 14px">
                <div style="font-weight:700;color:#1e293b">${escH(e.employee)}</div>
              </td>
              <td style="padding:10px 14px;text-align:center;color:#7c3aed;font-weight:700">${e.settlements.length} يوم</td>
              <td style="padding:10px 14px;text-align:center;font-weight:800;color:#dc2626">${money(e.total_spent||0)}</td>
            </tr>
            <!-- تفاصيل التسويات -->
            <tr style="border-top:1px dashed #f1f5f9">
              <td colspan="3" style="padding:0 14px 12px">
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
                  ${e.settlements.map(s=>`
                  <div style="background:#f8fafc;border-radius:8px;padding:6px 10px;border:1px solid #e8edf3;font-size:11px">
                    <span style="color:#64748b">${dateAr(s.date)}</span>
                    <span style="font-weight:700;color:#dc2626;margin-right:6px">${money(s.total_spent||0)}</span>
                    ${s.reason?`<span style="color:#94a3b8">— ${escH(s.reason)}</span>`:''}
                  </div>`).join('')}
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#1a2472;color:white">
              <td style="padding:12px 14px;font-weight:700">الإجمالي</td>
              <td style="padding:12px 14px;text-align:center;font-weight:700">${data.count} تسوية</td>
              <td style="padding:12px 14px;text-align:center;font-weight:800;font-size:15px">${money(data.grand_total||0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px">❌ ${escH(e.message)}</div>`;
  }
}

async function openEmployeeSettlements(empName) {
  _settleEmp = {name: empName};
  const main = document.getElementById('main');
  main.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';

  const now = new Date();
  _settleMonth = now.getMonth() + 1;
  _settleYear  = now.getFullYear();
  await renderEmpSettlements();
}

async function renderEmpSettlements() {
  const main = document.getElementById('main');
  try {
    const detail = await api('GET', `/api/settlements/employees/${encodeURIComponent(_settleEmp.name)}?month=${_settleMonth}&year=${_settleYear}`);

    const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const settlements = detail.settlements || [];
    const report = {
      total_custody_added: settlements.reduce((s,x)=>s+(x.custody_added||0),0),
      total_spent:         settlements.reduce((s,x)=>s+(x.total_spent||0),0),
      total_transportation:settlements.reduce((s,x)=>s+(x.transportation||0),0),
      total_meals:         settlements.reduce((s,x)=>s+(x.meals||0),0),
      total_other:         settlements.reduce((s,x)=>s+(x.other_expenses||0),0),
    };
    // For past months: show the closing balance of the last settlement in that month
    // For current month: show the live current_balance from custody record
    const now = new Date();
    const isCurrentMonth = (_settleMonth === now.getMonth()+1 && _settleYear === now.getFullYear());
    // Sort settlements by date desc to find most recent in the selected month
    const sortedByDate = [...settlements].sort((a,b)=>new Date(b.date)-new Date(a.date));
    const bal = isCurrentMonth
      ? (detail.current_balance || 0)
      : (sortedByDate.length ? (sortedByDate[0].closing_balance ?? detail.current_balance) : detail.current_balance);

    main.innerHTML = `
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:12px">
        <button onclick="loadSettlements()" style="background:#f1f5f9;border:none;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:13px;color:#475569">← رجوع</button>
        <div>
          <h2 style="font-size:16px;font-weight:800;color:#1e293b;margin:0">👷 ${escH(_settleEmp.name)}</h2>
          <p style="font-size:12px;color:#64748b;margin:2px 0 0">تسويات ${monthNames[_settleMonth-1]} ${_settleYear}</p>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select onchange="_settleMonth=+this.value;_AC.invalidate('/api/settlements');renderEmpSettlements()"
          style="padding:7px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;background:white">
          ${monthNames.map((m,i)=>`<option value="${i+1}" ${i+1===_settleMonth?'selected':''}>${m}</option>`).join('')}
        </select>
        <select onchange="_settleYear=+this.value;_AC.invalidate('/api/settlements');renderEmpSettlements()"
          style="padding:7px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;background:white">
          ${[2023,2024,2025,2026].map(y=>`<option ${y===_settleYear?'selected':''}>${y}</option>`).join('')}
        </select>
        <button onclick="showAddSettlement()" class="btn btn-primary" style="font-size:13px">➕ تسوية جديدة</button>
      </div>
    </div>

    <!-- ملخص الشهر -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:18px">
      ${[
        {label:'رصيد العهدة الحالي', val:money(bal), icon:'💼', color:bal>=0?'#15803d':'#dc2626', bg:bal>=0?'#f0fdf4':'#fef2f2'},
        {label:'عهد أُضيفت الشهر',  val:money(report.total_custody_added||0), icon:'💰', color:'#1a2472', bg:'#eef1fb'},
        {label:'إجمالي الصرف',      val:money(report.total_spent||0), icon:'💸', color:'#d97706', bg:'#fef9c3'},
        {label:'أيام مأمورية',      val:settlements.length, icon:'📅', color:'#7c3aed', bg:'#f5f3ff'},
      ].map(k=>`
      <div style="background:${k.bg};border-radius:12px;padding:14px;border:1px solid ${k.color}20">
        <div style="font-size:18px;margin-bottom:4px">${k.icon}</div>
        <div style="font-size:17px;font-weight:800;color:${k.color}">${k.val}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${k.label}</div>
      </div>`).join('')}
    </div>

    <!-- جدول التسويات -->
    <div style="background:white;border-radius:14px;border:1.5px solid #e8edf3;overflow:hidden">
      <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:14px;font-weight:700;color:#1e293b">📋 سجل التسويات — ${monthNames[_settleMonth-1]} ${_settleYear}</span>
        <span style="font-size:12px;color:#64748b">${settlements.length} تسوية</span>
      </div>
      ${settlements.length === 0 ? `
      <div style="text-align:center;padding:50px;color:#94a3b8">
        <div style="font-size:36px;margin-bottom:10px">📋</div>
        <div>لا توجد تسويات في هذا الشهر</div>
        <div style="font-size:12px;margin-top:6px">اضغط "تسوية جديدة" لإضافة أول تسوية</div>
      </div>` : `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:10px 14px;text-align:right;color:#64748b;font-weight:600;white-space:nowrap">التاريخ</th>
              <th style="padding:10px 14px;text-align:right;color:#64748b;font-weight:600">البنود (تاريخ | عميل | بند | مبلغ)</th>
              <th style="padding:10px 14px;text-align:center;color:#64748b;font-weight:600">الإجمالي</th>
              <th style="padding:10px 14px;text-align:center;color:#64748b;font-weight:600">رصيد افتتاحي</th>
              <th style="padding:10px 14px;text-align:center;color:#64748b;font-weight:600">عهدة جديدة</th>
              <th style="padding:10px 14px;text-align:center;color:#64748b;font-weight:600">رصيد ختامي</th>
              <th style="padding:10px 14px;text-align:center;color:#64748b;font-weight:600"></th>
            </tr>
          </thead>
          <tbody>
            ${(()=>{
              const topups = detail.custody_topups || [];
              const allRows = [
                ...settlements.map(s=>({type:'settlement',date:s.date,data:s})),
                ...topups.map(t=>({type:'topup',date:t.date,data:t}))
              ].sort((a,b)=>new Date(b.date)-new Date(a.date));
              return allRows.map((row,idx)=>{
                if(row.type==='topup'){
                  const t=row.data;
                  return '<tr style="border-top:1px solid #d1fae5;background:#f0fdf4">' +
                    '<td style="padding:10px 14px;color:#15803d;font-weight:700;white-space:nowrap;vertical-align:middle">' + dateAr(t.date) + '</td>' +
                    '<td style="padding:10px 14px;vertical-align:middle">' +
                      '<div style="display:flex;align-items:center;gap:8px">' +
                        '<span style="background:#15803d;color:white;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">💰 عهدة جديدة</span>' +
                        (t.notes ? '<span style="font-size:12px;color:#374151">' + escH(t.notes) + '</span>' : '') +
                      '</div>' +
                    '</td>' +
                    '<td style="padding:10px 14px;text-align:center;color:#94a3b8">—</td>' +
                    '<td style="padding:10px 14px;text-align:center;color:#94a3b8">—</td>' +
                    '<td style="padding:10px 14px;text-align:center;font-weight:800;color:#15803d;font-size:15px">' + money(t.amount) + '</td>' +
                    '<td style="padding:10px 14px;text-align:center;color:#94a3b8">—</td>' +
                    '<td style="padding:10px 14px;text-align:center;vertical-align:middle">' +
                      '<div style="display:flex;gap:4px;justify-content:center">' +
                        '<button onclick="showEditCustodyTopup(' + t.id + ',' + t.amount + ',\'' + escH(t.notes||'') + '\')" title="تعديل" style="background:#eef1fb;border:none;border-radius:6px;color:#1a2472;cursor:pointer;font-size:13px;padding:5px 8px">✏️</button>' +
                        '<button onclick="deleteCustodyTopup(' + t.id + ')" title="حذف" style="background:#fee2e2;border:none;border-radius:6px;color:#ef4444;cursor:pointer;font-size:13px;padding:5px 8px">🗑️</button>' +
                      '</div>' +
                    '</td>' +
                  '</tr>';
                }
                const s=row.data;
                return '<tr style="border-top:1px solid #f1f5f9;' + (idx%2===1?'background:#fafbfc':'') + '">' +
                  '<td style="padding:10px 14px;color:#1e293b;font-weight:600;white-space:nowrap;vertical-align:top">' + dateAr(s.date) + '</td>' +
                  '<td style="padding:10px 14px;vertical-align:top;min-width:200px">' +
                    (s.expense_items||[]).map(item=>
                      '<div style="display:grid;grid-template-columns:90px 1fr 1fr 80px;gap:4px;font-size:11px;padding:3px 0;border-bottom:1px solid #f1f5f9">' +
                        '<span style="color:#94a3b8">' + (item.expense_date||'') + '</span>' +
                        '<span style="color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escH(item.client_name||'—') + '</span>' +
                        '<span style="color:#1e293b;font-weight:600">' + escH(item.description||'—') + '</span>' +
                        '<span style="color:#1a2472;font-weight:700;text-align:left">' + money(item.amount) + '</span>' +
                      '</div>'
                    ).join('') +
                  '</td>' +
                  '<td style="padding:10px 14px;text-align:center;font-weight:800;color:#dc2626;vertical-align:top;white-space:nowrap">' + money(s.total_spent||0) + '</td>' +
                  '<td style="padding:10px 14px;text-align:center;color:#475569;vertical-align:top;white-space:nowrap">' + money(s.opening_balance||0) + '</td>' +
                  '<td style="padding:10px 14px;text-align:center;color:#15803d;font-weight:600;vertical-align:top;white-space:nowrap">' + (s.custody_added?money(s.custody_added):'—') + '</td>' +
                  '<td style="padding:10px 14px;text-align:center;font-weight:800;vertical-align:top;white-space:nowrap;color:' + ((s.closing_balance||0)>=0?'#15803d':'#dc2626') + '">' + money(s.closing_balance||0) + '</td>' +
                  '<td style="padding:10px 14px;text-align:center;vertical-align:top">' +
                    '<div style="display:flex;gap:4px;justify-content:center">' +
                      '<button onclick="printSettlement(' + JSON.stringify(s).replace(/"/g,'&quot;') + ')" title="طباعة" style="background:#f0fdf4;border:none;border-radius:6px;color:#15803d;cursor:pointer;font-size:13px;padding:5px 8px">🖨️</button>' +
                      '<button onclick="showEditSettlement(' + s.id + ')" title="تعديل" style="background:#eef1fb;border:none;border-radius:6px;color:#1a2472;cursor:pointer;font-size:13px;padding:5px 8px">✏️</button>' +
                      '<button onclick="deleteSettlement(' + s.id + ')" title="حذف" style="background:#fee2e2;border:none;border-radius:6px;color:#ef4444;cursor:pointer;font-size:13px;padding:5px 8px">🗑️</button>' +
                    '</div>' +
                  '</td>' +
                '</tr>';
              }).join('');
            })()}
          </tbody>
          <tfoot>
            <tr style="background:#1a2472;color:white">
              <td colspan="2" style="padding:12px 14px;font-weight:700;font-size:13px">الإجمالي</td>
              <td style="padding:12px 14px;text-align:center;font-weight:800;font-size:14px">${money(report.total_spent||0)}</td>
              <td colspan="3" style="padding:12px 14px"></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>`}
    </div>`;
  } catch(e) {
    main.innerHTML = `<div style="color:#dc2626;padding:20px">❌ ${escH(e.message)}</div>`;
  }
}

function showAddEmployee() {
  const html = `
  <div id="modal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px">
    <div style="background:white;border-radius:20px;padding:28px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <h3 style="margin:0 0 20px;font-size:16px;font-weight:800;color:#1e293b">👷 إضافة موظف جديد</h3>
      <div class="form-group">
        <label class="label">اسم الموظف *</label>
        <input id="empNameInp" class="input" placeholder="مثال: أحمد محمد" style="text-align:right">
      </div>
      <div class="form-group" style="margin-top:12px">
        <label class="label">رصيد العهدة الابتدائي</label>
        <input id="empBalInp" class="input" type="number" placeholder="0" value="0">
      </div>
      <div class="form-group" style="margin-top:12px">
        <label class="label">ملاحظات</label>
        <textarea id="empNoteInp" class="input" rows="2" placeholder="ملاحظات اختيارية..."></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button onclick="saveNewEmployee()" class="btn btn-primary" style="flex:1">حفظ</button>
        <button onclick="closeModal()" style="flex:1;padding:10px;background:#f1f5f9;border:none;border-radius:10px;cursor:pointer;font-weight:600">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function saveNewEmployee() {
  const name = document.getElementById('empNameInp')?.value?.trim();
  const balance = parseFloat(document.getElementById('empBalInp')?.value || '0');
  const notes = document.getElementById('empNoteInp')?.value?.trim();
  if (!name) { toast('ادخل اسم الموظف','error'); return; }
  try {
    await api('POST', '/api/settlements/employees', {employee_name:name, amount:balance, notes});
    closeModal();
    loadSettlements(true);
  } catch(e) { toast(e.message,'error'); }
}

function showCustodyTopup(empName) {
  const html = `
  <div id="modal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px">
    <div style="background:white;border-radius:20px;padding:28px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <h3 style="margin:0 0 20px;font-size:16px;font-weight:800;color:#1e293b">💰 إضافة عهدة — ${escH(empName)}</h3>
      <div class="form-group">
        <label class="label">المبلغ المضاف *</label>
        <input id="topupAmt" class="input" type="number" placeholder="0" style="font-size:18px;font-weight:700">
      </div>
      <div class="form-group" style="margin-top:12px">
        <label class="label">ملاحظات</label>
        <input id="topupNote" class="input" placeholder="سبب إضافة العهدة...">
      </div>
      <input type="hidden" id="topupEmpName" value="${escH(empName)}">
      <div style="display:flex;gap:10px;margin-top:20px">
        <button onclick="saveCustodyTopup()" class="btn btn-primary" style="flex:1">إضافة</button>
        <button onclick="closeModal()" style="flex:1;padding:10px;background:#f1f5f9;border:none;border-radius:10px;cursor:pointer;font-weight:600">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function showEditCustody(empName, currentBalance) {
  const html = `
  <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-width:380px">
      <div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);border-radius:14px 14px 0 0;padding:16px 20px">
        <div style="color:white;font-weight:700;font-size:15px">✏️ تعديل رصيد عهدة — ${escH(empName)}</div>
        <div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:3px">الرصيد الحالي: ${money(currentBalance)}</div>
      </div>
      <div style="padding:20px">
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400e">
          ⚠️ هيتم تعديل رصيد العهدة مباشرة — استخدمه فقط لتصحيح الأرقام الغلط
        </div>
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">الرصيد الصحيح (ج.م.)</label>
        <input id="editCustodyAmt" class="input" type="number" value="${currentBalance}" step="0.01" style="margin-bottom:14px"/>
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">سبب التعديل</label>
        <input id="editCustodyNote" class="input" placeholder="مثال: تصحيح خطأ في الإدخال..." style="margin-bottom:20px"/>
        <div style="display:flex;gap:10px">
          <button onclick="saveEditCustody('${escH(empName)}')" class="btn btn-primary" style="flex:1">💾 حفظ التعديل</button>
          <button onclick="this.closest('.modal-overlay').remove()" class="btn" style="flex:1">إلغاء</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(()=>document.getElementById('editCustodyAmt')?.focus(),100);
}

async function saveEditCustody(empName) {
  const amt = parseFloat(document.getElementById('editCustodyAmt')?.value||'');
  if (isNaN(amt) || amt < 0) { toast('ادخل مبلغ صحيح','error'); return; }
  try {
    await api('PATCH', `/api/settlements/employees/${encodeURIComponent(empName)}/balance`, {amount: amt});
    document.querySelector('.modal-overlay')?.remove();
    toast('✅ تم تعديل رصيد العهدة');
    loadSettlements(true);
  } catch(e) { toast(e.message,'error'); }
}
window.showEditCustody = showEditCustody;
window.saveEditCustody = saveEditCustody;

async function saveCustodyTopup() {
  const empName = document.getElementById('topupEmpName')?.value;
  const amount = parseFloat(document.getElementById('topupAmt')?.value || '0');
  const notes = document.getElementById('topupNote')?.value?.trim();
  if (!amount || amount <= 0) { toast('ادخل مبلغ صحيح','error'); return; }
  try {
    await api('POST', '/api/settlements/custody/topup', {employee_name:empName, amount, notes});
    closeModal();
    if (_settleEmp) renderEmpSettlements(); else loadSettlements(true);
  } catch(e) { toast(e.message,'error'); }
}

async function deleteCustodyTopup(id) {
  if (!await confirmDlg('حذف العهدة؟', 'هيتم حذف هذه العهدة وخصمها من رصيد الموظف — متأكد؟')) return;
  try {
    await api('DELETE', `/api/settlements/custody/topup/${id}`);
    toast('✅ تم حذف العهدة');
    _AC.invalidate('/api/settlements');
    renderEmpSettlements();
  } catch(e) { toast(e.message,'error'); }
}

function showEditCustodyTopup(id, currentAmount, currentNotes) {
  const html = `
  <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-width:380px">
      <div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);border-radius:14px 14px 0 0;padding:16px 20px">
        <div style="color:white;font-weight:700;font-size:15px">✏️ تعديل العهدة</div>
        <div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:3px">المبلغ الحالي: ${money(currentAmount)}</div>
      </div>
      <div style="padding:20px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">المبلغ الجديد (ج.م.)</label>
        <input id="editTopupAmt" class="input" type="number" value="${currentAmount}" step="0.01" style="margin-bottom:14px"/>
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">ملاحظات</label>
        <input id="editTopupNote" class="input" value="${escH(currentNotes||'')}" placeholder="سبب العهدة..." style="margin-bottom:20px"/>
        <div style="display:flex;gap:10px">
          <button onclick="saveEditCustodyTopup(${id})" class="btn btn-primary" style="flex:1">💾 حفظ التعديل</button>
          <button onclick="this.closest('.modal-overlay').remove()" class="btn" style="flex:1">إلغاء</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(()=>document.getElementById('editTopupAmt')?.focus(),100);
}

async function saveEditCustodyTopup(id) {
  const amt = parseFloat(document.getElementById('editTopupAmt')?.value||'');
  const notes = document.getElementById('editTopupNote')?.value?.trim()||'';
  if (isNaN(amt) || amt <= 0) { toast('ادخل مبلغ صحيح','error'); return; }
  try {
    await api('DELETE', `/api/settlements/custody/topup/${id}`);
    const empName = _settleEmp?.name;
    await api('POST', '/api/settlements/custody/topup', {employee_name: empName, amount: amt, notes});
    document.querySelector('.modal-overlay')?.remove();
    toast('✅ تم تعديل العهدة');
    _AC.invalidate('/api/settlements');
    renderEmpSettlements();
  } catch(e) { toast(e.message,'error'); }
}

// ── Settlement Form — matching طلب تسوية عهدة ─────────────────────────
const STL_CATS = ['انتقالات','مواصلات','تصوير وطباعه','اكرامية','مأكولات','بريد وشحن','رسوم حكومية','مستلزمات مكتبية','أخرى'];

let _stlItemCount = 0;
let _stlOpeningBal = 0;

function _stlGetItems() {
  const items = [];
  document.getElementById('stlItemsList')?.querySelectorAll('[data-stl-row]').forEach(row => {
    const date   = row.querySelector('[data-f=date]')?.value?.trim();
    const client = row.querySelector('[data-f=client]')?.value?.trim();
    const cat    = row.querySelector('[data-f=cat]')?.value?.trim();
    const amt    = parseFloat(row.querySelector('[data-f=amt]')?.value||0);
    if (client || cat || amt > 0) items.push({
      description: cat||'—',
      client_name: client||'—',
      expense_date: date||'',
      amount: amt,
    });
  });
  return items;
}

function calcStlTotal() {
  const items = _stlGetItems();
  const total    = items.reduce((s,it)=>s+(it.amount||0), 0);
  const cust     = parseFloat(document.getElementById('stlCustody')?.value||0);
  const returned = parseFloat(document.getElementById('stlSumReturn')?.value||0);
  const prevBal  = _stlOpeningBal;
  const preTot   = prevBal + cust;
  const final    = preTot - total - returned;
  const fmt = v => v.toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' ج.م';
  const set = (id, v) => { const el=document.getElementById(id); if(el&&el.tagName!=='INPUT') el.textContent=fmt(v); };
  set('stlSumTotal',    total);
  set('stlSumPrev',     prevBal);
  set('stlSumCust',     cust);
  set('stlSumPreSettle', preTot);
  const fEl = document.getElementById('stlSumFinal');
  if(fEl) { fEl.textContent = fmt(final); fEl.style.color = final < 0 ? '#dc2626' : '#15803d'; }
}

function addStlItem(data={}) {
  const list = document.getElementById('stlItemsList');
  if (!list) return;
  const idx = _stlItemCount++;
  const today = document.getElementById('stlDate')?.value || new Date().toISOString().slice(0,10);
  const row = document.createElement('div');
  row.dataset.stlRow = idx;
  row.style.cssText = 'display:grid;grid-template-columns:120px 1fr 1fr 110px 34px;gap:0;border-top:1px solid #e2e8f0';
  const cellStyle = 'padding:4px 6px;border-left:1px solid #e2e8f0;';
  const inp = (f,type,val,ph) => `<input data-f="${f}" type="${type}" value="${escH(String(val||''))}" placeholder="${ph}"
    class="input" style="width:100%;padding:5px 8px;font-size:12px;border:none;border-radius:0;background:transparent" oninput="calcStlTotal()"/>`;
  // ensure datalist exists once in DOM
  if (!document.getElementById('stlCatList')) {
    const dl = document.createElement('datalist');
    dl.id = 'stlCatList';
    dl.innerHTML = STL_CATS.map(c=>`<option value="${c}">`).join('');
    document.body.appendChild(dl);
  }
  row.innerHTML = `
    <div style="${cellStyle}">${inp('date','date',data.expense_date||today,'')}</div>
    <div style="${cellStyle}">${inp('client','text',data.client_name||'','مدينة نصر اول...')}</div>
    <div style="${cellStyle}"><input data-f="cat" type="text" list="stlCatList" value="${escH(data.description||data.cat||'')}" placeholder="اكتب البند يدوياً..."
      class="input" style="width:100%;padding:5px 8px;font-size:12px;border:none;border-radius:0;background:transparent;font-family:inherit" oninput="calcStlTotal()"/></div>
    <div style="${cellStyle};text-align:center">${inp('amt','number',data.amount||'','0.00')}</div>
    <div style="display:flex;align-items:center;justify-content:center;padding:2px">
      <button type="button" onclick="removeStlItem(this.closest('[data-stl-row]'))"
        style="background:#fee2e2;border:none;border-radius:5px;color:#dc2626;cursor:pointer;padding:3px 7px;font-size:12px">✕</button>
    </div>`;
  list.appendChild(row);
  calcStlTotal();
}

function removeStlItem(row) { row?.remove(); calcStlTotal(); }

function _stlOpenModal(existingData={}) {
  if (!_settleEmp) return;
  const today = existingData.date || new Date().toISOString().slice(0,10);
  _stlOpeningBal = existingData.opening_balance ?? _settleEmp.current_balance ?? 0;
  const custodyVal  = existingData.custody_added ?? 0;
  const returnedVal = existingData.returned_amount ?? 0;
  const isEdit = !!existingData.id;

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'stlModalOv';
  ov.innerHTML = `
  <div class="modal" style="max-width:780px;width:98%;padding:0">
    <div style="background:linear-gradient(135deg,#0d1540,#1a2472);padding:14px 20px;border-radius:18px 18px 0 0;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="color:white;font-size:15px;font-weight:800">📋 طلب تسوية عهدة</div>
        <div style="color:rgba(255,255,255,.65);font-size:11px">ا. ${escH(_settleEmp.name)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="color:rgba(255,255,255,.75);font-size:11px">تاريخ التسوية:</div>
        <input id="stlDate" type="date" value="${today}"
          style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:white;border-radius:8px;padding:5px 10px;font-family:inherit;font-size:12px" onchange="calcStlTotal()"/>
        <button onclick="document.getElementById('stlModalOv').remove()" style="background:rgba(255,255,255,.15);border:none;width:30px;height:30px;border-radius:7px;color:white;font-size:16px;cursor:pointer">✕</button>
      </div>
    </div>

    <div style="padding:14px 18px;overflow-y:auto;max-height:calc(92vh - 140px)">
      <!-- الرصيد السابق + تمويل العهدة -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="background:#eef1fb;border-radius:10px;padding:10px 14px;border:1.5px solid #b3c4e8">
          <div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:3px">الرصيد السابق</div>
          <div style="font-size:17px;font-weight:800;color:#1a2472">${_stlOpeningBal.toLocaleString('ar-EG',{minimumFractionDigits:2})} ج.م</div>
        </div>
        <div style="background:#fffde7;border-radius:10px;padding:10px 14px;border:2px solid #fde047">
          <div style="font-size:10px;color:#a16207;font-weight:600;margin-bottom:3px">💰 تمويل العهدة</div>
          <input id="stlCustody" type="number" step="0.01" placeholder="0.00" value="${custodyVal}"
            style="font-size:17px;font-weight:800;color:#a16207;border:none;background:transparent;width:100%;font-family:inherit;padding:0" oninput="calcStlTotal()"/>
        </div>
        <div style="background:#f0fdf4;border-radius:10px;padding:10px 14px;border:1.5px solid #86efac">
          <div style="font-size:10px;color:#15803d;font-weight:600;margin-bottom:3px">إجمالي الرصيد قبل التسوية</div>
          <div id="stlSumPreSettle" style="font-size:17px;font-weight:800;color:#15803d">— ج.م</div>
        </div>
      </div>

      <!-- جدول بنود المصروفات -->
      <div style="border:1.5px solid #cbd5e1;border-radius:10px;overflow:hidden;margin-bottom:14px">
        <div style="background:#1e3a5f;color:white;display:grid;grid-template-columns:120px 1fr 1fr 110px 34px">
          <div style="padding:8px 10px;font-size:11px;font-weight:700;border-left:1px solid rgba(255,255,255,.2)">تاريخ المصروف</div>
          <div style="padding:8px 10px;font-size:11px;font-weight:700;border-left:1px solid rgba(255,255,255,.2)">اسم الشركة / العميل</div>
          <div style="padding:8px 10px;font-size:11px;font-weight:700;border-left:1px solid rgba(255,255,255,.2)">بند المصروف</div>
          <div style="padding:8px 10px;font-size:11px;font-weight:700;text-align:center;border-left:1px solid rgba(255,255,255,.2)">ق. المصروف</div>
          <div></div>
        </div>
        <div id="stlItemsList"></div>
        <div style="padding:6px 10px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <button type="button" onclick="addStlItem()" style="background:#1e3a5f;color:white;border:none;border-radius:7px;padding:5px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">+ إضافة بند مصروف</button>
        </div>
      </div>

      <!-- ملخص التسوية -->
      <div style="border:1.5px solid #cbd5e1;border-radius:10px;overflow:hidden;margin-bottom:14px">
        <div style="background:#374151;color:white;padding:8px 14px;font-size:12px;font-weight:700">ملخص التسوية</div>
        ${[
          ['اجمالي المصروفات','stlSumTotal','#dc2626','#fef2f2'],
          ['الرصيد السابق','stlSumPrev','#1a2472','#eef1fb'],
          ['تمويل العهدة','stlSumCust','#a16207','#fffde7'],
          ['اجمالي الرصيد قبل التسوية','stlSumPreSettle2','#15803d','#f0fdf4'],
          ['رد العهدة (اختياري)','stlSumReturn','#7c3aed','#f5f3ff'],
          ['الرصيد الحـالي بعد التسوية','stlSumFinal','#dc2626','#fef2f2'],
        ].map(([lbl,id,color,bg],i)=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 16px;background:${bg};border-top:${i?'1px solid #e2e8f0':'none'}">
          <span style="font-size:13px;font-weight:700;color:${color}">${lbl}</span>
          ${id==='stlSumReturn'
            ? `<input id="${id}" type="number" step="0.01" placeholder="0.00" value="${returnedVal}"
                style="width:140px;padding:5px 10px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;font-weight:700;text-align:center;font-family:inherit;background:white" oninput="calcStlTotal()"/>`
            : `<span id="${id}" style="font-size:14px;font-weight:800;color:${color}">— ج.م</span>`
          }
        </div>`).join('')}
      </div>

      <!-- اضافات خاصة على العميل -->
      <div style="border:1.5px solid #cbd5e1;border-radius:10px;overflow:hidden;margin-bottom:12px">
        <div style="background:#374151;color:white;padding:8px 14px;font-size:12px;font-weight:700">اضافات خاصة على العميل (اختياري)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
          <div style="padding:8px 12px;border-left:1px solid #e2e8f0">
            <label style="display:block;font-size:10px;color:#64748b;margin-bottom:3px">اتعاب الاجراءات</label>
            <input id="stlFeeAmt" class="input" type="number" placeholder="0.00" step="0.01" value="${escH(String(existingData.fee_amount||''))}" style="font-size:12px"/>
          </div>
          <div style="padding:8px 12px">
            <label style="display:block;font-size:10px;color:#64748b;margin-bottom:3px">بند الاتعاب</label>
            <input id="stlFeeDesc" class="input" placeholder="وصف الاتعاب..." value="${escH(existingData.fee_desc||'')}" style="font-size:12px"/>
          </div>
        </div>
      </div>

      <!-- ملاحظات -->
      <div>
        <label style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:4px">ملاحظات</label>
        <input id="stlNotes" class="input" placeholder="ملاحظات إضافية..." value="${escH(existingData.notes||'')}" style="font-size:12px"/>
      </div>
    </div>

    <!-- أزرار -->
    <div style="padding:12px 18px;border-top:1px solid #f1f5f9;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button onclick="document.getElementById('stlModalOv').remove()" style="padding:8px 18px;background:#f1f5f9;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit">إلغاء</button>
      ${isEdit
        ? `<button onclick="saveEditSettlement(${existingData.id})" class="btn btn-primary">💾 حفظ التعديل</button>`
        : `<button onclick="saveSettlement()" class="btn btn-primary">💾 حفظ التسوية</button>`
      }
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if(e.target===ov) ov.remove(); });
  _stlItemCount = 0;
  const items = existingData.expense_items;
  if (items?.length) items.forEach(it => addStlItem(it));
  else { addStlItem(); addStlItem(); }
  calcStlTotal();
  // sync the hidden stlSumPreSettle2 with main one
  const sync = () => {
    const el2 = document.getElementById('stlSumPreSettle2');
    const el1 = document.getElementById('stlSumPreSettle');
    if(el2 && el1) el2.textContent = el1.textContent;
  };
  document.getElementById('stlItemsList')?.addEventListener('input', sync);
  document.getElementById('stlCustody')?.addEventListener('input', sync);
  setTimeout(sync, 50);
}

async function showAddSettlement() {
  if (!_settleEmp) return;
  try {
    const d = await api('GET', `/api/settlements/employees/${encodeURIComponent(_settleEmp.name)}?month=${new Date().getMonth()+1}&year=${new Date().getFullYear()}`);
    _settleEmp.current_balance = d.current_balance ?? 0;
  } catch(e){}
  _stlOpenModal();
}

async function showEditSettlement(id) {
  try {
    const s = await api('GET', `/api/settlements/${id}`);
    _stlOpenModal(s);
  } catch(e) { toast(e.message,'error'); }
}

function _stlBuildPayload(empName) {
  const date     = document.getElementById('stlDate')?.value;
  const custody  = parseFloat(document.getElementById('stlCustody')?.value||0);
  const returned = parseFloat(document.getElementById('stlSumReturn')?.value||0);
  const notes    = document.getElementById('stlNotes')?.value?.trim();
  const feeAmt   = parseFloat(document.getElementById('stlFeeAmt')?.value||0);
  const feeDesc  = document.getElementById('stlFeeDesc')?.value?.trim();
  const expense_items = _stlGetItems();
  return { employee_name: empName, date, expense_items, custody_added: custody, returned_amount: returned,
    notes: [notes, feeDesc?`اتعاب: ${feeDesc} — ${feeAmt} ج.م`:''].filter(Boolean).join(' | ')||null,
    fee_amount: feeAmt||null, fee_desc: feeDesc||null };
}

async function saveEditSettlement(id) {
  const date = document.getElementById('stlDate')?.value;
  if (!date) { toast('اختر التاريخ','error'); return; }
  const items = _stlGetItems();
  if (!items.length) { toast('أضف بند واحد على الأقل','error'); return; }
  const payload = _stlBuildPayload(_settleEmp.name);
  try {
    await api('PUT', `/api/settlements/${id}`, payload);
    document.getElementById('stlModalOv')?.remove();
    toast('تم تحديث التسوية ✅');
    _AC.invalidate('/api/settlements');
    renderEmpSettlements();
  } catch(e) { toast(e.message,'error'); }
}

async function saveSettlement() {
  const date = document.getElementById('stlDate')?.value;
  if (!date) { toast('اختر التاريخ','error'); return; }
  const items = _stlGetItems();
  if (!items.length) { toast('أضف بند واحد على الأقل','error'); return; }
  const payload = _stlBuildPayload(_settleEmp.name);
  try {
    await api('POST', '/api/settlements', payload);
    document.getElementById('stlModalOv')?.remove();
    toast('تم حفظ التسوية ✅');
    _AC.invalidate('/api/settlements');
    renderEmpSettlements();
  } catch(e) { toast(e.message,'error'); }
}

async function deleteSettlement(id) {
  if (!await confirmDlg('حذف هذه التسوية؟')) return;
  try {
    await api('DELETE', `/api/settlements/${id}`);
    toast('تم حذف التسوية ✅');
    _AC.invalidate('/api/settlements');
    await renderEmpSettlements();
  } catch(e) { toast(e.message,'error'); }
}

function printSettlement(s) {
  const items = s.expense_items || [];
  const total = s.total_spent || items.reduce((x,i)=>x+(i.amount||0),0);
  const prevBal = s.opening_balance || 0;
  const custody = s.custody_added || 0;
  const returned = s.returned_amount || 0;
  const preTot = prevBal + custody;
  const final = preTot - total - returned;
  const fmtNum = v => Number(v).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
  const dateStr = s.date ? new Date(s.date+'T00:00:00').toLocaleDateString('ar-EG',{year:'numeric',month:'2-digit',day:'2-digit'}) : '';
  const rows = items.map(it=>`
    <tr>
      <td>${it.expense_date||s.date||''}</td>
      <td style="text-align:right">${escH(it.client_name||'—')}</td>
      <td style="text-align:right">${escH(it.description||'—')}</td>
      <td style="text-align:center;font-weight:700">ج.م. ${fmtNum(it.amount||0)}</td>
    </tr>`).join('');
  const blankRows = Math.max(0, 8 - items.length);
  const blank = Array(blankRows).fill('<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>').join('');
  const w = window.open('','_blank','width=800,height=700');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/>
  <style>
    *{font-family:'Cairo',Tahoma,sans-serif;box-sizing:border-box}
    body{margin:20px;font-size:12px;color:#000}
    h2{text-align:center;font-size:16px;margin:0 0 6px}
    .sub{text-align:center;font-size:11px;color:#333;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #000;padding:5px 8px;text-align:center}
    th{background:#1a2472;color:white;font-weight:700}
    .sum-row td{font-weight:700}
    .yellow{background:#fffde7}
    .gray{background:#f0f0f0}
    .footer-row td{border:1px solid #000;padding:10px 8px;text-align:center;font-weight:700}
    @media print{body{margin:10px}}
  </style></head><body>
  <h2>طلب تسوية عهدة</h2>
  <div class="sub">تاريخ التسوية: ${dateStr} &nbsp;&nbsp;&nbsp; ا. ${escH(s.employee_name||_settleEmp?.name||'')}</div>
  <table>
    <thead><tr>
      <th style="width:14%">تاريخ المصروف</th>
      <th style="width:30%">اسم الشركة / العميل</th>
      <th style="width:30%">بند المصروف</th>
      <th style="width:26%">ق. المصروف</th>
    </tr></thead>
    <tbody>${rows}${blank}</tbody>
    <tbody>
      <tr class="sum-row"><td colspan="3" style="text-align:right">اجمالي المصروفات</td><td>ج.م. ${fmtNum(total)}</td></tr>
      <tr class="sum-row"><td colspan="3" style="text-align:right">الرصيد السابق</td><td>ج.م. ${fmtNum(prevBal)}</td></tr>
      <tr class="sum-row yellow"><td colspan="3" style="text-align:right">تمويل العهدة</td><td>ج.م. ${fmtNum(custody)}</td></tr>
      <tr class="sum-row"><td colspan="3" style="text-align:right">اجمالي الرصيد القبل التسوية</td><td>ج.م. ${fmtNum(preTot)}</td></tr>
      <tr class="sum-row gray"><td colspan="3" style="text-align:right">رد العهدة</td><td>ج.م. ${fmtNum(returned)}</td></tr>
      <tr class="sum-row" style="background:${final<0?'#fee2e2':'#f0fdf4'}"><td colspan="3" style="text-align:right">الرصيد الحـالي بعد التسوية</td><td style="color:${final<0?'red':'green'}">ج.م. ${fmtNum(final)}</td></tr>
    </tbody>
  </table>
  ${s.fee_amount||s.notes ? `
  <table style="margin-top:10px">
    <tr><th colspan="4">اضافات خاصة على العميل</th></tr>
    <tr><td colspan="2" style="text-align:right">اتعاب الاجراءات</td><td colspan="2" style="text-align:right">بند الاتعاب</td></tr>
    <tr><td colspan="2">${fmtNum(s.fee_amount||0)} ج.م</td><td colspan="2">${escH(s.fee_desc||s.notes||'')}</td></tr>
  </table>` : ''}
  <table style="margin-top:14px">
    <tr class="footer-row"><td style="width:33%">مستلم العهدة</td><td style="width:33%">المراجعة</td><td style="width:33%">الادارة</td></tr>
    <tr style="height:50px"><td></td><td></td><td></td></tr>
  </table>
  <script>setTimeout(()=>{window.print();window.close();},300);<\/script>
  </body></html>`);
  w.document.close();
}

async function resetEmployeeBalance(empName) {
  if (!await confirmDlg(
    `سيتم حذف جميع تسويات "${empName}" وتصفير الرصيد.\nسيبقى اسم الموظف موجوداً.`,
    'تصفير رصيد الموظف', 'تصفير', true
  )) return;
  try {
    await api('POST', `/api/settlements/employees/${encodeURIComponent(empName)}/reset`);
    toast(`تم تصفير رصيد ${empName} ✅`);
    _AC.invalidate('/api/settlements');
    // بعد التصفير مباشرة: اسأل عن الرصيد المرحل من الشهر السابق
    showSetOpeningBalance(empName);
  } catch(e) { toast(e.message,'error'); }
}

function showSetOpeningBalance(empName) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
  <div class="modal" style="max-width:420px">
    <div style="padding:22px 24px 0">
      <div style="font-size:28px;text-align:center;margin-bottom:8px">💼</div>
      <h3 style="font-size:16px;font-weight:800;color:#1e293b;text-align:center;margin:0 0 6px">رصيد ${escH(empName)} المرحّل</h3>
      <p style="font-size:13px;color:#64748b;text-align:center;margin:0 0 20px">
        ادخل الرصيد المتبقي من الشهر السابق — سيكون هذا الرصيد الافتتاحي لكل تسوية جديدة
      </p>
      <div class="form-group">
        <label class="label">الرصيد المرحّل (ج.م.)</label>
        <input id="openingBalInput" class="input" type="number" placeholder="0" step="0.01" style="font-size:18px;font-weight:800;text-align:center">
      </div>
      <p style="font-size:12px;color:#94a3b8;margin:8px 0 20px;text-align:center">
        💡 كل تسوية جديدة ستأخذ الرصيد المتبقي تلقائياً كرصيد افتتاحي
      </p>
    </div>
    <div style="padding:0 24px 22px;display:flex;gap:10px">
      <button onclick="saveOpeningBalance('${escH(empName)}')" class="btn btn-primary" style="flex:1">✅ حفظ الرصيد</button>
      <button onclick="this.closest('.modal-overlay').remove();loadSettlements(true)" style="flex:1;padding:10px;background:#f1f5f9;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-family:inherit">تخطي (ابدأ من صفر)</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); loadSettlements(true); } };
  setTimeout(() => document.getElementById('openingBalInput')?.focus(), 100);
}

async function saveOpeningBalance(empName) {
  const amount = parseFloat(document.getElementById('openingBalInput')?.value || '0');
  if (isNaN(amount) || amount < 0) { toast('ادخل قيمة صحيحة', 'error'); return; }
  try {
    await api('PATCH', `/api/settlements/employees/${encodeURIComponent(empName)}/balance`, {
      employee_name: empName, amount, notes: 'رصيد مرحّل'
    });
    toast(`✅ تم ضبط الرصيد المرحّل: ${amount.toLocaleString('ar-EG')} ج.م.`);
    document.querySelector('.modal-overlay')?.remove();
    _AC.invalidate('/api/settlements');
    loadSettlements(true);
  } catch(e) { toast(e.message, 'error'); }
}

// ════════════════════════════════════════════════════════════════════════════
// ══  جدول المواعيد  ════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════

let _apptFilter = 'all';

async function loadAppointments() {
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  await renderAppointments();
}

async function renderAppointments() {
  const main = document.getElementById('main');
  try {
    const allAppts = await api('GET', '/api/appointments');
    const today = new Date().toISOString().split('T')[0];
    const appts = _apptFilter === 'upcoming'
      ? allAppts.filter(a => a.appt_date >= today && a.status !== 'cancelled' && a.status !== 'done')
      : _apptFilter === 'all'
      ? allAppts
      : allAppts.filter(a => a.status === _apptFilter);

    const statusBadge = (s) => {
      const m = {pending:{l:'قيد الانتظار',c:'#d97706',bg:'#fef9c3'},confirmed:{l:'مؤكد',c:'#15803d',bg:'#dcfce7'},done:{l:'منتهي',c:'#64748b',bg:'#f1f5f9'},cancelled:{l:'ملغى',c:'#dc2626',bg:'#fee2e2'}};
      const x = m[s]||{l:s,c:'#64748b',bg:'#f1f5f9'};
      return `<span style="background:${x.bg};color:${x.c};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${x.l}</span>`;
    };

    const filterTabs = [
      {id:'all',      label:'الكل'},
      {id:'upcoming', label:'القادمة 🔜'},
      {id:'pending',  label:'قيد الانتظار'},
      {id:'confirmed',label:'مؤكدة ✅'},
      {id:'done',     label:'منتهية'},
    ];

    main.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px">
      <div>
        <h2 style="font-size:18px;font-weight:800;color:#1e293b;margin:0">📅 جدول المواعيد</h2>
        <p style="font-size:13px;color:#64748b;margin:4px 0 0">${appts.length} موعد</p>
      </div>
      <button onclick="showAddAppointment()" class="btn btn-primary" style="font-size:13px">➕ موعد جديد</button>
    </div>

    <!-- Filter tabs -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px">
      ${filterTabs.map(f=>`
      <button onclick="setApptFilter('${f.id}')"
        style="padding:7px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid ${_apptFilter===f.id?'#1a2472':'#e2e8f0'};background:${_apptFilter===f.id?'#1a2472':'white'};color:${_apptFilter===f.id?'white':'#64748b'}">
        ${f.label}
      </button>`).join('')}
    </div>

    <!-- قائمة المواعيد -->
    ${appts.length === 0 ? `
    <div style="text-align:center;padding:60px;color:#94a3b8;background:white;border-radius:16px;border:1.5px solid #e8edf3">
      <div style="font-size:48px;margin-bottom:12px">📅</div>
      <div style="font-size:16px;font-weight:600">لا توجد مواعيد</div>
      <div style="font-size:13px;margin-top:6px">اضغط "موعد جديد" لإضافة موعد</div>
    </div>` : `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${appts.map(a=>`
      <div style="background:white;border-radius:14px;padding:18px 20px;border:1.5px solid #e8edf3;box-shadow:0 1px 6px rgba(0,0,0,.04);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="display:flex;gap:14px;align-items:flex-start;flex:1;min-width:200px">
          <div style="background:#eef1fb;border-radius:12px;padding:10px 14px;text-align:center;flex-shrink:0;min-width:52px">
            <div style="font-size:20px;font-weight:800;color:#1a2472;line-height:1">${new Date(a.appt_date+'T00:00:00').getDate()}</div>
            <div style="font-size:10px;color:#64748b;font-weight:600">${['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][new Date(a.appt_date+'T00:00:00').getMonth()]}</div>
          </div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:14px;font-weight:700;color:#1e293b">${escH(a.title)}</span>
              ${statusBadge(a.status)}
            </div>
            ${a.client_name ? `<div style="font-size:12px;color:#1a2472;margin-top:4px;font-weight:600">👤 ${escH(a.client_name)}</div>` : ''}
            <div style="display:flex;gap:16px;margin-top:6px;flex-wrap:wrap">
              ${a.appt_time?`<span style="font-size:12px;color:#64748b">🕐 ${a.appt_time}</span>`:''}
              ${a.location  ?`<span style="font-size:12px;color:#64748b">📍 ${escH(a.location)}</span>`:''}
              ${a.employee_name?`<span style="font-size:12px;color:#64748b">👷 ${escH(a.employee_name)}</span>`:''}
            </div>
            ${a.description?`<div style="font-size:12px;color:#94a3b8;margin-top:4px">${escH(a.description)}</div>`:''}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
          ${a.status==='pending'   ?`<button onclick="updateApptStatus(${a.id},'confirmed')" style="padding:5px 12px;background:#dcfce7;color:#15803d;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer">✅ تأكيد</button>`:''}
          ${a.status!=='done'&&a.status!=='cancelled'?`<button onclick="updateApptStatus(${a.id},'done')" style="padding:5px 12px;background:#f1f5f9;color:#475569;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer">✓ منتهي</button>`:''}
          <button onclick="deleteAppt(${a.id})" style="padding:5px 10px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer">🗑️</button>
        </div>
      </div>`).join('')}
    </div>`}`;
  } catch(e) {
    main.innerHTML = `<div style="color:#dc2626;padding:20px">❌ ${escH(e.message)}</div>`;
  }
}

async function showAddAppointment() {
  let clients = [];
  try { clients=await getClients(); } catch(e){}
  const today = new Date().toISOString().split('T')[0];
  const html = `
  <div id="modal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto">
    <div style="background:white;border-radius:20px;padding:28px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,.2);margin:auto">
      <h3 style="margin:0 0 20px;font-size:16px;font-weight:800;color:#1e293b">📅 موعد جديد</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group" style="grid-column:1/-1">
          <label class="label">عنوان الموعد *</label>
          <input id="apptTitle" class="input" placeholder="مثال: اجتماع ميزانية سنوية">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="label">العميل</label>
          <select id="apptClient" class="input">
            <option value="">-- بدون عميل --</option>
            ${(Array.isArray(clients)?clients:clients.clients||[]).map(c=>`<option value="${c.id}">${escH(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="label">التاريخ *</label>
          <input id="apptDate" class="input" type="date" value="${today}">
        </div>
        <div class="form-group">
          <label class="label">الوقت</label>
          <input id="apptTime" class="input" type="time">
        </div>
        <div class="form-group">
          <label class="label">المسؤول</label>
          <input id="apptEmp" class="input" placeholder="اسم الموظف">
        </div>
        <div class="form-group">
          <label class="label">المكان</label>
          <input id="apptLoc" class="input" placeholder="مثال: المكتب الرئيسي">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="label">تفاصيل</label>
          <textarea id="apptDesc" class="input" rows="2" placeholder="تفاصيل الموعد..."></textarea>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button onclick="saveAppointment()" class="btn btn-primary" style="flex:1">💾 حفظ</button>
        <button onclick="closeModal()" style="flex:1;padding:10px;background:#f1f5f9;border:none;border-radius:10px;cursor:pointer;font-weight:600">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function saveAppointment() {
  const title    = document.getElementById('apptTitle')?.value?.trim();
  const clientEl = document.getElementById('apptClient');
  const clientId = clientEl?.value;
  const clientName = clientId ? clientEl.options[clientEl.selectedIndex]?.text : null;
  const date     = document.getElementById('apptDate')?.value;
  const time     = document.getElementById('apptTime')?.value;
  const emp      = document.getElementById('apptEmp')?.value?.trim();
  const loc      = document.getElementById('apptLoc')?.value?.trim();
  const desc     = document.getElementById('apptDesc')?.value?.trim();
  if (!title||!date) { toast('ادخل العنوان والتاريخ','error'); return; }
  try {
    await api('POST', '/api/appointments', {title, client_id:clientId?+clientId:null, client_name:clientName||null, appt_date:date, appt_time:time||null, employee_name:emp||null, location:loc||null, description:desc||null});
    closeModal();
    renderAppointments();
  } catch(e) { toast(e.message,'error'); }
}

async function updateApptStatus(id, status) {
  try {
    await api('PATCH', `/api/appointments/${id}/status`, {status});
    renderAppointments();
  } catch(e) { toast(e.message,'error'); }
}

async function deleteAppt(id) {
  if (!await confirmDlg('حذف هذا الموعد؟')) return;
  try {
    await api('DELETE', `/api/appointments/${id}`);
    renderAppointments();
  } catch(e) { toast(e.message,'error'); }
}

// ════════════════════════════════════════════════════════════════════════════
// ══  الأوراق الحكومية  ═════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════

let _papersSearch = '';
let _papersStatus = '';

async function loadGovernmentPapers() {
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  await renderGovernmentPapers();
}

async function renderGovernmentPapers() {
  const main = document.getElementById('main');
  try {
    const [allPapers, alertsRaw] = await Promise.all([
      api('GET', `/api/government-papers${_papersStatus?`?status=${_papersStatus}`:''}`),
      api('GET', '/api/government-papers/alerts'),
    ]);
    // client-side search filter
    const papers = _papersSearch
      ? allPapers.filter(p=>(p.client_name||'').toLowerCase().includes(_papersSearch.toLowerCase())||(p.paper_type||'').includes(_papersSearch))
      : allPapers;
    // alerts: backend returns {expired:[], expiring_soon:[]}
    const alerts = [
      ...(alertsRaw.expired||[]).map(a=>({...a, days_to_expiry:a.days_left})),
      ...(alertsRaw.expiring_soon||[]).map(a=>({...a, days_to_expiry:a.days_left})),
    ].sort((a,b)=>(a.days_to_expiry||0)-(b.days_to_expiry||0));

    const paperTypes = ['بطاقة ضريبية','سجل تجاري','شهادة ض.ق.م','بطاقة رقم قومي','عقد إيجار','ترخيص تجاري','بيان قيد','ختم الشركة','توكيل رسمي','عقد شركة','شهادة استثمار','أخرى'];

    const statusInfo = (s) => {
      const m = {active:{l:'سارية',c:'#15803d',bg:'#dcfce7',icon:'✅'},expired:{l:'منتهية',c:'#dc2626',bg:'#fee2e2',icon:'❌'},expiring_soon:{l:'تنتهي قريباً',c:'#d97706',bg:'#fef9c3',icon:'⚠️'},pending_renewal:{l:'قيد التجديد',c:'#7c3aed',bg:'#f5f3ff',icon:'🔄'},cancelled:{l:'ملغاة',c:'#94a3b8',bg:'#f1f5f9',icon:'⛔'}};
      const x = m[s]||{l:s,c:'#64748b',bg:'#f1f5f9',icon:'📄'};
      return `<span style="background:${x.bg};color:${x.c};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${x.icon} ${x.l}</span>`;
    };

    const filterTabs = [
      {id:'',               label:'الكل'},
      {id:'expiring_soon',  label:'⚠️ تنتهي قريباً'},
      {id:'expired',        label:'❌ منتهية'},
      {id:'active',         label:'✅ سارية'},
      {id:'pending_renewal',label:'🔄 قيد التجديد'},
    ];

    main.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px">
      <div>
        <h2 style="font-size:18px;font-weight:800;color:#1e293b;margin:0">📄 الأوراق الحكومية</h2>
        <p style="font-size:13px;color:#64748b;margin:4px 0 0">تتبع وثائق العملاء وتواريخ الانتهاء</p>
      </div>
      <button onclick="showAddPaper()" class="btn btn-primary" style="font-size:13px">➕ إضافة ورقة</button>
    </div>

    <!-- تنبيهات الانتهاء -->
    ${alerts.length > 0 ? `
    <div style="background:#fef9c3;border:1.5px solid #fbbf24;border-radius:14px;padding:14px 18px;margin-bottom:18px">
      <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:8px">⚠️ ${alerts.length} ورقة تحتاج انتباهاً</div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${alerts.slice(0,5).map(a=>`
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
          <span style="color:#92400e"><strong>${escH(a.client_name)}</strong> — ${escH(a.paper_type)}</span>
          <span style="color:${a.days_to_expiry<0?'#dc2626':'#d97706'};font-weight:700">${a.days_to_expiry<0?'منتهية منذ '+Math.abs(a.days_to_expiry)+' يوم':'تنتهي خلال '+a.days_to_expiry+' يوم'}</span>
        </div>`).join('')}
        ${alerts.length>5?`<div style="font-size:11px;color:#92400e;margin-top:4px">+ ${alerts.length-5} أخرى...</div>`:''}
      </div>
    </div>` : ''}

    <!-- بحث وفلترة -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
      <input value="${escH(_papersSearch)}" oninput="_papersSearch=this.value;renderGovernmentPapers()"
        class="input" placeholder="🔍 بحث باسم العميل أو نوع الورقة..." style="max-width:280px">
      ${filterTabs.map(f=>`
      <button onclick="setPapersStatus('${f.id}')"
        style="padding:7px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid ${_papersStatus===f.id?'#1a2472':'#e2e8f0'};background:${_papersStatus===f.id?'#1a2472':'white'};color:${_papersStatus===f.id?'white':'#64748b'}">
        ${f.label}
      </button>`).join('')}
    </div>

    <!-- الجدول -->
    ${papers.length === 0 ? `
    <div style="text-align:center;padding:60px;color:#94a3b8;background:white;border-radius:16px;border:1.5px solid #e8edf3">
      <div style="font-size:48px;margin-bottom:12px">📄</div>
      <div style="font-size:16px;font-weight:600">لا توجد أوراق</div>
    </div>` : `
    <div style="background:white;border-radius:14px;border:1.5px solid #e8edf3;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:11px 14px;text-align:right;color:#64748b;font-weight:600">العميل</th>
              <th style="padding:11px 14px;text-align:right;color:#64748b;font-weight:600">نوع الورقة</th>
              <th style="padding:11px 14px;text-align:center;color:#64748b;font-weight:600">الرقم</th>
              <th style="padding:11px 14px;text-align:center;color:#64748b;font-weight:600">تاريخ الإصدار</th>
              <th style="padding:11px 14px;text-align:center;color:#64748b;font-weight:600">تاريخ الانتهاء</th>
              <th style="padding:11px 14px;text-align:center;color:#64748b;font-weight:600">الحالة</th>
              <th style="padding:11px 14px;text-align:center;color:#64748b;font-weight:600">نسخة</th>
              <th style="padding:11px 14px;text-align:center;color:#64748b;font-weight:600"></th>
            </tr>
          </thead>
          <tbody>
            ${papers.map((p,idx)=>{
              const daysLeft = p.days_left ?? (p.expiry_date ? Math.ceil((new Date(p.expiry_date+'T00:00:00')-new Date())/(86400000)) : null);
              const rowBg = p.status==='expired'?'#fff5f5':p.status==='expiring_soon'?'#fffbeb':'';
              return `
              <tr style="border-top:1px solid #f1f5f9;background:${rowBg}">
                <td style="padding:10px 14px;font-weight:600;color:#1e293b">${escH(p.client_name||'—')}</td>
                <td style="padding:10px 14px;color:#475569">${escH(p.paper_type)}</td>
                <td style="padding:10px 14px;text-align:center;color:#64748b;font-size:12px">${escH(p.paper_number||'—')}</td>
                <td style="padding:10px 14px;text-align:center;color:#64748b;font-size:12px">${p.issue_date?dateAr(p.issue_date):'—'}</td>
                <td style="padding:10px 14px;text-align:center">
                  <div style="font-size:12px;color:${daysLeft!==null&&daysLeft<30?'#dc2626':'#475569'};font-weight:${daysLeft!==null&&daysLeft<30?'700':'400'}">${p.expiry_date?dateAr(p.expiry_date):'—'}</div>
                  ${daysLeft!==null?`<div style="font-size:10px;color:${daysLeft<0?'#dc2626':daysLeft<30?'#d97706':'#94a3b8'}">${daysLeft<0?'منتهية منذ '+Math.abs(daysLeft)+' يوم':daysLeft===0?'اليوم':'بعد '+daysLeft+' يوم'}</div>`:''}
                </td>
                <td style="padding:10px 14px;text-align:center">${statusInfo(p.status)}</td>
                <td style="padding:10px 14px;text-align:center">
                  <span style="background:${p.has_copy?'#dcfce7':'#fee2e2'};color:${p.has_copy?'#15803d':'#dc2626'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${p.has_copy?'✅ موجودة':'❌ غير موجودة'}</span>
                </td>
                <td style="padding:10px 14px;text-align:center">
                  <div style="display:flex;gap:4px;justify-content:center">
                    <button onclick="showEditPaper(${p.id})" title="تعديل"
                      style="background:#eef1fb;border:none;border-radius:6px;color:#1a2472;cursor:pointer;font-size:12px;padding:5px 9px">✏️</button>
                    <button onclick="deletePaper(${p.id})" title="حذف"
                      style="background:#fee2e2;border:none;border-radius:6px;color:#dc2626;cursor:pointer;font-size:12px;padding:5px 9px">🗑️</button>
                  </div>
                </td>
              </tr>`;}).join('')}
          </tbody>
        </table>
      </div>
    </div>`}`;
  } catch(e) {
    main.innerHTML = `<div style="color:#dc2626;padding:20px">❌ ${escH(e.message)}</div>`;
  }
}

async function showAddPaper(existingPaper) {
  let clients = [];
  try { clients=await getClients(); } catch(e){}
  const clientArr = Array.isArray(clients)?clients:clients.clients||[];
  const paperTypes = ['بطاقة ضريبية','سجل تجاري','شهادة ض.ق.م','بطاقة رقم قومي','عقد إيجار','ترخيص تجاري','بيان قيد','ختم الشركة','توكيل رسمي','عقد شركة','شهادة استثمار','أخرى'];
  const p = existingPaper || {};
  const isEdit = !!p.id;

  const html = `
  <div id="modal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto">
    <div style="background:white;border-radius:20px;padding:28px;width:100%;max-width:520px;box-shadow:0 20px 60px rgba(0,0,0,.2);margin:auto">
      <h3 style="margin:0 0 20px;font-size:16px;font-weight:800;color:#1e293b">${isEdit?'✏️ تعديل':'📄 إضافة'} ورقة حكومية</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group" style="grid-column:1/-1">
          <label class="label">العميل *</label>
          <select id="paperClient" class="input">
            <option value="">-- اختر العميل --</option>
            ${clientArr.map(c=>`<option value="${c.id}" ${p.client_id===c.id?'selected':''}>${escH(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="label">نوع الورقة *</label>
          <select id="paperType" class="input">
            ${paperTypes.map(t=>`<option ${p.paper_type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="label">رقم الورقة / كود</label>
          <input id="paperNum" class="input" placeholder="رقم التسجيل أو الكود" value="${escH(p.paper_number||'')}">
        </div>
        <div class="form-group">
          <label class="label">الحالة</label>
          <select id="paperStatus" class="input">
            <option value="active"           ${p.status==='active'?'selected':''}>✅ سارية</option>
            <option value="expired"          ${p.status==='expired'?'selected':''}>❌ منتهية</option>
            <option value="expiring_soon"    ${p.status==='expiring_soon'?'selected':''}>⚠️ تنتهي قريباً</option>
            <option value="pending_renewal"  ${p.status==='pending_renewal'?'selected':''}>🔄 قيد التجديد</option>
            <option value="cancelled"        ${p.status==='cancelled'?'selected':''}>⛔ ملغاة</option>
          </select>
        </div>
        <div class="form-group">
          <label class="label">تاريخ الإصدار</label>
          <input id="paperIssue" class="input" type="date" value="${p.issue_date||''}">
        </div>
        <div class="form-group">
          <label class="label">تاريخ الانتهاء</label>
          <input id="paperExpiry" class="input" type="date" value="${p.expiry_date||''}">
        </div>
        <div class="form-group" style="grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:12px;background:#f8fafc;border-radius:10px;border:1.5px solid #e2e8f0">
          <input id="paperHasCopy" type="checkbox" ${p.has_copy?'checked':''} style="width:18px;height:18px;accent-color:#1a2472">
          <label for="paperHasCopy" style="cursor:pointer;font-size:13px;font-weight:600;color:#1e293b">عندنا نسخة من الورقة</label>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="label">ملاحظات</label>
          <textarea id="paperNotes" class="input" rows="2" placeholder="ملاحظات...">${escH(p.notes||'')}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button onclick="savePaper(${p.id||'null'})" class="btn btn-primary" style="flex:1">💾 حفظ</button>
        <button onclick="closeModal()" style="flex:1;padding:10px;background:#f1f5f9;border:none;border-radius:10px;cursor:pointer;font-weight:600">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function showEditPaper(id) {
  try {
    const papers = await api('GET', '/api/government-papers');
    const p = papers.find(x=>x.id===id);
    if (p) showAddPaper(p);
  } catch(e) { toast(e.message,'error'); }
}

async function savePaper(existingId) {
  const clientId  = document.getElementById('paperClient')?.value;
  const paperType = document.getElementById('paperType')?.value;
  const paperNum  = document.getElementById('paperNum')?.value?.trim();
  const status    = document.getElementById('paperStatus')?.value;
  const issue     = document.getElementById('paperIssue')?.value;
  const expiry    = document.getElementById('paperExpiry')?.value;
  const hasCopy   = document.getElementById('paperHasCopy')?.checked;
  const notes     = document.getElementById('paperNotes')?.value?.trim();
  if (!clientId) { toast('اختر العميل','error'); return; }
  const clientEl2 = document.getElementById('paperClient');
  const clientNameVal = clientEl2?.options[clientEl2.selectedIndex]?.text || null;
  const body = {client_id:+clientId, client_name:clientNameVal, paper_type:paperType, paper_number:paperNum||null, status, issue_date:issue||null, expiry_date:expiry||null, has_copy:hasCopy, notes:notes||null};
  try {
    if (existingId && existingId !== 'null') {
      await api('PUT', `/api/government-papers/${existingId}`, body);
    } else {
      await api('POST', '/api/government-papers', body);
    }
    closeModal();
    renderGovernmentPapers();
  } catch(e) { toast(e.message,'error'); }
}

async function deletePaper(id) {
  if (!await confirmDlg('حذف هذه الورقة؟')) return;
  try {
    await api('DELETE', `/api/government-papers/${id}`);
    renderGovernmentPapers();
  } catch(e) { toast(e.message,'error'); }
}

window.openClientAccounting = openClientAccounting;
window.switchAccTab = switchAccTab;
window.accRender = accRender;
window.accInstallDefaults = accInstallDefaults;
window.accImportExcel = accImportExcel;
window.showAddTransaction = showAddTransaction;
window.confirmImportExcel = confirmImportExcel;
window.showImportPreview = showImportPreview;
window.undoLastImport = undoLastImport;
window.accImportInvoice = accImportInvoice;
window.showInvoicePreview = showInvoicePreview;
window.confirmInvoiceImport = confirmInvoiceImport;
window.saveAccTransaction = saveAccTransaction;
window.deleteAccTx = deleteAccTx;
window.calcTxTotals = calcTxTotals;
window.showEditTransaction = showEditTransaction;
window.saveEditTransaction = saveEditTransaction;
window.calcEditTxTotals = calcEditTxTotals;
window.showAddJournalEntry = showAddJournalEntry;
window.addJeLine = addJeLine;
window.calcJeBalance = calcJeBalance;
window.saveManualJE = saveManualJE;
window.showJournalDetail = showJournalDetail;
window.postJournalEntry = postJournalEntry;
window.copyJournalEntry = copyJournalEntry;
window.reverseJournalEntry = reverseJournalEntry;
window.deleteJournalEntry = deleteJournalEntry;
// ETA exports
window.accETA = accETA;
window.switchEtaTab = switchEtaTab;
window.etaSaveCredential = etaSaveCredential;
window.etaTestConnection = etaTestConnection;
window.etaDeleteCredential = etaDeleteCredential;
window.etaSync = etaSync;
window.etaOpenSettings = etaOpenSettings;
// ERP Phase 1 exports
window.accGeneralLedger = accGeneralLedger;
window.accTreasury = accTreasury;
window.accChecks = accChecks;
window.accAdvances = accAdvances;
window.accArAp = accArAp;
window.accCashFlow = accCashFlow;
window.showAddTreasury = showAddTreasury;
window.saveTreasury = saveTreasury;
window.showTreasuryTxs = showTreasuryTxs;
window.showAddTreasuryTx = showAddTreasuryTx;
window.saveTreasuryTx = saveTreasuryTx;
window.deleteTreasuryTx = deleteTreasuryTx;
window.showAddCheck = showAddCheck;
window.saveCheck = saveCheck;
window.updateCheckStatus = updateCheckStatus;
window.deleteCheck = deleteCheck;
window.showAddAdvance = showAddAdvance;
window.saveAdvance = saveAdvance;
window.showSettleAdvance = showSettleAdvance;
window.confirmSettleAdvance = confirmSettleAdvance;
window.deleteAdvance = deleteAdvance;
// Settlements
window.loadSettlements = loadSettlements;
window.renderSettlementsList = renderSettlementsList;
window.openEmployeeSettlements = openEmployeeSettlements;
window.renderEmpSettlements = renderEmpSettlements;
window.showAddEmployee = showAddEmployee;
window.saveNewEmployee = saveNewEmployee;
window.showCustodyTopup = showCustodyTopup;
window.saveCustodyTopup = saveCustodyTopup;
window.showAddSettlement = showAddSettlement;
window.showEditSettlement = showEditSettlement;
window.saveEditSettlement = saveEditSettlement;
window.addStlItem = addStlItem;
window.removeStlItem = removeStlItem;
window.calcStlTotal = calcStlTotal;
window.saveSettlement = saveSettlement;
window.deleteSettlement = deleteSettlement;
window.deleteCustodyTopup = deleteCustodyTopup;
window.showEditCustodyTopup = showEditCustodyTopup;
window.saveEditCustodyTopup = saveEditCustodyTopup;
window.resetEmployeeBalance = resetEmployeeBalance;
window.showSetOpeningBalance = showSetOpeningBalance;
window.saveOpeningBalance = saveOpeningBalance;
window.switchSettleView = switchSettleView;
window._refreshDailyView = _refreshDailyView;
window._refreshMonthlyView = _refreshMonthlyView;
// Appointments
window.loadAppointments = loadAppointments;
window.renderAppointments = renderAppointments;
window.showAddAppointment = showAddAppointment;
window.saveAppointment = saveAppointment;
window.updateApptStatus = updateApptStatus;
window.deleteAppt = deleteAppt;
// Government Papers
window.loadGovernmentPapers = loadGovernmentPapers;
window.renderGovernmentPapers = renderGovernmentPapers;
window.showAddPaper = showAddPaper;
window.showEditPaper = showEditPaper;
window.savePaper = savePaper;
window.deletePaper = deletePaper;

// ═══════════════════════════════════════════════════════════════════
// ██████╗  █████╗ ██╗   ██╗██████╗  ██████╗ ██╗     ██╗
// ██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██╔═══██╗██║     ██║
// ██████╔╝███████║ ╚████╔╝ ██████╔╝██║   ██║██║     ██║
// ██╔═══╝ ██╔══██║  ╚██╔╝  ██╔══██╗██║   ██║██║     ██║
// ██║     ██║  ██║   ██║   ██║  ██║╚██████╔╝███████╗███████╗
// ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝
// SECTION: الرواتب والموظفين — Payroll & HR
// ═══════════════════════════════════════════════════════════════════

let _payrollView = 'employees'; // employees | runs
let _payrollEmployees = [];
let _payrollRuns = [];

async function loadPayroll(silent=false) {
  const main = document.getElementById('main');
  main.innerHTML = `
  <div class="page">
    <div class="print-header"><span>MS Accounting</span><span>الرواتب والموظفين</span><span>${new Date().toLocaleDateString('ar-EG')}</span></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <h2>👔 الرواتب والموظفين</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div style="background:#f1f5f9;border-radius:10px;padding:3px;display:flex">
          <button onclick="switchPayrollView('employees')" id="pvEmp" style="padding:6px 14px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;background:#1a2472;color:white">👥 الموظفين</button>
          <button onclick="switchPayrollView('runs')" id="pvRun" style="padding:6px 14px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;background:none;color:#64748b">📋 مسيرات الرواتب</button>
        </div>
        <button class="btn btn-primary" onclick="showAddEmployee2()" id="payrollAddBtn">➕ موظف جديد</button>
        <button class="btn btn-secondary no-print" onclick="exportTableExcel('payrollTable','رواتب')">📥 Excel</button>
      </div>
    </div>
    <div id="payrollStats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px"></div>
    <div id="payrollContent"></div>
  </div>`;
  await loadPayrollStats();
  await switchPayrollView('employees');
}

async function loadPayrollStats() {
  try {
    const s = await api('GET', '/api/payroll/stats');
    document.getElementById('payrollStats').innerHTML = `
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:24px;font-weight:800;color:#1a2472">${s.total_employees}</div>
        <div style="font-size:12px;color:#64748b">موظف نشط</div>
      </div>
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:24px;font-weight:800;color:#16a34a">${fmtMoney(s.total_base_salary)}</div>
        <div style="font-size:12px;color:#64748b">إجمالي الرواتب الأساسية</div>
      </div>
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:#7c3aed">${s.last_run ? `${s.last_run.month}/${s.last_run.year}` : '—'}</div>
        <div style="font-size:12px;color:#64748b">آخر مسير</div>
      </div>`;
  } catch(e) {}
}

async function switchPayrollView(view) {
  _payrollView = view;
  document.getElementById('pvEmp').style.cssText = view==='employees' ? 'padding:6px 14px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;background:#1a2472;color:white' : 'padding:6px 14px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;background:none;color:#64748b';
  document.getElementById('pvRun').style.cssText = view==='runs' ? 'padding:6px 14px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;background:#1a2472;color:white' : 'padding:6px 14px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;background:none;color:#64748b';
  const addBtn = document.getElementById('payrollAddBtn');
  if (view === 'employees') {
    addBtn.textContent = '➕ موظف جديد';
    addBtn.onclick = showAddEmployee2;
    await renderEmployeeList();
  } else {
    addBtn.textContent = '➕ مسير جديد';
    addBtn.onclick = showAddPayrollRun;
    await renderPayrollRuns();
  }
}

async function renderEmployeeList() {
  const content = document.getElementById('payrollContent');
  content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    _payrollEmployees = await api('GET', '/api/payroll/employees');
    if (!_payrollEmployees.length) {
      content.innerHTML = '<div class="empty-state">👔 لا يوجد موظفون مضافون</div>';
      return;
    }
    content.innerHTML = `
    <div class="card">
      <table id="payrollTable" style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f8fafc">
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">الاسم</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">المسمى</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">القسم</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">الراتب الأساسي</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">تاريخ التعيين</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">الحالة</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b" class="no-print">إجراء</th>
        </tr></thead>
        <tbody>
          ${_payrollEmployees.map(e=>`
          <tr style="border-top:1px solid #f1f5f9;cursor:pointer" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:10px;font-weight:600">${e.name}</td>
            <td style="padding:10px;font-size:13px">${e.job_title||'—'}</td>
            <td style="padding:10px;font-size:13px">${e.department||'—'}</td>
            <td style="padding:10px;font-weight:700;color:#16a34a">${fmtMoney(e.base_salary)}</td>
            <td style="padding:10px;font-size:12px">${e.hire_date?dateAr(e.hire_date):'—'}</td>
            <td style="padding:10px"><span style="padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:${e.status==='active'?'#dcfce7':'#fee2e2'};color:${e.status==='active'?'#16a34a':'#dc2626'}">${e.status==='active'?'نشط':'غير نشط'}</span></td>
            <td style="padding:10px" class="no-print">
              <button onclick="showEditEmployee2(${e.id})" style="background:#eef1fb;border:none;color:#1a2472;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">✏️</button>
              <button onclick="deleteEmployee2(${e.id})" style="background:#fee2e2;border:none;color:#dc2626;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">🗑️</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } catch(e) { content.innerHTML = `<div class="empty-state">❌ خطأ في التحميل</div>`; }
}

async function renderPayrollRuns() {
  const content = document.getElementById('payrollContent');
  content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    _payrollRuns = await api('GET', '/api/payroll/runs');
    if (!_payrollRuns.length) {
      content.innerHTML = '<div class="empty-state">📋 لا يوجد مسيرات رواتب</div>';
      return;
    }
    const months = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const statusMap = {draft:{label:'مسودة',bg:'#f1f5f9',color:'#64748b'},approved:{label:'معتمد',bg:'#dcfce7',color:'#16a34a'},paid:{label:'مدفوع',bg:'#dbeafe',color:'#1d4ed8'}};
    content.innerHTML = `
    <div class="card">
      <table id="payrollTable" style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f8fafc">
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">الشهر</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">إجمالي الرواتب</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">إجمالي الخصومات</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">صافي المدفوع</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">الحالة</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b" class="no-print">إجراء</th>
        </tr></thead>
        <tbody>
          ${_payrollRuns.map(r=>{
            const s=statusMap[r.status]||statusMap.draft;
            return `<tr style="border-top:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
              <td style="padding:10px;font-weight:600">${months[r.month]||r.month} ${r.year}</td>
              <td style="padding:10px;color:#1a2472;font-weight:600">${fmtMoney(r.total_gross)}</td>
              <td style="padding:10px;color:#dc2626">${fmtMoney(r.total_deduct)}</td>
              <td style="padding:10px;color:#16a34a;font-weight:700">${fmtMoney(r.total_net)}</td>
              <td style="padding:10px"><span style="padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:${s.bg};color:${s.color}">${s.label}</span></td>
              <td style="padding:10px" class="no-print">
                <button onclick="viewPayrollRun(${r.id})" style="background:#eef1fb;border:none;color:#1a2472;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">👁️ عرض</button>
                ${r.status==='draft'?`<button onclick="approveRun(${r.id})" style="background:#dcfce7;border:none;color:#16a34a;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">✅ اعتماد</button>`:''}
                <button onclick="deleteRun(${r.id})" style="background:#fee2e2;border:none;color:#dc2626;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  } catch(e) { content.innerHTML = `<div class="empty-state">❌ خطأ في التحميل</div>`; }
}

function showAddEmployee2(emp=null) {
  const isEdit = !!emp;
  openModal(`${isEdit?'✏️ تعديل':'➕ موظف جديد'}`, `
  <div class="form-row">
    <div class="form-group"><label>الاسم *</label><input id="eN" class="form-control" value="${isEdit?emp.name:''}" placeholder="اسم الموظف"/></div>
    <div class="form-group"><label>المسمى الوظيفي</label><input id="eJT" class="form-control" value="${isEdit?emp.job_title||'':''}" placeholder="محاسب / مدير ..."/></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>القسم</label><input id="eDept" class="form-control" value="${isEdit?emp.department||'':''}" placeholder="المحاسبة / الإدارة ..."/></div>
    <div class="form-group"><label>تاريخ التعيين</label><input id="eHD" class="form-control" type="date" value="${isEdit?emp.hire_date||'':''}"/></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>الراتب الأساسي (ج.م)</label><input id="eSal" class="form-control" type="number" value="${isEdit?emp.base_salary:0}"/></div>
    <div class="form-group"><label>الرقم القومي</label><input id="eNID" class="form-control" value="${isEdit?emp.national_id||'':''}"/></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>رقم التأمين</label><input id="eIns" class="form-control" value="${isEdit?emp.insurance_number||'':''}"/></div>
    <div class="form-group"><label>% تأمين الموظف</label><input id="eIS" class="form-control" type="number" value="${isEdit?emp.insurance_share:11}"/></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>% تأمين الشركة</label><input id="eCI" class="form-control" type="number" value="${isEdit?emp.company_insurance:18}"/></div>
    <div class="form-group"><label>التليفون</label><input id="ePh" class="form-control" value="${isEdit?emp.phone||'':''}"/></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>البنك</label><input id="eBnk" class="form-control" value="${isEdit?emp.bank_name||'':''}"/></div>
    <div class="form-group"><label>رقم الحساب</label><input id="eBA" class="form-control" value="${isEdit?emp.bank_account||'':''}"/></div>
  </div>
  <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="${isEdit?`saveEditEmployee2(${emp.id})`:'saveEmployee2()'}">💾 حفظ</button>
  `);
}

async function saveEmployee2() {
  const body = {name:v('eN'),job_title:v('eJT'),department:v('eDept'),hire_date:v('eHD')||null,base_salary:parseFloat(v('eSal')||0),national_id:v('eNID')||null,insurance_number:v('eIns')||null,insurance_share:parseFloat(v('eIS')||11),company_insurance:parseFloat(v('eCI')||18),phone:v('ePh')||null,bank_name:v('eBnk')||null,bank_account:v('eBA')||null};
  if(!body.name){toast('الاسم مطلوب','error');return;}
  try{await api('POST','/api/payroll/employees',body);closeModal();toast('تم الحفظ');loadPayroll();}catch(e){toast(e.message,'error');}
}

async function showEditEmployee2(id) {
  const emp = _payrollEmployees.find(e=>e.id===id);
  if(emp) showAddEmployee2(emp);
}

async function saveEditEmployee2(id) {
  const body = {name:v('eN'),job_title:v('eJT'),department:v('eDept'),hire_date:v('eHD')||null,base_salary:parseFloat(v('eSal')||0),national_id:v('eNID')||null,insurance_number:v('eIns')||null,insurance_share:parseFloat(v('eIS')||11),company_insurance:parseFloat(v('eCI')||18),phone:v('ePh')||null,bank_name:v('eBnk')||null,bank_account:v('eBA')||null};
  try{await api('PUT',`/api/payroll/employees/${id}`,body);closeModal();toast('تم التحديث');loadPayroll();}catch(e){toast(e.message,'error');}
}

async function deleteEmployee2(id) {
  if(!await confirmDlg('تأكيد إنهاء خدمة الموظف؟'))return;
  await api('DELETE',`/api/payroll/employees/${id}`);
  loadPayroll(true);
}

function showAddPayrollRun() {
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const now = new Date();
  openModal('📋 مسير رواتب جديد', `
  <div class="form-row">
    <div class="form-group"><label>الشهر</label><select id="prM" class="form-control">${months.map((m,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${m}</option>`).join('')}</select></div>
    <div class="form-group"><label>السنة</label><input id="prY" class="form-control" type="number" value="${now.getFullYear()}"/></div>
  </div>
  <div style="background:#f8fafc;border-radius:10px;padding:12px;margin:8px 0">
    <p style="font-size:13px;color:#64748b;margin:0 0 8px">سيتم إنشاء مسير تلقائي بناءً على رواتب الموظفين المسجلة. يمكنك تعديل القيم بعد الإنشاء.</p>
  </div>
  <div class="form-group"><label>ملاحظات</label><textarea id="prNotes" class="form-control" rows="2"></textarea></div>
  <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="savePayrollRun()">⚡ إنشاء المسير</button>
  `);
}

async function savePayrollRun() {
  const emps = await api('GET', '/api/payroll/employees?status=active');
  if(!emps.length){toast('لا يوجد موظفون نشطون','error');return;}
  const items = emps.map(e=>({employee_id:e.id,base_salary:e.base_salary,allowances:0,overtime:0,bonus:0,deductions_other:0,advances_deduct:0}));
  const body = {month:parseInt(v('prM')),year:parseInt(v('prY')),notes:v('prNotes'),items};
  try{await api('POST','/api/payroll/runs',body);closeModal();toast('تم إنشاء مسير الرواتب');await switchPayrollView('runs');await loadPayrollStats();}catch(e){toast(e.message,'error');}
}

async function viewPayrollRun(id) {
  const data = await api('GET',`/api/payroll/runs/${id}`);
  const months = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  openModal(`📋 مسير ${months[data.run.month]} ${data.run.year}`, `
  <div style="background:#f8fafc;border-radius:10px;padding:12px;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
    <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#1a2472">${fmtMoney(data.run.total_gross)}</div><div style="font-size:11px;color:#64748b">إجمالي الرواتب</div></div>
    <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#dc2626">${fmtMoney(data.run.total_deduct)}</div><div style="font-size:11px;color:#64748b">إجمالي الخصومات</div></div>
    <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#16a34a">${fmtMoney(data.run.total_net)}</div><div style="font-size:11px;color:#64748b">صافي المدفوع</div></div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="background:#f1f5f9"><th style="padding:8px;text-align:right">الموظف</th><th style="padding:8px;text-align:right">إجمالي</th><th style="padding:8px;text-align:right">تأمين</th><th style="padding:8px;text-align:right">ضريبة</th><th style="padding:8px;text-align:right">صافي</th></tr></thead>
    <tbody>
      ${data.items.map(i=>`<tr style="border-top:1px solid #f1f5f9">
        <td style="padding:8px;font-weight:600">${i.employee_name}</td>
        <td style="padding:8px">${fmtMoney(i.gross_salary)}</td>
        <td style="padding:8px;color:#f59e0b">${fmtMoney(i.insurance_employee)}</td>
        <td style="padding:8px;color:#dc2626">${fmtMoney(i.income_tax)}</td>
        <td style="padding:8px;font-weight:700;color:#16a34a">${fmtMoney(i.net_salary)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <button class="btn btn-secondary no-print" style="width:100%;margin-top:12px" onclick="window.print()">🖨️ طباعة المسير</button>
  `);
}

async function approveRun(id) {
  if(!await confirmDlg('اعتماد هذا المسير؟'))return;
  await api('PUT',`/api/payroll/runs/${id}/approve`,{});
  renderPayrollRuns();
}

async function deleteRun(id) {
  if(!await confirmDlg('حذف المسير؟'))return;
  await api('DELETE',`/api/payroll/runs/${id}`);
  renderPayrollRuns();
}

window.loadPayroll=loadPayroll;
window.switchPayrollView=switchPayrollView;
window.showAddEmployee2=showAddEmployee2;
window.saveEmployee2=saveEmployee2;
window.showEditEmployee2=showEditEmployee2;
window.saveEditEmployee2=saveEditEmployee2;
window.deleteEmployee2=deleteEmployee2;
window.showAddPayrollRun=showAddPayrollRun;
window.savePayrollRun=savePayrollRun;
window.viewPayrollRun=viewPayrollRun;
window.approveRun=approveRun;
window.deleteRun=deleteRun;


// ═══════════════════════════════════════════════════════════════════
// SECTION: الأصول الثابتة — Fixed Assets
// ═══════════════════════════════════════════════════════════════════

let _assets = [];
const _assetCategories = ['عقارات','سيارات','أثاث ومفروشات','أجهزة كمبيوتر','معدات','برامج وتراخيص','أخرى'];

async function loadAssets() {
  const main = document.getElementById('main');
  main.innerHTML = `
  <div class="page">
    <div class="print-header"><span>MS Accounting</span><span>الأصول الثابتة</span><span>${new Date().toLocaleDateString('ar-EG')}</span></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <h2>🏭 الأصول الثابتة</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="assetCatFilter" class="form-control" style="width:auto" onchange="filterAssets()">
          <option value="">كل الفئات</option>
          ${_assetCategories.map(c=>`<option>${c}</option>`).join('')}
        </select>
        <button class="btn btn-primary" onclick="showAddAsset()">➕ أصل جديد</button>
        <button class="btn btn-secondary no-print" onclick="exportTableExcel('assetsTable','أصول ثابتة')">📥 Excel</button>
      </div>
    </div>
    <div id="assetsStats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px"></div>
    <div id="assetsContent"></div>
  </div>`;
  await loadAssetsData();
}

async function loadAssetsData() {
  try {
    const [assets, stats] = await Promise.all([
      api('GET','/api/assets'),
      api('GET','/api/assets/stats')
    ]);
    _assets = assets;
    document.getElementById('assetsStats').innerHTML = `
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:24px;font-weight:800;color:#1a2472">${stats.total_assets}</div>
        <div style="font-size:12px;color:#64748b">أصل نشط</div>
      </div>
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:#7c3aed">${fmtMoney(stats.total_purchase_value)}</div>
        <div style="font-size:12px;color:#64748b">إجمالي تكلفة الشراء</div>
      </div>
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:#0891b2">${fmtMoney(stats.total_book_value)}</div>
        <div style="font-size:12px;color:#64748b">إجمالي القيمة الدفترية</div>
      </div>
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:#dc2626">${fmtMoney(stats.total_accumulated_dep)}</div>
        <div style="font-size:12px;color:#64748b">مجمع الإهلاك</div>
      </div>`;
    renderAssetsTable(_assets);
  } catch(e) { document.getElementById('assetsContent').innerHTML = '<div class="empty-state">❌ خطأ في التحميل</div>'; }
}

function filterAssets() {
  const cat = v('assetCatFilter');
  renderAssetsTable(cat ? _assets.filter(a=>a.category===cat) : _assets);
}

const _depPct = a => a.purchase_value > 0 ? Math.round(a.accumulated_dep/a.purchase_value*100) : 0;

function renderAssetsTable(assets) {
  const c = document.getElementById('assetsContent');
  if(!assets.length){c.innerHTML='<div class="empty-state">🏭 لا توجد أصول مضافة</div>';return;}
  const statusMap = {active:{label:'نشط',bg:'#dcfce7',color:'#16a34a'},disposed:{label:'مُستبعد',bg:'#fee2e2',color:'#dc2626'},fully_depreciated:{label:'مهلك بالكامل',bg:'#f3f4f6',color:'#6b7280'},under_maintenance:{label:'صيانة',bg:'#fef3c7',color:'#d97706'}};
  c.innerHTML = `<div class="card">
    <table id="assetsTable" style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f8fafc">
        <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">الاسم</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">الفئة</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">تاريخ الشراء</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">تكلفة الشراء</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">القيمة الدفترية</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">الإهلاك %</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#64748b">الحالة</th>
        <th style="padding:10px;text-align:right;font-size:12px;color:#64748b" class="no-print">إجراء</th>
      </tr></thead>
      <tbody>
        ${assets.map(a=>{
          const s=statusMap[a.status]||statusMap.active;
          const pct=_depPct(a);
          return `<tr style="border-top:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:10px;font-weight:600">${a.name}</td>
            <td style="padding:10px;font-size:13px">${a.category||'—'}</td>
            <td style="padding:10px;font-size:12px">${dateAr(a.purchase_date)}</td>
            <td style="padding:10px;font-weight:600">${fmtMoney(a.purchase_value)}</td>
            <td style="padding:10px;font-weight:700;color:#0891b2">${fmtMoney(a.book_value)}</td>
            <td style="padding:10px">
              <div style="display:flex;align-items:center;gap:6px">
                <div style="flex:1;background:#f1f5f9;border-radius:4px;height:6px"><div style="width:${pct}%;background:${pct>80?'#dc2626':'#f59e0b'};height:6px;border-radius:4px"></div></div>
                <span style="font-size:11px;font-weight:600">${pct}%</span>
              </div>
            </td>
            <td style="padding:10px"><span style="padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:${s.bg};color:${s.color}">${s.label}</span></td>
            <td style="padding:10px" class="no-print">
              <button onclick="showAssetDepreciation(${a.id})" title="تشغيل الإهلاك" style="background:#fef3c7;border:none;color:#d97706;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">📉</button>
              <button onclick="showEditAsset(${a.id})" style="background:#eef1fb;border:none;color:#1a2472;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">✏️</button>
              <button onclick="deleteAsset(${a.id})" style="background:#fee2e2;border:none;color:#dc2626;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function showAddAsset(asset=null) {
  const isEdit = !!asset;
  openModal(`${isEdit?'✏️ تعديل':'🏭 أصل جديد'}`, `
  <div class="form-row">
    <div class="form-group"><label>اسم الأصل *</label><input id="asN" class="form-control" value="${isEdit?asset.name:''}" placeholder="سيارة / لاب توب ..."/></div>
    <div class="form-group"><label>الفئة</label><select id="asCat" class="form-control"><option value="">اختر الفئة</option>${_assetCategories.map(c=>`<option ${isEdit&&asset.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>تاريخ الشراء *</label><input id="asPD" class="form-control" type="date" value="${isEdit?asset.purchase_date:''}"/></div>
    <div class="form-group"><label>تكلفة الشراء (ج.م)</label><input id="asPV" class="form-control" type="number" value="${isEdit?asset.purchase_value:0}"/></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>العمر الإنتاجي (سنوات)</label><input id="asUL" class="form-control" type="number" value="${isEdit?asset.useful_life_years:5}" step="0.5"/></div>
    <div class="form-group"><label>القيمة المتبقية (ج.م)</label><input id="asRV" class="form-control" type="number" value="${isEdit?asset.residual_value:0}"/></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>طريقة الإهلاك</label><select id="asDM" class="form-control"><option value="straight_line" ${isEdit&&asset.depreciation_method==='straight_line'?'selected':''}>القسط الثابت</option><option value="declining_balance" ${isEdit&&asset.depreciation_method==='declining_balance'?'selected':''}>القسط المتناقص</option></select></div>
    <div class="form-group"><label>الموقع</label><input id="asLoc" class="form-control" value="${isEdit?asset.location||'':''}" placeholder="المكتب / الفرع ..."/></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>المورد</label><input id="asSup" class="form-control" value="${isEdit?asset.supplier||'':''}" placeholder="اسم المورد"/></div>
    <div class="form-group"><label>الرقم التسلسلي</label><input id="asSN" class="form-control" value="${isEdit?asset.serial_number||'':''}"/></div>
  </div>
  <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="${isEdit?`saveEditAsset(${asset.id})`:'saveAddAsset()'}">💾 حفظ</button>
  `);
}

async function saveAddAsset() {
  const body = {name:v('asN'),category:v('asCat')||null,purchase_date:v('asPD'),purchase_value:parseFloat(v('asPV')||0),useful_life_years:parseFloat(v('asUL')||5),residual_value:parseFloat(v('asRV')||0),depreciation_method:v('asDM'),location:v('asLoc')||null,supplier:v('asSup')||null,serial_number:v('asSN')||null};
  if(!body.name||!body.purchase_date){toast('الاسم وتاريخ الشراء مطلوبان','error');return;}
  try{await api('POST','/api/assets',body);closeModal();toast('تم الحفظ');loadAssetsData();}catch(e){toast(e.message,'error');}
}

function showEditAsset(id) {
  const asset = _assets.find(a=>a.id===id);
  if(asset) showAddAsset(asset);
}

async function saveEditAsset(id) {
  const body = {name:v('asN'),category:v('asCat')||null,purchase_date:v('asPD'),purchase_value:parseFloat(v('asPV')||0),useful_life_years:parseFloat(v('asUL')||5),residual_value:parseFloat(v('asRV')||0),depreciation_method:v('asDM'),location:v('asLoc')||null,supplier:v('asSup')||null,serial_number:v('asSN')||null};
  try{await api('PUT',`/api/assets/${id}`,body);closeModal();toast('تم التحديث');loadAssetsData();}catch(e){toast(e.message,'error');}
}

function showAssetDepreciation(id) {
  const asset = _assets.find(a=>a.id===id);
  const now = new Date();
  openModal('📉 تشغيل الإهلاك', `
  <div style="background:#fef3c7;border-radius:10px;padding:12px;margin-bottom:12px">
    <p style="margin:0;font-size:13px"><strong>${asset?.name}</strong> — الإهلاك السنوي المقدر: <strong>${fmtMoney(asset?.annual_depreciation||0)}</strong></p>
    <p style="margin:4px 0 0;font-size:12px;color:#64748b">القيمة الدفترية الحالية: ${fmtMoney(asset?.book_value||0)}</p>
  </div>
  <div class="form-row">
    <div class="form-group"><label>السنة</label><input id="depY" class="form-control" type="number" value="${now.getFullYear()}"/></div>
    <div class="form-group"><label>الشهر (اختياري — فارغ = سنوي)</label><input id="depM" class="form-control" type="number" min="1" max="12" placeholder="1-12"/></div>
  </div>
  <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="runDepreciation(${id})">⚡ تشغيل الإهلاك</button>
  `);
}

async function runDepreciation(id) {
  const year = parseInt(v('depY'));
  const month = v('depM') ? parseInt(v('depM')) : null;
  let url = `/api/assets/${id}/depreciate?year=${year}`;
  if(month) url += `&month=${month}`;
  try{const r=await api('POST',url,{});closeModal();toast(`✅ تم تسجيل إهلاك ${fmtMoney(r.amount)} — القيمة الدفترية: ${fmtMoney(r.book_value)}`,'success');loadAssetsData();}catch(e){toast(e.message,'error');}
}

async function deleteAsset(id) {
  if(!await confirmDlg('حذف هذا الأصل؟'))return;
  await api('DELETE',`/api/assets/${id}`);
  loadAssetsData();
}

window.loadAssets=loadAssets;
window.filterAssets=filterAssets;
window.showAddAsset=showAddAsset;
window.saveAddAsset=saveAddAsset;
window.showEditAsset=showEditAsset;
window.saveEditAsset=saveEditAsset;
window.showAssetDepreciation=showAssetDepreciation;
window.runDepreciation=runDepreciation;
window.deleteAsset=deleteAsset;


// ═══════════════════════════════════════════════════════════════════
// SECTION: التقارير المالية — Financial Reports
// ═══════════════════════════════════════════════════════════════════

let _finReportView = 'aging';

async function loadFinReports() {
  const now = new Date();
  const main = document.getElementById('main');
  main.innerHTML = `
  <div class="page">
    <div class="print-header"><span>MS Accounting</span><span>التقارير المالية</span><span>${new Date().toLocaleDateString('ar-EG')}</span></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <h2>📈 التقارير المالية</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${[['aging','📊 تقادم الديون'],['cashflow','💧 التدفق النقدي'],['summary','📋 الملخص المالي'],['profitability','🏆 ربحية العملاء']].map(([id,label])=>`
        <button onclick="switchFinReport('${id}')" id="fr_${id}" style="padding:6px 12px;border:1.5px solid #e8edf3;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;background:white;color:#64748b;transition:all .15s">${label}</button>`).join('')}
        <button class="btn btn-secondary no-print" onclick="exportTableExcel('finTable','تقرير مالي')">📥 Excel</button>
        <button class="btn btn-secondary no-print" onclick="window.print()">🖨️ طباعة</button>
      </div>
    </div>
    <div id="finFilters" style="background:white;border-radius:12px;padding:14px;margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div class="form-group" style="margin:0"><label style="font-size:11px">السنة</label><input id="frYear" class="form-control" type="number" value="${now.getFullYear()}" style="width:90px"/></div>
      <div class="form-group" style="margin:0"><label style="font-size:11px">الشهر</label><select id="frMonth" class="form-control" style="width:120px"><option value="">كل السنة</option>${['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'].map((m,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${m}</option>`).join('')}</select></div>
      <button class="btn btn-primary" onclick="refreshFinReport()" style="margin-top:16px">🔄 تحديث</button>
    </div>
    <div id="finReportContent"></div>
  </div>`;
  switchFinReport('aging');
}

function _activateFinBtn(id) {
  ['aging','cashflow','summary','profitability'].forEach(k=>{
    const b = document.getElementById(`fr_${k}`);
    if(!b) return;
    if(k===id){b.style.background='#1a2472';b.style.color='white';b.style.borderColor='#1a2472';}
    else{b.style.background='white';b.style.color='#64748b';b.style.borderColor='#e8edf3';}
  });
}

function switchFinReport(view) {
  _finReportView = view;
  _activateFinBtn(view);
  refreshFinReport();
}

async function refreshFinReport() {
  const year = parseInt(v('frYear'));
  const month = v('frMonth') || null;
  const c = document.getElementById('finReportContent');
  c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    if(_finReportView === 'aging') {
      const data = await api('GET', '/api/reports/aging');
      renderAgingReport(data);
    } else if(_finReportView === 'cashflow') {
      let url = `/api/reports/cashflow?year=${year}`;
      if(month) url += `&month=${month}`;
      const data = await api('GET', url);
      renderCashflowReport(data);
    } else if(_finReportView === 'summary') {
      let url = `/api/reports/summary?year=${year}`;
      if(month) url += `&month=${month}`;
      const data = await api('GET', url);
      renderSummaryReport(data);
    } else if(_finReportView === 'profitability') {
      const url = `/api/reports/clients-profit?year=${year}`;
      const data = await api('GET', url);
      renderProfitabilityReport(data);
    }
  } catch(e) { c.innerHTML = `<div class="empty-state">❌ خطأ في التحميل: ${e.message}</div>`; }
}

function renderAgingReport(data) {
  const c = document.getElementById('finReportContent');
  const bucketLabels = {current:'أقل من 30 يوم',days_31_60:'31-60 يوم',days_61_90:'61-90 يوم',over_90:'أكثر من 90 يوم'};
  const bucketColors = {current:'#16a34a',days_31_60:'#f59e0b',days_61_90:'#f97316',over_90:'#dc2626'};

  const statsHtml = Object.entries(data.totals).map(([k,v])=>`
    <div class="card" style="padding:14px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:${bucketColors[k]}">${fmtMoney(v)}</div>
      <div style="font-size:11px;color:#64748b">${bucketLabels[k]}</div>
    </div>`).join('');

  let rows = '';
  for(const [bucket, items] of Object.entries(data.buckets)) {
    for(const row of items) {
      rows += `<tr style="border-top:1px solid #f1f5f9">
        <td style="padding:9px;font-weight:600">${row.client_name}</td>
        <td style="padding:9px;font-size:12px">${row.invoice_number||'—'}</td>
        <td style="padding:9px;font-size:12px">${row.due_date}</td>
        <td style="padding:9px"><span style="color:${bucketColors[bucket]};font-weight:700">${row.age_days} يوم</span></td>
        <td style="padding:9px">${fmtMoney(row.total_amount)}</td>
        <td style="padding:9px;color:#16a34a">${fmtMoney(row.paid)}</td>
        <td style="padding:9px;font-weight:700;color:${bucketColors[bucket]}">${fmtMoney(row.remaining)}</td>
        <td style="padding:9px"><span style="padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:${bucketColors[bucket]}22;color:${bucketColors[bucket]}">${bucketLabels[bucket]}</span></td>
      </tr>`;
    }
  }

  c.innerHTML = `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
    ${statsHtml}
    <div class="card" style="padding:14px;text-align:center;background:#1a2472">
      <div style="font-size:18px;font-weight:800;color:white">${fmtMoney(data.grand_total)}</div>
      <div style="font-size:11px;color:rgba(255,255,255,.7)">إجمالي الديون المتأخرة</div>
    </div>
  </div>
  <div class="card">
    <div style="padding:12px 16px;font-size:13px;font-weight:700;color:#1a2472;border-bottom:1px solid #f1f5f9">📊 تقرير تقادم الديون — حتى ${data.as_of}</div>
    <table id="finTable" style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f8fafc">
        <th style="padding:9px;text-align:right;font-size:11px;color:#64748b">العميل</th>
        <th style="padding:9px;text-align:right;font-size:11px;color:#64748b">رقم الفاتورة</th>
        <th style="padding:9px;text-align:right;font-size:11px;color:#64748b">تاريخ الاستحقاق</th>
        <th style="padding:9px;text-align:right;font-size:11px;color:#64748b">العمر</th>
        <th style="padding:9px;text-align:right;font-size:11px;color:#64748b">الإجمالي</th>
        <th style="padding:9px;text-align:right;font-size:11px;color:#64748b">المحصّل</th>
        <th style="padding:9px;text-align:right;font-size:11px;color:#64748b">المتبقي</th>
        <th style="padding:9px;text-align:right;font-size:11px;color:#64748b">الفئة</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">لا توجد ديون متأخرة ✅</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderCashflowReport(data) {
  const c = document.getElementById('finReportContent');
  c.innerHTML = `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
    <div class="card" style="padding:16px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#16a34a">${fmtMoney(data.total_inflows)}</div>
      <div style="font-size:12px;color:#64748b">إجمالي التدفقات الداخلة</div>
    </div>
    <div class="card" style="padding:16px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#dc2626">${fmtMoney(data.total_outflows)}</div>
      <div style="font-size:12px;color:#64748b">إجمالي التدفقات الخارجة</div>
    </div>
    <div class="card" style="padding:16px;text-align:center;background:${data.net_cashflow>=0?'#dcfce7':'#fee2e2'}">
      <div style="font-size:22px;font-weight:800;color:${data.net_cashflow>=0?'#16a34a':'#dc2626'}">${fmtMoney(data.net_cashflow)}</div>
      <div style="font-size:12px;color:#64748b">صافي التدفق النقدي</div>
    </div>
    <div class="card" style="padding:16px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#1a2472">${fmtMoney(data.invoice_payments_received)}</div>
      <div style="font-size:12px;color:#64748b">مدفوعات الفواتير</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="card">
      <div style="padding:12px 16px;font-size:13px;font-weight:700;color:#16a34a;border-bottom:1px solid #f1f5f9">⬇️ التدفقات الداخلة</div>
      <table id="finTable" style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f8fafc"><th style="padding:8px;text-align:right;font-size:11px;color:#64748b">التاريخ</th><th style="padding:8px;text-align:right;font-size:11px;color:#64748b">المبلغ</th><th style="padding:8px;text-align:right;font-size:11px;color:#64748b">البيان</th></tr></thead>
        <tbody>${data.inflows.map(t=>`<tr style="border-top:1px solid #f1f5f9"><td style="padding:8px;font-size:12px">${t.date}</td><td style="padding:8px;color:#16a34a;font-weight:600">${fmtMoney(t.amount)}</td><td style="padding:8px;font-size:12px">${t.desc||'—'}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;padding:16px;color:#94a3b8">لا توجد تدفقات</td></tr>'}</tbody>
      </table>
    </div>
    <div class="card">
      <div style="padding:12px 16px;font-size:13px;font-weight:700;color:#dc2626;border-bottom:1px solid #f1f5f9">⬆️ التدفقات الخارجة</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f8fafc"><th style="padding:8px;text-align:right;font-size:11px;color:#64748b">التاريخ</th><th style="padding:8px;text-align:right;font-size:11px;color:#64748b">المبلغ</th><th style="padding:8px;text-align:right;font-size:11px;color:#64748b">البيان</th></tr></thead>
        <tbody>${data.outflows.map(t=>`<tr style="border-top:1px solid #f1f5f9"><td style="padding:8px;font-size:12px">${t.date}</td><td style="padding:8px;color:#dc2626;font-weight:600">${fmtMoney(t.amount)}</td><td style="padding:8px;font-size:12px">${t.desc||'—'}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;padding:16px;color:#94a3b8">لا توجد تدفقات</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
}

function renderSummaryReport(data) {
  const c = document.getElementById('finReportContent');
  const statusAr = {draft:'مسودة',sent:'مُرسلة',paid:'مدفوعة',overdue:'متأخرة',partial:'جزئي',cancelled:'ملغاة'};
  const statusColor = {draft:'#94a3b8',sent:'#3b82f6',paid:'#16a34a',overdue:'#dc2626',partial:'#f59e0b',cancelled:'#94a3b8'};
  c.innerHTML = `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px">
    <div class="card" style="padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#1a2472">${fmtMoney(data.total_invoiced)}</div>
      <div style="font-size:12px;color:#64748b">إجمالي الأتعاب المصدرة</div>
    </div>
    <div class="card" style="padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#16a34a">${fmtMoney(data.total_collected)}</div>
      <div style="font-size:12px;color:#64748b">المحصّل فعلياً</div>
    </div>
    <div class="card" style="padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#dc2626">${fmtMoney(data.outstanding)}</div>
      <div style="font-size:12px;color:#64748b">المتبقي غير محصّل</div>
    </div>
    <div class="card" style="padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#7c3aed">${data.collection_rate}%</div>
      <div style="font-size:12px;color:#64748b">نسبة التحصيل</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="card" style="padding:16px">
      <div style="font-size:13px;font-weight:700;color:#1a2472;margin-bottom:12px">📊 توزيع الفواتير</div>
      <table id="finTable" style="width:100%;border-collapse:collapse">
        ${Object.entries(data.invoice_status).map(([s,cnt])=>`<tr style="border-top:1px solid #f1f5f9"><td style="padding:8px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor[s]||'#94a3b8'};margin-left:6px"></span>${statusAr[s]||s}</td><td style="padding:8px;font-weight:700;text-align:left">${cnt} فاتورة</td></tr>`).join('')}
      </table>
    </div>
    <div class="card" style="padding:16px">
      <div style="font-size:13px;font-weight:700;color:#1a2472;margin-bottom:12px">👥 العملاء</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
        <div style="text-align:center"><div style="font-size:28px;font-weight:800;color:#1a2472">${data.total_clients}</div><div style="font-size:12px;color:#64748b">إجمالي العملاء</div></div>
        <div style="text-align:center"><div style="font-size:28px;font-weight:800;color:#16a34a">${data.active_clients}</div><div style="font-size:12px;color:#64748b">عملاء نشطون</div></div>
      </div>
    </div>
  </div>`;
}

function renderProfitabilityReport(data) {
  const c = document.getElementById('finReportContent');
  if(!data.length){c.innerHTML='<div class="empty-state">لا توجد بيانات</div>';return;}
  const max = Math.max(...data.map(d=>d.total_invoiced),1);
  c.innerHTML = `
  <div class="card">
    <div style="padding:12px 16px;font-size:13px;font-weight:700;color:#1a2472;border-bottom:1px solid #f1f5f9">🏆 ربحية العملاء — مرتبة تنازلياً</div>
    <table id="finTable" style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f8fafc">
        <th style="padding:10px;text-align:right;font-size:11px;color:#64748b">#</th>
        <th style="padding:10px;text-align:right;font-size:11px;color:#64748b">العميل</th>
        <th style="padding:10px;text-align:right;font-size:11px;color:#64748b">إجمالي الأتعاب</th>
        <th style="padding:10px;text-align:right;font-size:11px;color:#64748b">المحصّل</th>
        <th style="padding:10px;text-align:right;font-size:11px;color:#64748b">المتبقي</th>
        <th style="padding:10px;text-align:right;font-size:11px;color:#64748b">نسبة التحصيل</th>
        <th style="padding:10px;text-align:right;font-size:11px;color:#64748b">عدد الفواتير</th>
      </tr></thead>
      <tbody>
        ${data.filter(d=>d.total_invoiced>0).map((d,i)=>`
        <tr style="border-top:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          <td style="padding:10px;font-weight:700;color:#94a3b8">${i+1}</td>
          <td style="padding:10px">
            <div style="font-weight:600">${d.client_name}</div>
            <div style="height:4px;background:#f1f5f9;border-radius:4px;margin-top:4px;width:${Math.round(d.total_invoiced/max*100)}%"><div style="height:4px;background:#1a2472;border-radius:4px;width:100%"></div></div>
          </td>
          <td style="padding:10px;font-weight:700;color:#1a2472">${fmtMoney(d.total_invoiced)}</td>
          <td style="padding:10px;color:#16a34a;font-weight:600">${fmtMoney(d.total_collected)}</td>
          <td style="padding:10px;color:${d.outstanding>0?'#dc2626':'#16a34a'};font-weight:${d.outstanding>0?'700':'400'}">${fmtMoney(d.outstanding)}</td>
          <td style="padding:10px">
            <div style="display:flex;align-items:center;gap:6px">
              <div style="width:60px;background:#f1f5f9;border-radius:4px;height:6px"><div style="width:${d.collection_rate}%;background:${d.collection_rate>=80?'#16a34a':d.collection_rate>=50?'#f59e0b':'#dc2626'};height:6px;border-radius:4px"></div></div>
              <span style="font-size:12px;font-weight:700">${d.collection_rate}%</span>
            </div>
          </td>
          <td style="padding:10px;text-align:center">${d.invoice_count}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

window.loadFinReports=loadFinReports;
window.switchFinReport=switchFinReport;
window.refreshFinReport=refreshFinReport;


// ═══════════════════════════════════════════════════════════════════
// SECTION: Excel Export — تصدير Excel لأي جدول
// ═══════════════════════════════════════════════════════════════════

function exportTableExcel(tableId, sheetName='تقرير') {
  const table = document.getElementById(tableId);
  if(!table){toast('لا يوجد جدول للتصدير','error');return;}

  // Build CSV
  let csv = '﻿'; // BOM for Arabic
  const rows = table.querySelectorAll('tr');
  rows.forEach(row=>{
    const cells = [...row.querySelectorAll('th,td')];
    csv += cells.map(c=>`"${c.textContent.trim().replace(/"/g,'""')}"`).join(',') + '\n';
  });

  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sheetName}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Global export: find first table in the current page and export it
function exportCurrentPage() {
  const table = document.querySelector('#main table');
  const title = document.getElementById('pageTitle')?.textContent || 'تقرير';
  if(!table){toast('لا يوجد جدول في هذه الصفحة','error');return;}
  const id = table.id || 'exportTable';
  if(!table.id) table.id = id;
  exportTableExcel(id, title);
}

window.exportTableExcel=exportTableExcel;
window.exportCurrentPage=exportCurrentPage;

// Helper
function fmtMoney(n){
  if(!n&&n!==0) return '—';
  return new Intl.NumberFormat('ar-EG',{minimumFractionDigits:0,maximumFractionDigits:2}).format(n) + ' ج.م';
}

// ══════════════════════════════════════════════════════
// ── 📬 البوسطة (Internal Mail Tracker) ────────────────
// ══════════════════════════════════════════════════════
let _postalData=[], _postalStatus='all';

async function loadPostal() {
  const main=document.getElementById('main');
  main.className='page';
  main.innerHTML=skeletonTable(4,5);
  try {
    const p = _postalStatus!=='all' ? `?status=${_postalStatus}` : '';
    const data = await api('GET', `/api/postal${p}`);
    _postalData = data.items||[];
    const counts = data.counts||{open:0,within:0,closed:0};
    renderPostal(counts);
  } catch(e){ toast(e.message,'error'); }
}

function renderPostal(counts) {
  const main=document.getElementById('main');
  const statusLabel={open:'مفتوح',within:'استُلم',closed:'مغلق'};
  const statusBadge={open:'badge-blue',within:'badge-yellow',closed:'badge-green'};
  const statusColor={open:'#1a2472',within:'#d97706',closed:'#16a34a'};
  main.innerHTML=`
  <!-- Stats row -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px">
    ${[['open','📬','مفتوح','#eef1fb','#1a2472'],['within','📩','استُلم','#fffbeb','#d97706'],['closed','✅','مغلق','#f0fdf4','#16a34a']].map(([s,ic,lb,bg,cl])=>`
    <div onclick="setPostalStatus('${s}')" style="background:${bg};border-radius:14px;padding:16px 20px;cursor:pointer;border:2px solid ${_postalStatus===s?cl:'transparent'};transition:all .15s">
      <div style="font-size:24px;margin-bottom:4px">${ic}</div>
      <div style="font-size:22px;font-weight:800;color:${cl}">${counts[s]||0}</div>
      <div style="font-size:12px;color:#64748b">${lb}</div>
    </div>`).join('')}
  </div>
  <!-- Toolbar -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:8px">
      ${['all','open','within','closed'].map(s=>`<button onclick="setPostalStatus('${s}')" class="btn btn-sm ${_postalStatus===s?'btn-primary':'btn-secondary'}">${{all:'الكل',open:'مفتوح',within:'استُلم',closed:'مغلق'}[s]}</button>`).join('')}
    </div>
    <button class="btn btn-primary" onclick="showAddPostal()">+ بوسطة جديدة</button>
  </div>
  <!-- Table -->
  <div class="card" style="overflow:hidden">
    <table>
      <thead><tr><th>الموضوع</th><th>نوع المستند</th><th>العميل</th><th>من</th><th>مكلف لـ</th><th>تاريخ الاستلام</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${_postalData.length===0?`<tr><td colspan="8" style="text-align:center;padding:50px;color:#94a3b8">
          <div style="font-size:40px;margin-bottom:10px">📬</div>
          <div style="font-weight:700;color:#475569;margin-bottom:6px">لا توجد بوسطة</div>
          <div style="font-size:12px">اضغط "+ بوسطة جديدة" لتسجيل أوراق جديدة</div>
        </td></tr>`:_postalData.map(m=>`
        <tr>
          <td style="font-weight:600;color:#1e293b">${escH(m.title)}</td>
          <td><span class="badge badge-gray">${m.document_type||'—'}</span></td>
          <td style="color:#374151">${m.client_name||'—'}</td>
          <td style="color:#374151">${escH(m.from_person||'—')}</td>
          <td style="color:#374151">${m.assignee_name||'—'}</td>
          <td style="color:#374151">${m.received_date||'—'}</td>
          <td>
            <select onchange="changePostalStatus(${m.id},this.value)" class="input" style="padding:4px 8px;font-size:12px;width:auto;border-color:${statusColor[m.status]||'#d1d5db'}">
              <option value="open" ${m.status==='open'?'selected':''}>📬 مفتوح</option>
              <option value="within" ${m.status==='within'?'selected':''}>📩 استُلم</option>
              <option value="closed" ${m.status==='closed'?'selected':''}>✅ مغلق</option>
            </select>
          </td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="showEditPostal(${m.id})" title="تعديل">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="deletePostal(${m.id})" title="حذف">🗑️</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

async function showAddPostal() {
  let clients=[];
  try{ clients=await getClients(); }catch{}
  let users=[];
  try{ const d=await api('GET','/api/users'); users=d||[]; }catch{}
  const types=['أوراق تأسيس','سجل تجاري','بطاقة ضريبية','عقد عمل','ميزانية','إقرار ضريبي','فاتورة','مستند آخر'];
  openModal(`<h3 style="margin:0 0 18px;font-size:16px;font-weight:800;color:#1e293b">📬 بوسطة جديدة</h3>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>الموضوع / الوصف *</label><input id="ptTitle" class="input" placeholder="مثال: أوراق تأسيس شركة XYZ"/></div>
    <div class="form-group"><label>نوع المستند</label>
      <select id="ptType" class="input">
        <option value="">-- اختر --</option>
        ${types.map(t=>`<option>${t}</option>`).join('')}
      </select>
    </div>
  </div>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>العميل</label>
      <select id="ptClient" class="input">
        <option value="">-- اختر --</option>
        ${clients.map(c=>`<option value="${c.id}">${escH(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>من (صاحب الأوراق)</label><input id="ptFrom" class="input" placeholder="اسم الشخص أو الجهة"/></div>
  </div>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>مكلف لـ</label>
      <select id="ptAssign" class="input">
        <option value="">-- اختر --</option>
        ${users.map(u=>`<option value="${u.id}">${escH(u.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>تاريخ الاستلام</label><input id="ptDate" class="input" type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
  </div>
  <div style="margin-bottom:18px"><label>ملاحظات</label><textarea id="ptNotes" class="input" rows="2" placeholder="أي ملاحظات إضافية..."></textarea></div>
  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="savePostal()">💾 حفظ</button>
  </div>`);
}

async function savePostal() {
  const title=v('ptTitle').trim();
  if(!title){toast('أدخل الموضوع','error');return;}
  const body={title,document_type:v('ptType'),client_id:+v('ptClient')||null,from_person:v('ptFrom'),assigned_to:+v('ptAssign')||null,received_date:v('ptDate'),notes:v('ptNotes')};
  try{await api('POST','/api/postal',body);closeModal();toast('تم الحفظ');loadPostal();}catch(e){toast(e.message,'error');}
}

async function showEditPostal(id) {
  const m=_postalData.find(x=>x.id===id);
  if(!m) return;
  let clients=[];
  try{ clients=await getClients(); }catch{}
  let users=[];
  try{ const d=await api('GET','/api/users'); users=d||[]; }catch{}
  const types=['أوراق تأسيس','سجل تجاري','بطاقة ضريبية','عقد عمل','ميزانية','إقرار ضريبي','فاتورة','مستند آخر'];
  openModal(`<h3 style="margin:0 0 18px;font-size:16px;font-weight:800;color:#1e293b">✏️ تعديل البوسطة</h3>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>الموضوع *</label><input id="ptTitle" class="input" value="${escH(m.title)}"/></div>
    <div class="form-group"><label>نوع المستند</label>
      <select id="ptType" class="input">
        <option value="">-- اختر --</option>
        ${types.map(t=>`<option ${m.document_type===t?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
  </div>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>العميل</label>
      <select id="ptClient" class="input">
        <option value="">-- اختر --</option>
        ${clients.map(c=>`<option value="${c.id}" ${m.client_id===c.id?'selected':''}>${escH(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>من</label><input id="ptFrom" class="input" value="${escH(m.from_person||'')}"/></div>
  </div>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>مكلف لـ</label>
      <select id="ptAssign" class="input">
        <option value="">-- اختر --</option>
        ${users.map(u=>`<option value="${u.id}" ${m.assigned_to===u.id?'selected':''}>${escH(u.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>تاريخ الاستلام</label><input id="ptDate" class="input" type="date" value="${m.received_date||''}"/></div>
  </div>
  <div style="margin-bottom:18px"><label>ملاحظات</label><textarea id="ptNotes" class="input" rows="2">${escH(m.notes||'')}</textarea></div>
  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="updatePostal(${id})">💾 حفظ</button>
  </div>`);
}

async function updatePostal(id) {
  const body={title:v('ptTitle').trim(),document_type:v('ptType'),client_id:+v('ptClient')||null,from_person:v('ptFrom'),assigned_to:+v('ptAssign')||null,received_date:v('ptDate'),notes:v('ptNotes')};
  try{await api('PUT',`/api/postal/${id}`,body);closeModal();toast('تم التحديث');loadPostal();}catch(e){toast(e.message,'error');}
}

async function changePostalStatus(id, newStatus) {
  try{await api('PUT',`/api/postal/${id}`,{status:newStatus});toast('تم تحديث الحالة');loadPostal();}catch(e){toast(e.message,'error');}
}

async function deletePostal(id) {
  if(!await confirmDlg('حذف هذه البوسطة نهائياً؟','تأكيد الحذف')) return;
  try{await api('DELETE',`/api/postal/${id}`);toast('تم الحذف');loadPostal();}catch(e){toast(e.message,'error');}
}

window.loadPostal=loadPostal; window.showAddPostal=showAddPostal; window.savePostal=savePostal;
window.showEditPostal=showEditPostal; window.updatePostal=updatePostal;
window.changePostalStatus=changePostalStatus; window.deletePostal=deletePostal;


// ══════════════════════════════════════════════════════
// ── 📑 الميزانيات (Financial Statements Tracker) ──────
// ══════════════════════════════════════════════════════
let _stmtData=[], _stmtYear=new Date().getFullYear();

async function loadStatements() {
  const main=document.getElementById('main');
  main.className='page';
  main.innerHTML=skeletonTable(5,6);
  try {
    const data = await api('GET',`/api/statements?year=${_stmtYear}`);
    _stmtData = data.items||[];
    renderStatements(data.summary||{});
  } catch(e){ toast(e.message,'error'); }
}

function renderStatements(summary) {
  const main=document.getElementById('main');
  const pct = summary.total>0 ? Math.round(summary.done/summary.total*100) : 0;
  const stages=[
    {key:'is_printed', label:'طُبعت', icon:'🖨️', color:'#1a2472'},
    {key:'is_sent',    label:'ذهبت للشركة', icon:'📤', color:'#d97706'},
    {key:'is_signed',  label:'رجعت موقعة', icon:'✍️', color:'#7c3aed'},
    {key:'is_archived',label:'نزلت الأرشيف', icon:'📁', color:'#16a34a'},
  ];
  main.innerHTML=`
  <!-- Progress Banner -->
  <div style="background:linear-gradient(135deg,#0f172a,#1a2472);border-radius:18px;padding:22px 28px;margin-bottom:20px;color:white">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:13px;color:rgba(255,255,255,.6);margin-bottom:4px">إجمالي الميزانيات</div>
        <div style="font-size:28px;font-weight:800">${summary.total||0} ميزانية</div>
      </div>
      <div style="display:flex;gap:16px">
        <div style="text-align:center;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);padding:10px 18px;border-radius:12px">
          <div style="font-size:22px;font-weight:800;color:#4ade80">${summary.done||0}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.6)">مكتمل</div>
        </div>
        <div style="text-align:center;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.25);padding:10px 18px;border-radius:12px">
          <div style="font-size:22px;font-weight:800;color:#fde68a">${summary.remaining||0}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.6)">باقي</div>
        </div>
      </div>
    </div>
    <div style="background:rgba(255,255,255,.12);border-radius:99px;height:8px;overflow:hidden;margin-bottom:6px">
      <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#4ade80,#22c55e);border-radius:99px;transition:width 1s ease"></div>
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,.5);text-align:left">${pct}% مكتمل</div>
  </div>

  <!-- Toolbar -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;align-items:center;gap:10px">
      <label style="font-size:13px;font-weight:600;color:#374151">السنة:</label>
      <select onchange="_stmtYear=+this.value;loadStatements()" class="input" style="width:100px">
        ${[new Date().getFullYear(),new Date().getFullYear()-1,new Date().getFullYear()-2].map(y=>`<option ${_stmtYear===y?'selected':''}>${y}</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-primary" onclick="showAddStatement()">+ ميزانية جديدة</button>
  </div>

  <!-- Table -->
  <div class="card" style="overflow:hidden">
    <table>
      <thead><tr>
        <th>العميل</th><th>السنة</th><th>النوع</th>
        <th style="text-align:center">🖨️ طُبعت</th>
        <th style="text-align:center">📤 ذهبت</th>
        <th style="text-align:center">✍️ رجعت</th>
        <th style="text-align:center">📁 أُرشفت</th>
        <th>التقدم</th><th>إجراءات</th>
      </tr></thead>
      <tbody>
        ${_stmtData.length===0?`<tr><td colspan="9" style="text-align:center;padding:50px;color:#94a3b8">
          <div style="font-size:40px;margin-bottom:10px">📑</div>
          <div style="font-weight:700;color:#475569;margin-bottom:6px">لا توجد ميزانيات</div>
          <div style="font-size:12px">اضغط "+ ميزانية جديدة" للبدء</div>
        </td></tr>`:_stmtData.map(s=>{
          const done=s.stages_done;
          const pctS=Math.round(done/4*100);
          const pctColor=done===4?'#16a34a':done>=2?'#d97706':'#dc2626';
          return `<tr>
            <td style="font-weight:600;color:#1e293b">${escH(s.client_name||'—')}</td>
            <td style="font-weight:700;color:#1a2472">${s.year}</td>
            <td><span class="badge badge-blue">${{balance:'ميزانية',tax:'إقرار ضريبي',other:'أخرى'}[s.statement_type]||s.statement_type}</span></td>
            ${stages.map(st=>`
            <td style="text-align:center">
              <button onclick="toggleStage(${s.id},'${st.key}',${!s[st.key]})" style="background:${s[st.key]?'#dcfce7':'#f1f5f9'};border:none;cursor:pointer;border-radius:8px;padding:6px 10px;font-size:16px;transition:all .15s" title="${st.label}">
                ${s[st.key]?'✅':'⬜'}
              </button>
            </td>`).join('')}
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;background:#f1f5f9;border-radius:99px;height:6px;min-width:60px">
                  <div style="height:100%;width:${pctS}%;background:${pctColor};border-radius:99px;transition:width .5s"></div>
                </div>
                <span style="font-size:11px;font-weight:700;color:${pctColor}">${done}/4</span>
              </div>
            </td>
            <td>
              <div style="display:flex;gap:6px">
                <button class="btn btn-secondary btn-sm" onclick="showEditStatement(${s.id})" title="تعديل">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteStatement(${s.id})" title="حذف">🗑️</button>
              </div>
            </td>
          </tr>`;}).join('')}
      </tbody>
    </table>
  </div>`;
}

async function toggleStage(id, stage, val) {
  try {
    const s = await api('PUT',`/api/statements/${id}/stage`,{stage,value:val});
    const idx=_stmtData.findIndex(x=>x.id===id);
    if(idx>=0) _stmtData[idx]=s;
    // re-render summary
    const done=_stmtData.filter(x=>x.is_archived).length;
    renderStatements({total:_stmtData.length,done,remaining:_stmtData.length-done});
  } catch(e){toast(e.message,'error');}
}

async function showAddStatement() {
  let clients=[];
  try{ clients=(await getClients()).filter(c=>c.status==='active'); }catch{}
  let users=[];
  try{ const d=await api('GET','/api/users'); users=d||[]; }catch{}
  openModal(`<h3 style="margin:0 0 18px;font-size:16px;font-weight:800;color:#1e293b">📑 ميزانية جديدة</h3>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>العميل *</label>
      <select id="stClient" class="input">
        <option value="">-- اختر العميل --</option>
        ${clients.map(c=>`<option value="${c.id}">${escH(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>السنة *</label>
      <select id="stYear" class="input">
        ${[new Date().getFullYear(),new Date().getFullYear()-1,new Date().getFullYear()-2].map(y=>`<option ${y===_stmtYear?'selected':''}>${y}</option>`).join('')}
      </select>
    </div>
  </div>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>النوع</label>
      <select id="stType" class="input">
        <option value="balance">ميزانية</option>
        <option value="tax">إقرار ضريبي</option>
        <option value="other">أخرى</option>
      </select>
    </div>
    <div class="form-group"><label>الفترة</label>
      <select id="stPeriod" class="input">
        <option value="annual">سنوي</option>
        <option value="semi">نصف سنوي</option>
        <option value="quarterly">ربع سنوي</option>
      </select>
    </div>
  </div>
  <div class="form-row" style="margin-bottom:18px">
    <div class="form-group"><label>مكلف لـ</label>
      <select id="stAssign" class="input">
        <option value="">-- اختر --</option>
        ${users.map(u=>`<option value="${u.id}">${escH(u.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>ملاحظات</label><input id="stNotes" class="input" placeholder="اختياري"/></div>
  </div>
  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="saveStatement()">💾 حفظ</button>
  </div>`);
}

async function saveStatement() {
  const client_id=v('stClient');
  if(!client_id){toast('اختر العميل','error');return;}
  const body={client_id:+client_id,year:+v('stYear'),statement_type:v('stType'),period:v('stPeriod'),assigned_to:v('stAssign')||null,notes:v('stNotes')};
  try{await api('POST','/api/statements',body);closeModal();toast('تم الحفظ');loadStatements();}catch(e){toast(e.message,'error');}
}

async function showEditStatement(id) {
  const s=_stmtData.find(x=>x.id===id);
  if(!s) return;
  let users=[];
  try{ const d=await api('GET','/api/users'); users=d||[]; }catch{}
  openModal(`<h3 style="margin:0 0 18px;font-size:16px;font-weight:800;color:#1e293b">✏️ تعديل الميزانية — ${escH(s.client_name)}</h3>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>السنة</label>
      <select id="stYear" class="input">
        ${[new Date().getFullYear(),new Date().getFullYear()-1,new Date().getFullYear()-2].map(y=>`<option ${s.year===y?'selected':''}>${y}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>النوع</label>
      <select id="stType" class="input">
        <option value="balance" ${s.statement_type==='balance'?'selected':''}>ميزانية</option>
        <option value="tax" ${s.statement_type==='tax'?'selected':''}>إقرار ضريبي</option>
        <option value="other" ${s.statement_type==='other'?'selected':''}>أخرى</option>
      </select>
    </div>
  </div>
  <div class="form-row" style="margin-bottom:18px">
    <div class="form-group"><label>مكلف لـ</label>
      <select id="stAssign" class="input">
        <option value="">-- اختر --</option>
        ${users.map(u=>`<option value="${u.id}" ${s.assigned_to===u.id?'selected':''}>${escH(u.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>ملاحظات</label><input id="stNotes" class="input" value="${escH(s.notes||'')}"/></div>
  </div>
  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="updateStatement(${id})">💾 حفظ</button>
  </div>`);
}

async function updateStatement(id) {
  const body={year:+v('stYear'),statement_type:v('stType'),assigned_to:v('stAssign')||null,notes:v('stNotes')};
  try{await api('PUT',`/api/statements/${id}`,body);closeModal();toast('تم التحديث');loadStatements();}catch(e){toast(e.message,'error');}
}

async function deleteStatement(id) {
  if(!await confirmDlg('حذف هذه الميزانية نهائياً؟','تأكيد الحذف')) return;
  try{await api('DELETE',`/api/statements/${id}`);toast('تم الحذف');loadStatements();}catch(e){toast(e.message,'error');}
}

window.loadStatements=loadStatements; window.showAddStatement=showAddStatement; window.saveStatement=saveStatement;
window.showEditStatement=showEditStatement; window.updateStatement=updateStatement;
window.toggleStage=toggleStage; window.deleteStatement=deleteStatement;


// ══════════════════════════════════════════════════════
// ── ⏱️ التايم شيت (Timesheet) ─────────────────────────
// ══════════════════════════════════════════════════════
let _tsEntries=[], _tsDateFrom='', _tsDateTo='';

async function loadTimesheet() {
  const main=document.getElementById('main');
  main.className='page';
  // default: current week
  if(!_tsDateFrom) {
    const now=new Date();
    const mon=new Date(now); mon.setDate(now.getDate()-now.getDay()+1);
    _tsDateFrom=mon.toISOString().split('T')[0];
    _tsDateTo=now.toISOString().split('T')[0];
  }
  main.innerHTML=skeletonTable(5,5);
  try {
    const [entries, stats] = await Promise.all([
      api('GET',`/api/timesheet?date_from=${_tsDateFrom}&date_to=${_tsDateTo}`),
      api('GET',`/api/timesheet/stats?date_from=${_tsDateFrom}&date_to=${_tsDateTo}`).catch(()=>[]),
    ]);
    _tsEntries=entries.items||[];
    renderTimesheet(entries.total_hours||0, stats||[]);
  } catch(e){ toast(e.message,'error'); }
}

function renderTimesheet(totalHours, stats) {
  const main=document.getElementById('main');
  main.innerHTML=`
  <!-- Top Stats -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:20px">
    <div class="card" style="padding:18px;display:flex;align-items:center;gap:14px">
      <div style="width:46px;height:46px;border-radius:12px;background:#eef1fb;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">⏱️</div>
      <div><div style="font-size:22px;font-weight:800;color:#1e293b">${totalHours.toFixed(1)}h</div><div style="font-size:12px;color:#64748b">إجمالي الساعات</div></div>
    </div>
    <div class="card" style="padding:18px;display:flex;align-items:center;gap:14px">
      <div style="width:46px;height:46px;border-radius:12px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">👥</div>
      <div><div style="font-size:22px;font-weight:800;color:#16a34a">${stats.length}</div><div style="font-size:12px;color:#64748b">موظفين نشطين</div></div>
    </div>
    <div class="card" style="padding:18px;display:flex;align-items:center;gap:14px">
      <div style="width:46px;height:46px;border-radius:12px;background:#fff1f2;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📋</div>
      <div><div style="font-size:22px;font-weight:800;color:#dc2626">${_tsEntries.length}</div><div style="font-size:12px;color:#64748b">إدخالات</div></div>
    </div>
  </div>

  <!-- Date Filter & Add -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <label style="font-size:13px;font-weight:600;color:#374151">من:</label>
      <input type="date" class="input" style="width:150px" value="${_tsDateFrom}" oninput="_tsDateFrom=this.value"/>
      <label style="font-size:13px;font-weight:600;color:#374151">إلى:</label>
      <input type="date" class="input" style="width:150px" value="${_tsDateTo}" oninput="_tsDateTo=this.value"/>
      <button class="btn btn-secondary" onclick="loadTimesheet()">🔍 بحث</button>
    </div>
    <button class="btn btn-primary" onclick="showAddTimeEntry()">+ تسجيل ساعات</button>
  </div>

  <!-- Employee Summary Cards -->
  ${stats.length>0?`
  <div class="card" style="padding:20px;margin-bottom:20px">
    <div style="font-size:14px;font-weight:800;color:#1e293b;margin-bottom:14px">📊 ملخص الموظفين</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${stats.map(st=>{
        const maxH=Math.max(...stats.map(x=>x.total_hours),1);
        const pct=Math.round(st.total_hours/maxH*100);
        return `<div style="display:flex;align-items:center;gap:12px">
          <div style="width:130px;font-size:13px;font-weight:600;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(st.employee_name)}</div>
          <div style="flex:1;background:#f1f5f9;border-radius:99px;height:8px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#1a2472,#2563eb);border-radius:99px"></div>
          </div>
          <div style="font-size:13px;font-weight:700;color:#1a2472;width:60px;text-align:left">${st.total_hours.toFixed(1)}h</div>
          <div style="font-size:11px;color:#94a3b8">${st.entries} إدخال</div>
        </div>`;}).join('')}
    </div>
  </div>`:''
  }

  <!-- Entries Table -->
  <div class="card" style="overflow:hidden">
    <table>
      <thead><tr><th>الموظف</th><th>التاريخ</th><th>المهمة</th><th>العميل</th><th>الساعات</th><th>الوصف</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${_tsEntries.length===0?`<tr><td colspan="7" style="text-align:center;padding:50px;color:#94a3b8">
          <div style="font-size:40px;margin-bottom:10px">⏱️</div>
          <div style="font-weight:700;color:#475569;margin-bottom:6px">لا توجد إدخالات في هذه الفترة</div>
          <div style="font-size:12px">اضغط "+ تسجيل ساعات" للبدء</div>
        </td></tr>`:_tsEntries.map(e=>`
        <tr>
          <td style="font-weight:600;color:#1e293b">${escH(e.employee_name||'—')}</td>
          <td style="color:#374151">${dateAr(e.date)}</td>
          <td style="color:#374151;font-size:12px">${e.task_title?escH(e.task_title):'—'}</td>
          <td style="color:#374151;font-size:12px">${e.client_name?escH(e.client_name):'—'}</td>
          <td>
            <span style="background:#eef1fb;color:#1a2472;font-weight:800;padding:4px 12px;border-radius:99px;font-size:13px">${e.hours}h</span>
          </td>
          <td style="color:#374151;font-size:12px;max-width:200px">${e.description?escH(e.description):'—'}</td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="showEditTimeEntry(${e.id})" title="تعديل">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="deleteTimeEntry(${e.id})" title="حذف">🗑️</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

async function showAddTimeEntry() {
  let tasks=[], clients=[], users=[];
  try{ const d=await api('GET','/api/tasks?page_size=100&status=open'); tasks=d.items||[]; }catch{}
  try{ clients=await getClients(); }catch{}
  try{ const d=await api('GET','/api/users'); users=d||[]; }catch{}
  openModal(`<h3 style="margin:0 0 18px;font-size:16px;font-weight:800;color:#1e293b">⏱️ تسجيل ساعات عمل</h3>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>الموظف *</label>
      <select id="tsEmp" class="input">
        <option value="">-- اختر --</option>
        ${users.map(u=>`<option value="${u.id}">${escH(u.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>التاريخ *</label><input id="tsDate" class="input" type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
  </div>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>المهمة</label>
      <select id="tsTask" class="input">
        <option value="">-- اختر مهمة --</option>
        ${tasks.map(t=>`<option value="${t.id}">${escH(t.title)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>العميل</label>
      <select id="tsClient" class="input">
        <option value="">-- اختر عميل --</option>
        ${clients.map(c=>`<option value="${c.id}">${escH(c.name)}</option>`).join('')}
      </select>
    </div>
  </div>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>الساعات *</label><input id="tsHours" class="input" type="number" min="0.5" max="24" step="0.5" placeholder="مثال: 2.5"/></div>
    <div class="form-group"><label>وصف العمل</label><input id="tsDesc" class="input" placeholder="ماذا عملت؟"/></div>
  </div>
  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="saveTimeEntry()">💾 حفظ</button>
  </div>`);
}

async function saveTimeEntry() {
  const emp=v('tsEmp'), hrs=v('tsHours');
  if(!emp){toast('اختر الموظف','error');return;}
  if(!hrs||+hrs<=0){toast('أدخل الساعات','error');return;}
  const body={employee_id:+emp,task_id:+v('tsTask')||null,client_id:+v('tsClient')||null,date:v('tsDate'),hours:+hrs,description:v('tsDesc')};
  try{await api('POST','/api/timesheet',body);closeModal();toast('تم التسجيل');loadTimesheet();}catch(e){toast(e.message,'error');}
}

async function showEditTimeEntry(id) {
  const e=_tsEntries.find(x=>x.id===id);
  if(!e) return;
  openModal(`<h3 style="margin:0 0 18px;font-size:16px;font-weight:800;color:#1e293b">✏️ تعديل الإدخال</h3>
  <div class="form-row" style="margin-bottom:14px">
    <div class="form-group"><label>التاريخ</label><input id="tsDate" class="input" type="date" value="${e.date||''}"/></div>
    <div class="form-group"><label>الساعات *</label><input id="tsHours" class="input" type="number" min="0.5" max="24" step="0.5" value="${e.hours}"/></div>
  </div>
  <div style="margin-bottom:18px"><label>وصف العمل</label><input id="tsDesc" class="input" value="${escH(e.description||'')}"/></div>
  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="updateTimeEntry(${id})">💾 حفظ</button>
  </div>`);
}

async function updateTimeEntry(id) {
  const hrs=v('tsHours');
  if(!hrs||+hrs<=0){toast('أدخل الساعات','error');return;}
  const body={hours:+hrs,description:v('tsDesc'),date:v('tsDate')};
  try{await api('PUT',`/api/timesheet/${id}`,body);closeModal();toast('تم التحديث');loadTimesheet();}catch(e){toast(e.message,'error');}
}

async function deleteTimeEntry(id) {
  if(!await confirmDlg('حذف هذا الإدخال؟','تأكيد الحذف')) return;
  try{await api('DELETE',`/api/timesheet/${id}`);toast('تم الحذف');loadTimesheet();}catch(e){toast(e.message,'error');}
}

window.loadTimesheet=loadTimesheet; window.showAddTimeEntry=showAddTimeEntry; window.saveTimeEntry=saveTimeEntry;
window.showEditTimeEntry=showEditTimeEntry; window.updateTimeEntry=updateTimeEntry;
window.deleteTimeEntry=deleteTimeEntry;

// ════════════════════════════════════════════════════════════════════════════
// ── خدمات المكتب — Office Services
// ════════════════════════════════════════════════════════════════════════════
const SERVICE_TYPE_LABELS = {
  audit:'المراجعة', accounting:'الحسابات', tax:'الضرائب',
  legal:'الاستشارات القانونية', tax_systems:'منظومات الضرائب',
  establishment:'تأسيس الشركات', other:'أخرى'
};

async function loadOfficeServices() {
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <select id="osSvcFilter" class="input" style="width:auto" onchange="loadOfficeServices()">
        <option value="">جميع الخدمات</option>
        ${Object.entries(SERVICE_TYPE_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
      </select>
      <select id="osStatusFilter" class="input" style="width:auto" onchange="loadOfficeServices()">
        <option value="">جميع الحالات</option>
        <option value="active">نشط</option>
        <option value="paused">موقوف</option>
        <option value="completed">مكتمل</option>
      </select>
    </div>
    <button class="btn btn-primary" onclick="showAddOfficeService()">➕ خدمة جديدة</button>
  </div>
  <div id="osList">${skeletonTable(4,5)}</div>`;

  const svcType = document.getElementById('osSvcFilter')?.value||'';
  const status  = document.getElementById('osStatusFilter')?.value||'';
  let url = '/api/office-services';
  const params = [];
  if(svcType) params.push(`service_type=${svcType}`);
  if(status) params.push(`status=${status}`);
  if(params.length) url += '?' + params.join('&');

  try {
    const services = await api('GET', url);
    const el = document.getElementById('osList');
    if(!el) return;
    if(!services.length){
      el.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:#94a3b8">
        <div style="font-size:48px;margin-bottom:12px">🏢</div>
        <div style="font-weight:600">لا توجد خدمات مسجلة بعد</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="showAddOfficeService()">➕ أضف أول خدمة</button>
      </div>`;
      return;
    }
    el.innerHTML = `<div class="card">
      <table>
        <thead><tr><th>العميل</th><th>الخدمة</th><th>الحالة</th><th>الرسوم</th><th>الدورية</th><th>المهام</th><th>إجراءات</th></tr></thead>
        <tbody>${services.map(s=>`
          <tr>
            <td><strong>${escH(s.client_name||'-')}</strong></td>
            <td><span style="display:flex;align-items:center;gap:6px">
              <span style="background:#eef1fb;color:#1a2472;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600">${escH(s.service_type_label)}</span>
              ${s.name?`<span>${escH(s.name)}</span>`:''}
            </span></td>
            <td>${s.status==='active'?'<span class="badge badge-green">نشط</span>':s.status==='paused'?'<span class="badge badge-yellow">موقوف</span>':'<span class="badge badge-gray">مكتمل</span>'}</td>
            <td>${s.fee?`${s.fee.toLocaleString('ar-EG')} جنيه`:'—'}</td>
            <td>${{monthly:'شهري',quarterly:'ربع سنوي',annual:'سنوي',once:'مرة واحدة'}[s.fee_period]||s.fee_period}</td>
            <td><span class="badge badge-blue">${s.task_count} مهمة</span>${s.pending_tasks?`<span class="badge badge-orange" style="margin-right:4px">${s.pending_tasks} معلق</span>`:''}</td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="showOfficeServiceDetail(${s.id})">تفاصيل</button>
              <button class="btn btn-sm btn-danger" style="margin-right:4px" onclick="deleteOfficeService(${s.id})">حذف</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } catch(e) { toast(e.message,'error'); }
}

async function showAddOfficeService() {
  let clients = [];
  try { clients=await getClients(); } catch(e){}
  openModal(`
  <h3 style="margin:0 0 18px;font-size:16px;font-weight:800;color:#1e293b">🏢 إضافة خدمة جديدة</h3>
  <div style="display:grid;gap:14px">
    <div><label>العميل *</label>
      <select id="osSvcClient" class="input">
        <option value="">اختر عميل</option>
        ${clients.map(c=>`<option value="${c.id}">${escH(c.name)}</option>`).join('')}
      </select></div>
    <div><label>نوع الخدمة *</label>
      <select id="osSvcType" class="input">
        ${Object.entries(SERVICE_TYPE_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
      </select></div>
    <div><label>اسم الخدمة (اختياري)</label><input id="osSvcName" class="input" placeholder="مثال: مراجعة 2024"/></div>
    <div class="form-row">
      <div><label>الرسوم</label><input id="osSvcFee" class="input" type="number" min="0" placeholder="0"/></div>
      <div><label>الدورية</label>
        <select id="osSvcPeriod" class="input">
          <option value="monthly">شهري</option>
          <option value="quarterly">ربع سنوي</option>
          <option value="annual">سنوي</option>
          <option value="once">مرة واحدة</option>
        </select></div>
    </div>
    <div><label>ملاحظات</label><textarea id="osSvcNotes" class="input" rows="2"></textarea></div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveOfficeService()">💾 حفظ</button>
    </div>
  </div>`);
}

async function saveOfficeService() {
  const client_id = v('osSvcClient');
  if(!client_id){toast('اختر العميل','error');return;}
  const body={
    client_id:+client_id,
    service_type:v('osSvcType'),
    name:v('osSvcName')||null,
    fee:+v('osSvcFee')||0,
    fee_period:v('osSvcPeriod'),
    notes:v('osSvcNotes')||null,
  };
  try{await api('POST','/api/office-services',body);closeModal();toast('تم إضافة الخدمة');loadOfficeServices();}
  catch(e){toast(e.message,'error');}
}

async function showOfficeServiceDetail(id) {
  let s;
  try { s = await api('GET',`/api/office-services/${id}`); } catch(e){toast(e.message,'error');return;}
  openModal(`
  <h3 style="margin:0 0 14px;font-size:15px;font-weight:800;color:#1e293b">🏢 ${escH(s.name||s.service_type_label)} — ${escH(s.client_name||'')}</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;font-size:13px">
    <div><span style="color:#94a3b8">الحالة:</span> ${s.status==='active'?'<span class="badge badge-green">نشط</span>':s.status==='paused'?'<span class="badge badge-yellow">موقوف</span>':'<span class="badge badge-gray">مكتمل</span>'}</div>
    <div><span style="color:#94a3b8">الرسوم:</span> ${s.fee?s.fee.toLocaleString('ar-EG')+' جنيه':'—'}</div>
    ${s.notes?`<div style="grid-column:1/-1"><span style="color:#94a3b8">ملاحظات:</span> ${escH(s.notes)}</div>`:''}
  </div>
  <div style="font-weight:700;color:#1a2472;margin-bottom:10px;font-size:14px">المهام (${s.tasks?.length||0})</div>
  <div id="osSvcTasksList" style="margin-bottom:14px">
    ${(s.tasks||[]).map(t=>`
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:#f8fafc;margin-bottom:6px;border:1px solid #e8edf3">
        <input type="checkbox" ${t.status==='done'?'checked':''} onchange="updateOsSvcTask(${t.id},this.checked)" style="width:16px;height:16px;accent-color:#1a2472"/>
        <span style="${t.status==='done'?'text-decoration:line-through;color:#94a3b8':''}">${escH(t.title)}</span>
        <span style="margin-right:auto;font-size:11px;color:#94a3b8">${t.due_date?t.due_date.slice(0,10):''}</span>
      </div>`).join('')||'<div style="color:#94a3b8;font-size:13px;text-align:center;padding:10px">لا توجد مهام</div>'}
  </div>
  <div style="display:flex;gap:8px;margin-bottom:14px">
    <input id="newOsTaskTitle" class="input" placeholder="مهمة جديدة..." style="flex:1"/>
    <button class="btn btn-primary btn-sm" onclick="addOsServiceTask(${id})">➕</button>
  </div>
  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button class="btn btn-secondary btn-sm" onclick="changeOsStatus(${id},'${s.status}')">تغيير الحالة</button>
    <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
  </div>`,{wide:true});
}

async function addOsServiceTask(serviceId) {
  const title = v('newOsTaskTitle');
  if(!title){toast('أدخل عنوان المهمة','error');return;}
  try{await api('POST',`/api/office-services/${serviceId}/tasks`,{title});showOfficeServiceDetail(serviceId);}
  catch(e){toast(e.message,'error');}
}

async function updateOsSvcTask(taskId, done) {
  try{await api('PUT',`/api/office-services/tasks/${taskId}`,{status:done?'done':'pending'});}
  catch(e){toast(e.message,'error');}
}

async function changeOsStatus(id, current) {
  const next = current==='active'?'paused':current==='paused'?'completed':'active';
  try{await api('PUT',`/api/office-services/${id}`,{status:next});closeModal();toast('تم تغيير الحالة');loadOfficeServices();}
  catch(e){toast(e.message,'error');}
}

async function deleteOfficeService(id) {
  if(!await confirmDlg('حذف هذه الخدمة؟','سيتم حذف الخدمة وجميع مهامها')) return;
  try{await api('DELETE',`/api/office-services/${id}`);toast('تم الحذف');loadOfficeServices();}
  catch(e){toast(e.message,'error');}
}

window.loadOfficeServices=loadOfficeServices;
window.showAddOfficeService=showAddOfficeService; window.saveOfficeService=saveOfficeService;
window.showOfficeServiceDetail=showOfficeServiceDetail; window.addOsServiceTask=addOsServiceTask;
window.updateOsSvcTask=updateOsSvcTask; window.changeOsStatus=changeOsStatus;
window.deleteOfficeService=deleteOfficeService;


// ════════════════════════════════════════════════════════════════════════════
// ── وثائق الشركة — Company Documents with Expiry Alerts
// ════════════════════════════════════════════════════════════════════════════
const DOC_TYPE_LABELS = {
  tax_card:'البطاقة الضريبية', commercial_reg:'السجل التجاري',
  vat_cert:'شهادة القيمة المضافة', import_card:'البطاقة الاستيرادية',
  export_card:'البطاقة التصديرية', power_of_attorney:'التوكيل / التفويض',
  license:'ترخيص', other:'أخرى'
};

async function loadCompanyDocs() {
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML = `
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:20px">
    <div class="stat-card stat-red" onclick="loadCompanyDocs('expired')" style="cursor:pointer">
      <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:4px">مستندات منتهية</div>
      <div id="cdExpiredCount" style="font-size:26px;font-weight:800;color:#dc2626">—</div>
    </div>
    <div class="stat-card stat-purple" onclick="loadCompanyDocs('expiring30')" style="cursor:pointer">
      <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:4px">تنتهي خلال 30 يوم</div>
      <div id="cdExpiring30Count" style="font-size:26px;font-weight:800;color:#7c3aed">—</div>
    </div>
    <div class="stat-card stat-green">
      <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:4px">مستندات سارية</div>
      <div id="cdActiveCount" style="font-size:26px;font-weight:800;color:#16a34a">—</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <select id="cdClientFilter" class="input" style="width:auto" onchange="loadCompanyDocsForClient()">
        <option value="">اختر عميل لعرض مستنداته</option>
      </select>
      <select id="cdTypeFilter" class="input" style="width:auto" onchange="loadCompanyDocsForClient()">
        <option value="">جميع الأنواع</option>
        ${Object.entries(DOC_TYPE_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-primary" onclick="showAddCompanyDoc()">➕ إضافة مستند</button>
  </div>
  <div id="cdAlerts" style="margin-bottom:16px"></div>
  <div id="cdList">${skeletonTable(5,6)}</div>`;

  // Load clients for filter
  try {
    const items = await getClients();
    const sel = document.getElementById('cdClientFilter');
    if(sel) items.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;sel.appendChild(o);});
  } catch(e){}

  // Load alerts (expired & expiring soon)
  try {
    const [expired, expiring] = await Promise.all([
      api('GET','/api/company-documents/expired').catch(()=>[]),
      api('GET','/api/company-documents/expiring?days=30').catch(()=>[]),
    ]);
    const ec = document.getElementById('cdExpiredCount');
    const e3 = document.getElementById('cdExpiring30Count');
    if(ec) ec.textContent = expired.length;
    if(e3) e3.textContent = expiring.length;

    const alerts = document.getElementById('cdAlerts');
    if(alerts && (expired.length||expiring.length)) {
      alerts.innerHTML = `
        ${expired.length?`<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:10px;padding:12px 16px;margin-bottom:10px;display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">⚠️</span>
          <div><strong style="color:#dc2626">${expired.length} مستند منتهي الصلاحية!</strong>
          <div style="font-size:12px;color:#991b1b;margin-top:3px">${expired.slice(0,3).map(d=>`${d.client_id?'':''}${escH(d.doc_name||d.doc_type_label)} (انتهى ${d.expiry_date})`).join(' — ')}</div></div>
        </div>`:''}
        ${expiring.length?`<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:12px 16px;margin-bottom:10px;display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">🔔</span>
          <div><strong style="color:#a16207">${expiring.length} مستند ينتهي خلال 30 يوم</strong>
          <div style="font-size:12px;color:#854d0e;margin-top:3px">${expiring.slice(0,3).map(d=>`${escH(d.doc_name||d.doc_type_label)} (${d.days_until_expiry} يوم)`).join(' — ')}</div></div>
        </div>`:''} `;
    }
  } catch(e){}

  loadCompanyDocsForClient();
}

async function loadCompanyDocsForClient() {
  const clientId = document.getElementById('cdClientFilter')?.value;
  const docType  = document.getElementById('cdTypeFilter')?.value||'';
  const el = document.getElementById('cdList');
  if(!el) return;

  if(!clientId) {
    el.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:#94a3b8">
      <div style="font-size:48px;margin-bottom:12px">📜</div>
      <div>اختر عميلاً من القائمة أعلاه لعرض مستنداته</div>
    </div>`;
    return;
  }

  el.innerHTML = skeletonTable(4,5);
  try {
    let docs = await api('GET',`/api/company-documents/client/${clientId}`);
    if(docType) docs = docs.filter(d=>d.doc_type===docType);
    if(!docs.length){
      el.innerHTML=`<div class="card" style="padding:30px;text-align:center;color:#94a3b8">لا توجد مستندات لهذا العميل</div>`;
      return;
    }
    el.innerHTML=`<div class="card"><table>
      <thead><tr><th>النوع</th><th>الرقم</th><th>تاريخ الإصدار</th><th>تاريخ الانتهاء</th><th>الحالة</th><th>الأيام المتبقية</th><th>إجراءات</th></tr></thead>
      <tbody>${docs.map(d=>`
        <tr>
          <td><strong>${escH(d.doc_type_label)}</strong>${d.doc_name&&d.doc_name!==d.doc_type_label?`<br><span style="font-size:11px;color:#94a3b8">${escH(d.doc_name)}</span>`:''}</td>
          <td>${d.doc_number||'—'}</td>
          <td>${d.issue_date||'—'}</td>
          <td>${d.expiry_date||'—'}</td>
          <td>${d.status==='expired'?'<span class="badge badge-red">منتهي</span>':d.status==='expiring_soon'?'<span class="badge badge-yellow">ينتهي قريباً</span>':'<span class="badge badge-green">ساري</span>'}</td>
          <td>${d.days_until_expiry!=null?`<span style="color:${d.days_until_expiry<0?'#dc2626':d.days_until_expiry<=30?'#d97706':'#16a34a'};font-weight:600">${d.days_until_expiry<0?`منذ ${-d.days_until_expiry} يوم`:d.days_until_expiry+' يوم'}</span>`:'—'}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deleteCompanyDoc(${d.id})">حذف</button></td>
        </tr>`).join('')}
      </tbody></table></div>`;
  } catch(e){toast(e.message,'error');}
}

async function showAddCompanyDoc() {
  let clients = [];
  try { clients=await getClients(); } catch(e){}
  openModal(`
  <h3 style="margin:0 0 18px;font-size:16px;font-weight:800;color:#1e293b">📜 إضافة مستند</h3>
  <div style="display:grid;gap:14px">
    <div><label>العميل *</label>
      <select id="cdAddClient" class="input">
        <option value="">اختر عميل</option>
        ${clients.map(c=>`<option value="${c.id}">${escH(c.name)}</option>`).join('')}
      </select></div>
    <div><label>نوع المستند *</label>
      <select id="cdAddType" class="input">
        ${Object.entries(DOC_TYPE_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
      </select></div>
    <div><label>رقم المستند</label><input id="cdAddNum" class="input" placeholder="مثال: 123456"/></div>
    <div class="form-row">
      <div><label>تاريخ الإصدار</label><input id="cdAddIssue" class="input" type="date"/></div>
      <div><label>تاريخ الانتهاء</label><input id="cdAddExpiry" class="input" type="date"/></div>
    </div>
    <div><label>ملاحظات</label><textarea id="cdAddNotes" class="input" rows="2"></textarea></div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveCompanyDoc()">💾 حفظ</button>
    </div>
  </div>`);
}

async function saveCompanyDoc() {
  const clientId = v('cdAddClient');
  if(!clientId){toast('اختر العميل','error');return;}
  const fd = new FormData();
  fd.append('doc_type', v('cdAddType'));
  fd.append('doc_number', v('cdAddNum'));
  if(v('cdAddIssue'))  fd.append('issue_date',  v('cdAddIssue'));
  if(v('cdAddExpiry')) fd.append('expiry_date', v('cdAddExpiry'));
  if(v('cdAddNotes'))  fd.append('notes',        v('cdAddNotes'));
  try {
    await fetchWithAuth(`/api/company-documents/client/${clientId}`, {method:'POST', body:fd});
    closeModal(); toast('تم إضافة المستند'); loadCompanyDocs();
  } catch(e){toast(e.message,'error');}
}

async function deleteCompanyDoc(id) {
  if(!await confirmDlg('حذف هذا المستند؟','')) return;
  try{await api('DELETE',`/api/company-documents/${id}`);toast('تم الحذف');loadCompanyDocsForClient();}
  catch(e){toast(e.message,'error');}
}

// Helper for multipart fetch
function fetchWithAuth(url, opts={}) {
  const base = API; // Uses the module-level API constant (which checks window.MS_API first)
  const headers = {'Authorization':`Bearer ${token}`};
  if(opts.body instanceof FormData) { /* let browser set content-type */ }
  else { headers['Content-Type']='application/json'; }
  return fetch(base+url, {...opts, headers:{...headers,...(opts.headers||{})}})
    .then(async r=>{if(!r.ok){const e=await r.json().catch(()=>({detail:r.statusText}));throw new Error(e.detail||r.statusText);}return r.json();});
}

window.loadCompanyDocs=loadCompanyDocs; window.loadCompanyDocsForClient=loadCompanyDocsForClient;
window.showAddCompanyDoc=showAddCompanyDoc; window.saveCompanyDoc=saveCompanyDoc;
window.deleteCompanyDoc=deleteCompanyDoc;


// ════════════════════════════════════════════════════════════════════════════
// ── إدارة الملفات والمجلدات — File & Folder Manager
// ════════════════════════════════════════════════════════════════════════════
let _folderStack = []; // breadcrumb stack

async function loadFolders(parentId=null, clientId=null) {
  const main = document.getElementById('main');
  main.className = 'page';

  if(parentId===null && clientId===null) {
    _folderStack = [];
  }

  const params = [];
  if(clientId) params.push(`client_id=${clientId}`);
  if(parentId) params.push(`parent_id=${parentId}`);
  else params.push('parent_id=null');

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" onclick="loadFolders(null,null)">🏠 الرئيسية</button>
      ${_folderStack.map((f,i)=>`<span style="color:#94a3b8">›</span><button class="btn btn-secondary btn-sm" onclick="loadFolders(${f.id},null)">${escH(f.name)}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary btn-sm" onclick="showCreateFolder(${parentId||'null'})">📁 مجلد جديد</button>
      <button class="btn btn-primary btn-sm" onclick="showUploadFile(${parentId||'null'})">⬆️ رفع ملف</button>
    </div>
  </div>
  <div id="folderGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:24px">${skeletonTable(2,3)}</div>
  <div style="font-weight:700;color:#1a2472;margin-bottom:10px">الملفات</div>
  <div id="fileList" class="card">${skeletonTable(3,4)}</div>`;

  try {
    const url = `/api/folders?${params.join('&')}`;
    const folders = await api('GET', url);
    const grid = document.getElementById('folderGrid');
    if(grid) {
      grid.innerHTML = folders.length ? folders.map(f=>`
        <div onclick="drillIntoFolder(${f.id},'${escH(f.name)}')" style="background:white;border:1.5px solid #e8edf3;border-radius:12px;padding:18px;cursor:pointer;text-align:center;transition:all .15s;box-shadow:0 1px 4px rgba(0,0,0,.05)" onmouseover="this.style.borderColor='#1a2472';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#e8edf3';this.style.transform=''">
          <div style="font-size:40px;margin-bottom:8px">📁</div>
          <div style="font-weight:600;font-size:13px;color:#1e293b">${escH(f.name)}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px">${f.file_count} ملف</div>
          <button onclick="event.stopPropagation();deleteFolderItem(${f.id})" style="margin-top:8px;background:none;border:none;cursor:pointer;color:#94a3b8;font-size:11px">🗑️ حذف</button>
        </div>`).join('') : '<div style="color:#94a3b8;text-align:center;padding:30px;grid-column:1/-1">لا توجد مجلدات فرعية</div>';
    }
  } catch(e){}

  try {
    const filesUrl = `/api/folders/files/list${parentId?`?folder_id=${parentId}`:''}`;
    const files = await api('GET', filesUrl);
    const el = document.getElementById('fileList');
    if(el) {
      el.innerHTML = files.length ? `<table>
        <thead><tr><th>الاسم</th><th>الحجم</th><th>النوع</th><th>رُفع بواسطة</th><th>التاريخ</th><th>إجراءات</th></tr></thead>
        <tbody>${files.map(f=>`
          <tr>
            <td>📄 ${escH(f.original_name||f.name)}</td>
            <td>${f.file_size?Math.round(f.file_size/1024)+' KB':'—'}</td>
            <td><span style="font-size:11px;background:#f3f4f6;padding:2px 8px;border-radius:6px">${f.mime_type||'—'}</span></td>
            <td>${escH(f.uploader_name||'—')}</td>
            <td>${f.created_at?f.created_at.slice(0,10):'—'}</td>
            <td><button class="btn btn-sm btn-danger" onclick="deleteFileItem(${f.id})">🗑️</button></td>
          </tr>`).join('')}
        </tbody></table>` : `<div style="padding:30px;text-align:center;color:#94a3b8">لا توجد ملفات في هذا المجلد</div>`;
    }
  } catch(e){}
}

function drillIntoFolder(folderId, folderName) {
  _folderStack.push({id:folderId,name:folderName});
  loadFolders(folderId, null);
}

function showCreateFolder(parentId) {
  openModal(`
  <h3 style="margin:0 0 16px;font-size:15px;font-weight:800;color:#1e293b">📁 مجلد جديد</h3>
  <div style="margin-bottom:14px"><label>اسم المجلد *</label><input id="newFolderName" class="input" placeholder="مثال: عقود 2024"/></div>
  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="createFolder(${parentId||'null'})">💾 إنشاء</button>
  </div>`);
}

async function createFolder(parentId) {
  const name = v('newFolderName');
  if(!name){toast('أدخل اسم المجلد','error');return;}
  try{
    await api('POST','/api/folders',{name, parent_id:parentId||null});
    closeModal(); toast('تم إنشاء المجلد');
    loadFolders(parentId,null);
  }catch(e){toast(e.message,'error');}
}

function showUploadFile(folderId) {
  openModal(`
  <h3 style="margin:0 0 16px;font-size:15px;font-weight:800;color:#1e293b">⬆️ رفع ملف</h3>
  <div style="margin-bottom:14px">
    <label>الملف *</label>
    <input id="uploadFileInput" class="input" type="file"/>
  </div>
  <div style="margin-bottom:14px"><label>وصف (اختياري)</label><input id="uploadFileDesc" class="input" placeholder="وصف الملف"/></div>
  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    <button class="btn btn-primary" onclick="uploadFileToFolder(${folderId||'null'})">⬆️ رفع</button>
  </div>`);
}

async function uploadFileToFolder(folderId) {
  const input = document.getElementById('uploadFileInput');
  if(!input?.files?.length){toast('اختر ملفاً','error');return;}
  const fd = new FormData();
  fd.append('file', input.files[0]);
  const desc = v('uploadFileDesc');
  if(desc) fd.append('description',desc);
  try{
    const url = folderId ? `/api/folders/${folderId}/upload` : '/api/folders/upload';
    await fetchWithAuth(url,{method:'POST',body:fd});
    closeModal(); toast('تم رفع الملف');
    loadFolders(folderId,null);
  }catch(e){toast(e.message,'error');}
}

async function deleteFolderItem(id) {
  if(!await confirmDlg('حذف هذا المجلد؟','سيتم حذف المجلد وجميع محتوياته')) return;
  try{await api('DELETE',`/api/folders/${id}`);toast('تم الحذف');const p=_folderStack[_folderStack.length-2];loadFolders(p?.id||null,null);}
  catch(e){toast(e.message,'error');}
}

async function deleteFileItem(id) {
  if(!await confirmDlg('حذف هذا الملف؟','')) return;
  try{await api('DELETE',`/api/folders/files/${id}`);toast('تم الحذف');const p=_folderStack[_folderStack.length-1];loadFolders(p?.id||null,null);}
  catch(e){toast(e.message,'error');}
}

window.loadFolders=loadFolders; window.drillIntoFolder=drillIntoFolder;
window.showCreateFolder=showCreateFolder; window.createFolder=createFolder;
window.showUploadFile=showUploadFile; window.uploadFileToFolder=uploadFileToFolder;
window.deleteFolderItem=deleteFolderItem; window.deleteFileItem=deleteFileItem;


// ════════════════════════════════════════════════════════════════════════════
// ── سجل المراجعة — Audit Trail
// ════════════════════════════════════════════════════════════════════════════
async function loadAuditTrail() {
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML = `
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
    <select id="atModule" class="input" style="width:auto" onchange="fetchAuditLogs()">
      <option value="">جميع الوحدات</option>
      ${['clients','invoices','tasks','documents','company_documents','folders','office_services','permissions','client_portal'].map(m=>`<option value="${m}">${m}</option>`).join('')}
    </select>
    <select id="atAction" class="input" style="width:auto" onchange="fetchAuditLogs()">
      <option value="">جميع الإجراءات</option>
      <option value="create">إنشاء</option>
      <option value="update">تعديل</option>
      <option value="delete">حذف</option>
      <option value="view">عرض</option>
      <option value="export">تصدير</option>
    </select>
    <button class="btn btn-secondary btn-sm" onclick="fetchAuditLogs()">🔄 تحديث</button>
  </div>
  <div id="auditList" class="card">${skeletonTable(5,6)}</div>`;
  fetchAuditLogs();
}

async function fetchAuditLogs() {
  const module = document.getElementById('atModule')?.value||'';
  const action = document.getElementById('atAction')?.value||'';
  let url='/api/audit-logs?page_size=100';
  if(module) url+=`&module=${module}`;
  if(action) url+=`&action=${action}`;
  const el=document.getElementById('auditList');
  if(!el) return;
  try{
    const {items,total}=await api('GET',url);
    const ACTION_ICONS={create:'➕',update:'✏️',delete:'🗑️',view:'👁️',export:'📤',approve:'✅'};
    el.innerHTML=`<table>
      <thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>الإجراء</th><th>الوحدة</th><th>السجل</th><th>IP</th></tr></thead>
      <tbody>${(items||[]).map(l=>`
        <tr>
          <td style="white-space:nowrap;font-size:12px">${l.created_at?l.created_at.replace('T',' ').slice(0,19):''}</td>
          <td>${escH(l.user_name||'النظام')}</td>
          <td><span style="display:flex;align-items:center;gap:4px">${ACTION_ICONS[l.action]||'•'} ${l.action}</span></td>
          <td><span style="background:#eef1fb;color:#1a2472;padding:2px 8px;border-radius:6px;font-size:12px">${l.module}</span></td>
          <td>${escH(l.record_name||String(l.record_id||'—'))}</td>
          <td style="font-size:11px;color:#94a3b8">${l.ip_address||'—'}</td>
        </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:30px">لا توجد سجلات</td></tr>'}
      </tbody></table>
      <div style="padding:12px 16px;font-size:12px;color:#94a3b8;border-top:1px solid #f3f4f6">إجمالي: ${total||0} سجل</div>`;
  }catch(e){el.innerHTML=`<div style="padding:30px;text-align:center;color:#94a3b8">تعذر تحميل السجلات: ${e.message}</div>`;}
}

window.loadAuditTrail=loadAuditTrail; window.fetchAuditLogs=fetchAuditLogs;


// ════════════════════════════════════════════════════════════════════════════
// ── بوابة العملاء — Client Portal Management
// ════════════════════════════════════════════════════════════════════════════
async function loadClientPortal() {
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML = `
  <div style="background:linear-gradient(135deg,#0f172a,#1a2472);border-radius:16px;padding:24px;color:white;margin-bottom:20px">
    <div style="font-size:32px;margin-bottom:8px">🔑</div>
    <div style="font-size:17px;font-weight:800;margin-bottom:4px">بوابة العملاء</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6)">أنشئ حسابات دخول للعملاء لمتابعة ملفاتهم ومستحقاتهم</div>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
    <button class="btn btn-primary" onclick="showCreatePortalUser()">➕ إنشاء حساب عميل</button>
  </div>
  <div id="portalList" class="card">${skeletonTable(5,5)}</div>`;
  fetchPortalUsers();
}

async function fetchPortalUsers() {
  const el = document.getElementById('portalList');
  if(!el) return;
  try{
    const users = await api('GET','/api/portal/users');
    if(!users.length){
      el.innerHTML=`<div style="padding:40px;text-align:center;color:#94a3b8">
        <div style="font-size:48px;margin-bottom:12px">🔑</div>
        <div>لا توجد حسابات بوابة بعد</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="showCreatePortalUser()">➕ إنشاء أول حساب</button>
      </div>`;
      return;
    }
    el.innerHTML=`<table>
      <thead><tr><th>العميل</th><th>اسم المستخدم</th><th>الحالة</th><th>الصلاحيات</th><th>آخر دخول</th><th>إجراءات</th></tr></thead>
      <tbody>${users.map(u=>`
        <tr>
          <td><strong>${escH(u.client_name||'—')}</strong></td>
          <td><code style="background:#f3f4f6;padding:2px 8px;border-radius:6px;font-size:13px">${escH(u.username)}</code></td>
          <td>${u.is_active?'<span class="badge badge-green">نشط</span>':'<span class="badge badge-red">معطل</span>'}</td>
          <td style="font-size:12px">
            ${u.can_see_invoices?'💳 ':''} ${u.can_see_files?'📁 ':''}${u.can_see_obligations?'📋 ':''}${u.can_see_tasks?'✅ ':''}${u.can_see_reports?'📊 ':''}
          </td>
          <td style="font-size:12px;color:#94a3b8">${u.last_login?u.last_login.slice(0,16).replace('T',' '):'لم يدخل بعد'}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="showEditPortalUser(${u.id})">تعديل</button>
            <button class="btn btn-sm btn-danger" style="margin-right:4px" onclick="togglePortalUser(${u.id},${!u.is_active})">${u.is_active?'تعطيل':'تفعيل'}</button>
            <button class="btn btn-sm btn-danger" style="margin-right:4px" onclick="deletePortalUser(${u.id})">حذف</button>
          </td>
        </tr>`).join('')}
      </tbody></table>`;
  }catch(e){el.innerHTML=`<div style="padding:30px;text-align:center;color:#94a3b8">خطأ: ${e.message}</div>`;}
}

async function showCreatePortalUser() {
  let clients=[];
  try{clients=await getClients();}catch(e){}
  openModal(`
  <h3 style="margin:0 0 18px;font-size:16px;font-weight:800;color:#1e293b">🔑 إنشاء حساب عميل</h3>
  <div style="display:grid;gap:14px">
    <div><label>العميل *</label>
      <select id="puClient" class="input"><option value="">اختر عميل</option>
        ${clients.map(c=>`<option value="${c.id}">${escH(c.name)}</option>`).join('')}
      </select></div>
    <div><label>اسم المستخدم *</label><input id="puUsername" class="input" placeholder="مثال: client_abc"/></div>
    <div><label>كلمة المرور *</label><input id="puPassword" class="input" type="password" placeholder="كلمة مرور قوية"/></div>
    <div style="border:1px solid #e8edf3;border-radius:10px;padding:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">الصلاحيات</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
        <label style="display:flex;align-items:center;gap:6px"><input id="puFil" type="checkbox" checked/> رؤية الملفات</label>
        <label style="display:flex;align-items:center;gap:6px"><input id="puInv" type="checkbox" checked/> رؤية الفواتير</label>
        <label style="display:flex;align-items:center;gap:6px"><input id="puObl" type="checkbox" checked/> رؤية الالتزامات</label>
        <label style="display:flex;align-items:center;gap:6px"><input id="puRep" type="checkbox" checked/> رؤية التقارير</label>
        <label style="display:flex;align-items:center;gap:6px"><input id="puTsk" type="checkbox"/> رؤية المهام</label>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="savePortalUser()">💾 إنشاء</button>
    </div>
  </div>`);
}

async function savePortalUser() {
  const client_id=v('puClient');
  const username=v('puUsername');
  const password=v('puPassword');
  if(!client_id||!username||!password){toast('يجب ملء جميع الحقول الإلزامية','error');return;}
  const body={
    client_id:+client_id, username, password,
    can_see_files: document.getElementById('puFil')?.checked,
    can_see_invoices: document.getElementById('puInv')?.checked,
    can_see_obligations: document.getElementById('puObl')?.checked,
    can_see_reports: document.getElementById('puRep')?.checked,
    can_see_tasks: document.getElementById('puTsk')?.checked,
  };
  try{await api('POST','/api/portal/users',body);closeModal();toast('تم إنشاء الحساب');fetchPortalUsers();}
  catch(e){toast(e.message,'error');}
}

async function showEditPortalUser(id) {
  openModal(`
  <h3 style="margin:0 0 16px;font-size:15px;font-weight:800;color:#1e293b">✏️ تعديل حساب البوابة</h3>
  <div style="display:grid;gap:14px">
    <div><label>كلمة مرور جديدة (اتركها فارغة لعدم التغيير)</label><input id="epuPass" class="input" type="password" placeholder="كلمة مرور جديدة..."/></div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="updatePortalUser(${id})">💾 حفظ</button>
    </div>
  </div>`);
}

async function updatePortalUser(id) {
  const pwd=v('epuPass');
  if(!pwd){closeModal();return;}
  try{await api('PUT',`/api/portal/users/${id}`,{password:pwd});closeModal();toast('تم تحديث كلمة المرور');}
  catch(e){toast(e.message,'error');}
}

async function togglePortalUser(id, isActive) {
  try{await api('PUT',`/api/portal/users/${id}`,{is_active:isActive});toast(isActive?'تم التفعيل':'تم التعطيل');fetchPortalUsers();}
  catch(e){toast(e.message,'error');}
}

async function deletePortalUser(id) {
  if(!await confirmDlg('حذف هذا الحساب؟','')) return;
  try{await api('DELETE',`/api/portal/users/${id}`);toast('تم الحذف');fetchPortalUsers();}
  catch(e){toast(e.message,'error');}
}

window.loadClientPortal=loadClientPortal; window.fetchPortalUsers=fetchPortalUsers;
window.showCreatePortalUser=showCreatePortalUser; window.savePortalUser=savePortalUser;
window.showEditPortalUser=showEditPortalUser; window.updatePortalUser=updatePortalUser;
window.togglePortalUser=togglePortalUser; window.deletePortalUser=deletePortalUser;


// ════════════════════════════════════════════════════════════════════════════
// ── إدارة الصلاحيات — Permissions Management
// ════════════════════════════════════════════════════════════════════════════
const MODULE_LABELS = {
  dashboard:'الرئيسية', clients:'العملاء', invoices:'الفواتير',
  tasks:'المهام', documents:'الأرشيف', tax:'الضرائب',
  accounting:'المحاسبة', payroll:'الرواتب', fixed_assets:'الأصول',
  reports:'التقارير', leads:'العملاء المحتملين', quotations:'عروض الأسعار',
  obligations:'الالتزامات', collection:'التحصيلات', postal:'البوسطة',
  statements:'الميزانيات', timesheet:'التايم شيت', settlements:'التسويات',
  eta:'منظومة الضرائب', users:'المستخدمين', settings:'الإعدادات',
  company_documents:'وثائق الشركة', office_services:'خدمات المكتب',
  folders:'الملفات', audit_logs:'سجل المراجعة', client_portal:'بوابة العملاء'
};

async function loadPermissions() {
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML = `
  <div style="background:#fef9c3;border:1px solid #fde047;border-radius:12px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#854d0e;display:flex;align-items:center;gap:10px">
    <span style="font-size:18px">🛡️</span>
    <div>هذه الصفحة لإدارة صلاحيات المستخدمين لكل وحدة. المدير يملك صلاحيات كاملة دائماً ولا يمكن تقييده.</div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
    <label style="font-weight:600;font-size:13px">اختر مستخدم:</label>
    <select id="permUserSelect" class="input" style="width:auto;min-width:200px" onchange="loadUserPermissions()">
      <option value="">اختر...</option>
    </select>
  </div>
  <div id="permMatrix"></div>`;

  try{
    const users=await api('GET','/api/users');
    const sel=document.getElementById('permUserSelect');
    if(sel)(users.items||users).filter(u=>u.role!=='admin').forEach(u=>{
      const o=document.createElement('option');
      o.value=u.id; o.textContent=`${u.name} (${u.role})`;
      sel.appendChild(o);
    });
  }catch(e){}
}

async function loadUserPermissions() {
  const userId = document.getElementById('permUserSelect')?.value;
  const el = document.getElementById('permMatrix');
  if(!el) return;
  if(!userId){el.innerHTML='';return;}

  el.innerHTML = `<div style="text-align:center;padding:30px"><div class="spinner" style="margin:0 auto"></div></div>`;

  try{
    const perms = await api('GET',`/api/permissions/user/${userId}`);
    const modules = await api('GET','/api/permissions/modules');
    const permMap = Object.fromEntries((perms||[]).map(p=>[p.module,p]));

    const cols = ['can_view','can_add','can_edit','can_delete','can_export','can_approve'];
    const colLabels = {can_view:'عرض',can_add:'إضافة',can_edit:'تعديل',can_delete:'حذف',can_export:'تصدير',can_approve:'اعتماد'};

    el.innerHTML = `
    <div class="card" style="overflow-x:auto">
      <table id="permTable">
        <thead><tr>
          <th>الوحدة</th>
          ${cols.map(c=>`<th style="text-align:center">${colLabels[c]}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${(modules.modules||[]).map(m=>{
            const p = permMap[m]||{};
            return `<tr>
              <td><strong>${MODULE_LABELS[m]||m}</strong><br><span style="font-size:11px;color:#94a3b8">${m}</span></td>
              ${cols.map(c=>`<td style="text-align:center">
                <input type="checkbox" data-module="${m}" data-perm="${c}" ${p[c]?'checked':''} style="width:16px;height:16px;accent-color:#1a2472" onchange="permCheckChange(this)"/>
              </td>`).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-primary" onclick="savePermissions(${userId})">💾 حفظ الصلاحيات</button>
    </div>`;
  }catch(e){el.innerHTML=`<div style="padding:30px;text-align:center;color:#94a3b8">خطأ: ${e.message}</div>`;}
}

function permCheckChange(cb) {
  // If checking any action, also check "view"
  if(cb.dataset.perm!=='can_view' && cb.checked) {
    const viewCb = document.querySelector(`input[data-module="${cb.dataset.module}"][data-perm="can_view"]`);
    if(viewCb) viewCb.checked = true;
  }
}

async function savePermissions(userId) {
  const cbs = document.querySelectorAll('#permTable input[type=checkbox]');
  const permMap = {};
  cbs.forEach(cb=>{
    if(!permMap[cb.dataset.module]) permMap[cb.dataset.module]={module:cb.dataset.module};
    permMap[cb.dataset.module][cb.dataset.perm]=cb.checked;
  });
  const permissions = Object.values(permMap);
  try{
    await api('POST','/api/permissions/bulk',{user_id:+userId,permissions});
    toast('✅ تم حفظ الصلاحيات');
  }catch(e){toast(e.message,'error');}
}

window.loadPermissions=loadPermissions; window.loadUserPermissions=loadUserPermissions;
window.permCheckChange=permCheckChange; window.savePermissions=savePermissions;

// ════════════════════════════════════════════════════════════════════════════
// ── i18n — Arabic / English Language Toggle
// ════════════════════════════════════════════════════════════════════════════
const I18N = {
  ar: {
    dashboard:'الرئيسية', clients:'العملاء', leads:'العملاء المحتملين',
    invoices:'أتعاب الحسابات', tasks:'المهام', documents:'الأرشيف',
    settings:'الإعدادات', search:'بحث...', logout:'خروج',
    save:'حفظ', cancel:'إلغاء', delete:'حذف', edit:'تعديل',
    add:'إضافة', close:'إغلاق', name:'الاسم', phone:'الهاتف',
    status:'الحالة', date:'التاريخ', notes:'ملاحظات',
    active:'نشط', inactive:'غير نشط',
    tax:'الضرائب', accounting:'المحاسبة', reports:'التقارير',
    office_services:'خدمات المكتب', company_docs:'وثائق الشركة',
    folders:'إدارة الملفات', audit_trail:'سجل المراجعة',
    client_portal:'بوابة العملاء', permissions:'الصلاحيات',
  },
  en: {
    dashboard:'Dashboard', clients:'Clients', leads:'Leads',
    invoices:'Invoices', tasks:'Tasks', documents:'Documents',
    settings:'Settings', search:'Search...', logout:'Logout',
    save:'Save', cancel:'Cancel', delete:'Delete', edit:'Edit',
    add:'Add', close:'Close', name:'Name', phone:'Phone',
    status:'Status', date:'Date', notes:'Notes',
    active:'Active', inactive:'Inactive',
    tax:'Tax', accounting:'Accounting', reports:'Reports',
    office_services:'Office Services', company_docs:'Company Docs',
    folders:'File Manager', audit_trail:'Audit Trail',
    client_portal:'Client Portal', permissions:'Permissions',
  }
};

let _currentLang = localStorage.getItem('ms_lang') || 'ar';

function t(key) {
  return I18N[_currentLang]?.[key] || I18N.ar[key] || key;
}

function toggleLanguage() {
  _currentLang = _currentLang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('ms_lang', _currentLang);
  const isEn = _currentLang === 'en';

  // Update HTML dir & lang
  document.documentElement.lang = _currentLang;
  document.documentElement.dir = isEn ? 'ltr' : 'rtl';

  // Update toggle button
  const btn = document.getElementById('langToggleBtn');
  const lbl = document.getElementById('langToggleLabel');
  if(lbl) lbl.textContent = isEn ? 'AR' : 'EN';
  if(btn) btn.title = isEn ? 'Switch to Arabic / تحويل للعربية' : 'Switch to English';

  // Update nav item labels
  const navItemMap = Object.fromEntries(navItems.map(i=>[i.id,i]));
  document.querySelectorAll('.sidebar-link[data-nav-id]').forEach(el=>{
    const id = el.dataset.navId;
    const translated = I18N[_currentLang]?.[id];
    const labelEl = el.querySelector('span:last-child');
    if(labelEl && translated) labelEl.textContent = translated;
  });

  // Update page title
  const titleEl = document.getElementById('pageTitle');
  if(titleEl && currentPage) {
    const translated = I18N[_currentLang]?.[currentPage];
    if(translated) titleEl.textContent = translated;
  }

  // Search placeholder
  const sp = document.getElementById('searchPlaceholder');
  if(sp) sp.textContent = isEn ? 'Search... (Ctrl+K)' : 'بحث... (Ctrl+K)';

  toast(isEn ? '🌐 Switched to English' : '🌐 تم التحويل للعربية');
}

// ══════════════════════════════════════════════════════════════════
// 👑  OWNER DASHBOARD — إدارة المكتب المالية
// ══════════════════════════════════════════════════════════════════
let ownerTab = 'dashboard'; // dashboard | revenues | expenses | partners | snapshots | annual

async function loadOwnerDashboard() {
  if(currentUser?.role !== 'admin') {
    document.getElementById('main').innerHTML = `<div style="text-align:center;padding:80px;color:#dc2626;font-size:18px">🔒 هذه الصفحة للمسؤول فقط</div>`;
    return;
  }
  renderOwnerTabs();
}

function renderOwnerTabs() {
  const tabs = [
    {id:'dashboard', icon:'📊', label:'لوحة التحكم'},
    {id:'revenues',  icon:'💰', label:'الإيرادات'},
    {id:'expenses',  icon:'🧾', label:'المصاريف'},
    {id:'partners',  icon:'🤝', label:'توزيع الأرباح'},
    {id:'snapshots', icon:'📅', label:'إغلاق الشهر'},
    {id:'annual',    icon:'📈', label:'التقرير السنوي'},
  ];
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:0">
    <!-- Tabs -->
    <div style="display:flex;gap:4px;flex-wrap:wrap;background:#f1f5f9;border-radius:14px;padding:6px;margin-bottom:20px">
      ${tabs.map(t=>`
        <button onclick="window.ownerSwitchTab('${t.id}')" id="ownerTab_${t.id}"
          style="flex:1;min-width:100px;padding:8px 12px;border-radius:10px;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;transition:all .2s;
                 ${ownerTab===t.id?'background:white;color:#1a2472;box-shadow:0 2px 8px rgba(0,0,0,.08)':'background:transparent;color:#64748b'}">
          ${t.icon} ${t.label}
        </button>`).join('')}
    </div>
    <div id="ownerContent"></div>
  </div>`;
  loadOwnerTab(ownerTab);
}

window.ownerSwitchTab = function(tab) {
  ownerTab = tab;
  document.querySelectorAll('[id^="ownerTab_"]').forEach(el => {
    const isActive = el.id === `ownerTab_${tab}`;
    el.style.background = isActive ? 'white' : 'transparent';
    el.style.color = isActive ? '#1a2472' : '#64748b';
    el.style.boxShadow = isActive ? '0 2px 8px rgba(0,0,0,.08)' : 'none';
  });
  loadOwnerTab(tab);
};

async function loadOwnerTab(tab) {
  const el = document.getElementById('ownerContent');
  if(!el) return;
  el.innerHTML = `<div style="display:flex;justify-content:center;padding:40px"><div class="spinner"></div></div>`;
  try {
    if(tab === 'dashboard')  await renderOwnerKPIs(el);
    else if(tab === 'revenues')  await renderOwnerRevenues(el);
    else if(tab === 'expenses')  await renderOwnerExpenses(el);
    else if(tab === 'partners')  await renderOwnerPartners(el);
    else if(tab === 'snapshots') await renderOwnerSnapshots(el);
    else if(tab === 'annual')    await renderOwnerAnnual(el);
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px">خطأ: ${e.message}</div>`;
  }
}

// ── KPI Dashboard ─────────────────────────────────────
async function renderOwnerKPIs(el) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const data = await api('GET', `/api/office/dashboard?year=${year}&month=${month}`).catch(()=>null);
  if(!data) { el.innerHTML = `<div style="color:#dc2626;padding:20px">تعذّر تحميل البيانات</div>`; return; }

  const trends = data.trend || [];
  const partnerDist = data.partner_dist || [];

  const fmt = n => (n||0).toLocaleString('ar-EG', {minimumFractionDigits:0, maximumFractionDigits:0}) + ' ج.م';

  el.innerHTML = `
  <!-- KPI Cards -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px">
    ${[
      {icon:'💰', label:'إجمالي الإيرادات', val:fmt(data.total_revenue), color:'#10b981', bg:'#ecfdf5'},
      {icon:'🧾', label:'إجمالي المصاريف', val:fmt(data.total_expense), color:'#ef4444', bg:'#fef2f2'},
      {icon:'📈', label:'صافي الربح', val:fmt(data.net_profit), color:'#3b82f6', bg:'#eff6ff'},
      {icon:'📊', label:'هامش الربح', val:(data.margin_pct||0).toFixed(1)+'%', color:'#8b5cf6', bg:'#f5f3ff'},
    ].map(k=>`
      <div style="background:${k.bg};border-radius:16px;padding:20px;border:1.5px solid ${k.color}22">
        <div style="font-size:28px;margin-bottom:8px">${k.icon}</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:4px">${k.label}</div>
        <div style="font-size:22px;font-weight:700;color:${k.color}">${k.val}</div>
      </div>`).join('')}
  </div>

  <!-- Trend Chart -->
  <div style="background:white;border-radius:16px;padding:20px;border:1px solid #e8edf3;margin-bottom:20px">
    <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 16px">📉 الاتجاه الشهري (آخر 12 شهر)</h3>
    <canvas id="ownerTrendChart" height="80"></canvas>
  </div>

  <!-- Revenue breakdown + Partner split side by side -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div style="background:white;border-radius:16px;padding:20px;border:1px solid #e8edf3">
      <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 16px">💰 تفصيل الإيرادات</h3>
      <canvas id="ownerRevCatChart" height="120"></canvas>
    </div>
    <div style="background:white;border-radius:16px;padding:20px;border:1px solid #e8edf3">
      <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 16px">🤝 توزيع الأرباح</h3>
      ${partnerDist.length ? partnerDist.map(p=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9">
          <div>
            <div style="font-weight:600;color:#1e293b">${p.name}</div>
            <div style="font-size:12px;color:#64748b">${p.pct||p.share_pct}% من الأرباح</div>
          </div>
          <div style="font-size:18px;font-weight:700;color:#10b981">${fmt(p.amount)}</div>
        </div>`).join('') : '<div style="color:#64748b;text-align:center;padding:20px">لا توجد بيانات</div>'}
    </div>
  </div>`;

  // Draw trend chart
  if(trends.length) {
    const ctx = document.getElementById('ownerTrendChart');
    if(ctx) {
      const labels = trends.map(t=>t.month_label || (t.month && typeof t.month==='string' ? t.month : `${t.month}/${t.year}`));
      destroyChart('ownerTrendChart');
      chartInstances['ownerTrendChart'] = new Chart(ctx, {
        type:'bar',
        data:{
          labels,
          datasets:[
            {label:'إيرادات', data:trends.map(t=>t.revenue||0), backgroundColor:'#10b98155', borderColor:'#10b981', borderWidth:2},
            {label:'مصاريف', data:trends.map(t=>t.expense||0), backgroundColor:'#ef444455', borderColor:'#ef4444', borderWidth:2},
            {label:'ربح', data:trends.map(t=>t.profit||0), type:'line', borderColor:'#3b82f6', backgroundColor:'transparent', borderWidth:2, tension:.3},
          ]
        },
        options:{responsive:true, plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true}}}
      });
    }
  }

  // Draw revenue category chart
  const catArr = data.revenue_by_cat || [];
  if(catArr.length) {
    const ctx2 = document.getElementById('ownerRevCatChart');
    if(ctx2) {
      destroyChart('ownerRevCatChart');
      chartInstances['ownerRevCatChart'] = new Chart(ctx2, {
        type:'doughnut',
        data:{
          labels: catArr.map(c=>c.label||c.cat),
          datasets:[{data:catArr.map(c=>c.amount||0), backgroundColor:['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#94a3b8']}]
        },
        options:{responsive:true, plugins:{legend:{position:'right'}}}
      });
    }
  }
}

// ── Revenues ──────────────────────────────────────────
async function renderOwnerRevenues(el) {
  const now = new Date();
  let yr = now.getFullYear(), mo = now.getMonth()+1;

  async function loadRevs() {
    const data = await api('GET', `/api/office/revenues?year=${yr}&month=${mo}&page_size=200`).catch(()=>({items:[]}));
    const items = data.items || [];
    const catLabels = {accounting:'محاسبة',formation:'تأسيس',tax:'ضرائب',insurance:'تأمينات',commercial:'سجل تجاري',tax_card:'بطاقة ضريبية',consultation:'استشارات',office_svc:'خدمات مكتبية',other:'أخرى'};
    const total = items.reduce((s,i)=>s+(i.amount||0),0);

    document.getElementById('ownerRevContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="font-size:20px;font-weight:700;color:#10b981">إجمالي: ${total.toLocaleString('ar-EG')} ج.م</div>
      <button onclick="window.showAddRevenueModal()" class="btn btn-primary">+ إضافة إيراد</button>
    </div>
    <div style="overflow-x:auto">
    <table class="data-table" style="width:100%">
      <thead><tr>
        <th>التاريخ</th><th>البيان</th><th>الفئة</th><th>العميل</th><th>المبلغ</th><th>المصدر</th><th>إجراءات</th>
      </tr></thead>
      <tbody>
        ${items.length ? items.map(r=>`
          <tr>
            <td>${r.tx_date||''}</td>
            <td>${r.description||''}</td>
            <td><span style="background:#ecfdf5;color:#10b981;padding:2px 8px;border-radius:20px;font-size:12px">${catLabels[r.category]||r.category}</span></td>
            <td>${r.client_name||'—'}</td>
            <td style="font-weight:700;color:#10b981">${(r.amount||0).toLocaleString('ar-EG')} ج.م</td>
            <td style="font-size:12px;color:#64748b">${r.source_type==='manual'?'يدوي':'تلقائي'}</td>
            <td>
              ${r.source_type==='manual'?`<button onclick="window.editOwnerRevenue(${r.id})" style="background:none;border:none;cursor:pointer;font-size:16px">✏️</button>
              <button onclick="window.deleteOwnerRevenue(${r.id})" style="background:none;border:none;cursor:pointer;font-size:16px">🗑️</button>`:'—'}
            </td>
          </tr>`).join('') : `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:30px">لا توجد إيرادات لهذا الشهر</td></tr>`}
      </tbody>
    </table></div>`;
  }

  el.innerHTML = `
  <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
    <select id="ownerRevYear" class="input" style="width:100px" onchange="window.ownerRevFilter()">
      ${[yr-1,yr,yr+1].map(y=>`<option value="${y}" ${y===yr?'selected':''}>${y}</option>`).join('')}
    </select>
    <select id="ownerRevMonth" class="input" style="width:120px" onchange="window.ownerRevFilter()">
      ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===mo?'selected':''}>${new Date(2000,i).toLocaleString('ar-EG',{month:'long'})}</option>`).join('')}
    </select>
  </div>
  <div id="ownerRevContent"></div>`;

  window.ownerRevFilter = async function() {
    yr = parseInt(document.getElementById('ownerRevYear').value);
    mo = parseInt(document.getElementById('ownerRevMonth').value);
    await loadRevs();
  };
  await loadRevs();
}

// ── Expenses ──────────────────────────────────────────
async function renderOwnerExpenses(el) {
  const now = new Date();
  let yr = now.getFullYear(), mo = now.getMonth()+1;

  async function loadExps() {
    const data = await api('GET', `/api/office/expenses?year=${yr}&month=${mo}&page_size=200`).catch(()=>({items:[]}));
    const items = data.items || [];
    const catLabels = {rent:'إيجار',electricity:'كهرباء',internet:'إنترنت',salaries:'رواتب',advertising:'إعلانات',marketing:'تسويق',software:'برامج',transport:'مواصلات',hospitality:'ضيافة',other:'أخرى'};
    const total = items.reduce((s,i)=>s+(i.amount||0),0);

    document.getElementById('ownerExpContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="font-size:20px;font-weight:700;color:#ef4444">إجمالي: ${total.toLocaleString('ar-EG')} ج.م</div>
      <button onclick="window.showAddExpenseModal()" class="btn btn-primary">+ إضافة مصروف</button>
    </div>
    <div style="overflow-x:auto">
    <table class="data-table" style="width:100%">
      <thead><tr>
        <th>التاريخ</th><th>البيان</th><th>الفئة</th><th>المبلغ</th><th>مرفق</th><th>إجراءات</th>
      </tr></thead>
      <tbody>
        ${items.length ? items.map(r=>`
          <tr>
            <td>${r.tx_date||''}</td>
            <td>${r.description||''}</td>
            <td><span style="background:#fef2f2;color:#ef4444;padding:2px 8px;border-radius:20px;font-size:12px">${catLabels[r.category]||r.category}</span></td>
            <td style="font-weight:700;color:#ef4444">${(r.amount||0).toLocaleString('ar-EG')} ج.م</td>
            <td>${r.attachment_url?`<a href="${r.attachment_url}" target="_blank" style="color:#3b82f6">📎</a>`:'—'}</td>
            <td>
              <button onclick="window.editOwnerExpense(${r.id})" style="background:none;border:none;cursor:pointer;font-size:16px">✏️</button>
              <button onclick="window.deleteOwnerExpense(${r.id})" style="background:none;border:none;cursor:pointer;font-size:16px">🗑️</button>
            </td>
          </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:#64748b;padding:30px">لا توجد مصاريف لهذا الشهر</td></tr>`}
      </tbody>
    </table></div>`;
  }

  el.innerHTML = `
  <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
    <select id="ownerExpYear" class="input" style="width:100px" onchange="window.ownerExpFilter()">
      ${[yr-1,yr,yr+1].map(y=>`<option value="${y}" ${y===yr?'selected':''}>${y}</option>`).join('')}
    </select>
    <select id="ownerExpMonth" class="input" style="width:120px" onchange="window.ownerExpFilter()">
      ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===mo?'selected':''}>${new Date(2000,i).toLocaleString('ar-EG',{month:'long'})}</option>`).join('')}
    </select>
  </div>
  <div id="ownerExpContent"></div>`;

  window.ownerExpFilter = async function() {
    yr = parseInt(document.getElementById('ownerExpYear').value);
    mo = parseInt(document.getElementById('ownerExpMonth').value);
    await loadExps();
  };
  await loadExps();
}

// ── Partners ──────────────────────────────────────────
async function renderOwnerPartners(el) {
  const data = await api('GET', '/api/office/partners').catch(()=>[]);
  const partners = Array.isArray(data) ? data : [];
  const fmt = n => (n||0).toLocaleString('ar-EG') + ' ج.م';

  el.innerHTML = `
  <div style="max-width:600px">
    <div style="background:white;border-radius:16px;padding:24px;border:1px solid #e8edf3;margin-bottom:20px">
      <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 20px">🤝 توزيع الأرباح بين الشركاء</h3>
      <div id="ownerPartnersTable">
      ${partners.length ? partners.map((p,i)=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;border:1.5px solid #e8edf3;border-radius:12px;margin-bottom:10px">
          <div>
            <div style="font-size:16px;font-weight:700;color:#1e293b">${p.partner_name}</div>
            <div style="font-size:13px;color:#64748b">نسبة: <strong style="color:#3b82f6">${p.share_pct}%</strong></div>
            ${p.ytd_profit!=null?`<div style="font-size:13px;color:#10b981">مستحق العام: ${fmt(p.ytd_profit)}</div>`:''}
          </div>
          <button onclick="window.editPartner(${p.id},'${p.partner_name}',${p.share_pct})" class="btn" style="padding:6px 14px;font-size:13px">تعديل</button>
        </div>`).join('') : '<div style="color:#64748b;padding:20px;text-align:center">لا يوجد شركاء مضافون بعد</div>'}
      </div>
      <button onclick="window.addPartner()" class="btn btn-primary" style="margin-top:12px">+ إضافة شريك</button>
    </div>
    <div style="background:#fffbeb;border-radius:12px;padding:16px;border:1px solid #f59e0b44;font-size:13px;color:#92400e">
      ⚠️ مجموع النسب يجب أن يساوي 100% لضمان دقة توزيع الأرباح
    </div>
  </div>`;

  window.addPartner = function() {
    const html = `
    <div class="modal-backdrop" id="addPartnerModal">
      <div class="modal" style="max-width:400px">
        <div class="modal-header"><h3>إضافة شريك</h3><button onclick="document.getElementById('addPartnerModal').remove()" class="modal-close">✕</button></div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div><label class="label">اسم الشريك</label><input id="newPartnerName" class="input" placeholder="مثال: محمد سامي"/></div>
          <div><label class="label">نسبة الأرباح %</label><input id="newPartnerPct" class="input" type="number" min="0" max="100" step="0.5" placeholder="50"/></div>
        </div>
        <div class="modal-footer"><button onclick="window.saveNewPartner()" class="btn btn-primary">حفظ</button></div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  };

  window.saveNewPartner = async function() {
    const name = document.getElementById('newPartnerName').value.trim();
    const pct = parseFloat(document.getElementById('newPartnerPct').value||0);
    if(!name||!pct){ toast('ادخل الاسم والنسبة','error'); return; }
    await api('POST', '/api/office/partners', {partner_name:name, share_pct:pct});
    document.getElementById('addPartnerModal')?.remove();
    toast('تم إضافة الشريك');
    await renderOwnerPartners(el);
  };

  window.editPartner = function(id, name, pct) {
    const html = `
    <div class="modal-backdrop" id="editPartnerModal">
      <div class="modal" style="max-width:400px">
        <div class="modal-header"><h3>تعديل الشريك</h3><button onclick="document.getElementById('editPartnerModal').remove()" class="modal-close">✕</button></div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div><label class="label">اسم الشريك</label><input id="editPartnerName" class="input" value="${name}"/></div>
          <div><label class="label">نسبة الأرباح %</label><input id="editPartnerPct" class="input" type="number" min="0" max="100" step="0.5" value="${pct}"/></div>
        </div>
        <div class="modal-footer"><button onclick="window.saveEditPartner(${id})" class="btn btn-primary">حفظ</button></div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  };

  window.saveEditPartner = async function(id) {
    const name = document.getElementById('editPartnerName').value.trim();
    const pct = parseFloat(document.getElementById('editPartnerPct').value||0);
    await api('PUT', `/api/office/partners/${id}`, {partner_name:name, share_pct:pct});
    document.getElementById('editPartnerModal')?.remove();
    toast('تم التحديث');
    await renderOwnerPartners(el);
  };
}

// ── Month Snapshots ───────────────────────────────────
async function renderOwnerSnapshots(el) {
  const data = await api('GET', '/api/office/snapshots').catch(()=>({items:[]}));
  const snaps = data.items || data || [];
  const now = new Date();
  const fmt = n => (n||0).toLocaleString('ar-EG') + ' ج.م';
  const monthName = (y,m) => `${new Date(y,m-1).toLocaleString('ar-EG',{month:'long'})} ${y}`;

  el.innerHTML = `
  <div style="max-width:700px">
    <!-- Close current month button -->
    <div style="background:#eff6ff;border-radius:16px;padding:20px;border:1.5px solid #3b82f644;margin-bottom:20px">
      <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 8px">📅 إغلاق الشهر الحالي</h3>
      <p style="font-size:13px;color:#64748b;margin:0 0 14px">بعد الإغلاق لا يمكن تعديل بيانات هذا الشهر. سيتم حفظ نسخة ثابتة من الأرقام.</p>
      <button onclick="window.closeCurrentMonth()" class="btn btn-primary">🔒 إغلاق ${monthName(now.getFullYear(), now.getMonth()+1)}</button>
    </div>

    <!-- Closed months table -->
    <div style="background:white;border-radius:16px;padding:20px;border:1px solid #e8edf3">
      <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 16px">📋 الأشهر المغلقة</h3>
      ${snaps.length ? `
      <table class="data-table" style="width:100%">
        <thead><tr><th>الشهر</th><th>إيرادات</th><th>مصاريف</th><th>ربح</th><th>تاريخ الإغلاق</th><th>PDF</th></tr></thead>
        <tbody>
          ${snaps.map(s=>`
            <tr>
              <td>${monthName(s.year, s.month)}</td>
              <td style="color:#10b981">${fmt(s.total_revenue)}</td>
              <td style="color:#ef4444">${fmt(s.total_expense)}</td>
              <td style="color:#3b82f6;font-weight:700">${fmt(s.net_profit)}</td>
              <td style="font-size:12px;color:#64748b">${(s.closed_at||'').slice(0,10)}</td>
              <td><button onclick="window.exportOwnerMonthPDF(${s.year},${s.month})" style="background:none;border:none;cursor:pointer;font-size:18px" title="تصدير PDF">📄</button></td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<div style="color:#64748b;text-align:center;padding:20px">لا توجد أشهر مغلقة بعد</div>'}
    </div>
  </div>`;

  window.closeCurrentMonth = async function() {
    if(!confirm(`هل أنت متأكد من إغلاق ${monthName(now.getFullYear(), now.getMonth()+1)}؟\nلن يمكن تعديل البيانات بعد الإغلاق.`)) return;
    try {
      await api('POST', '/api/office/snapshots/close', {year: now.getFullYear(), month: now.getMonth()+1});
      toast('تم إغلاق الشهر بنجاح');
      await renderOwnerSnapshots(el);
    } catch(e) {
      toast(e.message||'خطأ في الإغلاق', 'error');
    }
  };

  window.exportOwnerMonthPDF = async function(year, month) {
    toast('جاري إعداد التقرير...');
    try {
      const token = localStorage.getItem('ms_token');
      const url = `${API}/api/office/report-pdf?year=${year}&month=${month}`;
      const resp = await fetch(url, {headers:{'Authorization':`Bearer ${token}`}});
      if(!resp.ok) throw new Error('فشل تحميل التقرير');
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `office-report-${year}-${month}.pdf`;
      a.click();
    } catch(e) { toast(e.message, 'error'); }
  };
}

// ── Annual Report ─────────────────────────────────────
async function renderOwnerAnnual(el) {
  const now = new Date();
  let yr = now.getFullYear();

  async function loadAnnual() {
    const data = await api('GET', `/api/office/annual-report?year=${yr}`).catch(()=>null);
    if(!data) { document.getElementById('ownerAnnualContent').innerHTML = '<div style="color:#dc2626;padding:20px">تعذّر تحميل البيانات</div>'; return; }

    const months = data.months || [];
    const fmt = n => (n||0).toLocaleString('ar-EG') + ' ج.م';

    document.getElementById('ownerAnnualContent').innerHTML = `
    <!-- Annual KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px">
      ${[
        {label:'إجمالي الإيرادات', val:fmt(data.total_revenue), color:'#10b981'},
        {label:'إجمالي المصاريف',  val:fmt(data.total_expense), color:'#ef4444'},
        {label:'صافي الربح',       val:fmt(data.net_profit),    color:'#3b82f6'},
        {label:'متوسط هامش الربح', val:data.margin_pct!=null ? data.margin_pct.toFixed(1)+'%' : '—', color:'#8b5cf6'},
      ].map(k=>`
        <div style="background:white;border-radius:14px;padding:16px;border:1.5px solid ${k.color}33;text-align:center">
          <div style="font-size:12px;color:#64748b;margin-bottom:6px">${k.label}</div>
          <div style="font-size:18px;font-weight:700;color:${k.color}">${k.val}</div>
        </div>`).join('')}
    </div>

    <!-- Annual trend chart -->
    <div style="background:white;border-radius:16px;padding:20px;border:1px solid #e8edf3;margin-bottom:20px">
      <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 14px">الاتجاه الشهري لعام ${yr}</h3>
      <canvas id="ownerAnnualChart" height="80"></canvas>
    </div>

    <!-- Monthly breakdown table -->
    <div style="background:white;border-radius:16px;padding:20px;border:1px solid #e8edf3">
      <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 14px">تفصيل شهري</h3>
      <table class="data-table" style="width:100%">
        <thead><tr><th>الشهر</th><th>إيرادات</th><th>مصاريف</th><th>ربح</th><th>هامش %</th></tr></thead>
        <tbody>
          ${months.map(m=>`
            <tr>
              <td>${new Date(yr,m.month-1).toLocaleString('ar-EG',{month:'long'})}</td>
              <td style="color:#10b981">${fmt(m.revenue)}</td>
              <td style="color:#ef4444">${fmt(m.expense)}</td>
              <td style="color:#3b82f6;font-weight:700">${fmt(m.profit)}</td>
              <td>${m.revenue ? ((m.profit/m.revenue)*100).toFixed(1)+'%' : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

    if(months.length) {
      const ctx = document.getElementById('ownerAnnualChart');
      if(ctx) {
        destroyChart('ownerAnnualChart');
        chartInstances['ownerAnnualChart'] = new Chart(ctx, {
          type:'bar',
          data:{
            labels: months.map(m=>new Date(yr,m.month-1).toLocaleString('ar-EG',{month:'short'})),
            datasets:[
              {label:'إيرادات', data:months.map(m=>m.revenue||0), backgroundColor:'#10b98155', borderColor:'#10b981', borderWidth:2},
              {label:'مصاريف', data:months.map(m=>m.expense||0), backgroundColor:'#ef444455', borderColor:'#ef4444', borderWidth:2},
              {label:'ربح',    data:months.map(m=>m.profit||0), type:'line', borderColor:'#3b82f6', backgroundColor:'transparent', borderWidth:2, tension:.3},
            ]
          },
          options:{responsive:true, plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true}}}
        });
      }
    }
  }

  el.innerHTML = `
  <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px">
    <select id="ownerAnnualYear" class="input" style="width:110px" onchange="window.ownerAnnualFilter()">
      ${[yr-2,yr-1,yr].map(y=>`<option value="${y}" ${y===yr?'selected':''}>${y}</option>`).join('')}
    </select>
    <button onclick="window.exportOwnerAnnualPDF()" class="btn">📄 تصدير PDF</button>
  </div>
  <div id="ownerAnnualContent"></div>`;

  window.ownerAnnualFilter = async function() {
    yr = parseInt(document.getElementById('ownerAnnualYear').value);
    await loadAnnual();
  };
  window.exportOwnerAnnualPDF = async function() {
    toast('جاري إعداد التقرير...');
    const token = localStorage.getItem('ms_token');
    const url = `${API}/api/office/report-pdf?year=${yr}`;
    try {
      const resp = await fetch(url, {headers:{'Authorization':`Bearer ${token}`}});
      if(!resp.ok) throw new Error('فشل');
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `annual-report-${yr}.pdf`; a.click();
    } catch(e){ toast(e.message,'error'); }
  };
  await loadAnnual();
}

// ── Add/Edit Revenue Modal ────────────────────────────
window.showAddRevenueModal = function(existing) {
  const isEdit = !!existing;
  const catOptions = {accounting:'محاسبة',formation:'تأسيس',tax:'ضرائب',insurance:'تأمينات',commercial:'سجل تجاري',tax_card:'بطاقة ضريبية',consultation:'استشارات',office_svc:'خدمات مكتبية',other:'أخرى'};
  const html = `
  <div class="modal-backdrop" id="addRevModal">
    <div class="modal" style="max-width:480px">
      <div class="modal-header"><h3>${isEdit?'تعديل إيراد':'إضافة إيراد'}</h3><button onclick="document.getElementById('addRevModal').remove()" class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div><label class="label">التاريخ</label><input id="revDate" class="input" type="date" value="${existing?.tx_date||new Date().toISOString().slice(0,10)}"/></div>
        <div><label class="label">البيان</label><input id="revDesc" class="input" placeholder="وصف الإيراد" value="${existing?.description||''}"/></div>
        <div><label class="label">الفئة</label>
          <select id="revCat" class="input">
            ${Object.entries(catOptions).map(([k,v])=>`<option value="${k}" ${existing?.category===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div><label class="label">المبلغ (ج.م)</label><input id="revAmount" class="input" type="number" min="0" step="0.01" value="${existing?.amount||''}"/></div>
        <div><label class="label">اسم العميل (اختياري)</label><input id="revClient" class="input" placeholder="اسم العميل" value="${existing?.client_name||''}"/></div>
      </div>
      <div class="modal-footer">
        <button onclick="window.saveOwnerRevenue(${isEdit?existing.id:'null'})" class="btn btn-primary">💾 حفظ</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.saveOwnerRevenue = async function(id) {
  const body = {
    date: document.getElementById('revDate').value,
    description: document.getElementById('revDesc').value,
    category: document.getElementById('revCat').value,
    amount: parseFloat(document.getElementById('revAmount').value||0),
    client_name: document.getElementById('revClient').value||null,
  };
  if(!body.amount||!body.date){ toast('ادخل التاريخ والمبلغ','error'); return; }
  if(id) await api('PUT', `/api/office/revenues/${id}`, body);
  else   await api('POST', '/api/office/revenues', body);
  document.getElementById('addRevModal')?.remove();
  toast('تم الحفظ');
  await renderOwnerRevenues(document.getElementById('ownerContent'));
};

window.editOwnerRevenue = async function(id) {
  const data = await api('GET', `/api/office/revenues/${id}`).catch(()=>null);
  if(data) window.showAddRevenueModal(data);
};

window.deleteOwnerRevenue = async function(id) {
  if(!confirm('حذف هذا الإيراد؟')) return;
  await api('DELETE', `/api/office/revenues/${id}`);
  toast('تم الحذف');
  await renderOwnerRevenues(document.getElementById('ownerContent'));
};

// ── Add/Edit Expense Modal ────────────────────────────
window.showAddExpenseModal = function(existing) {
  document.getElementById('addExpModal')?.remove();
  const isEdit = !!existing;
  const catOptions = {rent:'إيجار',electricity:'كهرباء',internet:'إنترنت',salaries:'رواتب',advertising:'إعلانات',marketing:'تسويق',software:'برامج',transport:'مواصلات',hospitality:'ضيافة',other:'أخرى'};
  const html = `
  <div class="modal-backdrop" id="addExpModal">
    <div class="modal" style="max-width:480px">
      <div class="modal-header"><h3>${isEdit?'تعديل مصروف':'إضافة مصروف'}</h3><button onclick="document.getElementById('addExpModal').remove()" class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div><label class="label">التاريخ</label><input id="expDate" class="input" type="date" value="${existing?.tx_date||new Date().toISOString().slice(0,10)}"/></div>
        <div><label class="label">البيان</label><input id="expDesc" class="input" placeholder="وصف المصروف" value="${existing?.description||''}"/></div>
        <div><label class="label">الفئة</label>
          <select id="expCat" class="input">
            ${Object.entries(catOptions).map(([k,v])=>`<option value="${k}" ${existing?.category===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div><label class="label">المبلغ (ج.م)</label><input id="expAmount" class="input" type="number" min="0" step="0.01" value="${existing?.amount||''}"/></div>
        <div><label class="label">ملاحظات</label><input id="expNotes" class="input" placeholder="ملاحظات إضافية" value="${existing?.notes||''}"/></div>
      </div>
      <div class="modal-footer">
        <button onclick="window.saveOwnerExpense(${isEdit?existing.id:'null'})" class="btn btn-primary">💾 حفظ</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.saveOwnerExpense = async function(id) {
  const body = {
    date: document.getElementById('expDate').value,
    description: document.getElementById('expDesc').value,
    category: document.getElementById('expCat').value,
    amount: parseFloat(document.getElementById('expAmount').value||0),
    notes: document.getElementById('expNotes').value||null,
  };
  if(!body.amount||!body.date){ toast('ادخل التاريخ والمبلغ','error'); return; }
  if(id) await api('PUT', `/api/office/expenses/${id}`, body);
  else   await api('POST', '/api/office/expenses', body);
  document.getElementById('addExpModal')?.remove();
  toast('تم الحفظ');
  await renderOwnerExpenses(document.getElementById('ownerContent'));
};

window.editOwnerExpense = async function(id) {
  const data = await api('GET', `/api/office/expenses/${id}`).catch(()=>null);
  if(data) window.showAddExpenseModal(data);
};

window.deleteOwnerExpense = async function(id) {
  if(!confirm('حذف هذا المصروف؟')) return;
  await api('DELETE', `/api/office/expenses/${id}`);
  toast('تم الحذف');
  await renderOwnerExpenses(document.getElementById('ownerContent'));
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: المركز المالي — Finance Center
// ─────────────────────────────────────────────────────────────────────────────

const OWNER_EMAIL_FC = 'ms.owner@mshq.io';
const FC_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const FC_PAY_LABELS = {cash:'كاش',transfer:'تحويل بنكي',instapay:'إنستاباي',check:'شيك'};
const FC_EXP_CATS = ['rent','electricity','internet','marketing','supplies','transport','other'];
const FC_EXP_CAT_AR = {rent:'إيجار',electricity:'كهرباء ومياه',internet:'إنترنت',marketing:'تسويق وإعلان',supplies:'مشتريات ومستلزمات',transport:'نقل',other:'أخرى'};

function fcIsOwner() {
  return currentUser?.email === OWNER_EMAIL_FC || currentUser?.role === 'admin';
}

let _fcTab = null; // active tab: 'expenses'|'collections'|'summary'|'grid'
let _fcClients = [];
let _fcMonth = new Date().getMonth() + 1;
let _fcYear = new Date().getFullYear();

async function loadFinanceCenter() {
  const el = document.getElementById('main');
  const isOwner = fcIsOwner();

  if (!_fcTab) _fcTab = isOwner ? 'expenses' : 'collections';

  // عرض الصفحة فوراً — جلب العملاء في الخلفية
  const tabs = isOwner
    ? [{id:'expenses',label:'المصروفات'},{id:'collections',label:'التحصيل'},{id:'summary',label:'ملخص الشهر'},{id:'grid',label:'جريد الأتعاب'}]
    : [{id:'collections',label:'التحصيل'}];

  el.innerHTML = `
  <div style="padding:16px 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="font-size:17px;font-weight:700;color:#1e293b">💰 المالية</div>
      ${isOwner ? `<div style="display:flex;gap:6px;align-items:center">
        <select id="fcMonthSel" onchange="window.fcChangeMonth()" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
          ${FC_MONTHS.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===_fcMonth?'selected':''}>${m}</option>`).join('')}
        </select>
        <select id="fcYearSel" onchange="window.fcChangeMonth()" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
          ${[2024,2025,2026].map(y=>`<option ${y===_fcYear?'selected':''}>${y}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>

    <div style="display:flex;border-bottom:2px solid #e2e8f0;margin-bottom:14px;gap:0" id="fcTabs">
      ${tabs.map(t=>`<button onclick="window.fcSwitchTab('${t.id}')" id="fcTab_${t.id}"
        style="padding:8px 18px;font-size:13px;border:none;background:none;cursor:pointer;border-bottom:2px solid ${_fcTab===t.id?'#1d9e75':'transparent'};color:${_fcTab===t.id?'#0f6e56':'#64748b'};font-weight:${_fcTab===t.id?'700':'400'};margin-bottom:-2px;white-space:nowrap">
        ${t.label}</button>`).join('')}
    </div>

    <div id="fcBody"></div>
  </div>`;

  window.fcChangeMonth = () => {
    _fcMonth = +document.getElementById('fcMonthSel').value;
    _fcYear = +document.getElementById('fcYearSel').value;
    window.fcSwitchTab(_fcTab);
  };

  window.fcSwitchTab = (tab) => {
    _fcTab = tab;
    document.querySelectorAll('#fcTabs button').forEach(b => {
      const active = b.id === `fcTab_${tab}`;
      b.style.borderBottomColor = active ? '#1d9e75' : 'transparent';
      b.style.color = active ? '#0f6e56' : '#64748b';
      b.style.fontWeight = active ? '700' : '400';
    });
    const body = document.getElementById('fcBody');
    if (!body) return;
    if (tab === 'collections') fcRenderCollections(body);
    else if (tab === 'expenses') fcRenderExpenses(body);
    else if (tab === 'summary') fcRenderSummary(body);
    else if (tab === 'grid') fcRenderGrid(body);
  };

  // جلب العملاء في الخلفية ثم عرض التبويب
  (async () => {
    if (!_fcClients.length) {
      try {
        const res = await api('GET', '/api/clients?limit=2000');
        _fcClients = (res.items || res || []).filter(c => c.status === 'active');
      } catch(e) { _fcClients = []; }
    }
    window.fcSwitchTab(_fcTab);
  })();
}

// ── التحصيل ──────────────────────────────────────────────────────────────────

async function fcRenderCollections(el) {
  const isOwner = fcIsOwner();
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);

  const clientOpts = _fcClients.map(c => `<option value="${c.id}" data-name="${escH(c.name)}">${escH(c.name)}</option>`).join('');

  el.innerHTML = `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f1f5f9">
      <div style="font-weight:600;font-size:14px;color:#1e293b">سجل التحصيل${isOwner?'':' — اليوم فقط'}</div>
    </div>
    <div style="display:flex;gap:6px;align-items:flex-end;padding:10px 14px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;background:#f8fafc">
      <div style="display:flex;flex-direction:column;gap:3px">
        <div style="font-size:10px;color:#64748b">التاريخ</div>
        <input id="fcCDate" type="date" value="${todayStr}" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;width:120px"/>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:140px">
        <div style="font-size:10px;color:#64748b">العميل</div>
        <select id="fcCClient" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff">
          <option value="">اختر العميل...</option>${clientOpts}
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <div style="font-size:10px;color:#64748b">الشهر المسدَّد</div>
        <select id="fcCMonth" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;width:110px">
          ${FC_MONTHS.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===_fcMonth?'selected':''}>${m} ${_fcYear}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <div style="font-size:10px;color:#64748b">المبلغ (ج.م)</div>
        <input id="fcCAmount" type="number" placeholder="0" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;width:90px"/>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <div style="font-size:10px;color:#64748b">الطريقة</div>
        <select id="fcCMethod" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;width:110px">
          <option value="cash">كاش</option>
          <option value="transfer">تحويل بنكي</option>
          <option value="instapay">إنستاباي</option>
          <option value="check">شيك</option>
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:100px">
        <div style="font-size:10px;color:#64748b">ملاحظة</div>
        <input id="fcCNote" type="text" placeholder="اختياري" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff"/>
      </div>
      <button onclick="window.fcAddCollection()" style="height:32px;padding:0 16px;background:#1d9e75;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap;font-weight:600">إضافة</button>
    </div>
    <div id="fcCollTable" style="overflow-x:auto">
      <div style="padding:20px;text-align:center;color:#94a3b8">⏳ جاري التحميل...</div>
    </div>
  </div>`;

  await fcLoadCollections();
}

async function fcLoadCollections() {
  const isOwner = fcIsOwner();
  const params = isOwner ? `?month=${_fcMonth}&year=${_fcYear}` : '';
  const rows = await api('GET', `/api/finance/collections${params}`).catch(() => []);
  const el = document.getElementById('fcCollTable');
  if (!el) return;

  if (!rows.length) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8">لا توجد تحصيلات${isOwner?` في ${FC_MONTHS[_fcMonth]} ${_fcYear}`:' اليوم'}</div>`;
    return;
  }

  const total = rows.reduce((s,r)=>s+r.amount,0);
  el.innerHTML = `<table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#f8fafc">
      <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0">التاريخ</th>
      <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0">العميل</th>
      <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0">الشهر</th>
      <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0">المبلغ</th>
      <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0">الطريقة</th>
      <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0">ملاحظة</th>
      <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0"></th>
    </tr></thead>
    <tbody>
      ${rows.map(r=>`<tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:8px 12px;font-size:12px;color:#64748b">${r.date}</td>
        <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#1e293b">${escH(r.client_name)}</td>
        <td style="padding:8px 12px;font-size:12px;color:#64748b">${r.billing_month_label} ${r.billing_year}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:700;color:#0f6e56;text-align:center">${(r.amount||0).toLocaleString('ar-EG')}</td>
        <td style="padding:8px 12px;font-size:12px"><span style="background:#e6f1fb;color:#0c447c;padding:2px 8px;border-radius:8px;font-size:10px">${r.payment_method_label}</span></td>
        <td style="padding:8px 12px;font-size:11px;color:#94a3b8">${escH(r.note||'—')}</td>
        <td style="padding:8px 12px"><button onclick="window.fcDelCollection(${r.id})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:12px">حذف</button></td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr style="background:#f0fdf4">
      <td colspan="3" style="padding:8px 12px;font-weight:700;font-size:13px;color:#1e293b">الإجمالي</td>
      <td style="padding:8px 12px;font-weight:700;font-size:14px;color:#0f6e56;text-align:center">${total.toLocaleString('ar-EG')}</td>
      <td colspan="3"></td>
    </tr></tfoot>
  </table>`;
}

window.fcAddCollection = async function() {
  const clientSel = document.getElementById('fcCClient');
  const clientName = clientSel.options[clientSel.selectedIndex]?.dataset?.name || clientSel.value;
  const clientId = +clientSel.value || null;
  const date = document.getElementById('fcCDate').value;
  const billingMonth = +document.getElementById('fcCMonth').value;
  const amount = +document.getElementById('fcCAmount').value;
  const method = document.getElementById('fcCMethod').value;
  const note = document.getElementById('fcCNote').value;

  if (!clientName || !clientId) return toast('اختر العميل', 'error');
  if (!amount || amount <= 0) return toast('أدخل المبلغ', 'error');

  await api('POST', '/api/finance/collections', {
    date, client_id: clientId, client_name: clientName,
    billing_month: billingMonth, billing_year: _fcYear,
    amount, payment_method: method, note: note || null,
  });
  document.getElementById('fcCAmount').value = '';
  document.getElementById('fcCNote').value = '';
  toast('تم الحفظ ✓');
  _AC.invalidate('/api/finance/collections');
  await fcLoadCollections();
};

window.fcDelCollection = async function(id) {
  if (!confirm('حذف هذا التحصيل؟')) return;
  await api('DELETE', `/api/finance/collections/${id}`);
  toast('تم الحذف');
  _AC.invalidate('/api/finance/collections');
  await fcLoadCollections();
};

// ── المصروفات (أدمن فقط) ─────────────────────────────────────────────────────

async function fcRenderExpenses(el) {
  const today = new Date().toISOString().slice(0,10);

  el.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:12px">

    <!-- تسويات الموظفين -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px">
        <div style="font-weight:600;font-size:14px;color:#1e293b">تسويات الموظفين</div>
        <span style="font-size:10px;background:#e6f1fb;color:#0c447c;padding:2px 8px;border-radius:8px">تلقائي من نظام الرواتب</span>
      </div>
      <div id="fcSettlements" style="padding:12px 16px"><div style="color:#94a3b8;font-size:13px">⏳</div></div>
    </div>

    <!-- مصاريف يدوية -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px">
        <div style="font-weight:600;font-size:14px;color:#1e293b">مصاريف خاصة</div>
        <span style="font-size:10px;background:#faeeda;color:#633806;padding:2px 8px;border-radius:8px">🔒 مدير فقط</span>
      </div>
      <div style="display:flex;gap:6px;align-items:flex-end;padding:10px 14px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;background:#fafafa">
        <div style="display:flex;flex-direction:column;gap:3px">
          <div style="font-size:10px;color:#64748b">التاريخ</div>
          <input id="fcEDate" type="date" value="${today}" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;width:120px"/>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:130px">
          <div style="font-size:10px;color:#64748b">البند</div>
          <input id="fcEDesc" type="text" placeholder="وصف المصروف" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff"/>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px">
          <div style="font-size:10px;color:#64748b">التصنيف</div>
          <select id="fcECat" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;width:130px">
            ${FC_EXP_CATS.map(c=>`<option value="${c}">${FC_EXP_CAT_AR[c]}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px">
          <div style="font-size:10px;color:#64748b">المبلغ</div>
          <input id="fcEAmount" type="number" placeholder="0" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;width:90px"/>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px">
          <div style="font-size:10px;color:#64748b">طريقة الدفع</div>
          <select id="fcEMethod" style="height:32px;padding:0 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;width:110px">
            <option value="cash">كاش</option>
            <option value="transfer">تحويل بنكي</option>
            <option value="check">شيك</option>
          </select>
        </div>
        <button onclick="window.fcAddManualExpense()" style="height:32px;padding:0 16px;background:#1d9e75;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap;font-weight:600">إضافة</button>
      </div>
      <div id="fcManualExp" style="overflow-x:auto"><div style="padding:12px 16px;color:#94a3b8;font-size:13px">⏳</div></div>
    </div>
  </div>`;

  await fcLoadExpenses();
}

async function fcLoadExpenses() {
  const data = await api('GET', `/api/finance/expenses?month=${_fcMonth}&year=${_fcYear}`).catch(() => null);
  if (!data) return;

  // تسويات
  const sEl = document.getElementById('fcSettlements');
  if (sEl) {
    if (!data.auto_expenses.length) {
      sEl.innerHTML = `<div style="color:#94a3b8;font-size:13px">لا توجد تسويات في ${FC_MONTHS[_fcMonth]} ${_fcYear}</div>`;
    } else {
      sEl.innerHTML = data.auto_expenses.map(s=>`
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-weight:600;font-size:13px;color:#1e293b">${escH(s.description)}</div>
            <div style="font-weight:700;color:#993c1d;font-size:14px">${(s.amount||0).toLocaleString('ar-EG')} ج.م</div>
          </div>
          ${s.items?.length ? `<div style="font-size:11px;color:#64748b">${s.items.map(i=>`${escH(i.description||'')} — ${(i.amount||0).toLocaleString('ar-EG')}`).join(' | ')}</div>` : ''}
        </div>`).join('')
      + `<div style="text-align:left;padding-top:6px;border-top:1px solid #f1f5f9;font-weight:700;color:#993c1d;font-size:13px">الإجمالي: ${data.total_auto.toLocaleString('ar-EG')} ج.م</div>`;
    }
  }

  // يدوية
  const mEl = document.getElementById('fcManualExp');
  if (mEl) {
    if (!data.manual_expenses.length) {
      mEl.innerHTML = `<div style="padding:12px 16px;color:#94a3b8;font-size:13px">لا توجد مصاريف خاصة مضافة</div>`;
    } else {
      mEl.innerHTML = `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f8fafc">
          <th style="padding:7px 12px;text-align:right;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0">التاريخ</th>
          <th style="padding:7px 12px;text-align:right;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0">البند</th>
          <th style="padding:7px 12px;text-align:right;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0">التصنيف</th>
          <th style="padding:7px 12px;text-align:center;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0">المبلغ</th>
          <th style="padding:7px 12px;text-align:right;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0">الطريقة</th>
          <th style="padding:7px 12px;border-bottom:1px solid #e2e8f0"></th>
        </tr></thead>
        <tbody>
          ${data.manual_expenses.map(e=>`<tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:7px 12px;font-size:12px;color:#64748b">${e.date}</td>
            <td style="padding:7px 12px;font-size:12px;font-weight:600;color:#1e293b">${escH(e.description)}</td>
            <td style="padding:7px 12px;font-size:12px"><span style="background:#faeeda;color:#633806;padding:2px 7px;border-radius:8px;font-size:10px">${escH(e.category_label)}</span></td>
            <td style="padding:7px 12px;font-size:13px;font-weight:700;color:#993c1d;text-align:center">${(e.amount||0).toLocaleString('ar-EG')}</td>
            <td style="padding:7px 12px;font-size:12px;color:#64748b">${escH(e.payment_method_label)}</td>
            <td style="padding:7px 12px"><button onclick="window.fcDelManualExpense(${e.id})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:12px">حذف</button></td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr style="background:#fef2f2">
          <td colspan="3" style="padding:7px 12px;font-weight:700;color:#1e293b">الإجمالي</td>
          <td style="padding:7px 12px;font-weight:700;color:#993c1d;text-align:center">${data.total_manual.toLocaleString('ar-EG')}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table>`;
    }
  }
}

window.fcAddManualExpense = async function() {
  const desc = document.getElementById('fcEDesc').value.trim();
  const amount = +document.getElementById('fcEAmount').value;
  if (!desc) return toast('أدخل وصف المصروف', 'error');
  if (!amount || amount <= 0) return toast('أدخل المبلغ', 'error');
  await api('POST', '/api/finance/expenses/manual', {
    date: document.getElementById('fcEDate').value,
    description: desc,
    category: document.getElementById('fcECat').value,
    amount,
    payment_method: document.getElementById('fcEMethod').value,
  });
  document.getElementById('fcEDesc').value = '';
  document.getElementById('fcEAmount').value = '';
  toast('تم الحفظ ✓');
  await fcLoadExpenses();
};

window.fcDelManualExpense = async function(id) {
  if (!confirm('حذف هذا المصروف؟')) return;
  await api('DELETE', `/api/finance/expenses/manual/${id}`);
  toast('تم الحذف');
  await fcLoadExpenses();
};

// ── ملخص الشهر (أدمن فقط) ────────────────────────────────────────────────────

async function fcRenderSummary(el) {
  el.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8">⏳ جاري التحميل...</div>`;
  const [summary, expData] = await Promise.all([
    api('GET', `/api/finance/summary?month=${_fcMonth}&year=${_fcYear}`).catch(()=>null),
    api('GET', `/api/finance/expenses?month=${_fcMonth}&year=${_fcYear}`).catch(()=>null),
  ]);
  if (!summary) { el.innerHTML = `<div style="color:#ef4444;padding:20px">فشل التحميل</div>`; return; }

  const monthLabel = `${FC_MONTHS[_fcMonth]} ${_fcYear}`;
  el.innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <!-- الإيرادات -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px">
      <div style="font-weight:700;font-size:13px;color:#1e293b;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f1f5f9">الإيرادات (التحصيل) — ${monthLabel}</div>
      ${(summary.collections_by_employee||[]).map(e=>`
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;border-bottom:1px solid #f8fafc">
          <span style="color:#475569">${escH(e.name)}</span>
          <span style="font-weight:600;color:#0f6e56">${(e.amount||0).toLocaleString('ar-EG')}</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-weight:700;font-size:14px">
        <span>إجمالي التحصيل</span>
        <span style="color:#0f6e56">${(summary.total_collected||0).toLocaleString('ar-EG')} ج.م</span>
      </div>
    </div>

    <!-- المصروفات -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px">
      <div style="font-weight:700;font-size:13px;color:#1e293b;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f1f5f9">المصروفات — ${monthLabel}</div>
      ${(expData?.auto_expenses||[]).map(s=>`
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;border-bottom:1px solid #f8fafc">
          <span style="color:#475569">${escH(s.description)}</span>
          <span style="font-weight:600;color:#993c1d">${(s.amount||0).toLocaleString('ar-EG')}</span>
        </div>`).join('')}
      ${(expData?.manual_expenses||[]).map(e=>`
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;border-bottom:1px solid #f8fafc">
          <span style="color:#475569">${escH(e.description)} <span style="font-size:9px;background:#faeeda;color:#633806;padding:1px 5px;border-radius:6px">خاص</span></span>
          <span style="font-weight:600;color:#993c1d">${(e.amount||0).toLocaleString('ar-EG')}</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-weight:700;font-size:14px">
        <span>إجمالي المصروفات</span>
        <span style="color:#993c1d">${(summary.total_expenses||0).toLocaleString('ar-EG')} ج.م</span>
      </div>
    </div>
  </div>

  <!-- الصافي -->
  <div style="margin-top:12px;background:${summary.net_profit>=0?'#f0fdf4':'#fef2f2'};border:1px solid ${summary.net_profit>=0?'#bbf7d0':'#fecaca'};border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-weight:700;font-size:15px;color:#1e293b">صافي الشهر — ${monthLabel}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px">هامش الربح: ${summary.profit_margin_pct||0}٪</div>
    </div>
    <div style="font-size:22px;font-weight:700;color:${summary.net_profit>=0?'#0f6e56':'#993c1d'}">${(summary.net_profit||0).toLocaleString('ar-EG')} ج.م</div>
  </div>`;
}

// ── جريد الأتعاب (أدمن فقط) ──────────────────────────────────────────────────

async function fcRenderGrid(el) {
  el.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8">⏳ جاري التحميل...</div>`;
  const data = await api('GET', `/api/finance/fees-grid?year=${_fcYear}`).catch(()=>null);
  if (!data) { el.innerHTML = `<div style="color:#ef4444;padding:20px">فشل التحميل</div>`; return; }

  const clients = data.clients || [];
  if (!clients.length) { el.innerHTML = `<div style="padding:20px;color:#94a3b8">لا توجد بيانات — تأكد من إضافة الأتعاب الشهرية للعملاء</div>`; return; }

  const curMonth = new Date().getMonth() + 1;
  el.innerHTML = `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;min-width:900px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0;position:sticky;right:0;background:#f8fafc;min-width:140px">العميل</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0;min-width:60px">الأتعاب</th>
            ${FC_MONTHS.slice(1).map((m,i)=>`<th style="padding:8px 8px;text-align:center;font-size:11px;border-bottom:1px solid #e2e8f0;min-width:52px;${i+1<curMonth?'background:#f0fdf4;color:#085041':i+1===curMonth?'background:#faeeda;color:#633806':'color:#94a3b8'}">${m}</th>`).join('')}
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0">الإجمالي</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0">النسبة</th>
          </tr>
        </thead>
        <tbody>
          ${clients.map(c=>`<tr style="border-bottom:1px solid #f1f5f9" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:7px 12px;font-size:12px;font-weight:600;color:#1e293b;position:sticky;right:0;background:#fff">${escH(c.client_name)}</td>
            <td style="padding:7px 10px;text-align:center;font-size:11px;color:#64748b">${(c.monthly_fee||0).toLocaleString('ar-EG')}</td>
            ${c.months.map(m=>{
              if(m.status==='paid') return `<td style="background:#e1f5ee;color:#085041;text-align:center;padding:7px 6px;font-size:13px;font-weight:700">✓</td>`;
              if(m.status==='partial') return `<td style="background:#faeeda;color:#633806;text-align:center;padding:7px 6px;font-size:11px;font-weight:600">${(m.collected||0).toLocaleString('ar-EG')}</td>`;
              if(m.month>curMonth) return `<td style="color:#94a3b8;text-align:center;padding:7px 6px;font-size:12px">—</td>`;
              return `<td style="background:#fef2f2;color:#993c1d;text-align:center;padding:7px 6px;font-size:13px">✕</td>`;
            }).join('')}
            <td style="padding:7px 10px;text-align:center;font-size:12px;font-weight:700;color:#0f6e56">${(c.total_collected||0).toLocaleString('ar-EG')}</td>
            <td style="padding:7px 10px;text-align:center;font-size:12px;font-weight:700;color:${c.collection_pct>=80?'#0f6e56':c.collection_pct>=50?'#854f0b':'#993c1d'}">${c.collection_pct}٪</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f8fafc;border-top:2px solid #e2e8f0">
            <td colspan="2" style="padding:8px 12px;font-weight:700;font-size:13px;color:#1e293b">الإجمالي الشهري</td>
            ${Array.from({length:12},(_,i)=>{
              const total = clients.reduce((s,c)=>s+(c.months[i]?.collected||0),0);
              const m = i+1;
              return `<td style="padding:8px 6px;text-align:center;font-size:11px;font-weight:700;color:${m<curMonth?'#0f6e56':m===curMonth?'#854f0b':'#94a3b8'}">${total>0?total.toLocaleString('ar-EG'):'—'}</td>`;
            }).join('')}
            <td style="padding:8px 10px;text-align:center;font-weight:700;color:#0f6e56">${clients.reduce((s,c)=>s+c.total_collected,0).toLocaleString('ar-EG')}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="padding:8px 14px;font-size:11px;color:#94a3b8">✓ = محصّل &nbsp;|&nbsp; ✕ = غير محصّل &nbsp;|&nbsp; رقم = جزئي</div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
