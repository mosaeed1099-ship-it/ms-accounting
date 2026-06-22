async function loadClients(silent=false) {
  const main=document.getElementById('main');
  if(main&&!clientsData.length&&!silent){main.className='page';main.innerHTML=skeletonTable(5,7);}
  try {
    // Always fetch all clients; filtering is done client-side in renderClients()
    const data = await api('GET',`/api/clients?page_size=500`);
    if(!data) return;
    clientsData = data.items||[];
    invalidateClientsCache(); // keep shared cache in sync
    _clientsCache = clientsData;
    renderClients();
  } catch(e) { toast(e.message,'error'); }
}

const CLIENT_TYPE_LABEL={
  'llc':'ش.م.م','one_person':'شخص واحد','sole':'فردية','limited_partnership':'توصية بسيطة',
  'joint_stock':'مساهمة','partnership':'تضامن','foreign_branch':'فرع أجنبي',
  'association':'جمعية','foundation':'مؤسسة','holding':'قابضة','free_zone':'منطقة حرة',
  'individual':'فرد','freelancer':'حر عمل','company':'شركة',
};
const CLIENT_TYPE_BADGE={
  'llc':'badge-blue','one_person':'badge-blue','sole':'badge-green','limited_partnership':'badge-purple',
  'joint_stock':'badge-blue','partnership':'badge-blue','foreign_branch':'badge-orange',
  'association':'badge-green','foundation':'badge-green','holding':'badge-purple','free_zone':'badge-yellow',
  'individual':'badge-green','freelancer':'badge-purple','company':'badge-blue',
};

// ── Shared lookup tables (module-level — not re-declared per render call) ──
const CLIENT_STATUS_BADGE  = {active:'badge-green',inactive:'badge-gray',prospect:'badge-yellow',suspended:'badge-red'};
const CLIENT_STATUS_LABEL  = {active:'نشط',inactive:'غير نشط',prospect:'محتمل',suspended:'موقوف'};
const INV_STATUS_BADGE     = {paid:'badge-green',sent:'badge-blue',partial:'badge-yellow',overdue:'badge-red',draft:'badge-gray',cancelled:'badge-gray'};
const INV_STATUS_LABEL     = {paid:'مسددة',sent:'مرسلة',partial:'جزئي',overdue:'متأخرة',draft:'مسودة',cancelled:'ملغاة'};
const PRIORITY_COLOR       = {urgent:'#dc2626',high:'#f97316',medium:'#eab308',low:'#22c55e'};
const PRIORITY_LABEL       = {urgent:'عاجل',high:'عالي',medium:'متوسط',low:'منخفض'};
const CAT_LABEL            = {tax:'ضرائب',accounting:'محاسبة',payroll:'مرتبات',legal:'قانوني',other:'أخرى'};
const MONTH_NAMES_AR       = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function _clientsTableRows() {
  const typeLabel=CLIENT_TYPE_LABEL;
  const typeBadge=CLIENT_TYPE_BADGE;
  const statusBadge=CLIENT_STATUS_BADGE;
  const statusLabel=CLIENT_STATUS_LABEL;
  const q = clientSearch.toLowerCase();
  const filtered = clientsData.filter(c=>{
    if(clientFilter!=='all' && c.status!==clientFilter) return false;
    if(clientTypeFilter!=='all' && c.client_type!==clientTypeFilter) return false;
    if(q) return (c.name||'').toLowerCase().includes(q)||(c.tax_number||'').includes(q)||(c.code||'').toLowerCase().includes(q);
    return true;
  });
  if(!filtered.length) return emptyStateRow(9,'👥','لا يوجد عملاء','اضغط "+ إضافة عميل" لإنشاء أول عميل');
  return filtered.map((c,idx)=>{
    return `
  <tr style="cursor:pointer" onclick="showClientDetail(${c.id})">
    <td><span style="font-family:monospace;background:#f1f5f9;padding:2px 8px;border-radius:6px;font-size:13px;color:#475569;font-weight:600">${idx+1}</span></td>
    <td>
      <div style="display:inline-flex;align-items:center;gap:5px">
        <span style="font-weight:600;color:#1e293b;cursor:pointer" onclick="showClientDetail(${c.id})">${escH(c.name)}</span>
        <button onclick="event.stopPropagation();navigator.clipboard.writeText('${c.name.replace(/'/g,"\\'")}').then(()=>toast('✅ تم نسخ الاسم'))" title="نسخ الاسم"
          style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;color:#94a3b8;font-size:12px;line-height:1;opacity:.5;transition:opacity .15s"
          onmouseover="this.style.opacity='1';this.style.background='#f1f5f9'"
          onmouseout="this.style.opacity='.5';this.style.background='none'">📋</button>
      </div>
      ${c.name_en?`<div style="font-size:11px;color:#94a3b8">${escH(c.name_en)}</div>`:''}
    </td>
    <td><span class="badge ${typeBadge[c.client_type]||'badge-gray'}">${typeLabel[c.client_type]||c.client_type}</span></td>
    <td class="col-mob-hide" onclick="event.stopPropagation()" style="direction:ltr;text-align:right;color:#374151;white-space:nowrap">
      ${c.phone ? `<span style="display:inline-flex;align-items:center;gap:5px">
        <span>${escH(c.phone)}</span>
        <button onclick="navigator.clipboard.writeText('${c.phone.replace(/'/g,"\\'")}').then(()=>toast('✅ تم نسخ الرقم'))" title="نسخ الرقم"
          style="background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:5px;color:#94a3b8;font-size:13px;line-height:1;opacity:.6;transition:opacity .15s"
          onmouseover="this.style.opacity='1';this.style.background='#f1f5f9'"
          onmouseout="this.style.opacity='.6';this.style.background='none'">📋</button>
      </span>` : '—'}
    </td>
    <td class="col-mob-hide" style="color:#374151;font-size:12px">${c.activity||'—'}</td>
    <td><span class="badge ${statusBadge[c.status]||'badge-gray'}">${statusLabel[c.status]||c.status}</span></td>
    <td onclick="event.stopPropagation()">
      <div class="mob-actions-wrap" style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" onclick="showClientModal(${c.id})" title="تعديل">✏️</button>
        <button class="btn btn-secondary btn-sm" onclick="addInvoiceForClient(${c.id},'${c.name}')" title="فاتورة جديدة">📄</button>
        <button class="btn btn-secondary btn-sm" title="رفع ملف" onclick="showUploadModal(${c.id})">📎</button>
        <button class="btn btn-secondary btn-sm" title="إرسال بريد" onclick="showClientEmailModal(${c.id},'${c.name.replace(/'/g,"\\'")}','${c.email||''}')">📧</button>
      </div>
    </td>
  </tr>`;}).join('');
}

function renderClients() {
  const main=document.getElementById('main');
  main.className='page';
  // If shell already rendered, only update tbody to preserve input focus
  const existingTbody = main.querySelector('#clientsTbody');
  if (existingTbody) {
    existingTbody.innerHTML = _clientsTableRows();
    return;
  }
  main.innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="position:relative">
        <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:15px">🔍</span>
        <input id="clientSearchInput" class="input" style="padding-right:34px;width:240px" placeholder="بحث بالاسم أو الرقم الضريبي..." value="${escH(clientSearch)}"/>
      </div>
      <select id="clientFilterSelect" class="input" style="width:140px">
        <option value="all" ${clientFilter==='all'?'selected':''}>كل الحالات</option>
        <option value="active" ${clientFilter==='active'?'selected':''}>نشط</option>
        <option value="prospect" ${clientFilter==='prospect'?'selected':''}>محتمل</option>
        <option value="inactive" ${clientFilter==='inactive'?'selected':''}>غير نشط</option>
      </select>
      <select id="clientTypeFilterSelect" class="input" style="width:160px">
        <option value="all" ${clientTypeFilter==='all'?'selected':''}>كل الأنواع</option>
        <option value="llc" ${clientTypeFilter==='llc'?'selected':''}>ش.م.م</option>
        <option value="one_person" ${clientTypeFilter==='one_person'?'selected':''}>شخص واحد</option>
        <option value="sole" ${clientTypeFilter==='sole'?'selected':''}>فردية</option>
        <option value="limited_partnership" ${clientTypeFilter==='limited_partnership'?'selected':''}>توصية بسيطة</option>
        <option value="joint_stock" ${clientTypeFilter==='joint_stock'?'selected':''}>مساهمة</option>
        <option value="partnership" ${clientTypeFilter==='partnership'?'selected':''}>تضامن</option>
        <option value="foreign_branch" ${clientTypeFilter==='foreign_branch'?'selected':''}>فرع أجنبي</option>
        <option value="association" ${clientTypeFilter==='association'?'selected':''}>جمعية</option>
        <option value="foundation" ${clientTypeFilter==='foundation'?'selected':''}>مؤسسة</option>
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:13px;color:#64748b;font-weight:600">${clientsData.length} عميل</span>
      <button class="btn btn-primary" onclick="showClientModal()">+ إضافة عميل</button>
    </div>
  </div>
  <div class="card" style="overflow:hidden">
    <table>
      <thead><tr>
        <th style="width:48px">#</th><th>الاسم</th><th>النوع</th><th class="col-mob-hide">الهاتف</th><th class="col-mob-hide">النشاط</th><th>الحالة</th><th>إجراءات</th>
      </tr></thead>
      <tbody id="clientsTbody">${_clientsTableRows()}</tbody>
    </table>
  </div>`;
  document.getElementById('clientSearchInput').oninput=e=>{clientSearch=e.target.value;renderClients()};
  document.getElementById('clientFilterSelect').onchange=e=>{clientFilter=e.target.value;renderClients()};
  document.getElementById('clientTypeFilterSelect').onchange=e=>{clientTypeFilter=e.target.value;renderClients()};
}

async function showClientDetail(id) {
  const c = clientsData.find(x=>x.id===id);
  if(!c) return;
  const typeLabel=CLIENT_TYPE_LABEL;
  const statusLabel=CLIENT_STATUS_LABEL;

  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:560px">
    <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin:0 0 2px">${escH(c.name)}</h2>
        <span style="font-size:12px;color:#64748b">${c.code||''} · ${typeLabel[c.client_type]||c.client_type}</span>
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <!-- Health Score Banner -->
    <div id="healthScoreBanner" style="padding:14px 24px;background:linear-gradient(135deg,#f0f7ff,#eef1fb);border-bottom:1px solid #e2e8f0">
      <div style="display:flex;align-items:center;gap:10px">
        <div id="healthScoreCircle" style="width:48px;height:48px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#94a3b8;flex-shrink:0">⏳</div>
        <div style="flex:1">
          <div style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:2px">مؤشر صحة العميل</div>
          <div id="healthScoreBar" style="height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden">
            <div id="healthScoreBarFill" style="height:100%;background:#94a3b8;width:0;border-radius:99px;transition:width .6s ease"></div>
          </div>
        </div>
        <div id="healthScoreLabel" style="font-size:12px;font-weight:700;color:#94a3b8">جاري...</div>
      </div>
      <!-- Health score breakdown (hidden until loaded) -->
      <div id="healthScoreDetails" style="display:none;margin-top:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px"></div>
    </div>
    <!-- Client Tasks Section -->
    <div id="clientTasksSection" style="padding:0 24px 14px;border-bottom:1px solid #f1f5f9;display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700;color:#374151">✅ مهام العميل</div>
        <button onclick="showTaskModalForClient(${c.id},'${escH(c.name)}')" style="background:#eef1fb;color:#1a2472;border:none;border-radius:8px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer">+ مهمة جديدة</button>
      </div>
      <div id="clientTasksList" style="display:flex;flex-direction:column;gap:6px"></div>
    </div>
    <div style="padding:20px 24px;display:grid;grid-template-columns:1fr 1fr;gap:14px">
      ${[
        ['📞 الهاتف',c.phone||'—'],['🏙️ المحافظة',c.governorate||'—'],
        ['🔢 الرقم الضريبي',c.tax_number||'—'],['🏢 السجل التجاري',c.commercial_register||'—'],
        ['⚙️ النشاط',c.activity||'—'],['💳 نوع الضريبة',c.tax_type||'—'],
        ['✅ الحالة',statusLabel[c.status]||c.status],
        ...(c.trade_name?[['🏷️ السمة التجارية',c.trade_name]]:[] ),
        ...(c.legal_entity?[['⚖️ الكيان القانوني',c.legal_entity]]:[] ),
        ...(c.company_status&&c.company_status!=='active'?[['🏭 حالة الشركة',{active:'نشطة',inactive:'غير نشطة',under_establishment:'قيد التأسيس'}[c.company_status]||c.company_status]]:[] ),
      ].map(([k,v])=>`<div><div style="font-size:10px;color:#94a3b8;font-weight:700;margin-bottom:3px;text-transform:uppercase;letter-spacing:.3px">${k}</div><div style="font-size:13px;color:#1e293b;font-weight:600">${escH(String(v))}</div></div>`).join('')}
    </div>
    ${c.tax_obligations&&c.tax_obligations.length?`
    <div style="padding:0 24px 14px">
      <div style="font-size:11px;color:#94a3b8;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.3px">الالتزامات الضريبية المسجلة</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${c.tax_obligations.map(t=>`<span style="background:#eef1fb;color:#1a2472;font-size:11px;padding:3px 10px;border-radius:6px;font-weight:600">${OBL_ICON[t]||'📋'} ${OBL_NAME_AR[t]||t}</span>`).join('')}
      </div>
    </div>`:''}
    ${c.notes?`<div style="padding:0 24px 14px"><div style="font-size:11px;color:#94a3b8;font-weight:700;margin-bottom:5px">ملاحظات</div><div style="font-size:13px;color:#374151;background:#f8fafc;padding:10px;border-radius:8px">${escH(c.notes)}</div></div>`:''}
    ${c.email?`<div style="padding:0 24px 12px;display:flex;align-items:center;gap:8px;font-size:13px;color:#1a2472"><span>📧</span><span>${escH(c.email)}</span></div>`:''}
    ${currentUser?.role==='admin'?`<div id="portalCredInline" style="padding:0 24px 14px;border-top:1px solid #f1f5f9"><div style="font-size:10px;color:#94a3b8;font-weight:700;margin:12px 0 8px;text-transform:uppercase;letter-spacing:.3px">🔐 بيانات البوابات</div><div id="portalCredInlineBody" style="font-size:12px;color:#64748b">⏳</div></div>`:''}
    <div style="padding:14px 24px 20px;border-top:1px solid #f1f5f9;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="this.closest('.modal-overlay').remove();showClientModal(${c.id})">✏️ تعديل</button>
      <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove();addInvoiceForClient(${c.id},'${escH(c.name)}')">💳 فاتورة</button>
      <button class="btn btn-secondary btn-sm" onclick="showUploadModal(${c.id})">📎 رفع ملف</button>
      <button class="btn btn-secondary btn-sm" onclick="showClientEmailModal(${c.id},'${escH(c.name)}','${escH(c.email||'')}')">📧 بريد</button>
      <button class="btn btn-secondary btn-sm" onclick="showObligationModal(${c.id})">🔔 التزام</button>
      <button class="btn btn-secondary btn-sm" onclick="showClientTimeline(${c.id},'${escH(c.name)}')">🕐 Timeline</button>
      ${c.tax_obligations&&c.tax_obligations.length?`<button class="btn btn-sm" style="background:#eef1fb;color:#1a2472;border:1.5px solid #b3c4e8" onclick="autoGenClientObligations(${c.id})">⚙️ Auto-Generate</button>`:''}
      <button class="btn btn-sm" style="background:linear-gradient(135deg,#1e3a8a,#1a2472);color:white;border:none;font-weight:700" onclick="this.closest('.modal-overlay').remove();openClientAccounting(${c.id},'${escH(c.name)}')">🏛️ الحسابات</button>
      <button class="btn btn-sm" style="background:#f0fdf4;color:#15803d;border:1.5px solid #86efac;font-weight:700" onclick="this.closest('.modal-overlay').remove();navigate('documents')">📜 وثائق</button>
      <button class="btn btn-sm" style="background:#fff7ed;color:#c2410c;border:1.5px solid #fed7aa;font-weight:700" onclick="this.closest('.modal-overlay').remove();navigate('office_services');setTimeout(()=>{document.getElementById('osSvcFilter')&&(document.getElementById('osSvcFilter').value='')},500)">🏢 خدمات</button>
      ${currentUser?.role==='admin'?`<button class="btn btn-sm" style="background:#1e293b;color:white;border:none;font-weight:700" onclick="showPortalCredentials(${c.id},'${escH(c.name)}')">🔐 بيانات البوابات</button>`:''}
      <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};

  // Load client tasks async
  api('GET', `/api/tasks?client_id=${c.id}&page_size=50`).then(r => {
    const tasks = r?.items || [];
    const section = document.getElementById('clientTasksSection');
    const list = document.getElementById('clientTasksList');
    if (!section || !list) return;
    if (tasks.length > 0) {
      section.style.display = 'block';
      const PRIORITY_COLOR_M = {urgent:'#dc2626',high:'#f97316',medium:'#d97706',low:'#16a34a'};
      const STATUS_LABEL_M = {todo:'جديدة',in_progress:'جاري',waiting_docs:'بانتظار مستندات',done:'مكتملة',cancelled:'ملغاة'};
      const STATUS_BG_M = {todo:'#f1f5f9',in_progress:'#eef1fb',waiting_docs:'#fffbeb',done:'#f0fdf4',cancelled:'#fff5f5'};
      const STATUS_CLR_M = {todo:'#64748b',in_progress:'#1a2472',waiting_docs:'#d97706',done:'#15803d',cancelled:'#dc2626'};
      const open = tasks.filter(t=>t.status!=='done'&&t.status!=='cancelled');
      const closed = tasks.filter(t=>t.status==='done'||t.status==='cancelled');
      const today = new Date().toISOString().split('T')[0];
      list.innerHTML = [
        ...open.map(t=>{
          const overdue = t.due_date && t.due_date < today;
          return `<div style="background:${STATUS_BG_M[t.status]||'#f8fafc'};border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;border:1px solid ${overdue?'#fecaca':'#e8edf3'}" onclick="this.closest('.modal-overlay').remove();navigate('tasks');setTimeout(()=>showTaskModal(${t.id}),400)">
            <div>
              <div style="font-size:12px;font-weight:700;color:#1e293b">${escH(t.title)}</div>
              <div style="font-size:10px;color:${overdue?'#dc2626':'#64748b'}">${overdue?'⚠️ متأخر — ':' '}${t.due_date?dateAr(t.due_date):''} ${t.assigned_to_name?'· 👷 '+t.assigned_to_name:''}</div>
            </div>
            <div style="display:flex;gap:5px;align-items:center">
              <span style="font-size:10px;font-weight:700;color:${PRIORITY_COLOR_M[t.priority]};background:${PRIORITY_COLOR_M[t.priority]}18;padding:2px 7px;border-radius:5px">${t.priority==='urgent'?'🔴':t.priority==='high'?'🟠':t.priority==='medium'?'🟡':'🟢'}</span>
              <span style="font-size:10px;font-weight:700;color:${STATUS_CLR_M[t.status]||'#64748b'};background:${STATUS_CLR_M[t.status]||'#64748b'}18;padding:2px 7px;border-radius:5px">${STATUS_LABEL_M[t.status]||t.status}</span>
            </div>
          </div>`;
        }),
        closed.length>0 ? `<div style="font-size:10px;color:#94a3b8;padding:3px 2px">✅ ${closed.length} مكتملة</div>` : '',
      ].join('');
    }
  }).catch(()=>{});

  // Load portal credentials inline (admin only)
  if (currentUser?.role === 'admin') {
    api('GET', `/api/portal-credentials/${c.id}`).then(pc => {
      const el = document.getElementById('portalCredInlineBody');
      if (!el) return;
      if (!pc || !pc.client_id) { el.textContent = '—'; return; }
      const rows = [
        pc.contact_person && ['👤 اسم العميل', pc.contact_person],
        pc.national_id    && ['🪪 الرقم القومي', pc.national_id],
        pc.portal_system  && ['🏛️ المنظومة', pc.portal_system + (pc.declaration_type ? ' — ' + pc.declaration_type : '')],
        pc.portal_username && ['👤 يوزر ساب', pc.portal_username],
        pc.portal_password && ['🔑 باسورد ساب', `<span style="filter:blur(4px);cursor:pointer" onclick="this.style.filter=''" title="اضغط للإظهار">${escH(pc.portal_password)}</span>`],
        pc.einvoice_email  && ['🧾 إيميل فاتورة', pc.einvoice_email],
        pc.einvoice_password && ['🔑 باسورد فاتورة', `<span style="filter:blur(4px);cursor:pointer" onclick="this.style.filter=''" title="اضغط للإظهار">${escH(pc.einvoice_password)}</span>`],
        pc.email_address  && ['📧 الإيميل', pc.email_address],
        pc.email_password && ['🔑 باسورد إيميل', `<span style="filter:blur(4px);cursor:pointer" onclick="this.style.filter=''" title="اضغط للإظهار">${escH(pc.email_password)}</span>`],
        pc.payroll_username && ['💼 مرتبات يوزر', pc.payroll_username + (pc.payroll_type ? ' (' + pc.payroll_type + ')' : '')],
        pc.payroll_password && ['🔑 باسورد مرتبات', `<span style="filter:blur(4px);cursor:pointer" onclick="this.style.filter=''" title="اضغط للإظهار">${escH(pc.payroll_password)}</span>`],
      ].filter(Boolean);
      if (!rows.length) { el.textContent = '—'; return; }
      el.innerHTML = `<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:center">${rows.map(([k,v])=>`<span style="color:#94a3b8;font-weight:700;white-space:nowrap">${k}</span><span style="color:#1e293b;font-weight:600">${v}</span>`).join('')}</div>`;
    }).catch(()=>{ const el=document.getElementById('portalCredInlineBody'); if(el) el.textContent='—'; });
  }

  // Load health score async
  try {
    const hs = await api('GET', `/api/obligations/health-score/${c.id}`);
    if (!hs) return;
    const circle = document.getElementById('healthScoreCircle');
    const fill = document.getElementById('healthScoreBarFill');
    const label = document.getElementById('healthScoreLabel');
    const details = document.getElementById('healthScoreDetails');
    if (circle) { circle.textContent=hs.score; circle.style.background=hs.color+'22'; circle.style.color=hs.color; }
    if (fill) { fill.style.width=hs.score+'%'; fill.style.background=hs.color; }
    if (label) { label.textContent=hs.rating_ar; label.style.color=hs.color; }
    if (details) {
      details.style.display='grid';
      details.innerHTML=[
        {k:'الدفع',v:hs.details.payment?.score,m:30,icon:'💰'},
        {k:'الالتزامات',v:hs.details.compliance?.score,m:30,icon:'📋'},
        {k:'الملفات',v:hs.details.documents?.score,m:20,icon:'📁'},
        {k:'المهام',v:hs.details.tasks?.score,m:20,icon:'✅'},
      ].map(d=>`<div style="text-align:center;background:white;border-radius:8px;padding:6px">
        <div style="font-size:13px">${d.icon}</div>
        <div style="font-size:13px;font-weight:700;color:#1e293b">${d.v||0}</div>
        <div style="font-size:9px;color:#94a3b8">/ ${d.m}</div>
        <div style="font-size:10px;color:#64748b;margin-top:1px">${d.k}</div>
      </div>`).join('');
    }
  } catch(e) {
    const circle = document.getElementById('healthScoreCircle');
    if(circle) circle.textContent='—';
  }
}

async function autoGenClientObligations(clientId) {
  try {
    const r = await api('POST', `/api/obligations/auto-generate/${clientId}`);
    toast(`⚙️ ${r.message}`);
    loadNotifCount();
  } catch(e){ toast(e.message,'error'); }
}

async function showClientTimeline(clientId, clientName) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" style="max-width:580px;max-height:90vh;display:flex;flex-direction:column">
    <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">🕐 Timeline</h2>
        <div style="font-size:12px;color:#64748b;margin-top:2px">${escH(clientName)}</div>
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div id="timelineBody" style="flex:1;overflow-y:auto;padding:20px 22px">
      <div style="text-align:center;padding:40px;color:#94a3b8"><div class="spinner" style="margin:0 auto"></div></div>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };

  try {
    const data = await api('GET', `/api/clients/${clientId}/timeline?limit=60`);
    const events = data?.events || [];
    const body = document.getElementById('timelineBody');
    if (!events.length) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8"><div style="font-size:40px;margin-bottom:10px">📭</div><div>لا توجد نشاطات بعد</div></div>';
      return;
    }

    const typeLabel = {client:'عميل',invoice:'فاتورة',payment:'دفعة',task:'مهمة',obligation:'التزام',document:'ملف',activity:'نشاط'};
    const typeBadge = {client:'badge-blue',invoice:'badge-blue',payment:'badge-green',task:'badge-purple',obligation:'badge-orange',document:'badge-gray',activity:'badge-gray'};

    // Group by date
    const grouped = {};
    events.forEach(e => {
      const d = e.date ? new Date(e.date).toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'}) : 'تاريخ غير معروف';
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(e);
    });

    body.innerHTML = Object.entries(grouped).map(([date, evts]) => `
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:12px;display:flex;align-items:center;gap:8px;text-transform:uppercase;letter-spacing:.5px">
          <span style="flex:1;height:1px;background:#f1f5f9"></span>
          <span>${date}</span>
          <span style="flex:1;height:1px;background:#f1f5f9"></span>
        </div>
        ${evts.map(e => `
          <div style="display:flex;gap:12px;margin-bottom:12px">
            <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
              <div style="width:36px;height:36px;border-radius:50%;background:${e.color}22;border:2px solid ${e.color}44;display:flex;align-items:center;justify-content:center;font-size:15px">${e.icon}</div>
              <div style="width:2px;flex:1;background:#f1f5f9;margin-top:4px"></div>
            </div>
            <div style="flex:1;padding-bottom:4px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
                <div style="font-size:13px;font-weight:600;color:#1e293b">${escH(e.title||'')}</div>
                <span class="badge ${typeBadge[e.type]||'badge-gray'}" style="font-size:10px">${typeLabel[e.type]||e.type}</span>
              </div>
              ${e.subtitle?`<div style="font-size:11px;color:#64748b">${escH(e.subtitle)}</div>`:''}
              ${e.amount?`<div style="font-size:11px;color:#16a34a;font-weight:600;margin-top:2px">${e.amount.toLocaleString('ar-EG')} ج.م.</div>`:''}
              <div style="font-size:10px;color:#cbd5e1;margin-top:3px">${e.date?new Date(e.date).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):''}</div>
            </div>
          </div>`).join('')}
      </div>`).join('');
  } catch(err) {
    const body = document.getElementById('timelineBody');
    if(body) body.innerHTML = `<div style="color:#dc2626;padding:20px;text-align:center">${err.message}</div>`;
  }
}

function showClientModal(id=null) {
  const c = id ? clientsData.find(x=>x.id===id) : null;
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:560px">
    <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:17px;font-weight:700;color:#1e293b;margin:0">${c?'تعديل عميل':'إضافة عميل جديد'}</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div style="padding:20px 24px">
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الاسم بالعربية *</label>
          <input id="cName" class="input" value="${c?.name||''}" placeholder="اسم العميل"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الاسم بالإنجليزية</label>
          <input id="cNameEn" class="input" value="${c?.name_en||''}" placeholder="English name"/></div>
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">نوع الكيان القانوني</label>
          <select id="cType" class="input">
            <option value="llc" ${(c?.client_type||'llc')==='llc'?'selected':''}>شركة ذات مسئولية محدودة</option>
            <option value="one_person" ${c?.client_type==='one_person'?'selected':''}>شركة شخص واحد</option>
            <option value="sole" ${c?.client_type==='sole'?'selected':''}>منشأة فردية</option>
            <option value="limited_partnership" ${c?.client_type==='limited_partnership'?'selected':''}>توصية بسيطة</option>
            <option value="joint_stock" ${c?.client_type==='joint_stock'?'selected':''}>شركة مساهمة</option>
            <option value="partnership" ${c?.client_type==='partnership'?'selected':''}>شركة تضامن</option>
            <option value="foreign_branch" ${c?.client_type==='foreign_branch'?'selected':''}>فرع شركة أجنبية</option>
            <option value="association" ${c?.client_type==='association'?'selected':''}>جمعية</option>
            <option value="foundation" ${c?.client_type==='foundation'?'selected':''}>مؤسسة</option>
            <option value="holding" ${c?.client_type==='holding'?'selected':''}>شركة قابضة</option>
            <option value="free_zone" ${c?.client_type==='free_zone'?'selected':''}>شركة منطقة حرة</option>
            <option value="individual" ${c?.client_type==='individual'?'selected':''}>فرد / شخص طبيعي</option>
            <option value="freelancer" ${c?.client_type==='freelancer'?'selected':''}>عمل حر</option>
          </select></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الحالة</label>
          <select id="cStatus" class="input">
            <option value="active" ${(c?.status||'active')==='active'?'selected':''}>نشط</option>
            <option value="prospect" ${c?.status==='prospect'?'selected':''}>محتمل</option>
            <option value="inactive" ${c?.status==='inactive'?'selected':''}>غير نشط</option>
          </select></div>
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الهاتف</label>
          <input id="cPhone" class="input" value="${c?.phone||''}" placeholder="01xxxxxxxxx"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">المحافظة</label>
          <input id="cGov" class="input" value="${c?.governorate||''}" placeholder="القاهرة"/></div>
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الرقم الضريبي <span style="color:#94a3b8;font-weight:400">(اختياري)</span></label>
          <input id="cTax" class="input" value="${c?.tax_number||''}" placeholder="xxx-xxx-xxx"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">السجل التجاري <span style="color:#94a3b8;font-weight:400">(اختياري)</span></label>
          <input id="cCommReg" class="input" value="${c?.commercial_register||''}" placeholder="رقم السجل"/></div>
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">رقم ق.م.م <span style="color:#94a3b8;font-weight:400">(اختياري)</span></label>
          <input id="cVat" class="input" value="${c?.vat_number||''}" placeholder="رقم القيمة المضافة"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">نوع الضريبة</label>
          <select id="cTaxType" class="input">
            <option value="vat" ${(c?.tax_type||'vat')==='vat'?'selected':''}>قيمة مضافة</option>
            <option value="income" ${c?.tax_type==='income'?'selected':''}>دخل</option>
            <option value="withholding" ${c?.tax_type==='withholding'?'selected':''}>خصم وإضافة</option>
            <option value="stamp" ${c?.tax_type==='stamp'?'selected':''}>دمغة</option>
            <option value="none" ${c?.tax_type==='none'?'selected':''}>لا يوجد</option>
          </select></div>
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">النشاط التجاري</label>
          <input id="cActivity" class="input" value="${c?.activity||''}" placeholder="استيراد وتصدير"/></div>
        <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الأتعاب الشهرية (ج.م.)</label>
          <input id="cMonthlyFee" class="input" type="number" value="${c?.monthly_fee||''}" placeholder="2000"/></div>
      </div>
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">📧 البريد الإلكتروني للعميل</label>
        <input id="cEmail" class="input" type="email" value="${c?.email||''}" placeholder="client@example.com"/>
        <div style="font-size:11px;color:#94a3b8;margin-top:3px">يُستخدم لإرسال التذكيرات والإشعارات للعميل مباشرةً</div>
      </div>
      <!-- ── Extended Profile ── -->
      <div style="border:1px solid #e8edf3;border-radius:10px;padding:14px;margin-bottom:14px;background:#fafbff">
        <div style="font-size:11px;font-weight:700;color:#1a2472;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">البيانات التوسعية للشركة</div>
        <div class="form-row" style="margin-bottom:10px">
          <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">السمة التجارية</label>
            <input id="cTradeName" class="input" value="${c?.trade_name||''}" placeholder="الاسم التجاري إن وجد"/></div>
          <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الكيان القانوني</label>
            <input id="cLegalEntity" class="input" value="${c?.legal_entity||''}" placeholder="مثال: شركة مساهمة مصرية"/></div>
        </div>
        <div class="form-row" style="margin-bottom:10px">
          <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">حالة الشركة</label>
            <select id="cCompanyStatus" class="input">
              <option value="active" ${(c?.company_status||'active')==='active'?'selected':''}>نشطة</option>
              <option value="inactive" ${c?.company_status==='inactive'?'selected':''}>غير نشطة</option>
              <option value="under_establishment" ${c?.company_status==='under_establishment'?'selected':''}>قيد التأسيس</option>
            </select></div>
          <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">اللغة المفضلة</label>
            <select id="cPrefLang" class="input">
              <option value="ar" ${(c?.preferred_lang||'ar')==='ar'?'selected':''}>العربية</option>
              <option value="en" ${c?.preferred_lang==='en'?'selected':''}>English</option>
            </select></div>
        </div>
        <div class="form-row">
          <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تاريخ بدء النشاط</label>
            <input id="cActivityStart" class="input" type="date" value="${c?.activity_start_date||''}"/></div>
          <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تاريخ انتهاء النشاط</label>
            <input id="cActivityEnd" class="input" type="date" value="${c?.activity_end_date||''}"/></div>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <label style="font-size:12px;font-weight:600;color:#374151">الالتزامات الضريبية</label>
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#1a2472;cursor:pointer">
            <input type="checkbox" id="cOblSelectAll" style="width:14px;height:14px;accent-color:#1a2472"> تحديد الكل
          </label>
        </div>
        <div id="cOblGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:5px">
          ${[
            {key:'vat_monthly',    label:'🧾 ضريبة القيمة المضافة'},
            {key:'payroll_monthly',label:'💼 مرتبات / أسس توحيد المرتبات'},
            {key:'income_annual',  label:'📊 دخل سنوي'},
          ].map(o=>{
            const taxObls=c?.tax_obligations||[];
            const checked=o.key==='payroll_monthly'
              ?taxObls.some(t=>t==='payroll_monthly'||t==='withholding_monthly')
              :taxObls.includes(o.key);
            return`<label style="display:flex;align-items:center;gap:6px;font-size:11.5px;cursor:pointer;padding:5px 8px;border-radius:7px;border:1px solid ${checked?'#1a2472':'#e5e7eb'};background:${checked?'#eef1fb':'#fff'};transition:.15s" id="cObl_${o.key}_label">
            <input type="checkbox" class="cOblCheck" data-key="${o.key}" ${checked?'checked':''} style="width:13px;height:13px;accent-color:#1a2472" onchange="toggleOblLabel(this)">${o.label}
          </label>`;}).join('')}
        </div>
      </div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="saveClientBtn" class="btn btn-primary">💾 ${c?'حفظ التعديلات':'إضافة عميل'}</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  // Select all obligations checkbox
  const oblAll=document.getElementById('cOblSelectAll');
  if(oblAll){
    const checks=()=>overlay.querySelectorAll('.cOblCheck');
    oblAll.onchange=()=>{
      checks().forEach(cb=>{cb.checked=oblAll.checked;toggleOblLabel(cb);});
    };
    // Sync select-all with individual checkboxes
    overlay.querySelectorAll('.cOblCheck').forEach(cb=>{
      cb.addEventListener('change',()=>{
        oblAll.checked=[...checks()].every(c=>c.checked);
        oblAll.indeterminate=[...checks()].some(c=>c.checked)&&![...checks()].every(c=>c.checked);
      });
    });
    // Init indeterminate state
    const allChecks=[...overlay.querySelectorAll('.cOblCheck')];
    if(allChecks.some(c=>c.checked)&&!allChecks.every(c=>c.checked)) oblAll.indeterminate=true;
    if(allChecks.every(c=>c.checked)) oblAll.checked=true;
  }
  document.getElementById('saveClientBtn').onclick = async () => {
    const btn=document.getElementById('saveClientBtn');
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    try {
      const selectedObls=[...overlay.querySelectorAll('.cOblCheck:checked')].map(el=>el.dataset.key);
      const body={
        name:$('#cName',overlay).value.trim(),
        name_en:$('#cNameEn',overlay).value.trim()||null,
        client_type:$('#cType',overlay).value,
        status:$('#cStatus',overlay).value,
        phone:$('#cPhone',overlay).value.trim()||null,
        governorate:$('#cGov',overlay).value.trim()||null,
        tax_number:$('#cTax',overlay).value.trim()||null,
        commercial_register:$('#cCommReg',overlay).value.trim()||null,
        vat_number:$('#cVat',overlay).value.trim()||null,
        tax_type:$('#cTaxType',overlay).value,
        activity:$('#cActivity',overlay).value.trim()||null,
        monthly_fee:parseFloat($('#cMonthlyFee',overlay).value)||0,
        email:$('#cEmail',overlay).value.trim()||null,
        tax_obligations:selectedObls,
        trade_name:$('#cTradeName',overlay)?.value.trim()||null,
        legal_entity:$('#cLegalEntity',overlay)?.value.trim()||null,
        company_status:$('#cCompanyStatus',overlay)?.value||'active',
        preferred_lang:$('#cPrefLang',overlay)?.value||'ar',
        activity_start_date:$('#cActivityStart',overlay)?.value||null,
        activity_end_date:$('#cActivityEnd',overlay)?.value||null,
      };
      if(!body.name){toast('الاسم مطلوب','error');btn.disabled=false;btn.innerHTML=`💾 ${c?'حفظ التعديلات':'إضافة عميل'}`;return}

      const DUE_DAYS={vat_monthly:30,vat_quarterly:30,payroll_monthly:14,withholding_monthly:14,insurance_monthly:14,stamp_quarterly:30,income_annual:30,corporate_tax:30,form_41:30,commercial_register_renewal:30};

      let savedClient;
      if(c){
        savedClient = await api('PUT',`/api/clients/${c.id}`,body);
      } else {
        savedClient = await api('POST','/api/clients',body);
      }
      const clientId = savedClient?.id || c?.id;

      // ── Auto-create obligations for selected types ──────────────────────
      if(clientId && selectedObls.length){
        // Fetch existing obligations for this client to avoid duplicates
        let existingObls = [];
        try { existingObls = await api('GET',`/api/obligations?client_id=${clientId}&page_size=100`); }
        catch(_) {}
        const existingTypes = new Set(
          (Array.isArray(existingObls)?existingObls:(existingObls?.items||[])).map(o=>
            o.obligation_type==='withholding_monthly'?'payroll_monthly':o.obligation_type
          )
        );
        const creates = selectedObls.filter(t=>!existingTypes.has(t));
        if(creates.length){
          await Promise.allSettled(creates.map(otype=>
            api('POST','/api/obligations',{
              client_id:clientId,
              obligation_type:otype,
              due_day:DUE_DAYS[otype]||30,
              alert_days_before:10,
              notes:'أُنشئ تلقائياً عند إضافة العميل',
            })
          ));
        }
      }

      // ── Auto-create folder for new clients ──────────────────────────────
      if(!c && clientId){
        try { await api('POST','/api/folders',{name:body.name,client_id:clientId,parent_id:null}); } catch(_) {}
      }

      toast(c?'تم تحديث بيانات العميل':'✅ تم إضافة العميل والتزاماته وفولدره');
      overlay.remove();
      invalidateClientsCache();
      _AC.invalidate('/api/obligations');
      loadClients(true);
      if(currentPage==='obligations')loadObligations(true);
    } catch(e){toast(e.message,'error');btn.disabled=false;btn.innerHTML=`💾 ${c?'حفظ التعديلات':'إضافة عميل'}`}
  };
}

function toggleOblLabel(cb){
  const lbl=document.getElementById('cObl_'+cb.dataset.key+'_label');
  if(lbl){lbl.style.borderColor=cb.checked?'#1a2472':'#e5e7eb';lbl.style.background=cb.checked?'#eef1fb':'#fff';}
}
window.toggleOblLabel=toggleOblLabel;

function addInvoiceForClient(clientId, clientName) {
  navigate('invoices');
  setTimeout(()=>showInvoiceModal(null,clientId),300);
}

// ── INVOICES ───────────────────────────────────────
let invoicesData=[], invoiceFilter='all';

// ── Unified Fees & Collections page ─────────────────
let _feesTab = 'establishment'; // 'establishment' | 'monthly_fee' | 'invoices'
let _feesCollData = [];
var _feesSearchQ = '';

