async function loadEstablishment(silent=false) {
  try {
    const main=document.getElementById('main');
    main.className='page';
    if(!silent) main.innerHTML=`<div style="text-align:center;padding:60px;color:#94a3b8"><div style="font-size:32px;margin-bottom:12px">⏳</div>جاري ��لتحميل...</div>`;

    const [statsRes, casesRes] = await Promise.all([
      api('GET','/api/formation/stats').catch(()=>null),
      api('GET',`/api/formation?page_size=200${_fmStageFilter?'&stage='+_fmStageFilter:''}`).catch(()=>({items:[]})),
    ]);
    _fmStats = statsRes;
    _fmData  = casesRes.items || [];
    renderEstablishment();
  } catch(e){toast(e.message,'error')}
}

function renderEstablishment() {
  const main=document.getElementById('main');
  main.className='page';

  const total = _fmStats?.total || _fmData.length;
  const completed = _fmStats?.completed || _fmData.filter(c=>c.is_completed).length;
  const inProg  = _fmStats?.in_progress || (total - completed);

  // Stage pills
  const stagePills = FORMATION_STAGES.map(s=>{
    const cnt = _fmStats?.stages?.[s.key]?.count ?? _fmData.filter(c=>c.current_stage===s.key).length;
    const active = _fmStageFilter===s.key;
    return `<button onclick="_fmFilterStage('${s.key}')"
      style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;border:2px solid ${active?s.color:'#e5e7eb'};background:${active?s.color+'15':'#fff'};color:${active?s.color:'#374151'};font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .15s">
      ${s.icon} ${s.label} <span style="background:${active?s.color:'#e5e7eb'};color:${active?'#fff':'#374151'};border-radius:10px;padding:0 6px;font-size:11px">${cnt}</span>
    </button>`;
  }).join('');

  // Filter active cases
  let shown = _fmData.filter(c=> {
    if(_fmStageFilter && c.current_stage !== _fmStageFilter) return false;
    if(_fmSearch && !c.company_name.toLowerCase().includes(_fmSearch.toLowerCase()) &&
       !(c.code||'').toLowerCase().includes(_fmSearch.toLowerCase())) return false;
    return true;
  });

  main.innerHTML=`
  <!-- KPIs -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px">
    ${[{label:'الإجمالي',val:total,icon:'🏗️',color:'#1a2472'},
       {label:'قيد التنفيذ',val:inProg,icon:'⚙️',color:'#d97706'},
       {label:'مكتملة',val:completed,icon:'🎉',color:'#16a34a'}]
      .map(k=>`<div class="stat-card" style="cursor:pointer" onclick="_fmFilterStage(${k.label==='مكتملة'?'"completed"':'""'})">
        <div style="font-size:28px;margin-bottom:6px">${k.icon}</div>
        <div style="font-size:28px;font-weight:800;color:#1e293b">${k.val}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px">${k.label}</div>
      </div>`).join('')}
  </div>

  <!-- Toolbar -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:10px">
    <div style="display:flex;gap:8px;align-items:center;flex:1">
      <input id="fmSearch" class="input" style="max-width:220px;padding:7px 12px" placeholder="🔍 بحث عن شركة..."
        value="${_fmSearch}" oninput="_fmSearchChange(this.value)"/>
      ${_fmStageFilter?`<button onclick="_fmFilterStage('')" style="padding:5px 10px;border-radius:8px;border:1px solid #e5e7eb;background:#fff3cd;color:#92400e;font-size:12px;cursor:pointer">✕ ${FORMATION_STAGES.find(s=>s.key===_fmStageFilter)?.label||_fmStageFilter}</button>`:''}
    </div>
    <button class="btn btn-primary" onclick="showFormationModal()">+ ملف تأسيس جديد</button>
  </div>

  <!-- Stage Filter Pills -->
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #f1f5f9;overflow-x:auto">
    <button onclick="_fmFilterStage('')" style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;border:2px solid ${!_fmStageFilter?'#1a2472':'#e5e7eb'};background:${!_fmStageFilter?'#eef1fb':'#fff'};color:${!_fmStageFilter?'#1a2472':'#374151'};font-size:12px;font-weight:600;cursor:pointer">
      🗂️ الكل <span style="background:${!_fmStageFilter?'#1a2472':'#e5e7eb'};color:${!_fmStageFilter?'#fff':'#374151'};border-radius:10px;padding:0 6px;font-size:11px">${total}</span>
    </button>
    ${stagePills}
  </div>

  <!-- Cases List -->
  <div style="display:flex;flex-direction:column;gap:10px">
    ${shown.length===0
      ? `<div class="card" style="padding:56px;text-align:center;color:#94a3b8">
           <div style="font-size:44px;margin-bottom:12px">🏗️</div>
           <div style="font-weight:600">لا توجد ملفات تأسيس ${_fmStageFilter||_fmSearch?'بهذا الفلتر':''}</div>
           <button class="btn btn-primary" style="margin-top:16px" onclick="showFormationModal()">+ إنشاء أول ملف</button>
         </div>`
      : shown.map(c=>_fmCaseCard(c)).join('')}
  </div>`;
}

function _fmCaseCard(c) {
  const stg = FORMATION_STAGES.find(s=>s.key===c.current_stage) || FORMATION_STAGES[0];
  const prog = c.progress || 0;
  const CTYPE_SHORT = {llc:'ذ.م.م',jsc:'مساهمة',sole:'فردية',partnership:'تضامن',ngo:'جمعية',branch:'فرع',rep:'مكتب تمثيل'};

  // Mini pipeline bar — show first 10 stages as dots
  const pipelineDots = FORMATION_STAGES.map((s,i)=>{
    const done = i < c.stage_index;
    const active = s.key === c.current_stage;
    const clr = done||active ? stg.color : '#e5e7eb';
    return `<div title="${s.label}" style="flex:1;height:6px;background:${clr};border-radius:2px;opacity:${active?1:done?0.7:0.35}"></div>`;
  }).join('');

  return `<div class="card" style="overflow:hidden;border-right:4px solid ${stg.color}">
    <div style="padding:14px 18px;display:flex;align-items:center;gap:14px">
      <!-- Icon -->
      <div style="width:44px;height:44px;background:${stg.color}15;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${stg.icon}</div>
      <!-- Info -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="font-weight:700;color:#1e293b;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.company_name}</span>
          ${c.company_name_en?`<span style="font-size:11px;color:#94a3b8;direction:ltr">${c.company_name_en}</span>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:10px;font-size:11px;color:#64748b">
          <span style="font-weight:600;color:#1a2472">${c.code||''}</span>
          ${c.company_type?`<span>· ${CTYPE_SHORT[c.company_type]||c.company_type}</span>`:''}
          ${c.client_name?`<span>· 👤 ${c.client_name}</span>`:''}
          ${c.assigned_name?`<span>· 👷 ${c.assigned_name}</span>`:''}
          ${c.agreed_fees?`<span>· 💰 ${Number(c.agreed_fees).toLocaleString('ar-EG')} ج.م.</span>`:''}
        </div>
        <!-- Pipeline bar -->
        <div style="display:flex;gap:2px;margin-top:8px;align-items:center">
          ${pipelineDots}
          <span style="font-size:10px;color:${stg.color};font-weight:700;margin-right:6px;white-space:nowrap">${prog}%</span>
        </div>
      </div>
      <!-- Stage badge + actions -->
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
        <span style="padding:4px 10px;border-radius:20px;background:${stg.color}15;color:${stg.color};font-size:11px;font-weight:700;white-space:nowrap">${stg.icon} ${stg.label}</span>
        <div style="display:flex;gap:6px">
          ${!c.is_completed?`<button onclick="showMoveStageModal(${c.id},'${c.current_stage}')" style="padding:5px 10px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;font-size:11px;cursor:pointer;color:#1a2472;font-family:inherit">➜ التالية</button>`:''}
          <button onclick="showFormationDetail(${c.id})" style="padding:5px 10px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;font-size:11px;cursor:pointer;color:#374151;font-family:inherit">📋 التفاصيل</button>
          <button onclick="deleteFormationCase(${c.id},'${escH(c.company_name)}')" style="padding:5px 10px;border-radius:6px;border:1px solid #fca5a5;background:#fef2f2;font-size:11px;cursor:pointer;color:#dc2626;font-family:inherit" title="حذف الملف">🗑️</button>
        </div>
      </div>
    </div>
  </div>`;
}

function _fmFilterStage(key) {
  _fmStageFilter = key;
  renderEstablishment();
}

function _fmSearchChange(val) {
  _fmSearch = val;
  renderEstablishment();
}

// ── Move Stage Modal ──────────────────────────────
function showMoveStageModal(caseId, currentStage) {
  const c = _fmData.find(x=>x.id===caseId);
  if(!c) return;
  const curIdx = FORMATION_STAGE_KEYS.indexOf(currentStage);
  const overlay = document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:480px">
    <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">نقل مرحلة — ${c.company_name}</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div style="padding:16px 22px">
      <div style="display:flex;flex-direction:column;gap:7px;max-height:400px;overflow-y:auto">
        ${FORMATION_STAGES.map((s,i)=>{
          const isCur = s.key===currentStage;
          const isDone = i < curIdx;
          return `<button onclick="_fmDoMoveStage(${caseId},'${s.key}',this)"
            style="padding:10px 14px;border-radius:8px;border:2px solid ${isCur?s.color:'#e5e7eb'};background:${isCur?s.color+'12':'#fff'};font-size:13px;font-weight:${isCur?'700':'500'};cursor:pointer;text-align:right;color:${isCur?s.color:'#374151'};font-family:inherit;display:flex;align-items:center;gap:10px">
            <span style="font-size:18px">${s.icon}</span>
            <span style="flex:1">${s.label}</span>
            ${isCur?'<span style="font-size:11px;font-weight:700;color:'+s.color+'">← الحالية</span>':isDone?'<span style="font-size:11px;color:#94a3b8">تم</span>':''}
          </button>`;
        }).join('')}
      </div>
      <div style="margin-top:14px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">ملاحظات الانتقال (اختياري)</label>
        <textarea id="fmMoveNotes" class="input" rows="2" placeholder="أي ملاحظات..."></textarea>
      </div>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
}

async function _fmDoMoveStage(caseId, newStage, btn) {
  const overlay = btn.closest('.modal-overlay');
  const notes = overlay?.querySelector('#fmMoveNotes')?.value||'';
  try {
    btn.disabled=true;
    await api('POST',`/api/formation/${caseId}/move`,{new_stage:newStage,notes:notes||null});
    toast('تم نقل الملف للمرحلة التالية ✅');
    overlay?.remove();
    // Bust formation GET cache so reload always fetches fresh data from server
    _AC.invalidate('/api/formation');
    await loadEstablishment(true);
  } catch(e){toast(e.message,'error');btn.disabled=false;}
}

// ── Stage Attachment Upload ──────────────
window._fmShowAttachModal = function(caseId, companyName, stageKey, clientId) {
  const stage = FORMATION_STAGES.find(s=>s.key===stageKey)||{label:stageKey,icon:'📄'};
  const html = `
  <div class="modal-backdrop" id="fmAttachModal">
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <h3>${stage.icon} رفع مرفق — ${escH(companyName)}</h3>
        <button onclick="document.getElementById('fmAttachModal').remove()" class="modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div style="background:#eef1fb;border-radius:8px;padding:10px;font-size:13px;color:#1a2472">
          المرحلة: <strong>${stage.icon} ${stage.label}</strong>
        </div>
        <div>
          <label class="label" style="font-weight:700">📎 اختر ملف (PDF / صورة)</label>
          <div style="border:2px dashed #c7d3ef;border-radius:10px;padding:14px;text-align:center;background:#f8fafc;cursor:pointer"
               onclick="document.getElementById('fmAttachFileInput').click()"
               ondragover="event.preventDefault();this.style.borderColor='#1a2472'"
               ondragleave="this.style.borderColor='#c7d3ef'"
               ondrop="event.preventDefault();this.style.borderColor='#c7d3ef';window._fmAttachDrop(event)">
            <input id="fmAttachFileInput" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" style="display:none" onchange="window._fmAttachSelect(this)"/>
            <div id="fmAttachPreview"><div style="font-size:28px;margin-bottom:6px">📎</div><div style="font-size:13px;color:#374151;font-weight:600">اسحب الملف هنا أو اضغط للاختيار</div></div>
          </div>
        </div>
        <div>
          <label class="label">وصف الملف (اختياري)</label>
          <input id="fmAttachDesc" class="input" placeholder="مثال: عقد تأسيس موقع" />
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="document.getElementById('fmAttachModal').remove()" class="btn btn-secondary">إلغاء</button>
        <button id="fmAttachUploadBtn" class="btn btn-primary" style="background:#94a3b8;cursor:not-allowed" disabled onclick="window._fmAttachUpload(${caseId},'${stageKey}',${clientId||'null'})">📎 اختر ملف أولاً</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  window._fmAttachFile = null;
  window._fmAttachSelect = function(inp) {
    const f = inp.files[0]; if (!f) return;
    window._fmAttachFile = f;
    document.getElementById('fmAttachPreview').innerHTML = `<div style="font-size:22px">✅</div><div style="font-size:12px;font-weight:700;color:#15803d;margin-top:4px">${escH(f.name)}</div>`;
    const btn = document.getElementById('fmAttachUploadBtn');
    if (btn) { btn.disabled=false; btn.style.background='#1a2472'; btn.style.cursor='pointer'; btn.textContent='⬆️ رفع الملف'; }
  };
  window._fmAttachDrop = function(e) {
    const f = e.dataTransfer.files[0]; if (!f) return;
    window._fmAttachFile = f;
    window._fmAttachSelect({files:[f]});
  };
  window._fmAttachUpload = async function(caseId, stageKey, clientId) {
    if (!window._fmAttachFile) return;
    const btn = document.getElementById('fmAttachUploadBtn');
    if (btn) { btn.disabled=true; btn.textContent='⏳ جاري الرفع...'; }
    try {
      const fd = new FormData();
      fd.append('file', window._fmAttachFile);
      if (clientId) fd.append('client_id', clientId);
      fd.append('category', 'establishment');
      fd.append('description', document.getElementById('fmAttachDesc')?.value || window._fmAttachFile.name);
      fd.append('tags', `formation,stage:${stageKey},case:${caseId}`);
      const token = localStorage.getItem('token');
      const res = await fetch(API + '/api/documents/upload', {
        method:'POST', headers:{'Authorization':'Bearer '+token}, body:fd
      });
      if (!res.ok) { const err=await res.json(); throw new Error(err.detail||'فشل الرفع'); }
      toast(`✅ تم رفع المرفق بنجاح وأرشفته تحت "${stage.label}"`);
      document.getElementById('fmAttachModal')?.remove();
      // Refresh detail modal
      showFormationDetail(caseId);
    } catch(err) {
      toast(err.message, 'error');
      if (btn) { btn.disabled=false; btn.style.background='#1a2472'; btn.textContent='⬆️ رفع الملف'; }
    }
  };
};

// ── Case Detail Modal with Timeline ──────────────
async function showFormationDetail(caseId) {
  const overlay = document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:700px;max-height:85vh;display:flex;flex-direction:column">
    <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0" id="fmDetailTitle">جاري التحميل...</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div id="fmDetailBody" style="flex:1;overflow-y:auto;padding:20px 22px">
      <div style="text-align:center;color:#94a3b8;padding:40px">⏳ جاري التحميل...</div>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};

  try {
    const [c, docsRes] = await Promise.all([
      api('GET',`/api/formation/${caseId}`),
      api('GET',`/api/documents?page_size=200${''}`).catch(()=>({items:[]})),
    ]);
    // Attach documents that have 'case:{id}' or 'stage:' tags
    const allDocs = docsRes.items || [];
    c.documents = allDocs.filter(d => d.tags && (d.tags.includes(`case:${caseId}`) || (d.client_id && d.client_id === c.client_id && d.tags.includes('formation'))));
    document.getElementById('fmDetailTitle').textContent = `📋 ${c.company_name} — ${c.code}`;
    const stg = FORMATION_STAGES.find(s=>s.key===c.current_stage)||FORMATION_STAGES[0];
    const CTYPE_FULL = {llc:'شركة ذات مسؤولية محدودة',jsc:'شركة مساهمة',sole:'مؤسسة فردية',partnership:'شركة تضامن',ngo:'جمعية',branch:'فرع',rep:'مكتب تمثيل'};

    // Pipeline progress
    const pBar = FORMATION_STAGES.map((s,i)=>{
      const done = i < c.stage_index;
      const active = s.key === c.current_stage;
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1">
        <div style="width:28px;height:28px;border-radius:50%;background:${active?stg.color:done?'#bbf7d0':'#f1f5f9'};border:2px solid ${active?stg.color:done?'#16a34a':'#e5e7eb'};display:flex;align-items:center;justify-content:center;font-size:13px">
          ${active?s.icon:done?'✓':''}
        </div>
        <div style="font-size:9px;color:${active?stg.color:done?'#16a34a':'#94a3b8'};font-weight:${active?'700':'400'};text-align:center;line-height:1.2">${s.label}</div>
      </div>`;
    }).join('<div style="flex:1;height:2px;background:#e5e7eb;margin-top:13px;align-self:flex-start"></div>');

    // Event type icons
    const evIcon = {created:'🆕',updated:'✏️',stage_change:'➜',payment_received:'💰',note_added:'📝',document_received:'📂',call_made:'📞',completed:'🎉',cancelled:'❌'};

    document.getElementById('fmDetailBody').innerHTML = `
      <!-- Stage Progress -->
      <div style="display:flex;align-items:flex-start;margin-bottom:24px;overflow-x:auto;padding:4px 0">${pBar}</div>

      <!-- Info Grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
        <div class="card" style="padding:14px">
          <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:10px">بيانات الشركة</div>
          ${[
            ['الاسم العربي', c.company_name],
            ['الاسم الإنجليزي', c.company_name_en||'—'],
            ['النوع', CTYPE_FULL[c.company_type]||c.company_type||'—'],
            ['النشاط', c.activity||'—'],
            ['المحافظة', c.governorate||'—'],
            ['رأس المال', c.capital?Number(c.capital).toLocaleString('ar-EG')+' ج.م.':'—'],
          ].map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f8fafc;font-size:12px"><span style="color:#64748b">${l}</span><span style="font-weight:600;color:#1e293b">${v}</span></div>`).join('')}
        </div>
        <div class="card" style="padding:14px">
          <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:10px">الأتعاب والمخرجات</div>
          ${[
            ['أتعاب التأسيس', c.agreed_fees?Number(c.agreed_fees).toLocaleString('ar-EG')+' ج.م.':'—'],
            ['الرسوم الحكومية', c.government_fees?Number(c.government_fees).toLocaleString('ar-EG')+' ج.م.':'—'],
            ['إجمالي التكاليف', c.total_cost?Number(c.total_cost).toLocaleString('ar-EG')+' ج.م.':'—'],
            ['السجل التجاري', c.commercial_register_number||'—'],
            ['البطاقة الضريبية', c.tax_card_number||'—'],
            ['رقم VAT', c.vat_number||'—'],
          ].map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f8fafc;font-size:12px"><span style="color:#64748b">${l}</span><span style="font-weight:600;color:#1e293b">${v}</span></div>`).join('')}
        </div>
      </div>

      <!-- Actions -->
      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
        ${!c.is_completed?`<button onclick="showMoveStageModal(${c.id},'${c.current_stage}')" class="btn btn-primary">➜ نقل للمرحلة التالية</button>`:''}
        <button onclick="_fmAddNote(${c.id})" class="btn btn-secondary">📝 إضافة ملاحظة</button>
        <button onclick="showFormationEditModal(${c.id})" class="btn btn-secondary">✏️ تعديل البيانات</button>
        <button onclick="_fmShowAttachModal(${c.id},'${escH(c.company_name)}','${c.current_stage}',${c.client_id||'null'})" class="btn btn-secondary" style="background:#f0fdf4;border-color:#86efac;color:#15803d">📎 رفع مرفق للمرحلة</button>
        <button onclick="this.closest('.modal-overlay').remove();deleteFormationCase(${c.id},'${escH(c.company_name)}')" class="btn btn-secondary" style="background:#fef2f2;border-color:#fca5a5;color:#dc2626;margin-right:auto">🗑️ حذف الملف</button>
        ${c.is_completed
          ? c.client_id
            ? `<span style="font-size:12px;color:#16a34a;font-weight:600;padding:6px 12px;background:#f0fdf4;border-radius:8px;border:1px solid #86efac">✅ مرتبط بعميل</span>`
            : `<button onclick="window._fmConvertToClient(${c.id})" class="btn btn-success" style="font-weight:700">🚀 تحويل إلى عميل مكتب</button>`
          : ''}
      </div>

      <!-- Stage Attachments -->
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px">📎 مرفقات كل مرحلة</div>
        <div style="display:grid;gap:6px">
          ${FORMATION_STAGES.map(s => {
            const stageAttachments = (c.documents||[]).filter(d=>d.tags&&d.tags.includes('stage:'+s.key));
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;background:${stageAttachments.length?'#f0fdf4':'#f8fafc'}">
              <span style="font-size:16px">${s.icon}</span>
              <span style="font-size:12px;font-weight:600;color:#374151;flex:1">${s.label}</span>
              ${stageAttachments.length
                ? stageAttachments.map(d=>`<a href="#" onclick="event.preventDefault();window.open('${API+'/'+d.file_path?.replace(/\\/g,'/')?.split('/').map(p=>encodeURIComponent(p)).join('/')||''}','_blank')" style="font-size:11px;color:#1a2472;background:#eef1fb;padding:2px 8px;border-radius:5px;text-decoration:none">📄 ${escH((d.original_name||d.name||'').slice(0,25))}</a>`).join('')
                : `<span style="font-size:11px;color:#94a3b8">لا يوجد مرفق</span>`}
              <button onclick="_fmShowAttachModal(${c.id},'${escH(c.company_name)}','${s.key}',${c.client_id||'null'})" style="background:#eef1fb;border:1px solid #c7d3ef;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;color:#1a2472;white-space:nowrap">+ رفع</button>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Timeline -->
      <div>
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px">📅 سجل الأحداث</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${(c.events||[]).map(e=>`
            <div style="display:flex;gap:12px;padding:10px;background:#f8fafc;border-radius:8px">
              <div style="font-size:20px;flex-shrink:0">${evIcon[e.event_type]||'📌'}</div>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;color:#1e293b">${e.title}</div>
                ${e.description?`<div style="font-size:12px;color:#64748b;margin-top:2px">${e.description}</div>`:''}
                ${e.old_stage&&e.new_stage?`<div style="font-size:11px;color:#94a3b8;margin-top:2px">${FORMATION_STAGES.find(s=>s.key===e.old_stage)?.label||e.old_stage} ← ${FORMATION_STAGES.find(s=>s.key===e.new_stage)?.label||e.new_stage}</div>`:''}
              </div>
              <div style="font-size:10px;color:#94a3b8;white-space:nowrap;text-align:left">
                <div>${e.created_by_name||''}</div>
                <div>${e.created_at?new Date(e.created_at).toLocaleDateString('ar-EG'):''}</div>
              </div>
            </div>`).join('') || `<div style="text-align:center;color:#94a3b8;padding:20px">لا توجد أحداث بعد</div>`}
        </div>
      </div>`;
  } catch(e){
    document.getElementById('fmDetailBody').innerHTML=`<div style="color:red;padding:20px">${e.message}</div>`;
  }
}

window._fmConvertToClient = async (caseId) => {
  if (!confirm('تحويل هذه الشركة إلى عميل في "عملاء المكتب"؟')) return;
  try {
    const r = await api('POST', `/api/formation/${caseId}/convert-to-client`);
    if (r.already_exists) {
      toast('الشركة مرتبطة بعميل مسبقاً', 'info');
    } else {
      toast(`✅ تم إنشاء العميل "${r.client_name}" بنجاح`);
    }
    // refresh detail
    document.querySelector('.modal-overlay')?.remove();
    showFormationDetail(caseId);
  } catch(e) { toast(e.message, 'error'); }
};

async function _fmAddNote(caseId) {
  const text = prompt('ملاحظة:');
  if(!text) return;
  try {
    await api('POST',`/api/formation/${caseId}/events`,{event_type:'note_added',title:'ملاحظة',description:text});
    toast('تم إضافة الملاحظة');
    showFormationDetail(caseId); // refresh
  } catch(e){toast(e.message,'error');}
}

// ── New Formation Case Modal ──────────────────────
function showFormationModal(leadData) {
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:560px">
    <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">🏗️ ملف تأسيس جديد</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div style="padding:18px 22px;display:flex;flex-direction:column;gap:13px">
      <div class="form-row">
        <div><label class="field-label">اسم الشركة (عربي) *</label>
          <input id="fmNameAr" class="input" placeholder="اسم الشركة..." value="${leadData?.company_name||''}"/></div>
        <div><label class="field-label">اسم الشركة (إنجليزي)</label>
          <input id="fmNameEn" class="input" placeholder="Company Name" style="direction:ltr" value="${leadData?.company_name_en||''}"/></div>
      </div>
      <div class="form-row">
        <div><label class="field-label">نوع الشركة</label>
          <select id="fmType" class="input">
            <option value="llc" ${leadData?.company_type==='llc'?'selected':''}>ذات مسؤولية محدودة</option>
            <option value="jsc" ${leadData?.company_type==='jsc'?'selected':''}>شركة مساهمة</option>
            <option value="sole" ${leadData?.company_type==='sole'?'selected':''}>مؤسسة فردية</option>
            <option value="partnership" ${leadData?.company_type==='partnership'?'selected':''}>شركة تضامن</option>
            <option value="ngo" ${leadData?.company_type==='ngo'?'selected':''}>جمعية / مؤسسة</option>
            <option value="branch" ${leadData?.company_type==='branch'?'selected':''}>فرع</option>
            <option value="rep" ${leadData?.company_type==='rep'?'selected':''}>مكتب تمثيل</option>
          </select></div>
        <div><label class="field-label">رأس المال (ج.م.)</label>
          <input id="fmCapital" class="input" type="number" placeholder="50000" value="${leadData?.capital||''}"/></div>
      </div>
      <div class="form-row">
        <div><label class="field-label">النشاط التجاري</label>
          <input id="fmActivity" class="input" placeholder="استيراد وتصدير..." value="${leadData?.activity||''}"/></div>
        <div><label class="field-label">المحافظة</label>
          <input id="fmGov" class="input" placeholder="القاهرة"/></div>
      </div>
      <div class="form-row">
        <div><label class="field-label">أتعاب التأسيس المتفق عليها</label>
          <input id="fmFees" class="input" type="number" placeholder="0" value="${leadData?.agreed_fees||''}"/></div>
        <div><label class="field-label">الرسوم الحكومية</label>
          <input id="fmGovFees" class="input" type="number" placeholder="0"/></div>
      </div>
      ${leadData?.lead_id?`<input type="hidden" id="fmLeadId" value="${leadData.lead_id}"/>`:''}
      ${leadData?.client_id?`<input type="hidden" id="fmClientId" value="${leadData.client_id}"/>`:''}
      <div><label class="field-label">ملاحظات</label>
        <textarea id="fmNotes" class="input" rows="2" placeholder="ملاحظات..."></textarea></div>
    </div>
    <div style="padding:14px 22px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="fmSaveBtn" class="btn btn-primary">🏗️ إنشاء الملف</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};

  document.getElementById('fmSaveBtn').onclick = async()=>{
    const btn=document.getElementById('fmSaveBtn');
    const name=overlay.querySelector('#fmNameAr').value.trim();
    if(!name){toast('اسم الشركة مطلوب','error');return;}
    btn.disabled=true; btn.textContent='جاري الإنشاء...';
    try {
      const payload = {
        company_name: name,
        company_name_en: overlay.querySelector('#fmNameEn').value||null,
        company_type: overlay.querySelector('#fmType').value,
        capital: parseFloat(overlay.querySelector('#fmCapital').value)||null,
        activity: overlay.querySelector('#fmActivity').value||null,
        governorate: overlay.querySelector('#fmGov').value||null,
        agreed_fees: parseFloat(overlay.querySelector('#fmFees').value)||0,
        government_fees: parseFloat(overlay.querySelector('#fmGovFees').value)||0,
        notes: overlay.querySelector('#fmNotes').value||null,
        lead_id: parseInt(overlay.querySelector('#fmLeadId')?.value)||null,
        client_id: parseInt(overlay.querySelector('#fmClientId')?.value)||null,
      };
      await api('POST','/api/formation',payload);
      toast('تم إنشاء ملف التأسيس ✅');
      overlay.remove();
      await loadEstablishment(true);
    } catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent='🏗️ إنشاء الملف';}
  };
}

// Edit modal for existing case
async function showFormationEditModal(caseId) {
  const c = await api('GET',`/api/formation/${caseId}`).catch(()=>null);
  if(!c) return;
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:560px">
    <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">✏️ تعديل — ${c.company_name}</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div style="padding:18px 22px;display:flex;flex-direction:column;gap:12px">
      <div class="form-row">
        <div><label class="field-label">السجل التجاري</label>
          <input id="feRegNum" class="input" value="${c.commercial_register_number||''}" placeholder="رقم السجل"/></div>
        <div><label class="field-label">البطاقة الضريبية</label>
          <input id="feTax" class="input" value="${c.tax_card_number||''}" placeholder="رقم البطاقة"/></div>
      </div>
      <div class="form-row">
        <div><label class="field-label">رقم VAT</label>
          <input id="feVat" class="input" value="${c.vat_number||''}" placeholder="رقم VAT"/></div>
        <div><label class="field-label">إجمالي التكاليف الفعلية</label>
          <input id="feCost" class="input" type="number" value="${c.total_cost||''}" placeholder="0"/></div>
      </div>
      <div class="form-row">
        <div><label class="field-label">أتعاب التأسيس</label>
          <input id="feAgreed" class="input" type="number" value="${c.agreed_fees||''}" placeholder="0"/></div>
        <div><label class="field-label">الرسوم الحكومية</label>
          <input id="feGovFees" class="input" type="number" value="${c.government_fees||''}" placeholder="0"/></div>
      </div>
      <div><label class="field-label">ملاحظات</label>
        <textarea id="feNotes" class="input" rows="2">${c.notes||''}</textarea></div>
    </div>
    <div style="padding:14px 22px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="feUpdateBtn" class="btn btn-primary">💾 حفظ التعديلات</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  document.getElementById('feUpdateBtn').onclick=async()=>{
    const btn=document.getElementById('feUpdateBtn');
    btn.disabled=true;btn.textContent='جاري الحفظ...';
    try {
      await api('PUT',`/api/formation/${caseId}`,{
        commercial_register_number:overlay.querySelector('#feRegNum').value||null,
        tax_card_number:overlay.querySelector('#feTax').value||null,
        vat_number:overlay.querySelector('#feVat').value||null,
        total_cost:parseFloat(overlay.querySelector('#feCost').value)||null,
        agreed_fees:parseFloat(overlay.querySelector('#feAgreed').value)||null,
        government_fees:parseFloat(overlay.querySelector('#feGovFees').value)||null,
        notes:overlay.querySelector('#feNotes').value||null,
      });
      toast('تم الحفظ ✅');
      overlay.remove();
      await loadEstablishment(true);
    } catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent='💾 حفظ التعديلات';}
  };
}

