// ── OBLIGATIONS ────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// SMART AUTOMATION ENGINE — الالتزامات الضريبية
// ─────────────────────────────────────────────────────────────────────────────
const OBL_NAME_AR = {
  vat_monthly:              'إقرار القيمة المضافة الشهري',
  vat_quarterly:            'إقرار القيمة المضافة الربعي',
  payroll_monthly:          'نموذج 1 — مرتبات شهري',
  withholding_monthly:      'أسس توحيد المرتبات شهري',
  insurance_monthly:        'تأمينات اجتماعية شهرية',
  stamp_quarterly:          'الدمغة النسبية ربعي',
  income_annual:            'إقرار ضريبة الدخل السنوي',
  form_41:                  'نموذج 41 — إقرار المرتبات السنوي',
  corporate_tax:            'ضريبة الخصم والتحصيل — ربع سنوي',
  commercial_register_renewal: 'تجديد السجل التجاري',
};
const OBL_ICON = {
  vat_monthly:'🧾', vat_quarterly:'🧾', payroll_monthly:'💼', withholding_monthly:'✂️',
  insurance_monthly:'🛡️', stamp_quarterly:'🔏', income_annual:'📊', form_41:'📋',
  corporate_tax:'🏛️', commercial_register_renewal:'📜',
};
const OBL_STATUS_BADGE = {
  upcoming:'badge-blue', pending:'badge-yellow', in_progress:'badge-purple',
  submitted:'badge-green', paid:'badge-green', late:'badge-red', exempted:'badge-gray'
};
const OBL_STATUS_AR = {
  upcoming:'قادم', pending:'معلق', in_progress:'قيد التنفيذ',
  submitted:'مُقدَّم', paid:'مدفوع', late:'متأخر', exempted:'معفى'
};
const PRIORITY_AR = {urgent:'عاجل', high:'مرتفع', medium:'متوسط', low:'منخفض'};
const FREQ_AR = {monthly:'شهري', quarterly:'ربعي', annual:'سنوي'};

var oblStats={}, oblInstances=[], oblTab='upcoming', oblDays=30, oblClientFilter='', oblTypeFilter='', oblStatusFilter='', oblSearchQ='';
let oblClientsCache=[];

async function loadObligations(silent=false) {
  try {
    const [stats, inst] = await Promise.all([
      api('GET', '/api/obligations/stats'),
      api('GET', `/api/obligations/instances?days_ahead=${oblDays}&page_size=200`),
    ]);
    if (!stats) return;
    oblStats = stats;
    oblInstances = inst?.items || [];
    // Also refresh notifications badge
    loadNotifCount();
    renderObligations();
  } catch(e){ toast(e.message,'error'); }
}

function renderObligations() {
  const main = document.getElementById('main');
  main.className = 'page';
  // Save focus state before re-render (search input loses focus on innerHTML replace)
  const _prevActive = document.activeElement;
  const _searchHadFocus = _prevActive && _prevActive.id === 'oblSearchInput';
  const _searchCursor = _searchHadFocus ? _prevActive.selectionStart : null;

  // Filter instances
  let filtered = oblInstances;
  if (oblSearchQ) {
    const q = oblSearchQ.toLowerCase();
    filtered = filtered.filter(i=>(i.client_name||'').toLowerCase().includes(q));
  }
  if (oblClientFilter) filtered = filtered.filter(i=>String(i.client_id)===oblClientFilter);
  if (oblTypeFilter) filtered = filtered.filter(i=>i.obligation_type===oblTypeFilter);
  if (oblStatusFilter === 'overdue_kpi') filtered = filtered.filter(i=>i.days_remaining<0);
  else if (oblStatusFilter) filtered = filtered.filter(i=>i.status===oblStatusFilter);

  const overdueLst = filtered.filter(i=>i.days_remaining<0);
  const soonLst = filtered.filter(i=>i.days_remaining>=0&&i.days_remaining<=7);
  const okLst = filtered.filter(i=>i.days_remaining>7);

  // KPI row
  const kpiRow = `
  <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:22px">
    ${[
      {label:'التزام نشط',val:oblStats.total_active_obligations||0,icon:'🔔',cls:'stat-blue',filter:null},
      {label:'خلال 30 يوم',val:oblStats.upcoming_30_days||0,icon:'📅',cls:'stat-purple',filter:null},
      {label:'هذا الأسبوع',val:oblStats.due_this_week||0,icon:'⏰',cls:'',filter:null},
      {label:'متأخرة',val:oblStats.overdue||0,icon:'🚨',cls:'stat-red',filter:'overdue'},
      {label:'مُقدَّم هذا الشهر',val:oblStats.submitted_this_month||0,icon:'✅',cls:'stat-green',filter:'submitted'},
      {label:'عملاء لديهم التزامات',val:oblStats.clients_with_obligations||0,icon:'👥',cls:'stat-blue',filter:null},
    ].map(k=>`<div class="stat-card ${k.cls}" style="padding:16px;${k.filter?'cursor:pointer;':'cursor:default;'}${k.filter&&oblStatusFilter===k.filter?'outline:2px solid #1a2472;outline-offset:2px;':''}" ${k.filter?`onclick="setOblStatusFilter('${k.filter}')"`:''}>
      <div style="font-size:22px;margin-bottom:6px">${k.icon}</div>
      <div style="font-size:26px;font-weight:800;color:#1e293b;line-height:1">${k.val}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px">${k.label}${k.filter?`<span style="font-size:10px;opacity:.7"> (اضغط للتصفية)</span>`:''}</div>
    </div>`).join('')}
  </div>`;

  // Build client options from instances
  const clientMap = new Map(oblInstances.filter(i=>i.client_id).map(i=>[i.client_id,i.client_name]));
  const typeSet = [...new Set(oblInstances.map(i=>i.obligation_type).filter(Boolean))];

  // Toolbar
  const _oblMob = window.innerWidth <= 768;
  const toolbar = `
  <div style="margin-bottom:16px">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
      <input class="input" style="flex:1;min-width:120px;font-size:12px;padding:5px 10px" placeholder="🔍 بحث باسم الشركة..." value="${escH(oblSearchQ)}" oninput="setOblSearch(this.value)" id="oblSearchInput"/>
      <select class="input" style="flex:1;min-width:${_oblMob?'100px':'auto'};font-size:12px;padding:5px 10px" onchange="oblDays=+this.value;loadObligations()">
        ${[7,14,30,60,90].map(d=>`<option value="${d}" ${oblDays===d?'selected':''}>خلال ${d} يوم</option>`).join('')}
      </select>
      <select class="input" style="flex:1;min-width:${_oblMob?'100px':'auto'};font-size:12px;padding:5px 10px" onchange="setOblTypeFilter(this.value)">
        <option value="">كل الأنواع</option>
        ${typeSet.map(t=>`<option value="${t}" ${oblTypeFilter===t?'selected':''}>${OBL_NAME_AR[t]||t}</option>`).join('')}
      </select>
      <select class="input" style="flex:1;min-width:${_oblMob?'100px':'auto'};font-size:12px;padding:5px 10px" onchange="setOblStatusFilter(this.value)">
        <option value="">كل الحالات</option>
        ${Object.entries(OBL_STATUS_AR).map(([k,v])=>`<option value="${k}" ${oblStatusFilter===k?'selected':''}>${v}</option>`).join('')}
      </select>
      ${oblSearchQ||oblTypeFilter||oblStatusFilter?`<button class="btn btn-secondary btn-sm" onclick="clearOblFilters()">✕</button>`:''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" onclick="runBulkGenerate()">⚙️ Auto-Generate</button>
      <button class="btn btn-secondary btn-sm" onclick="runRefreshNotifs()">🔔 تحديث</button>
      <button class="btn btn-primary btn-sm" onclick="showObligationModal()">+ إضافة</button>
    </div>
  </div>`;

  // ── تعريف أقسام الالتزامات (كل مجموعة في كارت منفصل) ───────────────────
  const OBL_GROUPS = [
    { key:'vat',         label:'ضريبة القيمة المضافة',    icon:'🧾', color:'#0369a1', bg:'#e0f2fe', border:'#7dd3fc',
      types:['vat_monthly','vat_quarterly'] },
    { key:'withholding', label:'أسس توحيد المرتبات',       icon:'✂️', color:'#0f766e', bg:'#f0fdfa', border:'#5eead4',
      types:['withholding_monthly'] },
    { key:'payroll',     label:'المرتبات والنماذج',        icon:'💼', color:'#7c3aed', bg:'#f5f3ff', border:'#c4b5fd',
      types:['payroll_monthly','form_41'] },
    { key:'income',      label:'ضريبة الدخل',             icon:'📊', color:'#b45309', bg:'#fffbeb', border:'#fcd34d',
      types:['income_annual','corporate_tax'] },
    { key:'insurance',   label:'التأمينات الاجتماعية',    icon:'🛡️', color:'#15803d', bg:'#f0fdf4', border:'#86efac',
      types:['insurance_monthly'] },
    { key:'other',       label:'التزامات أخرى',           icon:'📋', color:'#475569', bg:'#f8fafc', border:'#cbd5e1',
      types:['stamp_quarterly','commercial_register_renewal'] },
  ];

  // Instance row builder
  function instRow(i) {
    const over = i.days_remaining < 0;
    const close = i.days_remaining >= 0 && i.days_remaining <= 7;
    const rowStyle = over ? 'background:#fff5f5' : close ? 'background:#fffbeb' : '';
    const daysText = over
      ? `<span style="color:#dc2626;font-weight:700">⚠ ${Math.abs(i.days_remaining)} يوم متأخر</span>`
      : i.days_remaining === 0
        ? `<span style="color:#dc2626;font-weight:700">اليوم!</span>`
        : `<span style="color:${close?'#d97706':'#16a34a'};font-weight:600">${i.days_remaining} يوم</span>`;
    const prioColor = PRIORITY_COLOR[i.priority] || '#94a3b8';
    const subtypeName = OBL_NAME_AR[i.obligation_type]||i.obligation_type||'—';
    return `<tr style="${rowStyle}" data-id="${i.id}">
      <td><div style="font-weight:600;color:#1e293b;font-size:13px">${escH(i.client_name||'—')}</div></td>
      <td><div style="font-size:11px;color:#64748b">${subtypeName}<br/><span style="color:#94a3b8;font-size:10px">${i.period_label||''}</span></div></td>
      <td class="col-mob-hide" style="font-size:13px">${dateAr(i.due_date)}</td>
      <td>${daysText}</td>
      <td class="col-mob-hide"><span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;background:${prioColor}22;color:${prioColor};padding:2px 8px;border-radius:99px;font-weight:700">${PRIORITY_AR[i.priority]||'—'}</span></td>
      <td><span class="badge ${OBL_STATUS_BADGE[i.status]||'badge-gray'}">${OBL_STATUS_AR[i.status]||i.status}</span></td>
      <td class="col-mob-hide" style="color:#64748b;font-size:12px">${escH(i.assigned_name||'—')}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:4px">
          ${i.status!=='submitted'&&i.status!=='paid'?`<button class="btn btn-success btn-sm" onclick="submitObligation(${i.id})" title="تقديم">✅</button>`:''}
          ${i.status!=='paid'?`<button class="btn btn-secondary btn-sm" onclick="showUpdateOblModal(${i.id})" title="تعديل">✏️</button>`:''}
          <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5" onclick="deleteObligation(${i.obligation_id},'${escH(i.client_name||'')}')" title="حذف الالتزام">🗑️</button>
        </div>
      </td>
    </tr>`;
  }

  // Build grouped sections
  let groupedSections = '';
  // Track obligations that don't match any group
  const matchedIds = new Set();

  for (const grp of OBL_GROUPS) {
    const grpItems = filtered.filter(i => grp.types.includes(i.obligation_type));
    if (grpItems.length === 0) continue;
    grpItems.forEach(i => matchedIds.add(i.id));

    const overdueG = grpItems.filter(i=>i.days_remaining<0).length;
    const soonG = grpItems.filter(i=>i.days_remaining>=0&&i.days_remaining<=7).length;
    const sorted = [...grpItems].sort((a,b)=>a.days_remaining-b.days_remaining);

    groupedSections += `
    <div class="card" style="overflow:hidden;margin-bottom:18px">
      <div style="padding:14px 18px;background:${grp.bg};border-bottom:2px solid ${grp.border};display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">${grp.icon}</span>
          <div>
            <div style="font-size:14px;font-weight:800;color:${grp.color}">${grp.label}</div>
            <div style="font-size:11px;color:${grp.color}99;margin-top:1px">
              ${grpItems.length} عميل
              ${overdueG?`<span style="color:#dc2626;font-weight:700;margin-right:8px">• ${overdueG} متأخر</span>`:''}
              ${soonG?`<span style="color:#d97706;font-weight:700;margin-right:8px">• ${soonG} هذا الأسبوع</span>`:''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="background:${grp.color}22;color:${grp.color};font-size:11px;font-weight:700;padding:3px 12px;border-radius:99px">${grpItems.length} التزام</span>
        </div>
      </div>
      <div style="overflow-x:auto">
      <table>
        <thead><tr style="background:${grp.bg}55">
          <th>العميل</th><th>النوع / الفترة</th><th class="col-mob-hide">الاستحقاق</th><th>المتبقي</th>
          <th class="col-mob-hide">الأولوية</th><th>الحالة</th><th class="col-mob-hide">المحاسب</th><th>إجراءات</th>
        </tr></thead>
        <tbody>${sorted.map(instRow).join('')}</tbody>
      </table>
      </div>
    </div>`;
  }

  // Unmatched obligations (types not in any group)
  const unmatched = filtered.filter(i => !matchedIds.has(i.id));
  if (unmatched.length > 0) {
    groupedSections += `
    <div class="card" style="overflow:hidden;margin-bottom:18px">
      <div style="padding:14px 18px;background:#f8fafc;border-bottom:2px solid #e2e8f0;display:flex;align-items:center;gap:10px">
        <span style="font-size:22px">📌</span>
        <div style="font-size:14px;font-weight:800;color:#475569">التزامات متنوعة</div>
        <span style="background:#47556922;color:#475569;font-size:11px;font-weight:700;padding:3px 12px;border-radius:99px;margin-right:auto">${unmatched.length} التزام</span>
      </div>
      <div style="overflow-x:auto">
      <table>
        <thead><tr><th>العميل</th><th>النوع / الفترة</th><th class="col-mob-hide">الاستحقاق</th><th>المتبقي</th><th class="col-mob-hide">الأولوية</th><th>الحالة</th><th class="col-mob-hide">المحاسب</th><th>إجراءات</th></tr></thead>
        <tbody>${unmatched.map(instRow).join('')}</tbody>
      </table>
      </div>
    </div>`;
  }

  if (filtered.length === 0) {
    groupedSections = `<div class="card" style="padding:60px;text-align:center;color:#94a3b8"><div style="font-size:48px;margin-bottom:12px">✅</div><div style="font-size:15px">لا توجد التزامات بالفلاتر المختارة</div></div>`;
  }

  main.innerHTML = kpiRow + toolbar + groupedSections;
  // Restore search focus after re-render
  if (_searchHadFocus) {
    const si = document.getElementById('oblSearchInput');
    if (si) { si.focus(); if (_searchCursor != null) try { si.setSelectionRange(_searchCursor, _searchCursor); } catch(_){} }
  }
}

async function runBulkGenerate() {
  try {
    const btn = document.activeElement;
    if(btn) { btn.disabled=true; btn.textContent='⏳ جاري...'; }
    const r = await api('POST', '/api/obligations/bulk-generate');
    toast(`تم: ${r.total_obligations_created} التزام جديد لـ ${r.processed_clients} عميل`);
    loadObligations();
  } catch(e){ toast(e.message,'error'); }
}

async function runRefreshNotifs() {
  try {
    const r = await api('POST', '/api/obligations/refresh-notifications');
    toast(`${r.created_notifications} إشعار جديد`);
    loadNotifCount();
  } catch(e){ toast(e.message,'error'); }
}

async function submitObligation(instanceId) {
  try {
    await api('PUT', `/api/obligations/instances/${instanceId}`, {status:'submitted', submitted_at:new Date().toISOString()});
    toast('✅ تم تسجيل التقديم');
    loadObligations();
  } catch(e){ toast(e.message,'error'); }
}

async function deleteObligation(obligationId, clientName) {
  if (!obligationId) return;
  const confirmed = await confirmDlg(
    `هل تريد حذف الالتزام الضريبي للعميل "${clientName}"؟\nسيتم حذف جميع الفترات المستقبلية المرتبطة به.`,
    'حذف الالتزام', 'حذف', true
  );
  if (!confirmed) return;
  try {
    await api('DELETE', `/api/obligations/${obligationId}`);
    toast('✅ تم حذف الالتزام');
    // Remove instantly from local array so UI updates immediately
    oblInstances = oblInstances.filter(i => i.obligation_id !== obligationId);
    renderObligations();
  } catch(e){ toast(e.message||'خطأ في الحذف','error'); }
}
window.deleteObligation = deleteObligation;

async function showUpdateOblModal(instanceId) {
  const inst = oblInstances.find(i=>i.id===instanceId);
  if (!inst) return;
  let usersLst=[];
  try{ const u=await api('GET','/api/users'); usersLst=u||[]; }catch(e){}
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:440px">
    <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">تعديل الالتزام</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div style="padding:18px 22px">
      <div style="background:#f8fafc;border-radius:10px;padding:12px;margin-bottom:16px;font-size:12px;color:#374151">
        <b>${OBL_ICON[inst.obligation_type]||'📋'} ${OBL_NAME_AR[inst.obligation_type]||inst.obligation_type}</b><br/>
        ${escH(inst.client_name||'')} • ${inst.period_label||''} • استحقاق ${dateAr(inst.due_date)}
      </div>
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الحالة</label>
        <select id="updStatus" class="input">
          ${Object.entries(OBL_STATUS_AR).map(([k,v])=>`<option value="${k}" ${inst.status===k?'selected':''}>${v}</option>`).join('')}
        </select></div>
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">المبلغ (اختياري)</label>
          <input id="updAmount" class="input" type="number" placeholder="0" value="${inst.tax_amount||''}"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الغرامة</label>
          <input id="updPenalty" class="input" type="number" placeholder="0" value="${inst.penalty||''}"/></div>
      </div>
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">المحاسب المسؤول</label>
        <select id="updAssigned" class="input">
          <option value="">— غير محدد —</option>
          ${usersLst.map(u=>`<option value="${u.id}" ${inst.assigned_to===u.id?'selected':''}>${escH(u.name)}</option>`).join('')}
        </select></div>
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">ملاحظات</label>
        <textarea id="updNotes" class="input" rows="2">${escH(inst.notes||'')}</textarea></div>
    </div>
    <div style="padding:14px 22px;border-top:1px solid #f1f5f9;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="updOblBtn" class="btn btn-primary">💾 حفظ</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  document.getElementById('updOblBtn').onclick=async()=>{
    const btn=document.getElementById('updOblBtn');
    btn.disabled=true; btn.textContent='جاري...';
    try {
      const status=$('#updStatus',overlay).value;
      const body={status};
      const amt=$('#updAmount',overlay).value;
      const pen=$('#updPenalty',overlay).value;
      const ass=$('#updAssigned',overlay).value;
      const notes=$('#updNotes',overlay).value;
      if(amt) body.tax_amount=parseFloat(amt);
      if(pen) body.penalty=parseFloat(pen);
      if(ass) body.assigned_to=parseInt(ass);
      if(notes) body.notes=notes;
      if(status==='submitted') body.submitted_at=new Date().toISOString();
      await api('PUT',`/api/obligations/instances/${instanceId}`,body);
      toast('تم حفظ التعديلات');
      overlay.remove(); loadObligations(true);
    } catch(e){ toast(e.message,'error'); btn.disabled=false; btn.textContent='💾 حفظ'; }
  };
}

async function showObligationModal(preClientId=null) {
  let clientsList=[];
  try{ clientsList=await getClients(); }catch(e){}
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:500px">
    <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">🔔 إضافة التزام ضريبي</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div style="padding:18px 22px">
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">العميل *</label>
        <select id="oblClient" class="input">
          <option value="">— اختر العميل —</option>
          ${clientsList.map(c=>`<option value="${c.id}" ${preClientId===c.id?'selected':''}>${escH(c.name)}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">نوع الالتزام</label>
        <select id="oblType" class="input" onchange="autoFillOblFields(this.value)">
          <option value="">— اختر النوع —</option>
          <optgroup label="▸ شهرية">
            <option value="vat_monthly">🧾 إقرار القيمة المضافة الشهري</option>
            <option value="payroll_monthly">💼 نموذج 1 — مرتبات شهري</option>
            <option value="withholding_monthly">✂️ أسس توحيد المرتبات شهري</option>
            <option value="insurance_monthly">🛡️ تأمينات اجتماعية شهرية</option>
          </optgroup>
          <optgroup label="▸ ربع سنوية">
            <option value="vat_quarterly">🧾 إقرار القيمة المضافة الربعي</option>
            <option value="stamp_quarterly">🔏 الدمغة النسبية ربعي</option>
          </optgroup>
          <optgroup label="▸ سنوية">
            <option value="income_annual">📊 إقرار ضريبة الدخل السنوي</option>
            <option value="form_41">📋 نموذج 41 — إقرار المرتبات السنوي</option>
            <option value="corporate_tax">🏛️ ضريبة الخصم والتحصيل</option>
            <option value="commercial_register_renewal">📜 تجديد السجل التجاري</option>
          </optgroup>
        </select>
        <div id="oblTypeDesc" style="font-size:11px;color:#64748b;margin-top:4px;min-height:14px"></div>
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">التكرار</label>
          <select id="oblFreq" class="input">
            <option value="monthly">شهري</option>
            <option value="quarterly">ربعي</option>
            <option value="annual">سنوي</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">يوم الاستحقاق</label>
          <input id="oblDay" class="input" type="number" value="15" min="1" max="31"/>
        </div>
      </div>
    </div>
    <div style="padding:14px 22px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:space-between;align-items:center">
      <button class="btn btn-secondary" style="background:#f0f7ff;color:#1a2472;border-color:#bbd4f8;font-size:12px" onclick="autoGenerateForClient()">⚙️ Auto-Generate للعميل</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button id="saveOblBtn" class="btn btn-primary">🔔 إضافة</button>
      </div>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};

  // Auto-fill rules
  const oblDescMap = {
    vat_monthly:'تقديم وسداد الإقرار قبل اليوم 15 من الشهر التالي',
    payroll_monthly:'نموذج 1 الخاص بالمرتبات قبل اليوم 15',
    withholding_monthly:'تسوية الخصم والإضافة على المدفوعات للغير',
    insurance_monthly:'سداد اشتراكات التأمينات الاجتماعية قبل 15',
    vat_quarterly:'للمنشآت الصغيرة — إقرار ربعي قبل 15 من الشهر التالي للربع',
    stamp_quarterly:'ضريبة الدمغة النسبية على المعاملات التجارية',
    income_annual:'الإقرار السنوي لضريبة الدخل — 30 أبريل من كل عام',
    form_41:'الإقرار السنوي عن المرتبات — 31 يناير',
    corporate_tax:'ضريبة الخصم والتحصيل — ربع سنوي (مارس، يونيو، سبتمبر، ديسمبر)',
    commercial_register_renewal:'تجديد السجل التجاري سنويًا',
  };

  window.autoFillOblFields = function(type) {
    const freqMap = {vat_monthly:'monthly',payroll_monthly:'monthly',withholding_monthly:'monthly',insurance_monthly:'monthly',vat_quarterly:'quarterly',stamp_quarterly:'quarterly',income_annual:'annual',form_41:'annual',corporate_tax:'quarterly',commercial_register_renewal:'annual'};
    const dayMap = {vat_monthly:15,payroll_monthly:15,withholding_monthly:15,insurance_monthly:15,vat_quarterly:15,stamp_quarterly:15,income_annual:30,form_41:31,corporate_tax:30,commercial_register_renewal:28};
    const freq = freqMap[type]; const day = dayMap[type];
    if(freq){ const f=document.getElementById('oblFreq'); if(f) f.value=freq; }
    if(day){ const d=document.getElementById('oblDay'); if(d) d.value=day; }
    const desc=document.getElementById('oblTypeDesc');
    if(desc) desc.textContent=oblDescMap[type]||'';
  };

  window.autoGenerateForClient = async function() {
    const clientId=parseInt(document.getElementById('oblClient').value);
    if(!clientId){toast('اختر العميل أولاً','error');return;}
    try {
      const r=await api('POST',`/api/obligations/auto-generate/${clientId}`);
      toast(`تم: ${r.created.length} التزام جديد للعميل`);
      overlay.remove(); loadObligations(true);
    } catch(e){toast(e.message,'error');}
  };

  document.getElementById('saveOblBtn').onclick=async()=>{
    const btn=document.getElementById('saveOblBtn');
    const clientId=parseInt(document.getElementById('oblClient').value);
    const oblType=document.getElementById('oblType').value;
    if(!clientId){toast('اختر العميل','error');return;}
    if(!oblType){toast('اختر نوع الالتزام','error');return;}
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    try {
      await api('POST','/api/obligations',{
        client_id:clientId,
        obligation_type:oblType,
        frequency:document.getElementById('oblFreq').value,
        due_day:parseInt(document.getElementById('oblDay').value)||15,
      });
      toast('تم إنشاء الالتزام الضريبي');
      overlay.remove(); loadObligations(true);
    } catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent='🔔 إضافة';}
  };
}

// ── FORMATION OBLIGATIONS ──────────────────────────

let _fmOblData = [];
let _fmOblStats = null;
let _fmOblFilter = 'all';  // all, in_progress, late, completed
let _fmOblSearch = '';
let _fmOblExpanded = {};  // case_id → bool

const FMO_STATUS_LABEL = {not_started:'لم يبدأ', in_progress:'جاري', completed:'مكتمل', late:'متأخر'};
const FMO_STATUS_COLOR = {not_started:'#94a3b8', in_progress:'#f59e0b', completed:'#10b981', late:'#ef4444'};
const FMO_STATUS_BG    = {not_started:'#f1f5f9', in_progress:'#fffbeb', completed:'#f0fdf4', late:'#fef2f2'};


window.deleteFormationCase = async function(caseId, companyName) {
  const confirmed = await _SL.confirmDestructive({
    title: 'حذف ملف التأسيس',
    message: `سيتم حذف ملف "${companyName}" نهائياً. هل أنت متأكد؟`,
    confirmText: '🗑️ نعم، احذف الملف',
    backupNote: false,
  });
  if (!confirmed) return;
  try {
    await api('DELETE', `/api/formation/${caseId}`);
    _fmData = _fmData.filter(c => c.id !== caseId);
    toast('✅ تم حذف الملف');
    renderEstablishment();
  } catch(e) { toast(e.message, 'error'); }
};

async function loadFormationObligations(silent=false) {
  if(!silent){const m=document.getElementById('main');if(m)m.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';}
  try {
    const [oblRes, statsRes] = await Promise.all([
      api('GET','/api/formation-obligations').catch(()=>[]),
      api('GET','/api/formation-obligations/stats').catch(()=>null),
    ]);
    _fmOblData  = Array.isArray(oblRes) ? oblRes : [];
    _fmOblStats = statsRes;
    renderFormationObligations();
  } catch(e) {
    const m=document.getElementById('main');
    if(m) m.innerHTML=`<div style="text-align:center;padding:60px;color:#ef4444">${e.message}</div>`;
  }
}

function renderFormationObligations() {
  const stats = _fmOblStats || {};

  // Group obligations by case
  const byCase = {};
  for(const o of _fmOblData){
    if(!byCase[o.case_id]) byCase[o.case_id] = {case_id:o.case_id, company_name:'', items:[]};
    byCase[o.case_id].items.push(o);
  }
  // Merge company names from stats
  for(const cp of (stats.cases_with_progress||[])){
    if(byCase[cp.case_id]) byCase[cp.case_id].company_name = cp.company_name || '';
    else byCase[cp.case_id] = {case_id:cp.case_id, company_name:cp.company_name||'', items:[]};
  }

  let cases = Object.values(byCase);

  // Filter by status
  if(_fmOblFilter !== 'all'){
    cases = cases.map(c=>({...c, items:c.items.filter(o=>o.status===_fmOblFilter)})).filter(c=>c.items.length>0);
  }
  // Filter by search
  if(_fmOblSearch){
    const q=_fmOblSearch.toLowerCase();
    cases = cases.filter(c=>c.company_name.toLowerCase().includes(q));
  }

  const main = document.getElementById('main');
  if(!main) return;
  main.className='page';
  main.innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
    <div>
      <h2 style="margin:0;font-size:20px;color:#0f172a;font-weight:800">🏗️ التزامات التأسيس</h2>
      <div style="font-size:12px;color:#94a3b8;margin-top:3px">متابعة خطوات ملفات التأسيس</div>
    </div>
    <button class="btn btn-primary" onclick="showAddFormationOblModal()" style="font-size:13px">➕ إضافة التزام</button>
  </div>

  <!-- Stats bar -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
    ${[
      {label:'مفتوح',val:stats.total_open||0,color:'#6366f1',bg:'#eef2ff',icon:'📋'},
      {label:'مكتمل',val:stats.completed||0,color:'#10b981',bg:'#f0fdf4',icon:'✅'},
      {label:'متأخر',val:stats.late||0,color:'#ef4444',bg:'#fef2f2',icon:'🔴'},
      {label:'متوسط الإنجاز (يوم)',val:stats.avg_completion_days||0,color:'#f59e0b',bg:'#fffbeb',icon:'⏱️'},
    ].map(s=>`<div class="stat-card" style="background:${s.bg};border:1.5px solid ${s.color}20;padding:16px 20px;border-radius:14px">
      <div style="font-size:22px;margin-bottom:4px">${s.icon}</div>
      <div style="font-size:24px;font-weight:900;color:${s.color}">${s.val}</div>
      <div style="font-size:11px;color:#64748b;font-weight:600">${s.label}</div>
    </div>`).join('')}
  </div>

  <!-- Filters -->
  <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
    ${['all','in_progress','late','completed','not_started'].map(f=>`
    <button onclick="window._fmOblSetFilter('${f}')" style="padding:6px 16px;border-radius:99px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;border:1.5px solid ${_fmOblFilter===f?FMO_STATUS_COLOR[f]||'#1a2472':'#e2e8f0'};background:${_fmOblFilter===f?FMO_STATUS_COLOR[f]||'#1a2472':'#fff'};color:${_fmOblFilter===f?'#fff':'#64748b'};transition:.15s">
      ${f==='all'?'الكل':FMO_STATUS_LABEL[f]||f}
    </button>`).join('')}
    <input type="text" class="input" placeholder="بحث باسم الشركة..." value="${escH(_fmOblSearch)}"
      oninput="window._fmOblSetSearch(this.value)" style="flex:1;min-width:160px;max-width:280px;font-size:12px;padding:7px 12px">
  </div>

  <!-- Cases -->
  <div style="display:flex;flex-direction:column;gap:14px">
    ${cases.length===0?`<div style="text-align:center;padding:60px;color:#94a3b8"><div style="font-size:40px;margin-bottom:12px">📭</div><div style="font-size:14px">لا توجد التزامات</div></div>`
    : cases.map(c=>{
      const total = c.items.length;
      const done  = c.items.filter(o=>o.status==='completed').length;
      const pct   = total>0?Math.round(done/total*100):0;
      const late  = c.items.filter(o=>o.status==='late').length;
      const expanded = !!_fmOblExpanded[c.case_id];
      const statsForCase = (stats.cases_with_progress||[]).find(x=>x.case_id===c.case_id)||{};
      return `
      <div class="ea-white-card" style="padding:0;overflow:hidden;border-radius:14px;border:1px solid #f1f5f9">
        <!-- Header -->
        <div onclick="toggleFormationCase(${c.case_id})" style="padding:16px 20px;cursor:pointer;display:flex;align-items:center;gap:14px;background:#fff;transition:.15s" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background='#fff'">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span style="font-size:14px;font-weight:800;color:#0f172a">${escH(c.company_name||('ملف #'+c.case_id))}</span>
              ${late>0?`<span style="background:#fef2f2;color:#ef4444;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid #fecaca">${late} متأخر</span>`:''}
              <span style="font-size:12px;font-weight:800;color:${pct>=80?'#10b981':pct>=40?'#f59e0b':'#64748b'};margin-right:auto">${pct}%</span>
            </div>
            <div style="height:6px;background:#f1f5f9;border-radius:99px;overflow:hidden;margin-bottom:6px">
              <div style="height:100%;width:${pct}%;background:${pct>=80?'#10b981':pct>=40?'#f59e0b':'#6366f1'};border-radius:99px;transition:width .4s"></div>
            </div>
            <div style="font-size:10.5px;color:#94a3b8">${done}/${total} خطوة مكتملة${statsForCase.remaining&&statsForCase.remaining.length?` — متبقي: ${statsForCase.remaining.slice(0,3).join(' • ')}`:''}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button onclick="event.stopPropagation();generateFormationObls(${c.case_id})" class="btn" style="font-size:11px;padding:5px 12px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569">⚡ توليد تلقائي</button>
            <span style="color:#94a3b8;font-size:16px;transition:.2s;transform:rotate(${expanded?'180':'0'}deg)">${expanded?'▲':'▼'}</span>
          </div>
        </div>
        <!-- Steps (collapsible) -->
        ${expanded?`<div style="border-top:1px solid #f1f5f9;padding:12px 20px;display:flex;flex-direction:column;gap:6px;background:#fafafa">
          ${c.items.sort((a,b)=>a.order_index-b.order_index).map(o=>`
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:#fff;border:1px solid #f1f5f9">
            <div style="width:8px;height:8px;border-radius:50%;background:${FMO_STATUS_COLOR[o.status]||'#94a3b8'};flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:600;color:#0f172a">${escH(o.name)}</div>
              ${o.due_date?`<div style="font-size:10.5px;color:#94a3b8">الموعد: ${dateAr(o.due_date)}</div>`:''}
            </div>
            <span style="font-size:10px;font-weight:700;color:${FMO_STATUS_COLOR[o.status]||'#94a3b8'};background:${FMO_STATUS_BG[o.status]||'#f8fafc'};padding:3px 10px;border-radius:99px;white-space:nowrap">${FMO_STATUS_LABEL[o.status]||o.status}</span>
            <select onchange="updateFormationOblStatus(${o.id},this.value)" style="font-size:11px;padding:3px 8px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-family:inherit;color:#374151">
              ${Object.entries(FMO_STATUS_LABEL).map(([k,v])=>`<option value="${k}" ${o.status===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>`).join('')}
          <button onclick="showAddFormationOblModal(${c.case_id})" class="btn" style="margin-top:4px;font-size:11px;padding:6px 14px;background:#f8fafc;border:1px dashed #cbd5e1;color:#64748b;border-radius:10px;width:100%;text-align:center">+ إضافة خطوة</button>
        </div>`:''}
      </div>`;
    }).join('')}
  </div>`;
}

window._fmOblSetFilter = function(f){ _fmOblFilter=f; renderFormationObligations(); };
window._fmOblSetSearch = function(v){ _fmOblSearch=v; renderFormationObligations(); };

function toggleFormationCase(caseId){
  _fmOblExpanded[caseId] = !_fmOblExpanded[caseId];
  renderFormationObligations();
}

async function updateFormationOblStatus(oblId, newStatus){
  try {
    await api('PUT',`/api/formation-obligations/${oblId}`, {status: newStatus});
    await loadFormationObligations(true);
    toast('تم تحديث الحالة ✅');
  } catch(e){ toast(e.message,'error'); }
}

async function generateFormationObls(caseId, templateId){
  try {
    const url = templateId
      ? `/api/formation-obligations/generate/${caseId}?template_id=${templateId}`
      : `/api/formation-obligations/generate/${caseId}`;
    const r = await api('POST', url);
    if(r.generated>0){
      toast(`تم توليد ${r.generated} التزام ✅`);
      await loadFormationObligations(true);
    } else {
      toast(r.message||'لا جديد','info');
    }
  } catch(e){ toast(e.message,'error'); }
}

function showAddFormationOblModal(caseId){
  const overlay = document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`
  <div class="modal" style="max-width:480px;width:95%">
    <div class="modal-header"><span>➕ إضافة التزام تأسيس</span><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      <div><label class="form-label">اسم الالتزام *</label><input id="foName" class="input" placeholder="مثال: حجز الاسم التجاري"/></div>
      <div><label class="form-label">رقم الملف (case_id)</label><input id="foCaseId" class="input" type="number" value="${caseId||''}"/></div>
      <div><label class="form-label">الحالة</label>
        <select id="foStatus" class="input">
          ${Object.entries(FMO_STATUS_LABEL).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
      <div><label class="form-label">تاريخ الاستحقاق</label><input id="foDueDate" class="input" type="date"/></div>
      <div><label class="form-label">ملاحظات</label><textarea id="foNotes" class="input" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button class="btn btn-primary" onclick="window._saveFormationObl(this)">حفظ</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

window._saveFormationObl = async function(btn){
  btn.disabled=true;
  const caseId = parseInt(document.getElementById('foCaseId')?.value);
  const name   = document.getElementById('foName')?.value?.trim();
  if(!name||!caseId){ toast('يرجى إدخال الاسم ورقم الملف','error'); btn.disabled=false; return; }
  try {
    await api('POST','/api/formation-obligations',{
      case_id: caseId,
      name,
      status: document.getElementById('foStatus')?.value||'not_started',
      due_date: document.getElementById('foDueDate')?.value||null,
      notes: document.getElementById('foNotes')?.value||null,
    });
    document.querySelector('.modal-overlay')?.remove();
    await loadFormationObligations(true);
    toast('تم إضافة الالتزام ✅');
  } catch(e){ toast(e.message,'error'); btn.disabled=false; }
};

window.loadFormationObligations=loadFormationObligations;
window.renderFormationObligations=renderFormationObligations;
window.updateFormationOblStatus=updateFormationOblStatus;
window.showAddFormationOblModal=showAddFormationOblModal;
window.generateFormationObls=generateFormationObls;
window.toggleFormationCase=toggleFormationCase;

// ── EMPLOYEES ──────────────────────────────────────
const ROLE_LABEL={admin:'مدير النظام',manager:'مدير',accountant:'محاسب',viewer:'مشاهد'};
const ROLE_COLOR={admin:'#5b8ec4',manager:'#1a2472',accountant:'#059669',viewer:'#94a3b8'};
const SPEC_OPTS=['ضريبة القيمة المضافة','ضريبة الدخل','تأسيس شركات','محاسبة عامة','مرتبات','جمارك','زكاة','مراجعة حسابات','استشارات مالية'];

async function loadEmployees() {
  const main=document.getElementById('main');
  main.className='page';
  main.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
    <div>
      <h2 style="font-size:22px;font-weight:800;color:#1a2472;margin:0;padding-right:14px;border-right:4px solid #1a2472">👤 إدارة الموظفين</h2>
      <p style="font-size:13px;color:#94a3b8;margin:4px 0 0">توزيع المهام والتخصصات والعبء الوظيفي</p>
    </div>
    ${currentUser?.role==='admin'?`<button class="btn btn-primary" onclick="showEmployeeModal()">+ إضافة موظف</button>`:''}
  </div>
  <div id="empGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px">
    <div style="text-align:center;padding:60px;color:#94a3b8;grid-column:1/-1">⏳ جاري التحميل...</div>
  </div>`;
  try {
    const users=await api('GET','/api/users');
    renderEmployeeGrid(users);
  } catch(e){toast(e.message,'error');}
}

function renderEmployeeGrid(users) {
  const grid=document.getElementById('empGrid');
  if(!users||!users.length){grid.innerHTML='<div style="text-align:center;padding:60px;color:#94a3b8;grid-column:1/-1">لا يوجد موظفون</div>';return;}
  grid.innerHTML=users.map(u=>{
    const specs=Array.isArray(u.specialization)?u.specialization:[];
    const taskLoad=u.task_count||0;
    const leadLoad=u.lead_count||0;
    const loadColor=taskLoad+leadLoad>10?'#ef4444':taskLoad+leadLoad>5?'#f59e0b':'#10b981';
    const loadPct=Math.min(100,Math.round((taskLoad+leadLoad)/15*100));
    return `<div class="card" style="padding:0;overflow:hidden">
      <div style="padding:20px 20px 16px;border-bottom:1px solid #f1f5f9">
        <div style="display:flex;align-items:flex-start;gap:14px">
          <div style="width:52px;height:52px;border-radius:50%;background:${ROLE_COLOR[u.role]||'#94a3b8'};display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;flex-shrink:0">
            ${u.avatar?`<img src="${u.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`:(u.name||'?')[0]}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:3px">${escH(u.name)}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${ROLE_COLOR[u.role]+'22'};color:${ROLE_COLOR[u.role]};font-weight:600">${ROLE_LABEL[u.role]||u.role}</span>
              <span style="font-size:12px;color:#94a3b8">${escH(u.email||'')}</span>
            </div>
            ${u.phone?`<div style="font-size:12px;color:#64748b;margin-top:3px">📞 ${escH(u.phone)}</div>`:''}
          </div>
          ${currentUser?.role==='admin'?`<button onclick="showEmployeeModal(${u.id})" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:16px;padding:4px" title="تعديل">✏️</button>`:''}
        </div>
      </div>
      <div style="padding:16px 20px">
        <div style="display:flex;gap:16px;margin-bottom:14px">
          <div style="text-align:center;flex:1;padding:10px;background:#f8fafc;border-radius:8px">
            <div style="font-size:20px;font-weight:700;color:#4478b0">${taskLoad}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">مهام نشطة</div>
          </div>
          <div style="text-align:center;flex:1;padding:10px;background:#f8fafc;border-radius:8px">
            <div style="font-size:20px;font-weight:700;color:#8b5cf6">${leadLoad}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">عملاء محتملين</div>
          </div>
          <div style="text-align:center;flex:1;padding:10px;background:#f8fafc;border-radius:8px">
            <div style="font-size:20px;font-weight:700;color:${loadColor}">${loadPct}%</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">الحمل الوظيفي</div>
          </div>
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px;display:flex;justify-content:space-between">
            <span>العبء الوظيفي</span><span style="color:${loadColor}">${taskLoad+leadLoad} / 15</span>
          </div>
          <div style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${loadPct}%;background:${loadColor};border-radius:3px;transition:width .3s"></div>
          </div>
        </div>
        ${specs.length?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:10px">
          ${specs.map(s=>`<span style="font-size:10px;padding:3px 8px;background:#eef1fb;color:#4478b0;border-radius:10px;border:1px solid #b3c4e8">${escH(s)}</span>`).join('')}
        </div>`:`<div style="font-size:11px;color:#cbd5e1;margin-top:10px;font-style:italic">لا توجد تخصصات محددة</div>`}
        ${u.notes?`<div style="margin-top:10px;font-size:12px;color:#64748b;padding:8px;background:#fefce8;border-radius:6px;border-right:3px solid #fbbf24">📝 ${escH(u.notes)}</div>`:''}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #f1f5f9;display:flex;gap:8px">
        <button onclick="showAssignTaskModal(${u.id},'${escH(u.name)}')" class="btn btn-secondary" style="flex:1;font-size:12px">📋 تعيين مهمة</button>
        <button onclick="showEmployeeTasks(${u.id},'${escH(u.name)}')" class="btn btn-secondary" style="flex:1;font-size:12px">👁 مهامه</button>
      </div>
    </div>`;
  }).join('');
}

async function showEmployeeModal(userId=null) {
  let user=null;
  if(userId){
    try{const users=await api('GET','/api/users');user=users.find(u=>u.id===userId)||null;}catch(e){}
  }
  const specs=user&&Array.isArray(user.specialization)?user.specialization:[];
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px';
  overlay.innerHTML=`<div class="modal" style="width:520px;max-height:90vh;overflow-y:auto">
    <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">${userId?'تعديل بيانات الموظف':'إضافة موظف جديد'}</h3>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">×</button>
    </div>
    <div style="padding:20px 24px">
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الاسم الكامل *</label>
          <input id="empName" class="input" value="${escH(user?.name||'')}" placeholder="اسم الموظف"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">البريد الإلكتروني *</label>
          <input id="empEmail" class="input" type="email" value="${escH(user?.email||'')}" placeholder="email@example.com" ${userId?'disabled style="background:#f8fafc;color:#94a3b8"':''}/></div>
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">رقم الهاتف</label>
          <input id="empPhone" class="input" value="${escH(user?.phone||'')}" placeholder="01xxxxxxxxx"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الدور الوظيفي</label>
          <select id="empRole" class="input">
            ${Object.entries(ROLE_LABEL).map(([k,v])=>`<option value="${k}" ${(user?.role||'accountant')===k?'selected':''}>${v}</option>`).join('')}
          </select></div>
      </div>
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">💬 رقم واتساب <span style="font-size:11px;color:#64748b;font-weight:400">(للإشعارات التلقائية)</span></label>
        <input id="empWaPhone" class="input" value="${escH(user?.whatsapp_phone||user?.phone||'')}" placeholder="01xxxxxxxxx"/>
      </div>
      ${!userId?`<div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">كلمة المرور *</label>
        <input id="empPass" class="input" type="password" placeholder="••••••••"/></div>`:''}
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">ملاحظات</label>
        <textarea id="empNotes" class="input" rows="2" style="resize:none">${escH(user?.notes||'')}</textarea></div>
      <div style="margin-bottom:4px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">التخصصات</label>
        <div id="specList" style="display:flex;flex-wrap:wrap;gap:6px">
          ${SPEC_OPTS.map(s=>`<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;padding:5px 10px;border:1px solid ${specs.includes(s)?'#4478b0':'#e2e8f0'};border-radius:20px;background:${specs.includes(s)?'#eef1fb':'#fff'};transition:.15s" onclick="toggleSpecLabel(this)">
            <input type="checkbox" style="display:none" value="${s}" ${specs.includes(s)?'checked':''}>${s}
          </label>`).join('')}
        </div>
      </div>
      ${userId?`<div style="margin-top:16px;padding:12px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca">
        <div style="font-size:12px;font-weight:600;color:#dc2626;margin-bottom:8px">⚠️ تعطيل الحساب</div>
        <button onclick="deactivateEmployee(${userId})" style="font-size:12px;padding:6px 14px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer">تعطيل الموظف</button>
      </div>`:''}
    </div>
    <div style="padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="saveEmpBtn" class="btn btn-primary">${userId?'💾 حفظ التعديلات':'➕ إضافة الموظف'}</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  document.getElementById('saveEmpBtn').onclick=async()=>{
    const btn=document.getElementById('saveEmpBtn');
    const name=document.getElementById('empName')?.value?.trim();
    const email=document.getElementById('empEmail')?.value?.trim();
    const phone=document.getElementById('empPhone')?.value?.trim();
    const waPhone=document.getElementById('empWaPhone')?.value?.trim();
    const role=document.getElementById('empRole')?.value;
    const notes=document.getElementById('empNotes')?.value?.trim();
    const pass=document.getElementById('empPass')?.value;
    const selectedSpecs=[...overlay.querySelectorAll('#specList input[type=checkbox]:checked')].map(c=>c.value);
    if(!name){toast('الاسم مطلوب','error');return;}
    if(!userId&&!email){toast('البريد الإلكتروني مطلوب','error');return;}
    if(!userId&&(!pass||pass.length<6)){toast('كلمة المرور مطلوبة (6 أحرف على الأقل)','error');return;}
    btn.disabled=true;btn.textContent='جاري الحفظ...';
    try{
      if(userId){
        await api('PUT',`/api/users/${userId}`,{name,phone:phone||null,whatsapp_phone:waPhone||null,role,notes:notes||null,specialization:selectedSpecs});
        toast('تم تحديث بيانات الموظف');
      } else {
        await api('POST','/api/users',{name,email,password:pass,phone:phone||null,whatsapp_phone:waPhone||null,role,specialization:selectedSpecs});
        toast('تم إضافة الموظف بنجاح');
      }
      overlay.remove();
      loadEmployees();
    }catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent=userId?'💾 حفظ التعديلات':'➕ إضافة الموظف';}
  };
}

async function deactivateEmployee(userId) {
  if(!await confirmDlg('هل أنت متأكد من تعطيل هذا الموظف؟'))return;
  try{
    await api('DELETE',`/api/users/${userId}`);
    toast('تم تعطيل الموظف');
    document.querySelector('.modal-overlay')?.remove();
    loadEmployees();
  }catch(e){toast(e.message,'error');}
}

async function showAssignTaskModal(userId, userName) {
  let clients=[];
  try{clients=await getClients();}catch(e){}
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px';
  overlay.innerHTML=`<div class="modal" style="width:480px">
    <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">📋 تعيين مهمة لـ ${escH(userName)}</h3>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">×</button>
    </div>
    <div style="padding:20px 24px">
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">العنوان *</label>
        <input id="atTitle" class="input" placeholder="عنوان المهمة"/></div>
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">العميل</label>
        <select id="atClient" class="input">
          <option value="">— بدون عميل —</option>
          ${clients.map(c=>`<option value="${c.id}">${escH(c.name)}</option>`).join('')}
        </select></div>
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الأولوية</label>
          <select id="atPrio" class="input">
            <option value="low">منخفضة</option><option value="medium" selected>متوسطة</option><option value="high">عالية</option><option value="urgent">عاجلة</option>
          </select></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تاريخ الاستحقاق</label>
          <input id="atDue" class="input" type="date"/></div>
      </div>
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الوصف</label>
        <textarea id="atDesc" class="input" rows="3" style="resize:none" placeholder="تفاصيل المهمة..."></textarea></div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="saveAtBtn" class="btn btn-primary">✅ تعيين المهمة</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  document.getElementById('saveAtBtn').onclick=async()=>{
    const btn=document.getElementById('saveAtBtn');
    const title=document.getElementById('atTitle')?.value?.trim();
    if(!title){toast('العنوان مطلوب','error');return;}
    const clientId=parseInt(document.getElementById('atClient')?.value)||null;
    const due=document.getElementById('atDue')?.value||null;
    const desc=document.getElementById('atDesc')?.value?.trim()||null;
    const prio=document.getElementById('atPrio')?.value;
    btn.disabled=true;btn.textContent='جاري الحفظ...';
    try{
      await api('POST','/api/tasks',{title,description:desc,assigned_to:userId,client_id:clientId,priority:prio,due_date:due||null});
      toast('تم تعيين المهمة بنجاح');
      overlay.remove();
      loadEmployees();
    }catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent='✅ تعيين المهمة';}
  };
}

async function showEmployeeTasks(userId, userName) {
  let tasks=[];
  try{const r=await api('GET',`/api/tasks?assigned_to=${userId}&page_size=100`);tasks=r.items||[];}catch(e){}
  const TASK_STATUS={todo:'معلقة',in_progress:'جارية',done:'منجزة',cancelled:'ملغاة'};
  const TASK_COLOR={todo:'#f59e0b',in_progress:'#4478b0',done:'#10b981',cancelled:'#94a3b8'};
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px';
  overlay.innerHTML=`<div class="modal" style="width:580px;max-height:85vh;display:flex;flex-direction:column">
    <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">📋 مهام ${escH(userName)}</h3>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">×</button>
    </div>
    <div style="padding:16px 24px;overflow-y:auto;flex:1">
      ${!tasks.length?`<div style="text-align:center;padding:40px;color:#94a3b8">لا توجد مهام مسندة</div>`:
      tasks.map(t=>`<div style="padding:14px;border:1px solid #f1f5f9;border-radius:8px;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px">
        <div style="width:8px;height:8px;border-radius:50%;background:${TASK_COLOR[t.status]||'#94a3b8'};margin-top:5px;flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:#1e293b">${escH(t.title)}</div>
          ${t.client_name?`<div style="font-size:11px;color:#64748b">👤 ${escH(t.client_name)}</div>`:''}
          ${t.due_date?`<div style="font-size:11px;color:#94a3b8">📅 ${t.due_date?.substring(0,10)||''}</div>`:''}
        </div>
        <span style="font-size:11px;padding:3px 8px;border-radius:10px;background:${TASK_COLOR[t.status]+'22'};color:${TASK_COLOR[t.status]};font-weight:600;white-space:nowrap">${TASK_STATUS[t.status]||t.status}</span>
      </div>`).join('')}
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f1f5f9;text-align:left;flex-shrink:0">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
}

// ── COLLECTIONS (Sheet Style) ───────────────────────────────────────────────
let _collMode = 'acc'; // acc | est
let _collMonth = new Date().getMonth() + 1;
let _collYear  = new Date().getFullYear();
let _collRows  = [];   // loaded rows from server
const _COLL_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const _COLL_PAY = {cash:'كاش',transfer:'تحويل بنكي',instapay:'إنستاباي',check:'شيك',wallet:'محفظة إلكترونية'};
const _COLL_PAY_BADGE = {cash:'background:#f1f5f9;color:#475569',transfer:'background:#faeeda;color:#854f0b',instapay:'background:#eeedfe;color:#534ab7',check:'background:#f1f5f9;color:#475569',wallet:'background:#e0f2fe;color:#0369a1'};

