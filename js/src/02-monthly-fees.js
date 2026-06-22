// SECTION: المدفوعات الشهرية — Monthly Fees
// ─────────────────────────────────────────────────────────────────────────────

const MF_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
let mfCurrentYear = 2026;
let mfCurrentMonth = 5; // مايو — آخر شهر فيه بيانات

async function loadMonthlyFees() {
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML = `<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>`;
  await renderMFPage();
}

let mfTableFilter = 'all'; // 'all' | 'paid' | 'unpaid' | 'partial' | 'overdue'
let mfSearchQuery = '';
let _mfAllRecords = [];
let _mfClientsMap = {}; // client_id → {phone, name}

async function renderMFPage() {
  const main = document.getElementById('main');
  const [dash, records, mfClients] = await Promise.all([
    api('GET', `/api/monthly-fees/dashboard?year=${mfCurrentYear}&month=${mfCurrentMonth}`).catch(()=>null),
    api('GET', `/api/monthly-fees/records?year=${mfCurrentYear}&month=${mfCurrentMonth}`).catch(()=>[]),
    api('GET', '/api/monthly-fees/clients?page_size=200').catch(()=>[]),
  ]);
  _mfAllRecords = records;
  window._mfLastDash = dash;
  // Build phone map from mf_clients
  _mfClientsMap = {};
  (Array.isArray(mfClients) ? mfClients : []).forEach(c => {
    _mfClientsMap[c.id] = {phone: c.phone, name: c.name};
  });
  // Recompute paid/unpaid counts from records using _mfStatus (API counts use r.paid boolean
  // which disagrees with _mfStatus for zero-fee clients — this ensures cards match table filter)
  window._mfLastDash = _mfRecomputeDash(records);
  mfRenderPage(window._mfLastDash, records);
}

// ── helper: classify a record's status ────────────────────
function _mfStatus(r) {
  if (r.paid || r.remaining <= 0) return 'paid';
  if (r.paid_amount > 0 && r.remaining > 0) return 'partial';
  const isOverdue = r.year < mfCurrentYear || (r.year === mfCurrentYear && r.month < mfCurrentMonth);
  if (isOverdue) return 'overdue';
  return 'unpaid';
}

// ── helper: days overdue (days since end of record's month) ─
function _mfOverdueDays(r) {
  const endOfMonth = new Date(r.year, r.month, 0);
  const today = new Date();
  return Math.floor((today - endOfMonth) / (1000*60*60*24));
}

// ── helper: recompute dashboard summary from local records ─
function _mfRecomputeDash(records) {
  const dash = window._mfLastDash ? JSON.parse(JSON.stringify(window._mfLastDash)) : {summary:{},clients:{},top_debtors:[]};
  const s = dash.summary;
  s.total_due       = records.reduce((a,r)=>a+(r.total_due||0), 0);
  s.total_paid      = records.reduce((a,r)=>a+(r.paid_amount||0), 0);
  s.total_remaining = records.reduce((a,r)=>a+(r.remaining||0), 0);
  s.collection_pct  = s.total_due > 0 ? (s.total_paid / s.total_due * 100) : 0;
  dash.clients.paid_this_month   = records.filter(r=>_mfStatus(r)==='paid').length;
  dash.clients.unpaid_this_month = records.filter(r=>_mfStatus(r)==='unpaid' || _mfStatus(r)==='overdue').length;
  dash.top_debtors = records
    .filter(r=>r.remaining>0)
    .sort((a,b)=>(b.remaining||0)-(a.remaining||0))
    .slice(0,5)
    .map(r=>({name:r.client_name, remaining:r.remaining}));
  return dash;
}

// ── helper: update one record in-place and re-render ───────
function _mfUpdateLocalRecord(recordId, updates) {
  const idx = _mfAllRecords.findIndex(r=>r.id===recordId);
  if (idx === -1) return;
  const r = {..._mfAllRecords[idx], ...updates};
  r.remaining = (r.total_due||0) - (r.paid_amount||0);
  r.paid      = r.remaining <= 0;
  _mfAllRecords[idx] = r;
  window._mfLastDash = _mfRecomputeDash(_mfAllRecords);
  mfRenderPage(window._mfLastDash, _mfAllRecords);
}

function mfRenderPage(dash, records) {
  const main = document.getElementById('main');
  const fmt = n => (n||0).toLocaleString('ar-EG') + ' ج.م';
  const s = dash?.summary || {};
  const cl = dash?.clients || {};

  // Apply filter
  const q = (mfSearchQuery||'').trim().toLowerCase();
  let filtered = records;
  if (mfTableFilter === 'paid')         filtered = records.filter(r=>_mfStatus(r)==='paid');
  else if (mfTableFilter === 'unpaid')  filtered = records.filter(r=>_mfStatus(r)==='unpaid');
  else if (mfTableFilter === 'partial') filtered = records.filter(r=>_mfStatus(r)==='partial');
  else if (mfTableFilter === 'overdue') filtered = records.filter(r=>_mfStatus(r)==='overdue');
  else if (mfTableFilter === 'ov30')    filtered = records.filter(r=>_mfStatus(r)==='overdue' && _mfOverdueDays(r)>30);
  else if (mfTableFilter === 'ov60')    filtered = records.filter(r=>_mfStatus(r)==='overdue' && _mfOverdueDays(r)>60);
  else if (mfTableFilter === 'ov90')    filtered = records.filter(r=>_mfStatus(r)==='overdue' && _mfOverdueDays(r)>90);
  if (q) filtered = filtered.filter(r=>(r.client_name||'').toLowerCase().includes(q));

  // Stats for filter buttons
  const countAll     = records.length;
  const countPaid    = records.filter(r=>_mfStatus(r)==='paid').length;
  const countUnpaid  = records.filter(r=>_mfStatus(r)==='unpaid').length;
  const countPartial = records.filter(r=>_mfStatus(r)==='partial').length;
  const countOverdue = records.filter(r=>_mfStatus(r)==='overdue').length;
  const countOv30    = records.filter(r=>_mfStatus(r)==='overdue' && _mfOverdueDays(r)>30).length;
  const countOv60    = records.filter(r=>_mfStatus(r)==='overdue' && _mfOverdueDays(r)>60).length;
  const countOv90    = records.filter(r=>_mfStatus(r)==='overdue' && _mfOverdueDays(r)>90).length;

  const kpis = [
    {l:'إجمالي المستحقات', v:fmt(s.total_due),              c:'#3b82f6', bg:'#eff6ff', filter:null},
    {l:'إجمالي المحصّل',   v:fmt(s.total_paid),             c:'#10b981', bg:'#ecfdf5', filter:'paid'},
    {l:'إجمالي المتبقي',   v:fmt(s.total_remaining),        c:'#ef4444', bg:'#fef2f2', filter:'unpaid'},
    {l:'نسبة التحصيل',     v:(s.collection_pct||0).toFixed(1)+'%', c:'#8b5cf6', bg:'#f5f3ff', filter:null},
    {l:'دفعوا',            v:cl.paid_this_month||0,         c:'#10b981', bg:'#ecfdf5', filter:'paid'},
    {l:'لم يدفعوا',        v:cl.unpaid_this_month||0,       c:'#ef4444', bg:'#fef2f2', filter:'unpaid'},
  ];

  const filterBtns = [
    {f:'all',     l:`الكل (${countAll})`,              c:'#64748b', ac:'#1e293b'},
    {f:'paid',    l:`✅ مدفوع (${countPaid})`,          c:'#64748b', ac:'#10b981'},
    {f:'partial', l:`🟡 جزئي (${countPartial})`,       c:'#64748b', ac:'#f59e0b'},
    {f:'unpaid',  l:`❌ غير مدفوع (${countUnpaid})`,   c:'#64748b', ac:'#ef4444'},
    {f:'overdue', l:`⏰ متأخر (${countOverdue})`,      c:'#64748b', ac:'#dc2626'},
    {f:'ov30',    l:`🔶 +30 يوم (${countOv30})`,       c:'#64748b', ac:'#b45309'},
    {f:'ov60',    l:`🔴 +60 يوم (${countOv60})`,       c:'#64748b', ac:'#b91c1c'},
    {f:'ov90',    l:`💀 +90 يوم (${countOv90})`,       c:'#64748b', ac:'#7f1d1d'},
  ];

  const tableTitle = {
    all:'جدول العملاء', paid:'✅ دفعوا',
    partial:'🟡 مدفوع جزئياً', unpaid:'❌ لم يدفعوا', overdue:'⏰ المتأخرون',
    ov30:'🔶 متأخر أكثر من 30 يوم', ov60:'🔴 متأخر أكثر من 60 يوم', ov90:'💀 متأخر أكثر من 90 يوم'
  }[mfTableFilter] || 'جدول العملاء';

  main.innerHTML = `
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
    <div>
      <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin:0">📋 المدفوعات الشهرية</h2>
      <div style="font-size:13px;color:#64748b;margin-top:2px">تتبع الأتعاب الشهرية — بناءً على منطق الأتعاب المؤجلة</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      ${currentUser?.role==='admin'?`<button onclick="mfAddClientModal()" style="padding:7px 14px;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">+ إضافة شركة</button>`:''}
      <select id="mfYear" class="input" style="width:90px" onchange="mfFilterChange()">
        ${[2025,2026,2027].map(y=>`<option value="${y}" ${y===mfCurrentYear?'selected':''}>${y}</option>`).join('')}
      </select>
      <select id="mfMonth" class="input" style="width:100px" onchange="mfFilterChange()">
        ${MF_MONTHS.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===mfCurrentMonth?'selected':''}>${m}</option>`).join('')}
      </select>
    </div>
  </div>

  <!-- KPI Cards -->
  ${dash ? `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
    ${kpis.map(k=>`
      <div onclick="${k.filter?`mfSetFilter('${k.filter}')`:''}"
           style="background:${k.bg};border-radius:12px;padding:14px 16px;border:2px solid ${mfTableFilter===k.filter&&k.filter?k.c:k.c+'22'};${k.filter?'cursor:pointer;':''}transition:border .2s">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">${k.l}</div>
        <div style="font-size:20px;font-weight:700;color:${k.c}" id="mfKpi_${k.filter||'stat'}">${k.v}</div>
      </div>`).join('')}
  </div>
  ${dash.top_debtors?.length ? `
  <div style="background:#fff7ed;border-radius:12px;padding:14px 16px;border:1px solid #f59e0b44;margin-bottom:20px">
    <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:8px">⚠️ أعلى المتأخرين</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${dash.top_debtors.map(d=>`<span style="background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">${d.name} — ${(d.remaining||0).toLocaleString('ar-EG')} ج.م</span>`).join('')}
    </div>
  </div>` : ''}` : `<div style="background:#fef2f2;padding:14px;border-radius:10px;color:#dc2626;margin-bottom:20px">⚠️ تعذّر تحميل البيانات</div>`}

  <!-- Progress Bar -->
  ${s.total_due > 0 ? `
  <div style="background:white;border-radius:12px;padding:16px;border:1px solid #e8edf3;margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;margin-bottom:6px">
      <span>نسبة التحصيل — ${MF_MONTHS[mfCurrentMonth]} ${mfCurrentYear}</span>
      <span style="font-weight:700;color:#10b981" id="mfProgressPct">${(s.collection_pct||0).toFixed(1)}%</span>
    </div>
    <div style="background:#f1f5f9;border-radius:20px;height:10px;overflow:hidden">
      <div id="mfProgressBar" style="background:linear-gradient(90deg,#10b981,#059669);height:100%;border-radius:20px;width:${Math.min(100,s.collection_pct||0)}%;transition:width .5s"></div>
    </div>
  </div>` : ''}

  <!-- Filters + Search -->
  <div style="background:white;border-radius:12px;border:1px solid #e8edf3;padding:12px 16px;margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    ${filterBtns.map(b=>`
      <button onclick="mfSetFilter('${b.f}')"
        style="padding:6px 14px;border-radius:20px;border:1.5px solid ${mfTableFilter===b.f?b.ac:'#e2e8f0'};background:${mfTableFilter===b.f?b.ac+'18':'#f8fafc'};color:${mfTableFilter===b.f?b.ac:'#64748b'};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s">
        ${b.l}
      </button>`).join('')}
    <div style="flex:1;min-width:160px;max-width:280px;position:relative">
      <input id="mfSearch" class="input" placeholder="🔍 بحث باسم الشركة..." value="${escH(mfSearchQuery)}"
        oninput="mfSearchQuery=this.value;mfRenderPage(window._mfLastDash,_mfAllRecords)"
        style="padding-right:12px;font-size:13px"/>
    </div>
  </div>

  <!-- Clients Table -->
  <div style="background:white;border-radius:16px;border:1px solid #e8edf3;overflow:hidden">
    <div style="padding:12px 18px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:14px;font-weight:700;color:#1e293b">${tableTitle} — ${MF_MONTHS[mfCurrentMonth]} ${mfCurrentYear}</div>
      <div style="display:flex;gap:8px;align-items:center">
        <div style="font-size:12px;color:#64748b">${filtered.length} عميل</div>
        <button onclick="mfExportCSV()" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;color:#374151;font-family:inherit">📥 CSV</button>
      </div>
    </div>
    <div style="overflow-x:auto">
    <table class="data-table" style="width:100%">
      <thead><tr>
        <th>#</th>
        <th>اسم الشركة</th>
        <th>الأتعاب</th>
        <th>رصيد سابق</th>
        <th>إجمالي المطلوب</th>
        <th>المدفوع</th>
        <th>المتبقي</th>
        <th>تاريخ الدفع</th>
        <th>آخر دفعة</th>
        <th>الدفعات</th>
        <th>الحالة</th>
        <th>إجراءات</th>
      </tr></thead>
      <tbody>
        ${filtered.length ? filtered.map((r,i)=>{
          const st = _mfStatus(r);
          const rowBg = st==='paid'?'#f0fdf4' : st==='partial'?'#fffbeb' : st==='overdue'?'#fff1f2' : 'white';
          const safeName = (r.client_name||'').replace(/'/g,"\\'");
          return `
          <tr id="mfRow_${r.id}" style="cursor:pointer;background:${rowBg};transition:background .3s" onclick="mfShowClientHistory(${r.client_id},'${safeName}')">
            <td style="color:#94a3b8">${i+1}</td>
            <td style="font-weight:600">${r.client_name||'—'}</td>
            <td>${(r.fee_amount||0).toLocaleString('ar-EG')} ج.م</td>
            <td style="color:${r.balance_carried>0?'#ef4444':'#94a3b8'}">${r.balance_carried>0?(r.balance_carried||0).toLocaleString('ar-EG')+' ج.م':'—'}</td>
            <td style="font-weight:700">${(r.total_due||0).toLocaleString('ar-EG')} ج.م</td>
            <td style="color:#10b981">${(r.paid_amount||0).toLocaleString('ar-EG')} ج.م</td>
            <td style="color:${r.remaining>0?'#ef4444':'#10b981'};font-weight:600">${(r.remaining||0).toLocaleString('ar-EG')} ج.م</td>
            <td style="font-size:12px;color:#64748b">${r.paid_date||'—'}</td>
            <td style="font-size:12px;color:#64748b">${r.last_paid_date||'—'}</td>
            <td style="font-size:12px;color:#64748b;text-align:center">${r.payment_count||0}</td>
            <td>
              ${st==='paid'
                ? `<span style="background:#ecfdf5;color:#10b981;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">✓ مدفوع</span>`
                : st==='partial'
                ? `<span style="background:#fffbeb;color:#d97706;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">◑ جزئي</span>`
                : st==='overdue'
                ? `<span style="background:#fff1f2;color:#dc2626;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">⏰ متأخر</span>`
                : `<span style="background:#fef2f2;color:#ef4444;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">✗ غير مدفوع</span>`}
            </td>
            <td onclick="event.stopPropagation()" style="white-space:nowrap">
              <button id="mfPayBtn_${r.id}" onclick="mfPayModal(${r.id},${r.total_due},'${safeName}',${r.remaining},${r.paid_amount||0})"
                style="font-size:12px;padding:4px 10px;border-radius:6px;border:none;cursor:pointer;background:${r.paid_amount>0?'#6366f1':'#3b82f6'};color:white;margin-left:4px;font-family:inherit">
                ${r.paid_amount>0?'✏️ تعديل':'💳 دفع'}
              </button>
              ${r.remaining>0?`<button onclick="mfQuickPay(${r.id},${r.total_due},'${safeName}',${r.remaining},${r.paid_amount||0})" style="font-size:12px;padding:4px 8px;border-radius:6px;border:none;cursor:pointer;background:#10b981;color:white;margin-left:4px" title="دفع كامل المتبقي فوراً">🚀</button>`:''}
              <button onclick="mfPrepayModal(${r.client_id},'${safeName}',${r.fee_amount||0})"
                style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid #8b5cf6;cursor:pointer;background:#f5f3ff;color:#7c3aed;margin-left:4px;font-family:inherit" title="دفع مقدم لشهور قادمة">⏩</button>
              <button onclick="mfEditRecordModal(${r.id},${r.fee_amount},${r.balance_carried||0},${r.paid_amount||0},'${r.paid_date||''}','${safeName}','${(r.bayan||'').replace(/'/g,"\\'")}','${(r.notes||'').replace(/'/g,"\\'")}')"
                style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid #e2e8f0;cursor:pointer;background:#f8fafc;color:#374151;margin-left:4px" title="تعديل السجل">✏️</button>
              ${r.paid_amount>0?`<button onclick="mfResetPay(${r.id},'${safeName}')"
                style="font-size:12px;padding:4px 8px;border-radius:6px;border:none;cursor:pointer;background:#fee2e2;color:#dc2626;margin-left:4px">↩️</button>`:''}
              ${currentUser?.role==='admin'?`<button onclick="mfDeleteClientModal(${r.client_id},'${safeName}')"
                style="font-size:12px;padding:4px 8px;border-radius:6px;border:none;cursor:pointer;background:#fef2f2;color:#dc2626;margin-left:4px;font-family:inherit" title="حذف من المدفوعات الشهرية">🗑️</button>`:''}
              ${(()=>{ const ph = _mfClientsMap[r.client_id]?.phone; return ph ? `<button onclick="mfOpenWA(${r.id},${r.client_id})" style="font-size:12px;padding:4px 8px;border-radius:6px;border:none;cursor:pointer;background:#dcfce7;color:#16a34a;margin-left:4px" title="إرسال تذكير واتساب">📱</button>` : ''; })()}
            </td>
          </tr>`;}).join('')
          : `<tr><td colspan="12" style="text-align:center;color:#94a3b8;padding:40px">لا توجد بيانات${mfTableFilter!=='all'?' لهذا الفلتر':' لهذا الشهر'}</td></tr>`}
      </tbody>
      ${filtered.length>0?`<tfoot><tr style="background:#f8fafc;font-weight:700;border-top:2px solid #e2e8f0">
        <td colspan="4" style="padding:10px 12px;font-size:12px;color:#64748b">الإجمالي (${filtered.length} عميل)</td>
        <td style="padding:10px 12px;color:#3b82f6">${filtered.reduce((a,r)=>a+(r.total_due||0),0).toLocaleString('ar-EG')} ج.م</td>
        <td style="padding:10px 12px;color:#10b981">${filtered.reduce((a,r)=>a+(r.paid_amount||0),0).toLocaleString('ar-EG')} ج.م</td>
        <td style="padding:10px 12px;color:#ef4444">${filtered.reduce((a,r)=>a+(r.remaining||0),0).toLocaleString('ar-EG')} ج.م</td>
        <td colspan="5"></td>
      </tr></tfoot>`:''}
    </table>
    </div>
  </div>`;
}

window.mfSetFilter = function(f) {
  mfTableFilter = f;
  mfRenderPage(window._mfLastDash, _mfAllRecords);
};

window.mfFilterChange = function() {
  mfCurrentYear  = parseInt(document.getElementById('mfYear').value);
  mfCurrentMonth = parseInt(document.getElementById('mfMonth').value);
  mfTableFilter  = 'all';
  mfSearchQuery  = '';
  renderMFPage();
};


// ── WhatsApp Reminder System ──────────────────────────────────────────────────

function _mfGetOverdueInfo(r) {
  // Estimate overdue months from carried balance
  const fee = r.fee_amount || 0;
  const carried = r.balance_carried || 0;
  const carriedMonths = fee > 0 ? Math.round(carried / fee) : 0;
  const thisMonthUnpaid = _mfStatus(r) !== 'paid' ? 1 : 0;
  const totalOverdueMonths = carriedMonths + thisMonthUnpaid;

  // Build months text
  const months = [];
  if (thisMonthUnpaid) months.push(MF_MONTHS[mfCurrentMonth] + ' ' + mfCurrentYear);
  for (let i = 1; i <= carriedMonths; i++) {
    let m = mfCurrentMonth - i;
    let y = mfCurrentYear;
    if (m <= 0) { m += 12; y--; }
    months.unshift(MF_MONTHS[m] + ' ' + y);
  }
  const monthsText = months.length > 0 ? months.join(' + ') : MF_MONTHS[mfCurrentMonth] + ' ' + mfCurrentYear;
  return { totalOverdueMonths, monthsText, months };
}

function _mfGenerateWAMessage(r, type) {
  const clientName = r.client_name || '';
  const remaining  = (r.remaining || 0).toLocaleString('ar-EG');
  const fee        = (r.fee_amount || 0).toLocaleString('ar-EG');
  const { totalOverdueMonths, monthsText } = _mfGetOverdueInfo(r);
  const monthLabel = MF_MONTHS[mfCurrentMonth] + ' ' + mfCurrentYear;

  if (type === 1) {
    // Early reminder (day 1–15)
    return `السلام عليكم ورحمة الله وبركاته،\n${clientName}\n\nنود تذكيركم بموعد سداد أتعاب المحاسبة الشهرية 📋\n📅 الشهر: ${monthLabel}\n💰 المبلغ المستحق: ${remaining} ج.م.\n\nنرجو التكرم بالسداد في أقرب وقت ممكن.\nشاكرين تعاملكم مع مكتب MS للمحاسبة 🙏`;
  } else {
    // Late reminder (day 16–31)
    const overdueNote = totalOverdueMonths > 1
      ? `\n📌 الشهور المتأخرة (${totalOverdueMonths}): ${monthsText}`
      : '';
    return `السلام عليكم ورحمة الله وبركاته،\n${clientName}\n\n⚠️ تنبيه: لم يتم تسديد أتعاب المحاسبة حتى الآن\n📅 الشهر: ${monthLabel}\n💰 إجمالي المتأخرات: ${remaining} ج.م.${overdueNote}\n\nبرجاء سرعة التواصل لتسوية الحساب.\nمكتب MS للمحاسبة 📊`;
  }
}

window.mfOpenWA = function(recordId, clientId) {
  const r = _mfAllRecords.find(x => x.id === recordId);
  if (!r) return;
  const phone = _mfClientsMap[clientId]?.phone;
  if (!phone) { toast('لا يوجد رقم هاتف لهذه الشركة', 'warning'); return; }
  const p = toWAPhone(phone);
  if (!p) { toast('رقم الهاتف غير صالح', 'warning'); return; }

  const st = _mfStatus(r);
  if (st === 'paid') { toast('هذا العميل دفع بالفعل ✅', 'info'); return; }

  const today = new Date().getDate();
  const type  = today <= 15 ? 1 : 2;
  const msg   = _mfGenerateWAMessage(r, type);
  const { monthsText } = _mfGetOverdueInfo(r);
  const remaining = (r.remaining || 0).toLocaleString('ar-EG');
  const safeName  = (r.client_name || '').replace(/'/g, "\\'");

  // Show preview modal before opening WA
  document.getElementById('mfWAModal')?.remove();
  const html = `
  <div class="modal-backdrop" id="mfWAModal" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-width:500px">
      <div class="modal-header" style="background:linear-gradient(135deg,#25d366,#128c7e);color:white;border-radius:12px 12px 0 0">
        <h3 style="font-size:15px;color:white;margin:0">📱 تذكير واتساب — ${escH(r.client_name||'')}</h3>
        <button onclick="document.getElementById('mfWAModal').remove()" style="background:transparent;border:none;color:white;font-size:18px;cursor:pointer">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
          <div style="background:#fef2f2;border-radius:10px;padding:10px">
            <div style="font-size:10px;color:#64748b">المتأخرات</div>
            <div style="font-size:16px;font-weight:700;color:#ef4444">${remaining} ج.م</div>
          </div>
          <div style="background:#fffbeb;border-radius:10px;padding:10px">
            <div style="font-size:10px;color:#64748b">الشهور</div>
            <div style="font-size:14px;font-weight:700;color:#d97706">${monthsText}</div>
          </div>
          <div style="background:#f0fdf4;border-radius:10px;padding:10px">
            <div style="font-size:10px;color:#64748b">الهاتف</div>
            <div style="font-size:13px;font-weight:700;color:#16a34a" dir="ltr">+${p}</div>
          </div>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">نوع الرسالة</label>
          <div style="display:flex;gap:8px">
            <button onclick="mfWAPreview(${recordId},${clientId},1)" id="mfWATypeBtn1"
              style="flex:1;padding:7px;border-radius:8px;border:2px solid ${today<=15?'#25d366':'#e2e8f0'};background:${today<=15?'#f0fdf4':'#f8fafc'};cursor:pointer;font-size:12px;font-weight:600;color:${today<=15?'#16a34a':'#64748b'};font-family:inherit">
              🌅 تذكير مبكر (١–١٥)</button>
            <button onclick="mfWAPreview(${recordId},${clientId},2)" id="mfWATypeBtn2"
              style="flex:1;padding:7px;border-radius:8px;border:2px solid ${today>15?'#ef4444':'#e2e8f0'};background:${today>15?'#fef2f2':'#f8fafc'};cursor:pointer;font-size:12px;font-weight:600;color:${today>15?'#dc2626':'#64748b'};font-family:inherit">
              ⚠️ تذكير متأخر (١٦–٣١)</button>
          </div>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">نص الرسالة (قابل للتعديل)</label>
          <textarea id="mfWAMsgText" class="input" style="height:160px;font-size:13px;line-height:1.6;direction:rtl;resize:vertical">${escH(msg)}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="mfSendWA('${p}')" style="padding:9px 20px;background:#25d366;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">📱 فتح واتساب</button>
        <button onclick="document.getElementById('mfWAModal').remove()" class="btn">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.mfWAPreview = function(recordId, clientId, type) {
  const r = _mfAllRecords.find(x => x.id === recordId);
  if (!r) return;
  const msg = _mfGenerateWAMessage(r, type);
  const ta  = document.getElementById('mfWAMsgText');
  if (ta) ta.value = msg;
  // Update button styles
  [1, 2].forEach(t => {
    const btn = document.getElementById(`mfWATypeBtn${t}`);
    if (!btn) return;
    const active = t === type;
    btn.style.borderColor = active ? (t===1?'#25d366':'#ef4444') : '#e2e8f0';
    btn.style.background  = active ? (t===1?'#f0fdf4':'#fef2f2') : '#f8fafc';
    btn.style.color       = active ? (t===1?'#16a34a':'#dc2626') : '#64748b';
  });
};

window.mfSendWA = function(phone) {
  const msg = document.getElementById('mfWAMsgText')?.value || '';
  if (!msg.trim()) { toast('الرسالة فارغة', 'warning'); return; }
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  document.getElementById('mfWAModal')?.remove();
};

window.mfOpenWA = window.mfOpenWA;

window.mfPayModal = function(recordId, totalDue, clientName, remaining, currentPaid) {
  document.getElementById('mfPayModalEl')?.remove();
  const isEdit = (currentPaid||0) > 0;
  // remaining relative to totalDue (not to previous partial)
  const trueRemaining = (totalDue||0) - (currentPaid||0);
  const defaultVal = currentPaid > 0 ? currentPaid : (remaining > 0 ? remaining : totalDue);

  const html = `
  <div class="modal-backdrop" id="mfPayModalEl" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-width:440px">
      <div class="modal-header">
        <h3 style="font-size:15px">${isEdit?'✏️ تعديل الدفعة':'💳 تسجيل دفعة'} — ${escH(clientName)}</h3>
        <button onclick="document.getElementById('mfPayModalEl').remove()" class="modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">

        <!-- Summary row -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
          <div style="background:#eff6ff;border-radius:10px;padding:10px">
            <div style="font-size:10px;color:#64748b;margin-bottom:2px">المطلوب</div>
            <div style="font-size:15px;font-weight:700;color:#3b82f6">${(totalDue||0).toLocaleString('ar-EG')}</div>
            <div style="font-size:10px;color:#94a3b8">ج.م</div>
          </div>
          <div style="background:#ecfdf5;border-radius:10px;padding:10px">
            <div style="font-size:10px;color:#64748b;margin-bottom:2px">مدفوع سابقاً</div>
            <div style="font-size:15px;font-weight:700;color:#10b981">${(currentPaid||0).toLocaleString('ar-EG')}</div>
            <div style="font-size:10px;color:#94a3b8">ج.م</div>
          </div>
          <div style="background:#fef2f2;border-radius:10px;padding:10px">
            <div style="font-size:10px;color:#64748b;margin-bottom:2px">المتبقي</div>
            <div id="mfPayPreviewRemaining" style="font-size:15px;font-weight:700;color:#ef4444">${trueRemaining.toLocaleString('ar-EG')}</div>
            <div style="font-size:10px;color:#94a3b8">ج.م</div>
          </div>
        </div>

        <!-- Status badge (live) -->
        <div id="mfPayStatusBadge" style="text-align:center;font-size:13px;font-weight:600;padding:8px;border-radius:8px;background:#f8fafc;color:#64748b">
          أدخل المبلغ لمعرفة الحالة
        </div>

        <div><label class="label">المبلغ المدفوع الآن (ج.م)</label>
          <input id="mfPayAmount" class="input" type="number" min="0" step="0.01"
            value="${defaultVal||''}"
            oninput="mfPayPreview(${totalDue||0},${currentPaid||0})"/></div>
        <div><label class="label">تاريخ الدفع</label>
          <input id="mfPayDate" class="input" type="date" value="${new Date().toISOString().slice(0,10)}"/></div>
        <div><label class="label">البيان / ملاحظة (اختياري)</label>
          <input id="mfPayBayan" class="input" value="تم دفع"/></div>
      </div>
      <div class="modal-footer">
        <button id="mfPaySaveBtn" onclick="mfSavePay(${recordId},${totalDue||0},${currentPaid||0})" class="btn btn-primary">💾 حفظ</button>
        <button onclick="document.getElementById('mfPayModalEl').remove()" class="btn">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  // Trigger initial preview
  setTimeout(()=>{ mfPayPreview(totalDue||0, currentPaid||0); document.getElementById('mfPayAmount')?.focus(); }, 30);
};

window.mfPayPreview = function(totalDue, currentPaid) {
  const amountEl = document.getElementById('mfPayAmount');
  const remEl    = document.getElementById('mfPayPreviewRemaining');
  const badge    = document.getElementById('mfPayStatusBadge');
  const saveBtn  = document.getElementById('mfPaySaveBtn');
  if (!amountEl || !remEl || !badge) return;
  const amount = parseFloat(amountEl.value) || 0;
  const remaining = totalDue - amount;
  remEl.textContent = Math.max(0, remaining).toLocaleString('ar-EG');
  if (amount <= 0) {
    badge.textContent = 'أدخل المبلغ لمعرفة الحالة';
    badge.style.background = '#f8fafc'; badge.style.color = '#64748b';
    remEl.style.color = '#ef4444';
    if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
  } else if (amount > totalDue) {
    badge.textContent = '⚠️ المبلغ أكبر من المطلوب — لا يمكن الحفظ';
    badge.style.background = '#fff1f2'; badge.style.color = '#dc2626';
    remEl.style.color = '#dc2626';
    if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '.5'; }
  } else if (remaining <= 0) {
    badge.textContent = '✅ مدفوع بالكامل';
    badge.style.background = '#ecfdf5'; badge.style.color = '#10b981';
    remEl.style.color = '#10b981';
    if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
  } else {
    badge.textContent = `◑ مدفوع جزئياً — سيبقى ${remaining.toLocaleString('ar-EG')} ج.م`;
    badge.style.background = '#fffbeb'; badge.style.color = '#d97706';
    remEl.style.color = '#f59e0b';
    if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
  }
};

window.mfResetPay = async function(recordId, clientName) {
  if(!confirm(`هل تريد حذف الدفعة لـ ${clientName}؟`)) return;
  try {
    await api('PUT', `/api/monthly-fees/records/${recordId}/pay`,
      {paid_amount:0, paid_date:null, bayan:'لم يتم الدفع'},
      {queue:true, queueLabel:'إلغاء دفعة أتعاب'});
    toast('تم حذف الدفعة', 'success');
    _mfUpdateLocalRecord(recordId, {paid_amount:0, paid_date:null, bayan:'لم يتم الدفع'});
  } catch(e) {
    if (e._queued) { toast('⏳ '+e.message, 'warning'); _mfUpdateLocalRecord(recordId, {paid_amount:0, paid_date:null}); }
    else toast(e.message, 'error');
  }
};

window.mfSavePay = async function(recordId, totalDue, currentPaid) {
  const amount = parseFloat(document.getElementById('mfPayAmount')?.value||0);
  const pdate  = document.getElementById('mfPayDate')?.value;
  const bayan  = document.getElementById('mfPayBayan')?.value || 'تم دفع';
  if (!amount || amount <= 0) { toast('ادخل مبلغ صحيح', 'error'); return; }
  if (amount > (totalDue||0)) { toast('المبلغ أكبر من المطلوب', 'error'); return; }

  const saveBtn = document.getElementById('mfPaySaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite">⏳</span> جاري الحفظ...'; }

  try {
    await api('PUT', `/api/monthly-fees/records/${recordId}/pay`,
      {paid_amount: amount, paid_date: pdate, bayan},
      {queue: true, queueLabel: 'تسجيل دفعة أتعاب'});
    document.getElementById('mfPayModalEl')?.remove();
    toast('✅ تم تسجيل الدفعة');
    // Instant local update — no full page refresh
    _mfUpdateLocalRecord(recordId, {paid_amount: amount, paid_date: pdate||null, bayan});
  } catch(e) {
    if (e._queued) {
      document.getElementById('mfPayModalEl')?.remove();
      toast('⏳ '+e.message, 'warning');
      // Optimistic update even while queued
      _mfUpdateLocalRecord(recordId, {paid_amount: amount, paid_date: pdate||null, bayan});
    } else {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '💾 حفظ'; }
      toast(e.message, 'error');
    }
  }
};

window.mfShowClientHistory = async function(clientId, clientName) {
  const data = await api('GET', `/api/monthly-fees/clients/${clientId}/history`).catch(()=>null);
  if(!data){ toast('تعذّر تحميل التفاصيل','error'); return; }

  const fmt = n => (n||0).toLocaleString('ar-EG') + ' ج.م';
  const s = data.summary || {};
  const records = data.records || [];

  const html = `
  <div class="modal-backdrop" id="mfHistoryModal" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-width:680px;max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h3>🏢 ${clientName}</h3>
        <div style="display:flex;gap:8px;align-items:center">
          ${currentUser?.role==='admin'?`<button onclick="document.getElementById('mfHistoryModal').remove();mfEditClientModal(${clientId},'${clientName.replace(/'/g,"\\'")}',${data.client?.monthly_fee||0},'${(data.client?.notes||'').replace(/'/g,"\\'")}')" style="font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;color:#374151">✏️ تعديل</button>`:''}
          <button onclick="document.getElementById('mfHistoryModal').remove()" class="modal-close">✕</button>
        </div>
      </div>
      <div class="modal-body" style="overflow-y:auto;flex:1">
        <!-- Summary Cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px">
          ${[
            {l:'إجمالي المدفوع', v:fmt(s.total_paid), c:'#10b981', bg:'#ecfdf5'},
            {l:'إجمالي المطلوب', v:fmt(s.total_due), c:'#3b82f6', bg:'#eff6ff'},
            {l:'إجمالي المتأخرات', v:fmt(s.total_remaining), c:'#ef4444', bg:'#fef2f2'},
            {l:'آخر دفعة', v:s.last_paid_date||'—', c:'#64748b', bg:'#f8fafc'},
          ].map(k=>`<div style="background:${k.bg};border-radius:10px;padding:12px;border:1px solid ${k.c}22"><div style="font-size:11px;color:#64748b;margin-bottom:2px">${k.l}</div><div style="font-size:16px;font-weight:700;color:${k.c}">${k.v}</div></div>`).join('')}
        </div>

        <!-- Payment History -->
        <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:10px">سجل الشهور</div>
        ${records.map(r=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:10px;margin-bottom:6px;background:${r.paid?'#f0fdf4':'#fff7ed'};border:1px solid ${r.paid?'#bbf7d0':'#fed7aa'}">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:18px">${r.paid?'✅':'⏳'}</div>
            <div>
              <div style="font-weight:600;font-size:13px">${r.month_label} ${r.year}</div>
              <div style="font-size:11px;color:#64748b">${r.bayan||''}</div>
            </div>
          </div>
          <div style="text-align:left;font-size:12px">
            <div>أتعاب: <strong>${fmt(r.fee_amount)}</strong></div>
            ${r.balance_carried>0?`<div style="color:#ef4444">رصيد سابق: +${fmt(r.balance_carried)}</div>`:''}
            <div>مدفوع: <strong style="color:${r.paid_amount>0?'#10b981':'#94a3b8'}">${fmt(r.paid_amount)}</strong></div>
            ${r.remaining>0?`<div style="color:#ef4444">متبقي: ${fmt(r.remaining)}</div>`:''}
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

// ── Monthly Fees: Add Company Modal ──────────────────────
window.mfAddClientModal = function() {
  document.getElementById('mfAddClientModalEl')?.remove();
  const html = `
  <div class="modal-backdrop" id="mfAddClientModalEl" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <h3>➕ إضافة شركة جديدة</h3>
        <button onclick="document.getElementById('mfAddClientModalEl').remove()" class="modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div><label class="label">اسم الشركة *</label>
          <input id="mfNewClientName" class="input" placeholder="اسم الشركة" /></div>
        <div><label class="label">الأتعاب الشهرية (ج.م)</label>
          <input id="mfNewClientFee" class="input" type="number" min="0" step="0.01" placeholder="0" /></div>
        <div><label class="label">ملاحظات</label>
          <input id="mfNewClientNotes" class="input" placeholder="اختياري" /></div>
      </div>
      <div class="modal-footer">
        <button onclick="mfSaveNewClient()" class="btn btn-primary">💾 حفظ</button>
        <button onclick="document.getElementById('mfAddClientModalEl').remove()" class="btn">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(()=>document.getElementById('mfNewClientName')?.focus(), 50);
};

window.mfSaveNewClient = async function() {
  const name  = document.getElementById('mfNewClientName')?.value?.trim();
  const fee   = parseFloat(document.getElementById('mfNewClientFee')?.value || 0);
  const notes = document.getElementById('mfNewClientNotes')?.value?.trim();
  if(!name){ toast('اسم الشركة مطلوب','error'); return; }
  try {
    await api('POST', '/api/monthly-fees/clients', { name, monthly_fee: fee, status:'active', notes: notes||null });
    document.getElementById('mfAddClientModalEl')?.remove();
    toast('✅ تمت إضافة الشركة');
    await renderMFPage();
  } catch(e){ toast(e.message,'error'); }
};

// ── Monthly Fees: Edit Company Modal ─────────────────────
window.mfEditClientModal = function(clientId, clientName, monthlyFee, notes) {
  document.getElementById('mfEditClientModalEl')?.remove();
  const html = `
  <div class="modal-backdrop" id="mfEditClientModalEl" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <h3>✏️ تعديل بيانات الشركة</h3>
        <button onclick="document.getElementById('mfEditClientModalEl').remove()" class="modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div><label class="label">اسم الشركة *</label>
          <input id="mfEditClientName" class="input" value="${clientName}" /></div>
        <div><label class="label">الأتعاب الشهرية (ج.م)</label>
          <input id="mfEditClientFee" class="input" type="number" min="0" step="0.01" value="${monthlyFee||0}" /></div>
        <div><label class="label">ملاحظات</label>
          <input id="mfEditClientNotes" class="input" value="${notes||''}" /></div>
      </div>
      <div class="modal-footer">
        <button onclick="mfSaveEditClient(${clientId})" class="btn btn-primary">💾 حفظ التعديلات</button>
        <button onclick="document.getElementById('mfEditClientModalEl').remove();mfDeleteClientModal(${clientId},'${clientName.replace(/'/g,"\\'")}')"
          style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;font-family:inherit">🗑️ حذف من المدفوعات</button>
        <button onclick="document.getElementById('mfEditClientModalEl').remove()" class="btn">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.mfSaveEditClient = async function(clientId) {
  const name  = document.getElementById('mfEditClientName')?.value?.trim();
  const fee   = parseFloat(document.getElementById('mfEditClientFee')?.value || 0);
  const notes = document.getElementById('mfEditClientNotes')?.value?.trim();
  if(!name){ toast('اسم الشركة مطلوب','error'); return; }
  try {
    await api('PUT', `/api/monthly-fees/clients/${clientId}`, { name, monthly_fee: fee, notes: notes||null });
    document.getElementById('mfEditClientModalEl')?.remove();
    toast('✅ تم حفظ التعديلات');
    await renderMFPage();
  } catch(e){ toast(e.message,'error'); }
};

// ── Monthly Fees: Edit Record (fee amount) Modal ─────────
window.mfEditRecordModal = function(recordId, feeAmount, balanceCarried, paidAmount, paidDate, clientName, bayan, notes, updatedAt) {
  document.getElementById('mfEditRecordModalEl')?.remove();
  const html = `
  <div class="modal-backdrop" id="mfEditRecordModalEl" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <h3>✏️ تعديل السجل — ${clientName}</h3>
        <button onclick="document.getElementById('mfEditRecordModalEl').remove()" class="modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div><label class="label">الأتعاب هذا الشهر (ج.م)</label>
          <input id="mfEditRecFee" class="input" type="number" min="0" step="0.01" value="${feeAmount||0}" /></div>
        <div><label class="label">الرصيد السابق المرحّل (ج.م)</label>
          <input id="mfEditRecCarry" class="input" type="number" min="0" step="0.01" value="${balanceCarried||0}" /></div>
        <div><label class="label">المبلغ المدفوع (ج.م)</label>
          <input id="mfEditRecPaid" class="input" type="number" min="0" step="0.01" value="${paidAmount||0}" /></div>
        <div><label class="label">تاريخ الدفع</label>
          <input id="mfEditRecPaidDate" class="input" type="date" value="${paidDate||''}" /></div>
        <div><label class="label">البيان</label>
          <input id="mfEditRecBayan" class="input" value="${bayan||''}" /></div>
        <input type="hidden" id="mfEditRecUpdatedAt" value="${updatedAt||''}"/>
        <div><label class="label">ملاحظات</label>
          <input id="mfEditRecNotes" class="input" value="${notes||''}" /></div>
      </div>
      <div class="modal-footer">
        <button onclick="mfSaveEditRecord(${recordId})" class="btn btn-primary">💾 حفظ</button>
        <button onclick="document.getElementById('mfEditRecordModalEl').remove()" class="btn">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.mfSaveEditRecord = async function(recordId) {
  const fee       = parseFloat(document.getElementById('mfEditRecFee')?.value);
  const carry     = parseFloat(document.getElementById('mfEditRecCarry')?.value);
  const paid      = parseFloat(document.getElementById('mfEditRecPaid')?.value);
  const paidDate  = document.getElementById('mfEditRecPaidDate')?.value?.trim();
  const bayan     = document.getElementById('mfEditRecBayan')?.value?.trim();
  const notes     = document.getElementById('mfEditRecNotes')?.value?.trim();
  if(isNaN(fee)){ toast('ادخل قيمة صحيحة للأتعاب','error'); return; }
  try {
    const _mfEditTs = document.getElementById('mfEditRecUpdatedAt')?.value||null;
    await api('PUT', `/api/monthly-fees/records/${recordId}`, {
      fee_amount: fee,
      balance_carried: isNaN(carry) ? undefined : carry,
      paid_amount: isNaN(paid) ? undefined : paid,
      paid_date: paidDate || null,
      bayan: bayan || null,
      notes: notes || null,
    }, {queue:true, queueLabel:'تعديل سجل أتعاب', conflictTs:_mfEditTs});
    document.getElementById('mfEditRecordModalEl')?.remove();
    toast('✅ تم تعديل السجل');
    await renderMFPage();
  } catch(e){
    if(e._queued){document.getElementById('mfEditRecordModalEl')?.remove();toast('⏳ '+e.message,'warning');}
    else{ toast(e.message,'error'); }
  }
};

// ── Monthly Fees: Quick Pay (full remaining, no modal) ───────
window.mfQuickPay = async function(recordId, totalDue, clientName, remaining, currentPaid) {
  if (!confirm('دفع ' + (remaining||0).toLocaleString('ar-EG') + ' ج.م لـ ' + clientName + '؟')) return;
  const newPaid = (currentPaid||0) + (remaining||0);
  const pdate = new Date().toISOString().slice(0,10);
  try {
    await api('PUT', '/api/monthly-fees/records/' + recordId + '/pay',
      {paid_amount: newPaid, paid_date: pdate, bayan: 'تم دفع'},
      {queue: true, queueLabel: 'دفع سريع أتعاب'});
    toast('✅ تم التسجيل');
    _mfUpdateLocalRecord(recordId, {paid_amount: newPaid, paid_date: pdate, bayan: 'تم دفع'});
  } catch(e) {
    if (e._queued) { toast('⏳ ' + e.message, 'warning'); _mfUpdateLocalRecord(recordId, {paid_amount: newPaid, paid_date: pdate, bayan: 'تم دفع'}); }
    else toast(e.message, 'error');
  }
};

// ── Monthly Fees: Delete Client (archive + remove future unpaid) ──────────
window.mfDeleteClientModal = function(clientId, clientName) {
  document.getElementById('mfDeleteClientModalEl')?.remove();
  const html = `
  <div class="modal-backdrop" id="mfDeleteClientModalEl" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <h3 style="color:#dc2626">🗑️ حذف من المدفوعات الشهرية</h3>
        <button onclick="document.getElementById('mfDeleteClientModalEl').remove()" class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:12px;padding:16px;margin-bottom:16px">
          <div style="font-size:15px;font-weight:700;color:#dc2626;margin-bottom:8px">⚠️ تأكيد الحذف</div>
          <div style="font-size:13px;color:#374151;line-height:1.7">
            سيتم <strong>أرشفة "${escH(clientName)}"</strong> وحذفها من الشهر الحالي وكل الأشهر القادمة.
          </div>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;font-size:12px;color:#15803d;line-height:1.8">
          ✅ كل الدفعات والبيانات التاريخية السابقة محفوظة بالكامل<br/>
          ✅ السجلات المدفوعة في الشهر الحالي لن تُحذف<br/>
          ✅ يمكن إعادة تفعيلها لاحقاً إذا لزم الأمر
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="mfConfirmDeleteClient(${clientId},'${escH(clientName).replace(/'/g,"\\'")}',${mfCurrentYear},${mfCurrentMonth})"
          style="background:#dc2626;color:white;border:none;border-radius:8px;padding:9px 20px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">
          🗑️ نعم، احذف من المدفوعات الشهرية
        </button>
        <button onclick="document.getElementById('mfDeleteClientModalEl').remove()" class="btn">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.mfConfirmDeleteClient = async function(clientId, clientName, fromYear, fromMonth) {
  try {
    const res = await api('DELETE', `/api/monthly-fees/clients/${clientId}?from_year=${fromYear}&from_month=${fromMonth}`);
    document.getElementById('mfDeleteClientModalEl')?.remove();
    document.getElementById('mfHistoryModal')?.remove();
    toast(`✅ تم أرشفة "${clientName}" وحذف ${res.deleted_records} سجل مستقبلي`);
    await renderMFPage();
  } catch(e) { toast(e.message, 'error'); }
};

// ── Monthly Fees: Prepay Modal ────────────────────────────────
window.mfPrepayModal = function(clientId, clientName, feeAmount) {
  document.getElementById('mfPrepayModalEl')?.remove();
  const today = new Date();
  const nextMo = today.getMonth() + 2 > 12 ? 1 : today.getMonth() + 2;
  const nextYr = today.getMonth() + 2 > 12 ? today.getFullYear() + 1 : today.getFullYear();
  const html = `
  <div class="modal-backdrop" id="mfPrepayModalEl" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-width:440px">
      <div class="modal-header">
        <h3 style="color:#7c3aed">⏩ دفع مقدم — ${escH(clientName)}</h3>
        <button onclick="document.getElementById('mfPrepayModalEl').remove()" class="modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div style="background:#f5f3ff;border-radius:10px;padding:12px;font-size:13px;color:#5b21b6;line-height:1.6">
          💡 سيتم تسجيل الشهور المقدمة كمدفوعة تلقائياً — وتظهر بالأخضر عند فتح كل شهر
        </div>
        <div>
          <label class="label">الشهر الأول للدفع المقدم *</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <select id="mfPrepayYear" class="input">
              ${[2026,2027,2028].map(y=>`<option value="${y}" ${y===nextYr?'selected':''}>${y}</option>`).join('')}
            </select>
            <select id="mfPrepayMonth" class="input">
              ${['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'].slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===nextMo?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div>
          <label class="label">عدد الشهور المقدمة *</label>
          <select id="mfPrepayMonths" class="input">
            ${[1,2,3,4,5,6,12].map(n=>`<option value="${n}">${n} ${n===1?'شهر':'شهور'} — إجمالي ${((feeAmount||0)*n).toLocaleString('ar-EG')} ج.م</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label">تاريخ استلام الدفعة</label>
          <input id="mfPrepayDate" class="input" type="date" value="${today.toISOString().slice(0,10)}"/>
        </div>
        <div>
          <label class="label">البيان</label>
          <input id="mfPrepayBayan" class="input" value="دفع مقدم"/>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="mfSavePrepay(${clientId},'${escH(clientName).replace(/'/g,"\\'")}')" class="btn" style="background:#7c3aed;color:white;border:none">⏩ تسجيل الدفع المقدم</button>
        <button onclick="document.getElementById('mfPrepayModalEl').remove()" class="btn">إلغاء</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.mfSavePrepay = async function(clientId, clientName) {
  const months     = parseInt(document.getElementById('mfPrepayMonths')?.value || 1);
  const startYear  = parseInt(document.getElementById('mfPrepayYear')?.value);
  const startMonth = parseInt(document.getElementById('mfPrepayMonth')?.value);
  const paidDate   = document.getElementById('mfPrepayDate')?.value;
  const bayan      = document.getElementById('mfPrepayBayan')?.value || 'دفع مقدم';
  try {
    const res = await api('POST', `/api/monthly-fees/clients/${clientId}/prepay`, {
      months, start_year: startYear, start_month: startMonth,
      paid_date: paidDate || null, bayan
    });
    document.getElementById('mfPrepayModalEl')?.remove();
    toast(`✅ ${res.message}`);
    await renderMFPage();
  } catch(e) { toast(e.message, 'error'); }
};

// ── Monthly Fees: Export visible table as CSV ────────────────
window.mfExportCSV = function() {
  const q = (mfSearchQuery||'').trim().toLowerCase();
  let data = _mfAllRecords;
  if (mfTableFilter === 'paid')         data = data.filter(r=>_mfStatus(r)==='paid');
  else if (mfTableFilter === 'unpaid')  data = data.filter(r=>_mfStatus(r)==='unpaid');
  else if (mfTableFilter === 'partial') data = data.filter(r=>_mfStatus(r)==='partial');
  else if (mfTableFilter === 'overdue') data = data.filter(r=>_mfStatus(r)==='overdue');
  else if (mfTableFilter === 'ov30')    data = data.filter(r=>_mfStatus(r)==='overdue' && _mfOverdueDays(r)>30);
  else if (mfTableFilter === 'ov60')    data = data.filter(r=>_mfStatus(r)==='overdue' && _mfOverdueDays(r)>60);
  else if (mfTableFilter === 'ov90')    data = data.filter(r=>_mfStatus(r)==='overdue' && _mfOverdueDays(r)>90);
  if (q) data = data.filter(r=>(r.client_name||'').toLowerCase().includes(q));
  const header = ['اسم الشركة','الأتعاب','رصيد سابق','إجمالي المطلوب','المدفوع','المتبقي','تاريخ الدفع','آخر دفعة','عدد الدفعات','الحالة'];
  const rows = data.map(r=>[
    r.client_name||'', r.fee_amount||0, r.balance_carried||0, r.total_due||0,
    r.paid_amount||0, r.remaining||0, r.paid_date||'', r.last_paid_date||'', r.payment_count||0, _mfStatus(r)
  ]);
  const csv = '﻿' + [header,...rows].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'أتعاب_' + MF_MONTHS[mfCurrentMonth] + '_' + mfCurrentYear + '.csv';
  a.click();
};

