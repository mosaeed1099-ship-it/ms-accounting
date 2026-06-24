async function loadLeads(silent=false) {
  // Don't disrupt active data entry — skip silent (WS-triggered) refresh if user is typing in the grid
  if (silent) {
    const active = document.activeElement;
    if (active && active.closest && active.closest('#leadsGridBody')) return;
    if (active && active.id === 'leadsSearchInput') return;
    // Also skip if there are unsaved new rows being saved
    if (document.querySelector('tr[data-id^="new-"]')) return;
  }
  try {
    const p=new URLSearchParams({limit:'10000'});
    if(leadsSearch) p.append('q',leadsSearch);
    if(leadsStatusFilter) p.append('status',leadsStatusFilter);
    if(leadsDateFilter && leadsDateFilter!=='custom') p.append('date_filter',leadsDateFilter);
    if(leadsDateFilter==='custom'){
      if(leadsDateFrom) p.append('date_from',leadsDateFrom);
      if(leadsDateTo)   p.append('date_to',leadsDateTo+'T23:59:59');
    }
    const statsP=new URLSearchParams();
    if(leadsDateFilter && leadsDateFilter!=='custom') statsP.append('date_filter',leadsDateFilter);
    if(leadsDateFilter==='custom'){
      if(leadsDateFrom) statsP.append('date_from',leadsDateFrom);
      if(leadsDateTo)   statsP.append('date_to',leadsDateTo+'T23:59:59');
    }
    const [data,stats,users]=await Promise.all([
      api('GET',`/api/leads?${p}`),
      api('GET',`/api/leads/stats?${statsP}`),
      api('GET','/api/users'),
    ]);
    if(!data) return;
    leadsData=data.items||[];
    leadsUsersData=Array.isArray(users)?users:[];
    // Auto-convert any 'new' leads: with fees → interested, without → not_answered
    const newLeads = leadsData.filter(l => l.status === 'new');
    if(newLeads.length > 0) {
      await Promise.all(newLeads.map(async l => {
        const derived = (l.quote_total_fees > 0) ? 'interested' : 'not_answered';
        l.status = derived; // update locally first
        try { await api('PUT', `/api/leads/${l.id}`, {status: derived}); } catch(e) {}
      }));
      // Re-fetch stats after bulk update
      const newStats = await api('GET', `/api/leads/stats?${statsP}`).catch(()=>stats);
      return renderLeads(newStats||stats);
    }
    renderLeads(stats);
  } catch(e){toast(e.message,'error')}
}

function renderLeads(stats) {
  const main=document.getElementById('main');
  main.className='page';
  main.innerHTML=`
  ${stats?`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:10px">
    <div class="stat-card" style="cursor:pointer;${leadsStatusFilter===''?'border:2px solid #1a2472;':''}" onclick="setLeadsStatusFilter('')"><div style="font-size:18px;font-weight:800;color:#1a2472">${stats.total}</div><div style="font-size:10px;color:#64748b;margin-top:2px">الإجمالي 🎯</div></div>
    <div class="stat-card" style="cursor:pointer;${leadsStatusFilter==='interested'?'border:2px solid #15803d;':''}" onclick="setLeadsStatusFilter('interested')"><div style="font-size:18px;font-weight:800;color:#15803d">${stats.interested||0}</div><div style="font-size:10px;color:#64748b;margin-top:2px">مهتم ⭐</div></div>
    <div class="stat-card" style="cursor:pointer;${leadsStatusFilter==='not_answered'?'border:2px solid #6b7280;':''}" onclick="setLeadsStatusFilter('not_answered')"><div style="font-size:18px;font-weight:800;color:#6b7280">${stats.not_answered||0}</div><div style="font-size:10px;color:#64748b;margin-top:2px">لم يرد 📵</div></div>
    <div class="stat-card" style="cursor:pointer;${leadsStatusFilter==='call_later'?'border:2px solid #d97706;':''}" onclick="setLeadsStatusFilter('call_later')"><div style="font-size:18px;font-weight:800;color:#d97706">${stats.call_later||0}</div><div style="font-size:10px;color:#64748b;margin-top:2px">كلمني لاحقاً 🔄</div></div>
    <div class="stat-card" style="cursor:pointer;${leadsStatusFilter==='quotation_sent'?'border:2px solid #f97316;':''}" onclick="setLeadsStatusFilter('quotation_sent')"><div style="font-size:18px;font-weight:800;color:#f97316">${stats.quotation_sent??stats.quotation??0}</div><div style="font-size:10px;color:#64748b;margin-top:2px">عرض مرسل 📄</div></div>
    <div class="stat-card" style="cursor:pointer;${leadsStatusFilter==='under_establishment'?'border:2px solid #0891b2;':''}" onclick="setLeadsStatusFilter('under_establishment')"><div style="font-size:18px;font-weight:800;color:#0891b2">${stats.under_establishment||0}</div><div style="font-size:10px;color:#64748b;margin-top:2px">قيد التأسيس 🏗️</div></div>
    <div class="stat-card" style="cursor:pointer;${leadsStatusFilter==='lost'?'border:2px solid #dc2626;':''}" onclick="setLeadsStatusFilter('lost')"><div style="font-size:18px;font-weight:800;color:#dc2626">${stats.lost||0}</div><div style="font-size:10px;color:#64748b;margin-top:2px">خسارة ❌</div></div>
  </div>`:''}
  <!-- Date filter bar -->
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
    ${[['all','الكل'],['today','اليوم'],['yesterday','أمس'],['this_week','هذا الأسبوع'],['this_month','هذا الشهر'],['last_month','الشهر الماضي'],['this_year','هذه السنة'],['custom','📅 مخصص']].map(([k,lbl])=>`
      <button onclick="setLeadsDateFilter('${k}')" style="padding:4px 12px;border-radius:18px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid ${leadsDateFilter===k?'#1a2472':'#e2e8f0'};background:${leadsDateFilter===k?'#1a2472':'#f8fafc'};color:${leadsDateFilter===k?'#fff':'#64748b'}">${lbl}</button>
    `).join('')}
    <div id="leadsCustomRange" style="display:${leadsDateFilter==='custom'?'flex':'none'};align-items:center;gap:6px">
      <input type="date" class="input" style="width:140px;font-size:12px" value="${leadsDateFrom}" onchange="setLeadsDateFrom(this.value)"/>
      <span style="color:#94a3b8;font-size:12px">→</span>
      <input type="date" class="input" style="width:140px;font-size:12px" value="${leadsDateTo}" onchange="setLeadsDateTo(this.value)"/>
    </div>
  </div>
  <!-- Search & status & actions bar -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <input id="leadsSearchInput" class="input" style="width:200px" placeholder="🔍 بحث بالاسم أو الهاتف..." value="${escH(leadsSearch)}"/>
      <select id="leadsStatusSelect" class="input" style="width:155px">
        <option value="">كل الحالات</option>
        ${Object.entries(LEAD_STATUS_LABEL).map(([v,l])=>`<option value="${v}" ${leadsStatusFilter===v?'selected':''}>${l}</option>`).join('')}
      </select>
      <span style="font-size:13px;color:#94a3b8;font-weight:500">${leadsData.length} عميل — <span style="color:#1a2472;font-weight:700">${LEADS_DATE_LABELS[leadsDateFilter]||'مخصص'}</span></span>
    </div>
    <button class="btn btn-primary" onclick="addLeadRow()">+ إضافة صف</button>
  </div>
  <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.05)">
    <table id="leadsGrid" style="width:100%;border-collapse:collapse;table-layout:fixed;min-width:1100px">
      <thead>
        <tr style="background:#1e3a5f;border-bottom:2px solid #1a2472">
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:82px">تاريخ التسجيل</th>
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:130px">اسم العميل *</th>
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:108px">رقم الهاتف</th>
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:148px">البريد الإلكتروني</th>
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:125px">نشاط الشركة</th>
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:140px">الكيان القانوني</th>
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:85px">المقر</th>
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:95px">رأس المال</th>
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:100px">الأتعاب (ج.م.)</th>
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:110px">الحالة</th>
          <th style="padding:8px 6px;font-size:11px;font-weight:700;color:#e2e8f0;text-align:center;white-space:nowrap;width:96px">إجراءات</th>
          <th style="padding:8px 4px;width:28px"></th>
        </tr>
      </thead>
      <tbody id="leadsGridBody">
        ${leadsData.map((l,i)=>_buildLeadRow(l,i)).join('')}
        ${leadsData.length===0?`<tr><td colspan="12" style="text-align:center;padding:55px;color:#94a3b8"><div style="font-size:38px;margin-bottom:10px">🎯</div><div style="font-size:15px;font-weight:600;color:#475569;margin-bottom:6px">لا يوجد عملاء في هذه الفترة</div><div style="font-size:13px;color:#94a3b8">${leadsDateFilter!=='all'?`الفلتر الحالي: <b>${LEADS_DATE_LABELS[leadsDateFilter]||'مخصص'}</b> — جرّب <span onclick="setLeadsDateFilter('all')" style="color:#1a2472;cursor:pointer;text-decoration:underline">عرض جميع البيانات</span>`:'اضغط "+ إضافة صف" لإضافة عميل جديد'}</div></td></tr>`:''}
      </tbody>
    </table>
  </div>`;
  const si=document.getElementById('leadsSearchInput');
  const ss=document.getElementById('leadsStatusSelect');
  if(si) {
    si.oninput=e=>{
      leadsSearch=e.target.value;
      clearTimeout(window._leadsSearchTimer);
      window._leadsSearchTimer=setTimeout(()=>{
        const sel=si.selectionStart, selE=si.selectionEnd;
        loadLeads().then(()=>{
          const inp=document.getElementById('leadsSearchInput');
          if(inp){inp.focus();try{inp.setSelectionRange(sel,selE);}catch(ex){}}
        });
      },350);
    };
    si.focus();
  }
  if(ss) ss.onchange=e=>{leadsStatusFilter=e.target.value;loadLeads()};
  _initLeadsColResize();
  _initLeadsKeyboard();
}

// ── LEADS: Excel-style column resize ─────────────────────────────────────────
function _initLeadsColResize() {
  const table = document.getElementById('leadsGrid');
  if (!table) return;
  const ths = table.querySelectorAll('thead th');
  ths.forEach((th) => {
    // skip tiny columns (action / expand button)
    if (th.offsetWidth < 40) return;
    th.style.position = 'relative';
    th.style.userSelect = 'none';

    const handle = document.createElement('div');
    handle.title = 'اسحب لتغيير عرض العمود';
    handle.style.cssText = [
      'position:absolute;top:0;left:0;width:7px;height:100%;',
      'cursor:col-resize;z-index:10;',
      'border-left:2px solid transparent;box-sizing:border-box;',
      'transition:border-color .12s',
    ].join('');

    handle.addEventListener('mouseenter', () => { handle.style.borderLeftColor = '#1a2472'; });
    handle.addEventListener('mouseleave', () => { if (!handle._dragging) handle.style.borderLeftColor = 'transparent'; });

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle._dragging = true;
      handle.style.borderLeftColor = '#4478b0';
      const startX = e.clientX;
      const startW = th.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (e) => {
        // RTL: mouse moves left → column gets wider
        const diff = startX - e.clientX;
        const w = Math.max(50, startW + diff);
        th.style.width = w + 'px';
        th.style.minWidth = w + 'px';
      };
      const onUp = () => {
        handle._dragging = false;
        handle.style.borderLeftColor = 'transparent';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    th.appendChild(handle);
  });
}

// ── LEADS: Keyboard nav — Enter/Tab on last cell adds a new row ───────────────
function _addLeadRowWhenReady() {
  // Poll until the current "new" row finishes saving, then add a fresh row
  const start = Date.now();
  function poll() {
    const saving = document.querySelector('#leadsGridBody tr[data-id="new"]');
    if (!saving) { addLeadRow(); }
    else if (Date.now() - start < 3000) { setTimeout(poll, 80); }
  }
  poll();
}

function _initLeadsKeyboard() {
  const tbody = document.getElementById('leadsGridBody');
  if (!tbody) return;

  tbody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const el = e.target;
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;

    const row = el.closest('tr[data-id]');
    if (!row) return;

    const allInputs = Array.from(row.querySelectorAll('input[data-field],select[data-field]'));
    const isLast = !e.shiftKey && el === allInputs[allInputs.length - 1];
    const isNew  = row.dataset.id === 'new';

    if (e.key === 'Enter' || (e.key === 'Tab' && isLast)) {
      if (isNew) {
        // Check there's a name, otherwise just move focus normally
        const nameEl = row.querySelector('[data-field="name"]');
        if (!nameEl || !nameEl.value.trim()) return; // no name → don't do anything special
        e.preventDefault();
        el.blur(); // trigger saveLeadCell
        _addLeadRowWhenReady(); // waits for save, then adds row
      } else if (e.key === 'Enter') {
        e.preventDefault();
        addLeadRow();
        setTimeout(() => {
          const nf = document.querySelector('#leadsGridBody tr[data-id="new"] [data-field="name"]');
          if (nf) nf.focus();
        }, 30);
      }
    }
  });
}

function _cellInput(field,val,extra=''){
  return `<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="width:100%;border:1px solid transparent;border-radius:6px;padding:4px 6px;font-size:12px;font-weight:600;font-family:inherit;background:transparent;outline:none;text-align:center;transition:border-color .15s,background .15s" data-field="${field}" value="${escH(val||'')}" ${extra} onfocus="this.style.borderColor='#4478b0';this.style.background='#fff'" onblur="this.style.borderColor='transparent';this.style.background='transparent';saveLeadCell(this)"/>`;
}
function _cellSelect(field,optsHtml,extraStyle=''){
  return `<select style="width:100%;border:1px solid #e2e8f0;border-radius:6px;padding:4px 5px;font-size:12px;font-weight:600;font-family:inherit;background:transparent;outline:none;cursor:pointer;text-align:center;${extraStyle}" data-field="${field}" onchange="saveLeadCell(this)">${optsHtml}</select>`;
}

function _buildLeadRow(l,idx=0){
  const sc=LEAD_STATUS_COLORS[l.status]||'#94a3b8';
  const statOpts=Object.entries(LEAD_STATUS_LABEL).map(([v,lbl])=>`<option value="${v}" ${l.status===v?'selected':''}>${lbl}</option>`).join('');
  const isEven = idx%2===0;
  const rowBg = isEven ? (LEAD_ROW_BG[l.status]||'#ffffff') : (LEAD_ROW_BG_ALT[l.status]||'#eef2ff');
  const isNew = !l.id;
  const expandId = `lead-expand-${l.id||'new'}`;
  const legalVal = l.quote_legal_entity || (COMPANY_TYPE_FULL[l.company_type||'']||'');
  const totalFeesVal = l.quote_total_fees!=null ? l.quote_total_fees : '';

  const fmtNum = v => (v!=null&&v!==''&&!isNaN(Number(v))) ? Number(v).toLocaleString('en-US') : '';
  const mainRow = `<tr data-id="${l.id||'new'}" style="border-bottom:${isNew?'2px solid #e0e7ff':'1px solid #d1d9e8'};background:${rowBg};border-right:3px solid ${sc}" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter=''">
    <td style="padding:3px 6px;white-space:nowrap;text-align:center"><span style="font-size:11px;font-weight:600;color:#374151">${l.created_at ? new Date(l.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}) : (l.id?'—':'جديد')}</span></td>
    <td style="padding:2px 5px;text-align:center">${_cellInput('name',l.name,'placeholder="الاسم *"')}</td>
    <td style="padding:2px 5px;text-align:center">${_cellInput('phone',l.phone,'placeholder="01x..." style="direction:ltr;text-align:center"')}</td>
    <td style="padding:2px 5px;text-align:center"><input autocomplete="off" autocorrect="off" spellcheck="false" style="width:100%;border:1px solid transparent;border-radius:6px;padding:4px 6px;font-size:12px;font-weight:600;font-family:inherit;background:transparent;outline:none;direction:ltr;text-align:center;transition:border-color .15s,background .15s" data-field="email" type="text" value="${escH(l.email||'')}" placeholder="email@..." onfocus="this.style.borderColor='#4478b0';this.style.background='#fff'" onblur="this.style.borderColor='transparent';this.style.background='transparent';saveLeadCell(this);_syncLeadInlineToState(this.closest('tr[data-id]'))"/></td>
    <td style="padding:2px 5px;text-align:center">${_cellInput('company_activities',l.company_activities,'placeholder="تجارة، خدمات..."')}</td>
    <td style="padding:2px 5px;text-align:center"><input autocomplete="off" autocorrect="off" spellcheck="false" style="width:100%;border:1px solid transparent;border-radius:6px;padding:4px 6px;font-size:12px;font-weight:600;font-family:inherit;background:transparent;outline:none;text-align:center;transition:border-color .15s,background .15s" data-field="quote_legal_entity" value="${escH(legalVal)}" placeholder="ش.م.م / فردي..." onfocus="this.style.borderColor='#4478b0';this.style.background='#fff'" onblur="this.style.borderColor='transparent';this.style.background='transparent';saveLeadCell(this);_syncLeadInlineToState(this.closest('tr[data-id]'))"/></td>
    <td style="padding:2px 5px;text-align:center">${_cellInput('quote_location',l.quote_location||'','placeholder="القاهرة..."')}</td>
    <td style="padding:2px 5px;text-align:center"><input autocomplete="off" style="width:100%;border:1px solid transparent;border-radius:6px;padding:4px 6px;font-size:12px;font-weight:600;font-family:inherit;background:transparent;outline:none;text-align:center;direction:ltr" data-field="estimated_capital" type="text" inputmode="numeric" value="${escH(fmtNum(l.estimated_capital!=null?l.estimated_capital:''))}" placeholder="0" onfocus="this.value=this.value.replace(/,/g,'');this.style.borderColor='#4478b0';this.style.background='#fff'" onblur="const n=parseFloat(this.value.replace(/,/g,''));this.value=isNaN(n)?'':n.toLocaleString('en-US');this.style.borderColor='transparent';this.style.background='transparent';saveLeadCell(this)" /></td>
    <td style="padding:2px 5px;text-align:center"><input autocomplete="off" style="width:100%;border:1px solid transparent;border-radius:6px;padding:4px 6px;font-size:12px;font-weight:600;font-family:inherit;background:transparent;outline:none;text-align:center;direction:ltr" data-field="quote_total_fees" type="text" inputmode="numeric" value="${escH(fmtNum(totalFeesVal))}" placeholder="0" onfocus="this.value=this.value.replace(/,/g,'');this.style.borderColor='#4478b0';this.style.background='#fff'" onblur="const n=parseFloat(this.value.replace(/,/g,''));this.value=isNaN(n)?'':n.toLocaleString('en-US');this.style.borderColor='transparent';this.style.background='transparent';saveLeadCell(this);_syncLeadInlineToState(this.closest('tr[data-id]'))"/></td>
    <td style="padding:2px 5px;text-align:center">${_cellSelect('status',statOpts,`background:${sc}18;color:${sc};font-weight:700;border-color:${sc}44`)}</td>
    <td style="padding:2px 5px;text-align:center;white-space:nowrap">
      ${l.id ? `<div style="display:flex;align-items:center;justify-content:center;gap:3px;flex-wrap:nowrap">
        <button onclick="toggleLeadExpand(${l.id})" id="expand-btn-${l.id}"
          style="background:#eef1fb;color:#1a2472;border:1px solid #c7d3ef;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s"
          title="توسيع — عرض السعر والإرسال">▾</button>
        <button onclick="sendLeadWhatsApp(${l.id})"
          style="background:#25d366;color:white;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center"
          title="واتساب">📱</button>
        <button onclick="sendLeadEmailDirect(${l.id})"
          style="background:#1a2472;color:white;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center"
          title="بريد إلكتروني">✉️</button>
        ${l.status !== 'under_establishment' ? `<button onclick="markLeadUnderEstablishment(${l.id},event)"
          style="background:#0891b2;color:white;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center"
          title="بدء التأسيس — تحويل لقيد التأسيس">⭐</button>` : `<button onclick="navigate('under_establishment_clients')"
          style="background:#ecfeff;color:#0891b2;border:1px solid #0891b2;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center"
          title="قيد التأسيس — اضغط لعرض الصفحة">🏗️</button>`}
      </div>` : `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <span style="font-size:9px;color:#94a3b8;line-height:1.2">اكتب الاسم للحفظ 💾</span>
        <button onclick="saveLeadAsNotAnswered(this)" style="background:#6b7280;color:white;border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;transition:background .15s" onmouseover="this.style.background='#4b5563'" onmouseout="this.style.background='#6b7280'" title="احفظ برقم لم يرد وأرسل واتساب">📵 لم يرد</button>
      </div>`}
    </td>
    <td style="padding:3px 6px;text-align:center"><button onclick="${l.id?`deleteLeadRow(${l.id})`:`this.closest('tr[data-id]').remove()`}" style="background:none;border:none;color:#d1d5db;cursor:pointer;font-size:15px;line-height:1;padding:2px 4px" title="حذف" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#d1d5db'">✕</button></td>
  </tr>`;

  const expandRow = l.id ? `<tr id="${expandId}" style="display:none"><td colspan="12" style="padding:0;border-bottom:2px solid #c7d3ef">${_buildLeadExpandPanel(l)}</td></tr>` : '';

  return mainRow + expandRow;
}

// Auto-fill legal entity from company type dropdown
function _onLeadCompanyTypeChange(sel){
  const row = sel.closest('tr[data-id]');
  if(!row) return;
  const legalInp = row.querySelector('[data-field="quote_legal_entity"]');
  if(!legalInp) return;
  const full = COMPANY_TYPE_FULL[sel.value] || '';
  legalInp.value = full;
  // sync to expand state
  const id = parseInt(row.dataset.id);
  if(id && _leadExpandState[id]) _leadExpandState[id].legal_entity = full;
}

// Sync inline row fields (email, legal_entity, total_fees) into _leadExpandState
function _syncLeadInlineToState(row){
  if(!row) return;
  const id = parseInt(row.dataset.id);
  if(!id || isNaN(id)) return;
  if(!_leadExpandState[id]) return;
  const emailEl = row.querySelector('[data-field="email"]');
  const legalEl = row.querySelector('[data-field="quote_legal_entity"]');
  const feesEl  = row.querySelector('[data-field="quote_total_fees"]');
  const locEl   = row.querySelector('[data-field="quote_location"]');
  if(emailEl) _leadExpandState[id].email = emailEl.value || '';
  if(legalEl) _leadExpandState[id].legal_entity = legalEl.value || '';
  if(feesEl)  _leadExpandState[id].total_fees = feesEl.value !== '' ? parseFloat(feesEl.value.replace(/[,،٬]/g,'')) : '';
  if(locEl)   _leadExpandState[id].location = locEl.value || '';
}

function _getLeadExpandState(l) {
  if (!_leadExpandState[l.id]) {
    // Initialize from saved data or defaults
    let deliverables, reqDocs;
    try { deliverables = l.quote_deliver_docs ? JSON.parse(l.quote_deliver_docs) : null; } catch(e) { deliverables = null; }
    try { reqDocs = l.quote_required_docs ? JSON.parse(l.quote_required_docs) : null; } catch(e) { reqDocs = null; }
    _leadExpandState[l.id] = {
      email: l.email || '',
      legal_entity: l.quote_legal_entity || '',
      activity: l.quote_activity || l.company_activities || '',
      capital: l.quote_capital != null ? l.quote_capital : (l.estimated_capital || ''),
      total_fees: l.quote_total_fees || l.quote_expenses_total || '',
      notes2: l.quote_notes || '',
      extra: l.losses_detail || '',
      deliverables: deliverables || LEAD_DEFAULT_DELIVERABLES.map(t => ({text: t, checked: true})),
      reqDocs: reqDocs || LEAD_DEFAULT_REQUIRED_DOCS.map(t => ({text: t, checked: true})),
    };
  }
  return _leadExpandState[l.id];
}

function _buildLeadExpandPanel(l) {
  const st = _getLeadExpandState(l);
  const inp = (field, val, extra='') => `<input
    autocomplete="off" autocorrect="off" spellcheck="false"
    style="width:100%;border:1px solid #e2e8f0;border-radius:7px;padding:6px 9px;font-size:12.5px;font-family:inherit;outline:none;transition:border-color .15s"
    data-expand-id="${l.id}" data-expand-field="${field}" value="${escH(String(val||''))}" ${extra}
    onfocus="this.style.borderColor='#1a2472'"
    onblur="this.style.borderColor='#e2e8f0';_saveLeadExpandField(${l.id},this.dataset.expandField,this.value)"/>`;

  const chkList = (items, listKey, containerId) => `
    <div id="${containerId}" style="display:flex;flex-direction:column;gap:5px">
      ${items.map((item, idx) => `
        <div id="${containerId}-item-${idx}" style="display:flex;align-items:center;gap:6px">
          <input type="checkbox" ${item.checked?'checked':''} style="width:15px;height:15px;accent-color:#1a2472;cursor:pointer;flex-shrink:0"
            onchange="_toggleLeadExpandCheck(${l.id},'${listKey}',${idx},this.checked)"/>
          <input style="flex:1;border:none;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-size:12px;font-family:inherit;outline:none;background:transparent"
            value="${escH(item.text)}"
            onblur="_editLeadExpandCheckText(${l.id},'${listKey}',${idx},this.value)"/>
          <button onclick="_removeLeadExpandCheck(${l.id},'${listKey}',${idx},'${containerId}')"
            style="background:none;border:none;color:#d1d5db;cursor:pointer;font-size:13px;padding:0 2px;flex-shrink:0"
            onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#d1d5db'">✕</button>
        </div>`).join('')}
    </div>
    <button onclick="_addLeadExpandCheck(${l.id},'${listKey}','${containerId}')"
      style="margin-top:6px;background:none;border:1px dashed #c7d3ef;border-radius:6px;color:#4478b0;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit;width:100%">+ إضافة عنصر</button>`;

  return `
  <div style="background:linear-gradient(to bottom,#f0f4ff,#f8fafc);padding:16px 22px;border-right:4px solid #1a2472">
    <div style="display:grid;grid-template-columns:repeat(3,1fr) repeat(2,1fr);gap:10px;margin-bottom:16px">
      <div>
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">البريد الإلكتروني</div>
        ${inp('email', st.email, 'type="text" placeholder="example@email.com" style="direction:ltr"')}
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">الكيان القانوني</div>
        ${inp('legal_entity', st.legal_entity, 'placeholder="ش.م.م / فردي..."')}
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">النشاط (عرض السعر)</div>
        ${inp('activity', st.activity, 'placeholder="تجارة، مقاولات..."')}
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">رأس المال (جنيه)</div>
        ${inp('capital', st.capital, 'type="number" placeholder="0" style="direction:ltr"')}
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">إجمالي مصاريف وأتعاب التأسيس (جنيه)</div>
        ${inp('total_fees', st.total_fees, 'type="number" placeholder="أدخل الإجمالي" style="direction:ltr"')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div>
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">ملاحظات إضافية</div>
        <textarea autocomplete="off" spellcheck="false" data-expand-id="${l.id}" data-expand-field="notes2"
          style="width:100%;border:1px solid #e2e8f0;border-radius:7px;padding:6px 9px;font-size:12px;font-family:inherit;outline:none;resize:vertical;min-height:56px"
          placeholder="ملاحظات تضاف لنهاية الرسالة..."
          onfocus="this.style.borderColor='#1a2472'" onblur="this.style.borderColor='#e2e8f0';_saveLeadExpandField(${l.id},'notes2',this.value)">${escH(st.notes2)}</textarea>
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">تفاصيل إضافية</div>
        <textarea autocomplete="off" spellcheck="false" data-expand-id="${l.id}" data-expand-field="extra"
          style="width:100%;border:1px solid #e2e8f0;border-radius:7px;padding:6px 9px;font-size:12px;font-family:inherit;outline:none;resize:vertical;min-height:56px"
          placeholder="أي تفاصيل أخرى..."
          onfocus="this.style.borderColor='#1a2472'" onblur="this.style.borderColor='#e2e8f0';_saveLeadExpandField(${l.id},'extra',this.value)">${escH(st.extra)}</textarea>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px">
      <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:#1a2472;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          ✅ حضرتك هتستلم مننا:
        </div>
        ${chkList(st.deliverables, 'deliverables', `chk-del-${l.id}`)}
      </div>
      <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:#1a2472;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          📋 هحتاج من حضرتك:
        </div>
        ${chkList(st.reqDocs, 'reqDocs', `chk-req-${l.id}`)}
      </div>
    </div>

    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button onclick="sendLeadWhatsApp(${l.id})"
        style="display:flex;align-items:center;gap:6px;background:#25d366;color:white;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
        📱 إرسال واتساب
      </button>
      <button onclick="sendLeadEmailDirect(${l.id})"
        style="display:flex;align-items:center;gap:6px;background:#1a2472;color:white;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
        ✉️ إرسال بريد إلكتروني
      </button>
      <button onclick="_saveLeadExpandAll(${l.id})"
        style="display:flex;align-items:center;gap:6px;background:#f0fdf4;color:#15803d;border:1px solid #86efac;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
        💾 حفظ
      </button>
      <button onclick="toggleLeadExpand(${l.id})"
        style="background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;font-family:inherit">
        ▴ طي
      </button>
      <div id="expand-save-status-${l.id}" style="font-size:12px;color:#15803d"></div>
    </div>
  </div>`;
}

window.toggleLeadExpand = function(id) {
  const row = document.getElementById(`lead-expand-${id}`);
  const btn = document.getElementById(`expand-btn-${id}`);
  if (!row) return;
  const isOpen = row.style.display !== 'none';
  if (!isOpen) {
    // sync inline fields to expand state before opening
    const mainRow = document.querySelector(`tr[data-id="${id}"]`);
    if (mainRow) _syncLeadInlineToState(mainRow);
  }
  row.style.display = isOpen ? 'none' : '';
  if (btn) btn.textContent = isOpen ? '▾' : '▴';
};

window._saveLeadExpandField = async function(id, field, value) {
  const st = _leadExpandState[id];
  if (!st) return;
  st[field] = value;
  // Map expand fields to backend fields
  const fieldMap = {
    email: 'email',
    legal_entity: 'quote_legal_entity',
    activity: 'quote_activity',
    capital: 'quote_capital',
    total_fees: 'quote_total_fees',
    notes2: 'quote_notes',
    extra: 'losses_detail',
  };
  const backendField = fieldMap[field];
  if (!backendField) return;
  const parsedVal = (field==='capital'||field==='total_fees') ? (parseFloat(value)||null) : (value||null);
  try {
    await api('PUT', `/api/leads/${id}`, {[backendField]: parsedVal,
      ...(field==='total_fees' ? {quote_expenses_total: parsedVal} : {})
    });
    const lead = leadsData.find(l=>l.id===id);
    if (lead) lead[backendField] = parsedVal;
    const statusEl = document.getElementById(`expand-save-status-${id}`);
    if (statusEl) { statusEl.textContent = '✓ محفوظ'; setTimeout(()=>{if(statusEl)statusEl.textContent='';},1500); }
  } catch(e) { console.warn('expand save failed:', e); }
};

window._saveLeadExpandAll = async function(id) {
  const st = _leadExpandState[id];
  if (!st) return;
  const statusEl = document.getElementById(`expand-save-status-${id}`);
  try {
    const updated = await api('PUT', `/api/leads/${id}`, {
      email: st.email || null,
      quote_legal_entity: st.legal_entity || null,
      quote_activity: st.activity || null,
      quote_capital: parseFloat(st.capital) || null,
      quote_total_fees: parseFloat(st.total_fees) || null,
      quote_expenses_total: parseFloat(st.total_fees) || null,
      quote_notes: st.notes2 || null,
      losses_detail: st.extra || null,
      quote_deliver_docs: JSON.stringify(st.deliverables),
      quote_required_docs: JSON.stringify(st.reqDocs),
    });
    const idx = leadsData.findIndex(l=>l.id===id);
    if (idx>=0) leadsData[idx] = updated;
    if (statusEl) { statusEl.textContent = '✅ تم الحفظ'; setTimeout(()=>{if(statusEl)statusEl.textContent='';},2000); }
    toast('تم حفظ البيانات ✓');
  } catch(e) { toast(e.message,'error'); }
};

window._toggleLeadExpandCheck = function(id, listKey, idx, checked) {
  const st = _leadExpandState[id];
  if (st && st[listKey] && st[listKey][idx]) {
    st[listKey][idx].checked = checked;
  }
};
window._editLeadExpandCheckText = function(id, listKey, idx, text) {
  const st = _leadExpandState[id];
  if (st && st[listKey] && st[listKey][idx]) {
    st[listKey][idx].text = text;
  }
};
window._removeLeadExpandCheck = function(id, listKey, idx, containerId) {
  const st = _leadExpandState[id];
  if (!st || !st[listKey]) return;
  st[listKey].splice(idx, 1);
  // Rebuild the checklist in place
  const lead = leadsData.find(l=>l.id===id);
  if (!lead) return;
  const container = document.getElementById(containerId);
  if (!container) return;
  const wrapper = container.parentElement;
  if (!wrapper) return;
  wrapper.innerHTML = `<div style="font-size:12px;font-weight:700;color:#1a2472;margin-bottom:10px">${listKey==='deliverables'?'✅ حضرتك هتستلم مننا:':'📋 هحتاج من حضرتك:'}</div>` +
    _buildChecklistHTML(st[listKey], listKey, containerId, id);
};
window._addLeadExpandCheck = function(id, listKey, containerId) {
  const st = _leadExpandState[id];
  if (!st || !st[listKey]) return;
  const idx = st[listKey].length;
  st[listKey].push({text: '', checked: true});
  const container = document.getElementById(containerId);
  if (!container) return;
  const itemDiv = document.createElement('div');
  itemDiv.id = `${containerId}-item-${idx}`;
  itemDiv.style.cssText = 'display:flex;align-items:center;gap:6px';
  itemDiv.innerHTML = `
    <input type="checkbox" checked style="width:15px;height:15px;accent-color:#1a2472;cursor:pointer;flex-shrink:0"
      onchange="_toggleLeadExpandCheck(${id},'${listKey}',${idx},this.checked)"/>
    <input style="flex:1;border:none;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-size:12px;font-family:inherit;outline:none;background:transparent"
      placeholder="اكتب العنصر..." autofocus
      onblur="_editLeadExpandCheckText(${id},'${listKey}',${idx},this.value)"/>
    <button onclick="_removeLeadExpandCheck(${id},'${listKey}',${idx},'${containerId}')"
      style="background:none;border:none;color:#d1d5db;cursor:pointer;font-size:13px;padding:0 2px;flex-shrink:0"
      onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#d1d5db'">✕</button>`;
  container.insertBefore(itemDiv, container.lastElementChild);
  itemDiv.querySelector('input[type="text"], input:not([type="checkbox"])').focus?.();
};

function _buildChecklistHTML(items, listKey, containerId, leadId) {
  return `<div id="${containerId}" style="display:flex;flex-direction:column;gap:5px">
    ${items.map((item, idx) => `
      <div id="${containerId}-item-${idx}" style="display:flex;align-items:center;gap:6px">
        <input type="checkbox" ${item.checked?'checked':''} style="width:15px;height:15px;accent-color:#1a2472;cursor:pointer;flex-shrink:0"
          onchange="_toggleLeadExpandCheck(${leadId},'${listKey}',${idx},this.checked)"/>
        <input style="flex:1;border:none;border-bottom:1px solid #e2e8f0;padding:2px 4px;font-size:12px;font-family:inherit;outline:none;background:transparent"
          value="${escH(item.text)}"
          onblur="_editLeadExpandCheckText(${leadId},'${listKey}',${idx},this.value)"/>
        <button onclick="_removeLeadExpandCheck(${leadId},'${listKey}',${idx},'${containerId}')"
          style="background:none;border:none;color:#d1d5db;cursor:pointer;font-size:13px;padding:0 2px;flex-shrink:0"
          onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#d1d5db'">✕</button>
      </div>`).join('')}
  </div>
  <button onclick="_addLeadExpandCheck(${leadId},'${listKey}','${containerId}')"
    style="margin-top:6px;background:none;border:1px dashed #c7d3ef;border-radius:6px;color:#4478b0;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit;width:100%">+ إضافة عنصر</button>`;
}

async function saveLeadCell(el) {
  const row=el.closest('tr[data-id]');
  if(!row) return;
  const rowId=row.dataset.id;
  const field=el.dataset.field;
  let value;
  const _numFields=['quote_total_fees','estimated_capital'];
  if(el.type==='checkbox') value=el.checked;
  else if(el.type==='number') value=el.value!==''?parseFloat(el.value):null;
  else if(_numFields.includes(field)){const raw=el.value.replace(/,/g,'');value=raw!==''&&!isNaN(Number(raw))?parseFloat(raw):null;}
  else value=el.value||null;

  if(rowId==='new' || rowId.startsWith('new-')){
    const nameEl=row.querySelector('[data-field="name"]');
    if(!nameEl||!nameEl.value.trim()) return;
    if(row._saving) return;
    row._saving=true;
    const body={status:'new'};
    row.querySelectorAll('[data-field]').forEach(inp=>{
      const f=inp.dataset.field;
      if(inp.type==='checkbox') body[f]=inp.checked;
      else if(inp.type==='number') body[f]=inp.value!==''?parseFloat(inp.value):null;
      else if(_numFields.includes(f)){const r=inp.value.replace(/,/g,'');body[f]=r!==''&&!isNaN(Number(r))?parseFloat(r):null;}
      else body[f]=inp.value||null;
    });
    try {
      const result=await api('POST','/api/leads',body);
      row._saving=false;
      if(!result) return;
      leadsData.push(result);
      // ── In-place upgrade: keep existing inputs intact, just update IDs and state ──
      row.dataset.id = result.id; // assign real DB id — no HTML rebuild
      // Update code badge
      const codeBadge=row.querySelector('td:first-child span');
      if(codeBadge) codeBadge.textContent=result.code||'';
      // Update row border to normal (was blue for new rows)
      row.style.borderBottom='1px solid #f1f5f9';
      // Replace "اكتب الاسم" placeholder with real action buttons
      const actionTd=row.querySelector('td:nth-last-child(2)');
      if(actionTd) actionTd.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;gap:3px;flex-wrap:nowrap">
        <button onclick="toggleLeadExpand(${result.id})" id="expand-btn-${result.id}" style="background:#eef1fb;color:#1a2472;border:1px solid #c7d3ef;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s" title="توسيع">▾</button>
        <button onclick="sendLeadWhatsApp(${result.id})" style="background:#25d366;color:white;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center" title="واتساب">📱</button>
        <button onclick="sendLeadEmailDirect(${result.id})" style="background:#1a2472;color:white;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center" title="بريد إلكتروني">✉️</button>
      </div>`;
      // Update delete button to use real id
      const delBtn=row.querySelector('td:last-child button');
      if(delBtn) delBtn.setAttribute('onclick',`deleteLeadRow(${result.id})`);
      // Silently append expand panel row (hidden) after this row
      const expTmp=document.createElement('table');
      expTmp.innerHTML=`<tbody><tr id="lead-expand-${result.id}" style="display:none"><td colspan="12" style="padding:0;border-bottom:2px solid #c7d3ef">${_buildLeadExpandPanel(result)}</td></tr></tbody>`;
      row.insertAdjacentElement('afterend',expTmp.querySelector('tr'));
      // Flash green
      row.style.background='#dcfce7';
      setTimeout(()=>{row.style.background='';row.style.transition='background .6s';},800);
    } catch(err){row._saving=false;toast(err.message,'error');}
    return;
  }

  const id=parseInt(rowId);
  if(!id||isNaN(id)) return;

  const origColor=el.style.borderColor;
  el.style.borderColor='#f59e0b';
  try {
    await api('PUT',`/api/leads/${id}`,{[field]:value});
    if(field==='status'){
      const sc=LEAD_STATUS_COLORS[value]||'#94a3b8';
      el.style.background=`${sc}18`;
      el.style.color=sc;
      el.style.borderColor=`${sc}44`;
      // Update row background
      const row2=el.closest('tr');
      if(row2) row2.style.background=LEAD_ROW_BG[value]||'';
      // Auto WhatsApp for "لم يرد"
      if(value==='not_answered'){
        const rowId2 = el.closest('tr[data-id]')?.dataset.id;
        const lead2 = leadsData.find(l=>l.id===parseInt(rowId2));
        if(lead2?.phone) sendLeadNoAnswerWhatsApp(lead2);
      }
    } else {
      el.style.borderColor='#10b981';
      setTimeout(()=>{if(el!==document.activeElement)el.style.borderColor='transparent';},1000);
    }
    const lead=leadsData.find(l=>l.id===id);
    if(lead) lead[field]=value;
  } catch(err){
    el.style.borderColor='#ef4444';
    toast(err.message,'error');
  }
}

async function saveLeadAsNotAnswered(btn) {
  const row = btn.closest('tr[data-id]');
  if (!row) return;
  const nameEl  = row.querySelector('[data-field="name"]');
  const phoneEl = row.querySelector('[data-field="phone"]');
  if (!nameEl?.value.trim())  { toast('اكتب الاسم أولاً', 'error'); nameEl?.focus(); return; }
  if (!phoneEl?.value.trim()) { toast('اكتب رقم الهاتف أولاً', 'error'); phoneEl?.focus(); return; }
  if (row._saving) return;
  row._saving = true;
  btn.disabled = true;
  btn.textContent = '⏳';

  const body = { status: 'not_answered' };
  row.querySelectorAll('[data-field]').forEach(inp => {
    const f = inp.dataset.field;
    if (inp.type === 'checkbox') body[f] = inp.checked;
    else if (inp.type === 'number') body[f] = inp.value !== '' ? parseFloat(inp.value) : null;
    else body[f] = inp.value || null;
  });

  try {
    const result = await api('POST', '/api/leads', body);
    row._saving = false;
    if (!result) { btn.disabled = false; btn.textContent = '📵 لم يرد'; return; }
    leadsData.push(result);

    // In-place upgrade
    row.dataset.id = result.id;
    const codeBadge = row.querySelector('td:first-child span');
    if (codeBadge) codeBadge.textContent = result.code || '';
    row.style.borderBottom = '1px solid #f1f5f9';
    row.style.background = LEAD_ROW_BG['not_answered'] || '#f1f5f9';

    const sc = LEAD_STATUS_COLORS['not_answered'] || '#6b7280';
    const statusSel = row.querySelector('[data-field="status"]');
    if (statusSel) {
      statusSel.value = 'not_answered';
      statusSel.style.background = `${sc}18`;
      statusSel.style.color = sc;
      statusSel.style.borderColor = `${sc}44`;
    }

    const actionTd = row.querySelector('td:nth-last-child(2)');
    if (actionTd) actionTd.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:3px;flex-wrap:nowrap">
      <button onclick="toggleLeadExpand(${result.id})" id="expand-btn-${result.id}" style="background:#eef1fb;color:#1a2472;border:1px solid #c7d3ef;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s" title="توسيع">▾</button>
      <button onclick="sendLeadWhatsApp(${result.id})" style="background:#25d366;color:white;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center" title="واتساب">📱</button>
      <button onclick="sendLeadEmailDirect(${result.id})" style="background:#1a2472;color:white;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center" title="بريد إلكتروني">✉️</button>
    </div>`;

    const delBtn = row.querySelector('td:last-child button');
    if (delBtn) delBtn.setAttribute('onclick', `deleteLeadRow(${result.id})`);

    const expTmp = document.createElement('table');
    expTmp.innerHTML = `<tbody><tr id="lead-expand-${result.id}" style="display:none"><td colspan="12" style="padding:0;border-bottom:2px solid #c7d3ef">${_buildLeadExpandPanel(result)}</td></tr></tbody>`;
    row.insertAdjacentElement('afterend', expTmp.querySelector('tr'));

    toast('✅ تم الحفظ — جاري فتح واتساب...');
    sendLeadNoAnswerWhatsApp(result);
  } catch(err) {
    row._saving = false;
    btn.disabled = false;
    btn.textContent = '📵 لم يرد';
    toast(err.message, 'error');
  }
}
window.saveLeadAsNotAnswered = saveLeadAsNotAnswered;

function addLeadRow() {
  const tbody=document.getElementById('leadsGridBody');
  if(!tbody){loadLeads();return;}
  // Remove empty-state placeholder row if present
  const emptyRow = tbody.querySelector('td[colspan="12"]');
  if(emptyRow) emptyRow.closest('tr')?.remove();

  // Generate unique temp ID for this new row
  const tempId = 'new-' + (++_newRowCounter);
  const newLead={id:null,code:null,name:'',phone:'',email:'',company_activities:'',company_type:'',estimated_capital:null,has_office:false,suggested_name:'',status:'new',meeting_date:null,assigned_to:null,notes:'',quote_location:'',quote_legal_entity:'',quote_total_fees:null};
  const tmp=document.createElement('table');
  tmp.innerHTML=`<tbody>${_buildLeadRow(newLead)}</tbody>`;
  const tr = tmp.querySelector('tr');
  tr.dataset.id = tempId; // override data-id with unique temp ID
  tr.style.background='#f0fdf4';
  tbody.prepend(tr);
  tr.scrollIntoView({behavior:'smooth',block:'nearest'});
  const n=tr.querySelector('[data-field="name"]');
  if(n){n.focus();n.style.borderColor='#4478b0';n.style.background='#fff';}
}

async function deleteLeadRow(id) {
  if(!id){
    const nr=document.querySelector('tr[data-id="new"]');
    if(nr) nr.remove();
    return;
  }
  if(!await confirmDlg('حذف هذا العميل المحتمل؟')) return;
  try {
    await api('DELETE',`/api/leads/${id}`);
    const row=document.querySelector(`tr[data-id="${id}"]`);
    if(row) row.remove();
    const expRow=document.getElementById(`lead-expand-${id}`);
    if(expRow) expRow.remove();
    delete _leadExpandState[id];
    leadsData=leadsData.filter(l=>l.id!==id);
    toast('تم الحذف');
  } catch(e){toast(e.message,'error');}
}

// ── LEAD DETAIL MODAL ─────────────────────────────
async function showLeadDetail(id) {
  let lead;
  try { lead = await api('GET', `/api/leads/${id}`); }
  catch(e) { toast(e.message,'error'); return; }

  // Parse JSON fields safely
  let services = [];
  try { services = JSON.parse(lead.quote_services||'[]'); } catch(e){}
  let reqDocs = [];
  try { reqDocs = JSON.parse(lead.quote_required_docs||'[]'); } catch(e){}

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px';

  const COMPANY_TYPE_OPTS_FULL={'':'—',llc:'شركة ذات مسؤولية محدودة',jsc:'شركة مساهمة',sole:'فردي',ngo:'جمعية',branch:'فرع',rep:'مكتب تمثيلي',other:'أخرى'};
  const statusColors=LEAD_STATUS_COLORS;
  const statusLabel=LEAD_STATUS_LABEL;

  function fmtMoney(v){ return v!=null?Number(v).toLocaleString('ar-EG')+' جنيه':'—'; }
  function fmtDt(v){ if(!v)return '—'; const d=new Date(v); return d.toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}); }

  const serviceRows = services.map((s,i)=>
    `<tr id="qs-row-${i}" style="border-bottom:1px solid #f1f5f9">
      <td style="padding:6px 8px"><input class="input" style="font-size:12px;padding:4px 8px" value="${escH(s.name||'')}" oninput="window._qsServices[${i}].name=this.value;_qsCalc()"/></td>
      <td style="padding:6px 8px"><input class="input" type="number" style="font-size:12px;padding:4px 8px;width:110px;direction:ltr" value="${s.price||0}" oninput="window._qsServices[${i}].price=parseFloat(this.value)||0;_qsCalc()"/></td>
      <td style="padding:6px 4px;text-align:center"><button onclick="window._qsServices.splice(${i},1);document.getElementById('qs-row-${i}').remove();_qsCalc()" style="background:none;border:none;color:#d1d5db;cursor:pointer;font-size:14px" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#d1d5db'">✕</button></td>
    </tr>`
  ).join('');

  const docsHtml = reqDocs.map((d,i)=>
    `<div id="qd-${i}" style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <input class="input" style="flex:1;font-size:12px;padding:4px 8px" value="${escH(d)}" oninput="window._qsDocs[${i}]=this.value"/>
      <button onclick="window._qsDocs.splice(${i},1);document.getElementById('qd-${i}').remove()" style="background:none;border:none;color:#d1d5db;cursor:pointer;font-size:14px" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#d1d5db'">✕</button>
    </div>`
  ).join('');

  overlay.innerHTML = `
  <div style="background:#fff;border-radius:18px;width:100%;max-width:900px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a2472,#152060);color:white;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <div style="font-size:11px;color:#b3c4e8;margin-bottom:3px">${escH(lead.code||'')}</div>
        <div style="font-size:20px;font-weight:800">${escH(lead.name)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="background:${statusColors[lead.status]||'#94a3b8'}22;color:${statusColors[lead.status]||'#94a3b8'};border:1px solid ${statusColors[lead.status]||'#94a3b8'}44;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700">${statusLabel[lead.status]||lead.status}</span>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,.15);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1">✕</button>
      </div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;border-bottom:2px solid #e2e8f0;background:#f8fafc;flex-shrink:0">
      <button id="ld-tab-info" onclick="_ldTab('info')" style="padding:12px 22px;font-size:13px;font-weight:700;border:none;background:#fff;border-bottom:3px solid #1a2472;color:#1a2472;cursor:pointer;font-family:inherit">👤 بيانات العميل</button>
      <button id="ld-tab-quote" onclick="_ldTab('quote')" style="padding:12px 22px;font-size:13px;font-weight:600;border:none;background:transparent;border-bottom:3px solid transparent;color:#64748b;cursor:pointer;font-family:inherit">💼 عرض السعر</button>
      <button id="ld-tab-activity" onclick="_ldTab('activity')" style="padding:12px 22px;font-size:13px;font-weight:600;border:none;background:transparent;border-bottom:3px solid transparent;color:#64748b;cursor:pointer;font-family:inherit">📋 النشاطات</button>
    </div>

    <!-- Body (scrollable) -->
    <div id="ld-body" style="flex:1;overflow-y:auto;padding:24px 28px">

      <!-- TAB: Info -->
      <div id="ld-pane-info">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${_ldField('الاسم','name',lead.name)}
          ${_ldField('رقم الهاتف','phone',lead.phone,'tel')}
          ${_ldField('البريد الإلكتروني','email',lead.email,'email')}
          ${_ldField('نشاط الشركة','company_activities',lead.company_activities)}
          ${_ldSelectField('الكيان القانوني','company_type',lead.company_type,COMPANY_TYPE_OPTS_FULL)}
          ${_ldField('رأس المال','estimated_capital',lead.estimated_capital,'number')}
          ${_ldField('المحافظة / الموقع','governorate',lead.governorate)}
          ${_ldField('الاسم المقترح','suggested_name',lead.suggested_name)}
          ${_ldField('الأسماء المقترحة (قائمة)','proposed_names',lead.proposed_names)}
          ${_ldField('موعد الميتينج','meeting_date',lead.meeting_date?lead.meeting_date.slice(0,16):null,'datetime-local')}
          ${_ldField('موعد المتابعة','follow_up_date',lead.follow_up_date?lead.follow_up_date.slice(0,16):null,'datetime-local')}
          ${_ldSelectField('الحالة','status',lead.status,LEAD_STATUS_LABEL)}
        </div>
        <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#374151;cursor:pointer">
            <input type="checkbox" id="ld-has_office" ${lead.has_office?'checked':''} style="width:16px;height:16px;accent-color:#1a2472"/>
            يوجد مقر
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#374151;cursor:pointer">
            <input type="checkbox" id="ld-has_existing_companies" ${lead.has_existing_companies?'checked':''} style="width:16px;height:16px;accent-color:#1a2472"/>
            يوجد شركات قائمة
          </label>
        </div>
        <div style="margin-top:14px">
          <label class="form-label">ملاحظات</label>
          <textarea id="ld-notes" class="input" rows="3" style="width:100%;resize:vertical">${escH(lead.notes||'')}</textarea>
        </div>
        <div style="margin-top:16px;text-align:left">
          <button id="ld-save-info" class="btn btn-primary" onclick="saveLeadInfo(${lead.id})">💾 حفظ البيانات</button>
        </div>
      </div>

      <!-- TAB: Quote -->
      <div id="ld-pane-quote" style="display:none">
        <div style="background:#eef1fb;border-right:4px solid #1a2472;border-radius:10px;padding:14px 18px;margin-bottom:18px;font-size:12px;color:#1a2472">
          💡 بيانات العرض تُملأ تلقائياً من بيانات العميل — يمكنك تعديلها
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px">
          <div><label class="form-label">الكيان القانوني</label><input id="qq-legal_entity" class="input" value="${escH(lead.quote_legal_entity||COMPANY_TYPE_OPTS_FULL[lead.company_type||'']||'')}"/></div>
          <div><label class="form-label">النشاط</label><input id="qq-activity" class="input" value="${escH(lead.quote_activity||lead.company_activities||'')}"/></div>
          <div><label class="form-label">الموقع / المحافظة</label><input id="qq-location" class="input" value="${escH(lead.quote_location||lead.governorate||'')}"/></div>
          <div><label class="form-label">رأس المال (جنيه)</label><input id="qq-capital" class="input" type="number" style="direction:ltr" value="${lead.quote_capital!=null?lead.quote_capital:(lead.estimated_capital||'')}"/></div>
          <div><label class="form-label">إجمالي مصاريف وأتعاب التأسيس (جنيه)</label><input id="qq-total_fees" class="input" type="number" style="direction:ltr" value="${lead.quote_total_fees||lead.quote_expenses_total||''}" oninput="_qsCalc()" placeholder="أدخل الإجمالي يدوياً"/></div>
          <input type="hidden" id="qq-government_fees" value="0"/>
        </div>

        <!-- Services table -->
        <div style="margin-bottom:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <label class="form-label" style="margin:0">الخدمات المقدمة</label>
            <button onclick="_qsAddService()" class="btn btn-secondary" style="font-size:12px;padding:4px 10px">+ إضافة خدمة</button>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:#f8fafc">
                <th style="padding:8px 10px;font-size:11px;color:#64748b;text-align:right;font-weight:700">الخدمة</th>
                <th style="padding:8px 10px;font-size:11px;color:#64748b;text-align:right;font-weight:700;width:130px">السعر (جنيه)</th>
                <th style="width:30px"></th>
              </tr></thead>
              <tbody id="qs-services-tbody">${serviceRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Total summary -->
        <div id="qs-total-block" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #86efac;border-radius:10px;padding:16px 22px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:12px;color:#15803d;font-weight:600;margin-bottom:4px">إجمالي المصاريف والأتعاب</div>
            <div id="qs-total-amt" style="font-size:26px;font-weight:800;color:#15803d">${fmtMoney(lead.quote_total_fees||lead.quote_expenses_total)}</div>
          </div>
          <div style="font-size:36px">💰</div>
        </div>

        <!-- Required docs -->
        <div style="margin-bottom:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <label class="form-label" style="margin:0">المستندات المطلوبة</label>
            <button onclick="_qsAddDoc()" class="btn btn-secondary" style="font-size:12px;padding:4px 10px">+ إضافة مستند</button>
          </div>
          <div id="qs-docs-wrap">${docsHtml}</div>
        </div>

        <!-- Quote notes -->
        <div style="margin-bottom:16px">
          <label class="form-label">ملاحظات العرض</label>
          <textarea id="qq-notes" class="input" rows="2" style="width:100%;resize:vertical">${escH(lead.quote_notes||'')}</textarea>
        </div>

        <div style="text-align:left">
          <button id="ld-save-quote" class="btn btn-primary" onclick="saveLeadQuote(${lead.id})">💾 حفظ العرض</button>
        </div>
      </div>

      <!-- TAB: Activities -->
      <div id="ld-pane-activity" style="display:none">
        ${(lead.activities||[]).length===0
          ? emptyState('📋','لا يوجد نشاطات بعد')
          : `<div style="display:flex;flex-direction:column;gap:10px">`+
            (lead.activities||[]).map(a=>`
            <div style="display:flex;gap:12px;padding:10px 14px;background:#f8fafc;border-radius:10px;border-right:3px solid #1a2472">
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;color:#1e293b">${escH(a.description||a.action)}</div>
                <div style="font-size:11px;color:#94a3b8;margin-top:3px">${a.user_name?escH(a.user_name)+' — ':''}${fmtDt(a.created_at)}</div>
              </div>
            </div>`).join('')+`</div>`
        }
      </div>
    </div>

    <!-- Action buttons -->
    <div style="border-top:2px solid #e2e8f0;padding:14px 28px;background:#f8fafc;display:flex;gap:10px;flex-wrap:wrap;flex-shrink:0">
      <button onclick="sendLeadQuoteEmail(${lead.id},'${escH(lead.email||'')}')" class="btn btn-secondary" style="gap:6px">📧 إرسال بالبريد</button>
      <button onclick="sendLeadWhatsApp(${lead.id})" class="btn btn-secondary" style="gap:6px;background:#25d366;color:white;border-color:#25d366">📱 WhatsApp</button>
      <button onclick="previewLeadQuotePDF(${lead.id})" class="btn btn-secondary" style="gap:6px">📄 معاينة PDF</button>
      <button onclick="printLeadQuote(${lead.id})" class="btn btn-secondary" style="gap:6px">🖨️ طباعة</button>
      <div style="flex:1"></div>
      <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-secondary">إغلاق</button>
    </div>
  </div>`;

  // Store mutable service/doc arrays on window so inline handlers can update them
  window._qsServices = services.map(s=>({name:s.name||'',price:parseFloat(s.price)||0}));
  window._qsDocs = reqDocs.slice();
  window._ldLeadId = id;

  document.body.append(overlay);
  overlay.addEventListener('mousedown', e=>{ if(e.target===overlay) overlay.remove(); });
}

function _ldField(label, field, val, type='text'){
  const v = val!=null?String(val):'';
  return `<div>
    <label class="form-label">${label}</label>
    <input id="ld-${field}" class="input" type="${type}" value="${escH(v)}" ${type==='tel'?'style="direction:ltr"':''}/>
  </div>`;
}
function _ldSelectField(label, field, val, opts){
  const optsHtml = Object.entries(opts).map(([k,v])=>`<option value="${k}" ${val===k?'selected':''}>${v}</option>`).join('');
  return `<div>
    <label class="form-label">${label}</label>
    <select id="ld-${field}" class="input">${optsHtml}</select>
  </div>`;
}

function _ldTab(tab) {
  ['info','quote','activity'].forEach(t=>{
    const btn=document.getElementById(`ld-tab-${t}`);
    const pane=document.getElementById(`ld-pane-${t}`);
    if(!btn||!pane) return;
    const active = t===tab;
    btn.style.borderBottomColor = active?'#1a2472':'transparent';
    btn.style.color = active?'#1a2472':'#64748b';
    btn.style.background = active?'#fff':'transparent';
    btn.style.fontWeight = active?'700':'600';
    pane.style.display = active?'':'none';
  });
}

function _qsCalc() {
  const fees = parseFloat(document.getElementById('qq-total_fees')?.value)||0;
  const amt = document.getElementById('qs-total-amt');
  if(amt) amt.textContent = fees > 0 ? fees.toLocaleString('ar-EG')+' جنيه' : '—';
}

function _qsAddService() {
  const svc = {name:'',price:0};
  window._qsServices = window._qsServices||[];
  const i = window._qsServices.length;
  window._qsServices.push(svc);
  const tbody = document.getElementById('qs-services-tbody');
  if(!tbody) return;
  const tr = document.createElement('tr');
  tr.id = `qs-row-${i}`;
  tr.style.borderBottom = '1px solid #f1f5f9';
  tr.innerHTML = `
    <td style="padding:6px 8px"><input class="input" style="font-size:12px;padding:4px 8px" placeholder="اسم الخدمة" oninput="window._qsServices[${i}].name=this.value;_qsCalc()"/></td>
    <td style="padding:6px 8px"><input class="input" type="number" style="font-size:12px;padding:4px 8px;width:110px;direction:ltr" placeholder="0" oninput="window._qsServices[${i}].price=parseFloat(this.value)||0;_qsCalc()"/></td>
    <td style="padding:6px 4px;text-align:center"><button onclick="window._qsServices.splice(${i},1);this.closest('tr').remove();_qsCalc()" style="background:none;border:none;color:#d1d5db;cursor:pointer;font-size:14px" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#d1d5db'">✕</button></td>`;
  tbody.append(tr);
}

function _qsAddDoc() {
  window._qsDocs = window._qsDocs||[];
  const i = window._qsDocs.length;
  window._qsDocs.push('');
  const wrap = document.getElementById('qs-docs-wrap');
  if(!wrap) return;
  const div = document.createElement('div');
  div.id = `qd-${i}`;
  div.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px';
  div.innerHTML = `
    <input class="input" style="flex:1;font-size:12px;padding:4px 8px" placeholder="مستند مطلوب..." oninput="window._qsDocs[${i}]=this.value"/>
    <button onclick="window._qsDocs.splice(${i},1);this.closest('div').remove()" style="background:none;border:none;color:#d1d5db;cursor:pointer;font-size:14px" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#d1d5db'">✕</button>`;
  wrap.append(div);
}

async function saveLeadInfo(id) {
  const btn = document.getElementById('ld-save-info');
  const body = {};
  ['name','phone','email','company_activities','company_type','estimated_capital',
   'governorate','suggested_name','proposed_names','meeting_date','follow_up_date','status','notes'].forEach(f=>{
    const el = document.getElementById(`ld-${f}`);
    if(!el) return;
    if(el.type==='number') body[f] = el.value!==''?parseFloat(el.value):null;
    else body[f] = el.value||null;
  });
  const officeEl = document.getElementById('ld-has_office');
  if(officeEl) body.has_office = officeEl.checked;
  const excEl = document.getElementById('ld-has_existing_companies');
  if(excEl) body.has_existing_companies = excEl.checked;

  await withSaving(btn, async()=>{
    const updated = await api('PUT', `/api/leads/${id}`, body);
    // Refresh local cache
    const idx = leadsData.findIndex(l=>l.id===id);
    if(idx>=0) leadsData[idx]=updated;
    else leadsData.push(updated);
    // Update grid row if visible — rebuild & replace (main + expand rows)
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if(row){
      const expandRow = document.getElementById(`lead-expand-${id}`);
      const wasOpen = expandRow && expandRow.style.display !== 'none';
      const tmp=document.createElement('table');
      tmp.innerHTML=`<tbody>${_buildLeadRow(updated)}</tbody>`;
      const rows = tmp.querySelectorAll('tr');
      if(expandRow) expandRow.remove();
      row.replaceWith(...rows);
      if(wasOpen) {
        const newExpand = document.getElementById(`lead-expand-${id}`);
        if(newExpand) { newExpand.style.display=''; }
        const btn = document.getElementById(`expand-btn-${id}`);
        if(btn) btn.textContent='▴';
      }
    }
    // Update status badge inside modal if open
    const modalBadge = document.querySelector('.modal .lead-status-badge');
    if(modalBadge && updated.status){
      const sc=LEAD_STATUS_COLORS[updated.status]||'#94a3b8';
      modalBadge.style.background=`${sc}22`;
      modalBadge.style.color=sc;
      modalBadge.textContent=LEAD_STATUS_LABEL[updated.status]||updated.status;
    }
    toast('تم حفظ بيانات العميل ✓');
  });
}

async function saveLeadQuote(id) {
  const btn = document.getElementById('ld-save-quote');
  const total = parseFloat(document.getElementById('qq-total_fees')?.value)||0;
  const body = {
    quote_legal_entity: document.getElementById('qq-legal_entity')?.value||null,
    quote_activity:     document.getElementById('qq-activity')?.value||null,
    quote_location:     document.getElementById('qq-location')?.value||null,
    quote_capital:      parseFloat(document.getElementById('qq-capital')?.value)||null,
    quote_total_fees:   total||null,
    quote_government_fees: 0,
    quote_expenses_total: total||null,
    quote_services:     JSON.stringify((window._qsServices||[]).filter(s=>s.name)),
    quote_required_docs: JSON.stringify((window._qsDocs||[]).filter(Boolean)),
    quote_notes:        document.getElementById('qq-notes')?.value||null,
  };
  await withSaving(btn, async()=>{
    const updated = await api('PUT', `/api/leads/${id}`, body);
    const idx = leadsData.findIndex(l=>l.id===id);
    if(idx>=0) leadsData[idx]=updated;
    _qsCalc();
    toast('تم حفظ عرض السعر ✓');
  });
}

async function sendLeadQuoteEmail(id, defaultEmail) {
  const email = prompt('البريد الإلكتروني للإرسال:', defaultEmail||'');
  if(!email) return;
  try {
    await api('POST', `/api/leads/${id}/quote/send-email`, {to_email:email});
    toast('تم الإرسال بنجاح ✓');
  } catch(e){ toast(e.message,'error'); }
}

function _parseAmt(v){return parseFloat(String(v||'').replace(/[,،٬]/g,''))||0;}

function _buildLeadMessage(lead, st) {
  // Deliverables & required docs from state
  const delivers = (st.deliverables||[]).filter(i=>i.checked).map(i=>`• ${i.text}`).join('\n');
  const reqDocs  = (st.reqDocs||[]).filter(i=>i.checked).map(i=>`• ${i.text}`).join('\n');
  const capital  = _parseAmt(st.capital) || _parseAmt(lead.quote_capital) || _parseAmt(lead.estimated_capital);
  const total    = _parseAmt(st.total_fees) || _parseAmt(lead.quote_total_fees) || _parseAmt(lead.quote_expenses_total);
  const legal    = st.legal_entity || lead.quote_legal_entity || '';
  const activity = st.activity || lead.quote_activity || lead.company_activities || '';
  const location = st.location || lead.quote_location || '';
  const extra    = [st.notes2, st.extra].filter(Boolean).join('\n');

  return `السلام عليكم أستاذ / ${lead?.name||''}

عرض السعر الخاص بتأسيس الشركة:

الكيان القانوني: ${legal||'—'}
النشاط: ${activity||'—'}
${location ? `مقر النشاط: ${location}\n` : ''}رأس المال: ${capital>0?capital.toLocaleString('ar-EG')+' جنيه':'—'}

إجمالي مصاريف وأتعاب التأسيس:
${total>0?total.toLocaleString('ar-EG')+' جنيه':'—'}
${delivers ? `\nحضرتك هتستلم مننا:\n${delivers}` : ''}
${reqDocs  ? `\nهحتاج من حضرتك:\n${reqDocs}` : ''}
${extra    ? `\n${extra}` : ''}

مع خالص الشكر والتقدير
المستشار / عمرو شعبان`.replace(/\n{3,}/g, '\n\n').trim();
}

async function sendLeadWhatsApp(id) {
  const lead = leadsData.find(l=>l.id===id);
  if (!lead) { toast('بيانات العميل غير موجودة','error'); return; }
  const waPhone = toWAPhone(lead?.phone);
  if(!waPhone){ toast('لا يوجد رقم هاتف لهذا العميل','error'); return; }

  if(lead.status === 'not_answered') {
    sendLeadNoAnswerWhatsApp(lead);
    return;
  }

  const mainRow = document.querySelector(`tr[data-id="${id}"]`);
  if (mainRow) _syncLeadInlineToState(mainRow);
  const st = _getLeadExpandState(lead);
  const msg = _buildLeadMessage(lead, st);
  window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

window.sendLeadEmailDirect = function(id) {
  const lead = leadsData.find(l=>l.id===id);
  if (!lead) return;
  const mainRow = document.querySelector(`tr[data-id="${id}"]`);
  if (mainRow) _syncLeadInlineToState(mainRow);
  const st = _getLeadExpandState(lead);
  const email = st.email || lead.email || '';
  if (!email) { toast('لا يوجد بريد إلكتروني لهذا العميل','error'); return; }
  const msg = _buildLeadMessage(lead, st);
  const subject = encodeURIComponent(`عرض سعر تأسيس شركة — ${lead.name||''}`);
  const body = encodeURIComponent(msg);
  window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
};

function sendLeadNoAnswerWhatsApp(lead) {
  const waPhone = toWAPhone(lead?.phone);
  if(!waPhone){ toast('لا يوجد رقم هاتف','error'); return; }

  const msg =
`أخبار حضرتك إيه؟

مع حضرتك المستشار / عمرو شعبان

كنت بحاول أتواصل مع حضرتك هاتفياً ولم يتم الرد بخصوص تأسيس شركة.

محتاج أعرف من حضرتك بعض التفاصيل لإرسال عرض السعر:

1- نشاط الشركة
2- رأس مال الشركة
3- هل يوجد مقر أم سيتم التأسيس على مقر افتراضي؟
4- هل يوجد شركاء؟
5- عنوان المقر إن وجد

في انتظار رد حضرتك، وسأقوم بإرسال جميع التفاصيل وعرض السعر المناسب.`;

  window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function previewLeadQuotePDF(id) {
  // Gather data from modal or from leadsData
  const lead = leadsData.find(l=>l.id===id);
  const legalEntity = document.getElementById('qq-legal_entity')?.value || lead?.quote_legal_entity || '';
  const activity    = document.getElementById('qq-activity')?.value    || lead?.quote_activity    || lead?.company_activities || '';
  const location    = document.getElementById('qq-location')?.value    || lead?.quote_location    || lead?.governorate        || '';
  const capital     = _parseAmt(document.getElementById('qq-capital')?.value) || _parseAmt(lead?.quote_capital) || _parseAmt(lead?.estimated_capital);
  const fees        = _parseAmt(document.getElementById('qq-total_fees')?.value) || _parseAmt(lead?.quote_total_fees);
  const gov         = _parseAmt(document.getElementById('qq-government_fees')?.value) || _parseAmt(lead?.quote_government_fees);
  const svcTotal    = (window._qsServices||[]).reduce((s,r)=>s+(_parseAmt(r.price)),0);
  const total       = fees + gov + svcTotal;
  const notes       = document.getElementById('qq-notes')?.value || lead?.quote_notes || '';
  const services    = (window._qsServices||[]).filter(s=>s.name);
  const docs        = (window._qsDocs||[]).filter(Boolean);
  const today       = new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'});

  const servicesHtml = services.map(s=>`
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151">${escH(s.name)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#1a2472;text-align:left">${Number(s.price).toLocaleString('ar-EG')} جنيه</td>
    </tr>`).join('');
  const docsListHtml = docs.map(d=>`<li style="margin:5px 0;font-size:13px;color:#374151">${escH(d)}</li>`).join('');

  const printHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>عرض سعر — ${escH(lead?.code||'')} — ${escH(lead?.name||'')}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
  *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0}
  body{background:#fff;color:#1e293b;direction:rtl;font-size:14px;line-height:1.6}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:white;position:relative}
  .header{background:linear-gradient(135deg,#1a2472 0%,#152060 60%,#0f1848 100%);color:white;padding:30px 40px 22px}
  .header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
  .co-name{font-size:24px;font-weight:800}
  .co-sub{font-size:11px;color:#b3c4e8;margin-top:2px;letter-spacing:1px}
  .qmeta{text-align:left}
  .qnum{font-size:18px;font-weight:800;color:#fbbf24}
  .qdate{font-size:11px;color:#b3c4e8;margin-top:3px}
  .hdiv{border-top:1px solid rgba(255,255,255,.2);margin:14px 0}
  .qtitle{font-size:15px;font-weight:600;color:#b3c4e8;text-align:center}
  .body{padding:28px 40px}
  .greet{font-size:16px;font-weight:600;color:#1a2472;margin-bottom:3px}
  .greet-sub{font-size:13px;color:#64748b;margin-bottom:22px}
  .info-block{background:linear-gradient(135deg,#eef1fb,#f0f4ff);border:1.5px solid #c7d2fe;border-radius:10px;padding:18px 22px;margin-bottom:20px}
  .info-title{font-size:12px;font-weight:700;color:#1a2472;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;border-bottom:1px solid #c7d2fe;padding-bottom:7px}
  .info-row{display:flex;align-items:baseline;gap:8px;margin-bottom:7px;font-size:13px}
  .info-label{color:#64748b;min-width:130px}
  .info-value{font-weight:700;color:#1e293b;flex:1}
  .svc-table{width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:10px;overflow:hidden}
  .svc-thead th{background:#1a2472;color:white;padding:8px 14px;font-size:12px;text-align:right;font-weight:700}
  .svc-thead th:last-child{text-align:left}
  .total-block{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #86efac;border-radius:10px;padding:16px 22px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between}
  .total-label{font-size:12px;color:#15803d;font-weight:600}
  .total-amt{font-size:28px;font-weight:800;color:#15803d}
  .total-break{font-size:11px;color:#6b7280;margin-top:3px}
  .docs-block{margin-bottom:20px}
  .sec-title{font-size:12px;font-weight:700;color:#1a2472;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px}
  .docs-box{background:#fffbeb;border-right:4px solid #d97706;border-radius:8px;padding:12px 16px}
  .notes-block{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400e}
  .sig-block{border-top:2px solid #e8edf3;padding-top:18px;margin-top:18px;display:flex;justify-content:space-between;align-items:flex-end}
  .sig-side{text-align:center}
  .sig-line{border-top:1px solid #94a3b8;width:170px;margin:0 auto 5px;padding-top:7px;font-size:11px;color:#64748b}
  .sig-name{font-weight:700;font-size:13px;color:#1e293b}
  .footer{background:#1a2472;color:#b3c4e8;padding:12px 40px;display:flex;justify-content:space-between;font-size:10px}
  @media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{margin:0}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-top">
      <div><div class="co-name">🏛️ MS Accounting</div><div class="co-sub">Corporate Accounting & Tax Consulting</div></div>
      <div class="qmeta">
        <div class="qnum">${escH(lead?.code||'QUO')}</div>
        <div class="qdate">📅 ${today}</div>
      </div>
    </div>
    <div class="hdiv"></div>
    <div class="qtitle">عرض سعر — تأسيس شركة</div>
  </div>

  <div class="body">
    <div class="greet">مساء الخير،</div>
    <div class="greet-sub">مع حضرتك / ${escH(lead?.name||'')}</div>

    <div class="info-block">
      <div class="info-title">📋 تفاصيل عرض السعر</div>
      ${legalEntity?`<div class="info-row"><span class="info-label">الكيان القانوني:</span><span class="info-value">${escH(legalEntity)}</span></div>`:''}
      ${activity?`<div class="info-row"><span class="info-label">النشاط:</span><span class="info-value">${escH(activity)}</span></div>`:''}
      ${location?`<div class="info-row"><span class="info-label">مقر النشاط:</span><span class="info-value">${escH(location)}</span></div>`:''}
      ${capital?`<div class="info-row"><span class="info-label">رأس المال:</span><span class="info-value">${Number(capital).toLocaleString('ar-EG')} جنيه</span></div>`:''}
      <div class="info-row"><span class="info-label">اسم العميل:</span><span class="info-value">${escH(lead?.name||'')}</span></div>
      ${lead?.phone?`<div class="info-row"><span class="info-label">رقم الهاتف:</span><span class="info-value">${escH(lead.phone)}</span></div>`:''}
    </div>

    ${servicesHtml?`<table class="svc-table">
      <thead class="svc-thead"><tr><th>الخدمة</th><th>السعر</th></tr></thead>
      <tbody>${servicesHtml}</tbody>
    </table>`:''}

    <div class="total-block">
      <div>
        <div class="total-label">إجمالي المصاريف والأتعاب</div>
        <div class="total-amt">${total>0?total.toLocaleString('ar-EG')+' جنيه':'—'}</div>
      </div>
      <div style="font-size:36px">💰</div>
    </div>

    ${docsListHtml?`<div class="docs-block">
      <div class="sec-title">📌 المستندات المطلوبة من حضرتكم</div>
      <div class="docs-box"><ul style="padding-right:18px">${docsListHtml}</ul></div>
    </div>`:''}

    ${notes?`<div class="notes-block"><strong>ملاحظات:</strong> ${escH(notes)}</div>`:''}

    <div class="sig-block">
      <div class="sig-side">
        <div class="sig-line">العميل</div>
        <div class="sig-name">${escH(lead?.name||'')}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:2px">التوقيع والتاريخ</div>
      </div>
      <div style="text-align:center;color:#64748b;font-size:12px">
        <div style="font-size:22px;margin-bottom:5px">🏛️</div>
        <div style="font-weight:700;color:#1a2472">MS Accounting</div>
        <div style="font-size:10px">مكتب محاسبة وضرائب</div>
      </div>
      <div class="sig-side">
        <div class="sig-line">المستشار</div>
        <div class="sig-name">عمرو شعبان</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:2px">المستشار الضريبي</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div>MS Accounting — مكتب المحاسبة والضرائب</div>
    <div>${escH(lead?.code||'')} | ${today}</div>
    <div>هذا العرض سري وخاص بالعميل المُشار إليه</div>
  </div>
</div>
<div class="no-print" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:10px;background:white;padding:12px 20px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.2)">
  <button onclick="window.print()" style="background:linear-gradient(135deg,#1a2472,#152060);color:white;border:none;border-radius:9px;padding:10px 24px;font-size:14px;font-family:'Cairo',sans-serif;cursor:pointer;font-weight:700">🖨️ طباعة / حفظ PDF</button>
  <button onclick="window.close()" style="background:#f1f5f9;color:#374151;border:1.5px solid #d1d5db;border-radius:9px;padding:10px 24px;font-size:14px;font-family:'Cairo',sans-serif;cursor:pointer">إغلاق</button>
</div>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=1000,scrollbars=yes');
  if(!w){ toast('يرجى السماح بفتح نوافذ منبثقة في المتصفح','error'); return; }
  w.document.write(printHtml);
  w.document.close();
}

function printLeadQuote(id) { previewLeadQuotePDF(id); }

// ── ESTABLISHMENT ──────────────────────────────────
let estData=[]; // kept for collections compat

// ═══════════════════════════════════════════════════════════════════
// COMPANY FORMATION WORKFLOW — ملفات تأسيس الشركات (New Pipeline)
// ═══════════════════════════════════════════════════════════════════

const FORMATION_STAGES = [
  {key:'name_reservation',  label:'حجز اسم',              icon:'📝', color:'#6366f1'},
  {key:'name_approved',     label:'إقرار قبول',           icon:'✅', color:'#8b5cf6'},
  {key:'under_review',      label:'تحت المراجعة',         icon:'🔍', color:'#0ea5e9'},
  {key:'fees_payment',      label:'دفع الرسوم والتوقيع',  icon:'💳', color:'#0284c7'},
  {key:'follow_up',         label:'في المتابعة',          icon:'📞', color:'#d97706'},
  {key:'lawyers_syndicate', label:'نقابة المحامين',       icon:'⚖️', color:'#b45309'},
  {key:'real_estate',       label:'الشهر العقاري',        icon:'🏢', color:'#dc2626'},
  {key:'chamber_commerce',  label:'الغرفة التجارية',      icon:'🏛️', color:'#7c3aed'},
  {key:'commercial_register',label:'السجل التجاري',       icon:'📋', color:'#16a34a'},
  {key:'docs_received',     label:'استلام المستندات',     icon:'📂', color:'#0369a1'},
  {key:'tax_card',          label:'الضرائب',              icon:'🪪', color:'#15803d'},
  {key:'completed',         label:'مكتمل',                icon:'🎉', color:'#166534'},
];
const FORMATION_STAGE_KEYS = FORMATION_STAGES.map(s=>s.key);

let _fmData = [];       // all cases
let _fmStats = null;
let _fmStageFilter = '';
let _fmSearch = '';
let _fmView = 'pipeline'; // 'pipeline' | 'list'

