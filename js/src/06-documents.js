async function loadDocuments(silent=false) {
  try {
    const data=await api('GET','/api/documents?page_size=100');
    if(!data) return;
    docsData=data.items||[];
    renderDocuments();
  } catch(e){toast(e.message,'error')}
}

const DOC_CAT_ICON={
  contract:'📝',invoice:'📄',tax_return:'🧾',financial_statement:'📊',
  id_documents:'🪪',commercial_register:'🏢',tax_card:'💳',
  vat_certificate:'✅',bank_statement:'🏦',payroll:'💰',
  establishment:'🏗️',national_id:'🪪',other:'📁'
};
const DOC_CAT_LABEL={
  contract:'عقد',invoice:'فاتورة',tax_return:'إقرار ضريبي',
  financial_statement:'قوائم مالية',id_documents:'وثائق هوية',
  commercial_register:'سجل تجاري',tax_card:'بطاقة ضريبية',
  vat_certificate:'شهادة ق.م.ض',bank_statement:'كشف بنكي',
  payroll:'مرتبات',establishment:'تأسيس',national_id:'رقم قومي',other:'أخرى'
};

function docFileUrl(d){
  if(!d) return null;
  if(d.gdrive_view_url) return d.gdrive_view_url;
  if(!d.file_path) return null;
  const parts=d.file_path.replace(/\\/g,'/').split('/');
  return API+'/'+parts.map(p=>encodeURIComponent(p)).join('/');
}

function openDoc(idx){
  const d=docsData[idx];
  if(!d) return;
  const url=docFileUrl(d);
  if(!url){toast('رابط الملف غير متوفر','error');return;}
  window.open(url,'_blank');
}

function downloadDoc(idx,e){
  if(e) e.stopPropagation();
  const d=docsData[idx];
  if(!d){toast('الملف غير موجود','error');return;}
  if(d.gdrive_file_id){
    // Drive files: use export=download URL
    window.open(`https://drive.google.com/uc?export=download&id=${d.gdrive_file_id}`,'_blank');
  } else if(d.file_path){
    const url=docFileUrl(d);
    if(!url){toast('رابط التحميل غير متوفر','error');return;}
    const a=document.createElement('a');
    a.href=url; a.download=d.original_name||d.name||'file';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } else {
    toast('لا يوجد ملف للتحميل','error');
  }
}

// ── FILTER + NAVIGATION state ──
var docCatFilter='', docClientFilter='', docSearchQ='';
var _docOpenClientId = null; // null = root folders view

function renderDocuments() {
  if (_docOpenClientId !== null) {
    _renderDocClientFolder(_docOpenClientId);
  } else {
    _renderDocRoot();
  }
}

// ═══════════════════════════════════════════════════════════
// ROOT VIEW — Company folders grid
// ═══════════════════════════════════════════════════════════
function _renderDocRoot() {
  const main = document.getElementById('main');
  main.className = 'page';

  // Search filter on root
  const q = docSearchQ.toLowerCase();
  let docs = q ? docsData.filter(d =>
    (d.name||'').toLowerCase().includes(q) ||
    (d.client_name||'').toLowerCase().includes(q) ||
    (d.trade_name||'').toLowerCase().includes(q)
  ) : docsData;

  // Build company groups
  const groups = {};
  docs.forEach(d => {
    const key = d.client_id ? String(d.client_id) : '__general__';
    if (!groups[key]) groups[key] = {
      id: d.client_id||null,
      name: d.client_name || d.trade_name || 'ملفات عامة',
      docs: []
    };
    groups[key].docs.push(d);
  });

  // Sort alphabetically
  const sorted = Object.values(groups).sort((a,b) => (a.name||'').localeCompare(b.name||'', 'ar'));

  main.innerHTML = `
  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
    <div>
      <h2 style="font-size:17px;font-weight:800;color:#1e293b;margin:0">📂 الأرشيف</h2>
      <div style="font-size:12px;color:#64748b;margin-top:3px">${docsData.length} ملف — ${sorted.length} شركة / مجلد</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-secondary" onclick="showDriveImportWizard()" style="background:#e3f0ff;color:#1a73e8;border-color:#bbd4f8;font-weight:700;font-size:12px">
        <svg width="13" height="13" viewBox="0 0 87.3 78" fill="none" style="vertical-align:middle;margin-left:3px"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L38 42.55H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-14-24.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 45.5c-.8 1.4-1.2 2.95-1.2 4.5h38z" fill="#00ac47"/><path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57c.8-1.4 1.2-2.95 1.2-4.5H49.3l8.1 15.45z" fill="#ea4335"/><path d="M43.65 25 57.65.8C56.3 0 54.75-.4 53.2-.4H34.1c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d"/><path d="M49.3 52.05H87.3c0-1.55-.4-3.1-1.2-4.5L71.15 20.3 57.65.8 43.65 25z" fill="#2684fc"/><path d="M13.8 76.8c1.35.8 2.9 1.2 4.45 1.2h50.8c1.55 0 3.1-.4 4.45-1.2L38 42.55l-24.2 34.25z" fill="#ffba00"/></svg>
        Drive
      </button>
      <button class="btn btn-primary" onclick="showUploadModal()">⬆️ رفع ملف</button>
    </div>
  </div>

  <!-- Search -->
  <div style="margin-bottom:14px">
    <input class="input" style="max-width:280px" placeholder="🔍 بحث باسم الشركة أو الملف..." value="${escH(docSearchQ)}" oninput="docSearchQ=this.value;_renderDocRoot()"/>
  </div>

  <!-- Company Folders Grid -->
  ${sorted.length === 0
    ? `<div style="text-align:center;padding:60px;color:#94a3b8"><div style="font-size:52px;margin-bottom:14px">📂</div><div style="font-size:15px;font-weight:600">لا توجد ملفات</div></div>`
    : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
        ${sorted.map(g => {
          const catCounts = {};
          g.docs.forEach(d => { catCounts[d.category||'other'] = (catCounts[d.category||'other']||0)+1; });
          const topCats = Object.entries(catCounts).sort((a,b)=>b[1]-a[1]).slice(0,3);
          const lastDate = g.docs.reduce((mx,d)=>d.created_at>mx?d.created_at:mx,'');
          return `<div onclick="window._docOpenFolder(${g.id===null?'null':g.id})"
            style="background:white;border:1.5px solid #e2e8f0;border-radius:14px;padding:16px 14px;cursor:pointer;transition:all .15s;text-align:center"
            onmouseover="this.style.borderColor='#1a2472';this.style.background='#f8faff';this.style.transform='translateY(-2px)'"
            onmouseout="this.style.borderColor='#e2e8f0';this.style.background='white';this.style.transform=''">
            <div style="font-size:40px;margin-bottom:8px">📁</div>
            <div style="font-size:12px;font-weight:700;color:#1e293b;line-height:1.4;margin-bottom:6px;word-break:break-word">${escH(g.name)}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:6px">${g.docs.length} ملف</div>
            <div style="display:flex;justify-content:center;gap:3px;flex-wrap:wrap">
              ${topCats.map(([cat])=>`<span style="font-size:14px" title="${DOC_CAT_LABEL[cat]||cat}">${DOC_CAT_ICON[cat]||'📄'}</span>`).join('')}
            </div>
            ${lastDate?`<div style="font-size:10px;color:#cbd5e1;margin-top:5px">${lastDate.slice(0,10)}</div>`:''}
          </div>`;
        }).join('')}
      </div>`}`;

  window._docOpenFolder = function(clientId) {
    _docOpenClientId = clientId;
    _renderDocClientFolder(clientId);
  };
}

// ═══════════════════════════════════════════════════════════
// FOLDER VIEW — Files inside one company
// ═══════════════════════════════════════════════════════════
function _renderDocClientFolder(clientId) {
  const main = document.getElementById('main');
  main.className = 'page';
  const imgExts = ['.jpg','.jpeg','.png','.gif','.webp'];

  const clientDocs = clientId === null
    ? docsData.filter(d => !d.client_id)
    : docsData.filter(d => String(d.client_id) === String(clientId));

  const clientName = clientDocs[0]?.client_name || clientDocs[0]?.trade_name || 'ملفات عامة';

  // Apply category filter
  let filtered = docCatFilter ? clientDocs.filter(d=>d.category===docCatFilter) : clientDocs;
  if (docSearchQ) {
    const q = docSearchQ.toLowerCase();
    filtered = filtered.filter(d=>(d.name||'').toLowerCase().includes(q)||(d.original_name||'').toLowerCase().includes(q));
  }

  // Group by category
  const catGroups = {};
  filtered.forEach(d => {
    const cat = d.category || 'other';
    if (!catGroups[cat]) catGroups[cat] = [];
    catGroups[cat].push(d);
  });

  function docRow(d, idx) {
    const url = docFileUrl(d);
    const ext = (d.file_type||'').toLowerCase();
    const isImg = imgExts.includes(ext);
    const isDrive = !!d.gdrive_file_id;
    const sizeTxt = d.file_size ? (d.file_size < 1024*1024 ? (d.file_size/1024).toFixed(1)+' KB' : (d.file_size/1024/1024).toFixed(2)+' MB') : '';
    const icon = DOC_CAT_ICON[d.category] || '📄';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;transition:background .1s"
        onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''"
        onclick="openDoc(${idx})">
      <div style="font-size:22px;flex-shrink:0">${isImg&&url?`<img src="${url}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0" onerror="this.outerHTML='${icon}'"/>`:icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(d.original_name||d.name||'')}</div>
        <div style="font-size:10px;color:#94a3b8">${sizeTxt} ${d.description?'— '+escH(d.description.slice(0,40)):''}</div>
      </div>
      <div style="font-size:10px;color:#94a3b8;flex-shrink:0">${d.created_at?d.created_at.slice(0,10):''}</div>
      ${isDrive?`<span style="font-size:10px;background:#e3f0ff;color:#1a73e8;padding:2px 6px;border-radius:4px;font-weight:700;flex-shrink:0">Drive</span>`:''}
      <button onclick="downloadDoc(${idx},event)" title="تحميل" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;padding:3px 7px;font-size:11px;cursor:pointer;flex-shrink:0">⬇️</button>
      <button onclick="window._docDelete(${d.id},event)" title="حذف" style="background:#fef2f2;border:1px solid #fca5a5;border-radius:5px;padding:3px 7px;font-size:11px;cursor:pointer;flex-shrink:0;color:#dc2626">🗑</button>
    </div>`;
  }

  main.innerHTML = `
  <!-- Breadcrumb -->
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;font-size:13px">
    <button onclick="_docOpenClientId=null;_renderDocRoot()" style="background:none;border:none;color:#1a2472;font-weight:700;cursor:pointer;font-size:13px;font-family:inherit;padding:0">📂 الأرشيف</button>
    <span style="color:#94a3b8">›</span>
    <span style="font-weight:700;color:#1e293b">📁 ${escH(clientName)}</span>
  </div>

  <!-- Toolbar -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
    <input class="input" style="width:220px;font-size:12px" placeholder="🔍 بحث في ملفات هذه الشركة..." value="${escH(docSearchQ)}" oninput="docSearchQ=this.value;_renderDocClientFolder(${clientId===null?'null':clientId})"/>
    <select class="input" style="width:160px;font-size:12px" onchange="docCatFilter=this.value;_renderDocClientFolder(${clientId===null?'null':clientId})">
      <option value="">كل التصنيفات</option>
      ${Object.entries(DOC_CAT_LABEL).map(([k,v])=>`<option value="${k}" ${docCatFilter===k?'selected':''}>${DOC_CAT_ICON[k]||'📁'} ${v}</option>`).join('')}
    </select>
    <span style="font-size:12px;color:#94a3b8;flex:1">${filtered.length} ملف</span>
    <button class="btn btn-primary" style="font-size:12px" onclick="showUploadModal(${clientId===null?'null':clientId})">⬆️ رفع ملف</button>
  </div>

  <!-- Files by category -->
  ${Object.keys(catGroups).length === 0
    ? `<div style="text-align:center;padding:60px;color:#94a3b8"><div style="font-size:40px;margin-bottom:10px">📂</div><div>لا توجد ملفات</div></div>`
    : Object.entries(catGroups).sort((a,b)=>(DOC_CAT_LABEL[a[0]]||'').localeCompare(DOC_CAT_LABEL[b[0]]||'')).map(([cat,catDocs]) => `
    <div style="margin-bottom:18px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:white">
      <div style="background:#f8fafc;padding:10px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #e2e8f0">
        <span style="font-size:16px">${DOC_CAT_ICON[cat]||'📁'}</span>
        <span style="font-size:13px;font-weight:700;color:#1e293b">${DOC_CAT_LABEL[cat]||cat}</span>
        <span style="font-size:11px;color:#64748b;background:#e2e8f0;padding:1px 7px;border-radius:10px">${catDocs.length}</span>
      </div>
      ${catDocs.map(d => docRow(d, docsData.indexOf(d))).join('')}
    </div>`).join('')}`;

  window._docDelete = async function(docId, e) {
    if(e) e.stopPropagation();
    if(!confirm('هل تريد حذف هذا الملف نهائياً؟')) return;
    try {
      await api('DELETE', `/api/documents/${docId}`);
      docsData = docsData.filter(d => d.id !== docId);
      _renderDocClientFolder(clientId);
      toast('تم حذف الملف');
    } catch(err) { toast(err.message, 'error'); }
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// GOOGLE DRIVE IMPORT WIZARD
// ──────────────────────────────────────────────────────────────────────────────
let driveWizardOverlay=null;
let driveScannedFiles=[];
let driveClientsCache=[];

async function showDriveImportWizard() {
  // Load clients
  if(!driveClientsCache.length) {
    try { driveClientsCache=await getClients(); } catch(e){}
  }

  driveWizardOverlay=document.createElement('div');
  driveWizardOverlay.className='modal-overlay';
  driveWizardOverlay.innerHTML=`<div class="modal" style="max-width:680px;height:90vh;display:flex;flex-direction:column">
    <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0;display:flex;align-items:center;gap:8px">
          <svg width="20" height="18" viewBox="0 0 87.3 78" fill="none"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L38 42.55H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-14-24.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 45.5c-.8 1.4-1.2 2.95-1.2 4.5h38z" fill="#00ac47"/><path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57c.8-1.4 1.2-2.95 1.2-4.5H49.3l8.1 15.45z" fill="#ea4335"/><path d="M43.65 25 57.65.8C56.3 0 54.75-.4 53.2-.4H34.1c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d"/><path d="M49.3 52.05H87.3c0-1.55-.4-3.1-1.2-4.5L71.15 20.3 57.65.8 43.65 25z" fill="#2684fc"/><path d="M13.8 76.8c1.35.8 2.9 1.2 4.45 1.2h50.8c1.55 0 3.1-.4 4.45-1.2L38 42.55l-24.2 34.25z" fill="#ffba00"/></svg>
          استيراد من Google Drive
        </h2>
        <div id="driveWizardStep" style="font-size:11px;color:#94a3b8;margin-top:2px">الخطوة 1 من 3 — أدخل رابط المجلد</div>
      </div>
      <button onclick="driveWizardOverlay.remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>

    <!-- Step 1: Enter URL -->
    <div id="driveStep1" style="padding:20px;flex:1;overflow-y:auto">
      <div style="background:#e3f0ff;border-radius:10px;padding:14px 16px;margin-bottom:20px;border:1px solid #bbd4f8">
        <div style="font-size:12px;font-weight:700;color:#1a73e8;margin-bottom:6px">📋 كيفية الاستخدام</div>
        <ol style="font-size:11px;color:#3d5a80;margin:0;padding-right:18px;line-height:2">
          <li>افتح Google Drive وانتقل للمجلد</li>
          <li>انقر بزر الماوس الأيمن ← <b>نسخ الرابط (Copy link)</b></li>
          <li>الصق الرابط أدناه وانقر <b>فحص المجلد</b></li>
          <li>راجع الملفات وتأكد من ربطها بالعملاء الصحيحين</li>
          <li>انقر <b>استيراد الكل</b> ✅</li>
        </ol>
      </div>
      <div style="margin-bottom:16px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">رابط مجلد Google Drive *</label>
        <input id="driveFolderUrl" class="input" placeholder="https://drive.google.com/drive/folders/..." style="font-size:13px;direction:ltr"/>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">مثال: https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs</div>
      </div>
      <div style="margin-bottom:16px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">
          Google Drive API Key
          <span style="font-weight:400;color:#94a3b8">(اختياري — للمجلدات العامة يعمل بدونه)</span>
        </label>
        <input id="driveApiKey" class="input" placeholder="AIzaSy..." style="font-size:13px;direction:ltr"/>
        <div style="font-size:10px;color:#94a3b8;margin-top:3px">للمجلدات الخاصة أو للمزيد من الملفات: احصل على مفتاح API مجاني من <a href="https://console.cloud.google.com" target="_blank" style="color:#1a73e8">Google Cloud Console</a></div>
      </div>
      <div id="driveScanError" style="display:none;background:#fef2f2;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:12px"></div>
      <button id="driveScanBtn" class="btn btn-primary" style="width:100%;background:#1a73e8;border-color:#1a73e8" onclick="runDriveScan()">
        🔍 فحص المجلد واستخراج الملفات
      </button>
    </div>

    <!-- Step 2: Review files (hidden initially) -->
    <div id="driveStep2" style="display:none;flex:1;overflow:hidden;flex-direction:column">
      <div style="padding:12px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div id="driveScanSummary" style="font-size:12px;color:#374151"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" style="font-size:11px;padding:5px 12px" onclick="driveSelectAll(true)">تحديد الكل</button>
          <button class="btn btn-secondary" style="font-size:11px;padding:5px 12px" onclick="driveSelectAll(false)">إلغاء الكل</button>
          <button class="btn btn-secondary" style="font-size:11px;padding:5px 12px" onclick="driveShowStep(1)">← رجوع</button>
        </div>
      </div>
      <div id="driveFilesList" style="flex:1;overflow-y:auto;padding:16px 20px"></div>
      <div style="padding:12px 20px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end;flex-shrink:0">
        <button class="btn btn-secondary" onclick="driveWizardOverlay.remove()">إلغاء</button>
        <button id="driveImportBtn" class="btn btn-primary" style="background:#1a73e8;border-color:#1a73e8" onclick="runDriveImport()">
          ✅ استيراد الملفات المحددة
        </button>
      </div>
    </div>

    <!-- Step 3: Result -->
    <div id="driveStep3" style="display:none;padding:40px;text-align:center">
      <div id="driveResultIcon" style="font-size:56px;margin-bottom:16px">✅</div>
      <div id="driveResultMsg" style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:8px"></div>
      <div id="driveResultDetail" style="font-size:13px;color:#64748b;margin-bottom:24px"></div>
      <button class="btn btn-primary" onclick="driveWizardOverlay.remove();loadDocuments()">عرض الملفات</button>
    </div>
  </div>`;

  document.body.append(driveWizardOverlay);
  driveWizardOverlay.onclick=e=>{if(e.target===driveWizardOverlay)driveWizardOverlay.remove()};
}

function driveShowStep(n){
  [1,2,3].forEach(i=>{
    const el=document.getElementById('driveStep'+i);
    if(el) el.style.display=i===n?(i===2?'flex':'block'):'none';
  });
  const stepEl=document.getElementById('driveWizardStep');
  if(stepEl) stepEl.textContent={1:'الخطوة 1 من 3 — أدخل رابط المجلد',2:'الخطوة 2 من 3 — راجع الملفات',3:'الخطوة 3 من 3 — اكتمل الاستيراد'}[n]||'';
}

async function runDriveScan(){
  const url=document.getElementById('driveFolderUrl').value.trim();
  const apiKey=document.getElementById('driveApiKey').value.trim();
  const errEl=document.getElementById('driveScanError');
  const btn=document.getElementById('driveScanBtn');
  errEl.style.display='none';

  if(!url){errEl.textContent='أدخل رابط المجلد أولاً';errEl.style.display='block';return;}

  btn.disabled=true; btn.textContent='⏳ جاري الفحص...';
  try {
    const result=await api('POST','/api/gdrive/scan',{
      folder_url: url,
      api_key: apiKey||null
    });
    if(!result) throw new Error('لم يتم الحصول على نتائج');

    driveScannedFiles=result.files||[];

    // Show step 2
    driveShowStep(2);
    const summary=document.getElementById('driveScanSummary');
    if(summary) summary.innerHTML=`
      <b>${result.total_files}</b> ملف •
      <span style="color:#16a34a"><b>${result.matched_files}</b> مرتبط بعميل</span> •
      <span style="color:#dc2626"><b>${result.unmatched_files}</b> غير مرتبط</span>
      ${driveScannedFiles.filter(f=>f.is_duplicate).length>0?` • <span style="color:#f59e0b"><b>${driveScannedFiles.filter(f=>f.is_duplicate).length}</b> مكرر</span>`:''}
    `;
    renderDriveFilesList();
  } catch(e){
    errEl.textContent=e.message||'خطأ في الاتصال بـ Google Drive';
    errEl.style.display='block';
  } finally {
    btn.disabled=false; btn.textContent='🔍 فحص المجلد واستخراج الملفات';
  }
}

function renderDriveFilesList(){
  const container=document.getElementById('driveFilesList');
  if(!container) return;

  // Group by folder_path
  const grouped={};
  driveScannedFiles.forEach((f,i)=>{
    const key=f.folder_path||'المجلد الرئيسي';
    if(!grouped[key]) grouped[key]=[];
    grouped[key].push({...f,_idx:i});
  });

  container.innerHTML=Object.entries(grouped).map(([folder,files])=>`
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:8px;padding:4px 8px;background:#f8fafc;border-radius:6px">
        📂 ${escH(folder)}
      </div>
      ${files.map(f=>driveFileRow(f)).join('')}
    </div>
  `).join('');
}

function driveFileRow(f){
  const isDup=f.is_duplicate;
  const ext=(f.name||'').split('.').pop().toLowerCase();
  const iconMap={pdf:'📄',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',xlsx:'📊',xls:'📊',docx:'📝',doc:'📝',csv:'📊'};
  const fileIcon=iconMap[ext]||'📁';
  const clientOpts=driveClientsCache.map(c=>
    `<option value="${c.id}" ${f.suggested_client_id===c.id?'selected':''}>${escH(c.name)}</option>`
  ).join('');

  return `<div id="driveRow_${f._idx}" style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid ${isDup?'#fef3c7':'#e2e8f0'};border-radius:8px;margin-bottom:8px;background:${isDup?'#fffbeb':'#fff'};transition:.15s" ${isDup?'title="هذا الملف موجود مسبقاً"':''}>
    <input type="checkbox" id="driveChk_${f._idx}" ${isDup?'':'checked'} style="margin-top:3px;flex-shrink:0;width:16px;height:16px;cursor:pointer" onchange="updateDriveImportBtn()"/>
    <div style="font-size:22px;flex-shrink:0">${fileIcon}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escH(f.name)}">${escH(f.name)}</div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
        <select id="driveCat_${f._idx}" class="input" style="font-size:11px;padding:3px 6px;height:auto;max-width:160px">
          ${Object.entries(DOC_CAT_LABEL).map(([k,v])=>`<option value="${k}" ${f.suggested_category===k?'selected':''}>${DOC_CAT_ICON[k]||'📁'} ${v}</option>`).join('')}
        </select>
        <select id="driveCli_${f._idx}" class="input" style="font-size:11px;padding:3px 6px;height:auto;max-width:180px">
          <option value="">— بدون عميل —</option>
          ${clientOpts}
        </select>
      </div>
      ${f.suggested_client_name?`<div style="font-size:10px;color:#16a34a;margin-top:3px">✓ مرتبط بـ ${escH(f.suggested_client_name)}</div>`:'<div style="font-size:10px;color:#f59e0b;margin-top:3px">⚠ غير مرتبط بعميل</div>'}
      ${isDup?`<div style="font-size:10px;color:#d97706;margin-top:3px">⚠ موجود مسبقاً في النظام</div>`:''}
    </div>
    <a href="${escH(f.view_url)}" target="_blank" style="color:#64748b;font-size:18px;text-decoration:none;flex-shrink:0" title="فتح في Drive">🔗</a>
  </div>`;
}

function driveSelectAll(checked){
  driveScannedFiles.forEach((_,i)=>{
    const chk=document.getElementById('driveChk_'+i);
    if(chk) chk.checked=checked;
  });
  updateDriveImportBtn();
}

function updateDriveImportBtn(){
  const count=driveScannedFiles.filter((_,i)=>{
    const chk=document.getElementById('driveChk_'+i);
    return chk&&chk.checked;
  }).length;
  const btn=document.getElementById('driveImportBtn');
  if(btn) btn.textContent=`✅ استيراد ${count} ملف`;
}

async function runDriveImport(){
  const btn=document.getElementById('driveImportBtn');
  btn.disabled=true; btn.textContent='⏳ جاري الاستيراد...';

  const filesToImport=driveScannedFiles
    .map((f,i)=>{
      const chk=document.getElementById('driveChk_'+i);
      if(!chk||!chk.checked) return null;
      const catSel=document.getElementById('driveCat_'+i);
      const cliSel=document.getElementById('driveCli_'+i);
      return {
        gdrive_file_id: f.id,
        name: f.name,
        client_id: cliSel&&cliSel.value?parseInt(cliSel.value):null,
        category: catSel?catSel.value:'other',
        folder_path: f.folder_path||'',
        mime_type: f.mime_type||null,
        size: f.size||null,
      };
    })
    .filter(Boolean);

  if(!filesToImport.length){toast('لم تحدد أي ملفات','error');btn.disabled=false;btn.textContent='✅ استيراد الملفات المحددة';return;}

  try {
    const result=await api('POST','/api/gdrive/import',{files:filesToImport});
    driveShowStep(3);
    document.getElementById('driveResultMsg').textContent=`تم استيراد ${result.imported} ملف بنجاح`;
    document.getElementById('driveResultDetail').innerHTML=`
      ✅ مستورد: <b>${result.imported}</b> &nbsp;&nbsp;
      ⚠️ مكرر (تخطي): <b>${result.skipped_duplicates}</b>
      ${result.errors&&result.errors.length?`<br><span style="color:#dc2626">أخطاء: ${result.errors.join(' | ')}</span>`:''}
    `;
  } catch(e){
    toast(e.message||'خطأ في الاستيراد','error');
    btn.disabled=false; btn.textContent='✅ استيراد الملفات المحددة';
  }
}

window.showDriveImportWizard=showDriveImportWizard;
window.runDriveScan=runDriveScan;
window.runDriveImport=runDriveImport;
window.driveSelectAll=driveSelectAll;
window.updateDriveImportBtn=updateDriveImportBtn;
window.driveShowStep=driveShowStep;

async function showUploadModal(preClientId=null) {
  let clients=[];
  try { clients=await getClients(); } catch(e){}
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:460px">
    <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:17px;font-weight:700;color:#1e293b;margin:0">⬆️ رفع ملف جديد</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
    </div>
    <div style="padding:20px 24px">
      <div style="margin-bottom:16px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">اختر الملف *</label>
        <input id="docFile" type="file" class="input" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.csv" style="padding:7px"/>
        <div id="docFilePreview" style="margin-top:8px;font-size:12px;color:#64748b"></div>
      </div>
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">العميل</label>
        <select id="docClient" class="input"><option value="">— عام (بدون عميل) —</option>${clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select>
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">التصنيف</label>
        <select id="docCat" class="input">
          <option value="commercial_register">🏢 سجل تجاري</option>
          <option value="tax_card">💳 بطاقة ضريبية</option>
          <option value="vat_certificate">✅ شهادة القيمة المضافة</option>
          <option value="national_id">🪪 بطاقة رقم قومي</option>
          <option value="contract">📝 عقد</option>
          <option value="invoice">💳 فاتورة</option>
          <option value="tax_return">🧾 إقرار ضريبي</option>
          <option value="financial_statement">📊 قوائم مالية</option>
          <option value="establishment">🏗️ مستندات تأسيس</option>
          <option value="bank_statement">🏦 كشف بنكي</option>
          <option value="payroll">💰 مرتبات</option>
          <option value="other">📁 أخرى</option>
        </select>
      </div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="uploadSaveBtn" class="btn btn-primary">⬆️ رفع الملف</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};

  // Pre-select client if provided
  if(preClientId){
    const sel=document.getElementById('docClient');
    if(sel) sel.value=String(preClientId);
  }

  // File preview
  document.getElementById('docFile').onchange=function(){
    const f=this.files[0];
    const pv=document.getElementById('docFilePreview');
    if(f && pv){
      const size=f.size<1024*1024?`${(f.size/1024).toFixed(1)} KB`:`${(f.size/1024/1024).toFixed(2)} MB`;
      pv.innerHTML=`<span style="background:#f0fdf4;color:#16a34a;padding:3px 10px;border-radius:6px;font-weight:600">📎 ${f.name} — ${size}</span>`;
    }
  };

  document.getElementById('uploadSaveBtn').onclick=async()=>{
    const btn=document.getElementById('uploadSaveBtn');
    const file=document.getElementById('docFile').files[0];
    if(!file){toast('اختر ملفاً أولاً','error');return;}
    btn.disabled=true; btn.textContent='جاري الرفع...';
    try {
      const fd=new FormData();
      fd.append('file',file);
      fd.append('category',document.getElementById('docCat').value);
      const clientId=document.getElementById('docClient').value;
      if(clientId) fd.append('client_id',clientId);
      const r=await fetch(`${API}/api/documents/upload`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});
      const rdata=await r.json().catch(()=>({}));
      if(!r.ok){
        let msg=rdata.detail||'خطأ في رفع الملف';
        if(Array.isArray(msg)) msg=msg.map(e=>e.msg||e).join(' | ');
        throw new Error(msg);
      }
      toast('تم رفع الملف بنجاح');
      overlay.remove(); loadDocuments(true);
    } catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent='⬆️ رفع الملف';}
  };
}

// ── TAX HUB ────────────────────────────────────────
let taxData = [];
let _taxTab = 'dashboard';  // legacy compat

// ═══════════════════════════════════════════════════════════════════════════
// TAX CENTER — مركز الضرائب (Egyptian Law 91/2005 + Law 67/2016)
// ═══════════════════════════════════════════════════════════════════════════
let _tcTab = 'dashboard';
let _tcClientId = null;
let _tcClientName = '';
// Default to previous month — we always file for last month
let _tcYear  = new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear();
let _tcMonth = new Date().getMonth() === 0 ? 12 : new Date().getMonth(); // getMonth() is 0-based → -1 gives prev month
let _tcAllClients = [];       // all clients cached
let _tcOblMap = {};           // client_id → Set of obligation_types

const TC_MONTH_AR = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

