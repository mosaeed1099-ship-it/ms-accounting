async function loadInvoices(silent=false) {
  const main = document.getElementById('main');
  main.className = 'page';
  if(!silent) main.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  try {
    const [summary, colData, invData] = await Promise.all([
      api('GET', '/api/collections/summary').catch(()=>null),
      api('GET', '/api/collections?page_size=100').catch(()=>({items:[]})),
      api('GET', '/api/invoices?page_size=100').catch(()=>({items:[]})),
    ]);
    _feesCollData = colData.items || [];
    invoicesData  = invData.items  || [];
    renderInvoices(summary);
  } catch(e) { toast(e.message,'error'); }
}

function renderInvoices(summary) {
  if (summary) window._feesSummaryCache = summary;
  const main = document.getElementById('main');
  main.className = 'page';

  const estData = _feesCollData.filter(c=>c.collection_type==='establishment');
  const mthData = _feesCollData.filter(c=>c.collection_type==='monthly_fee');

  // KPI summary
  const kpiHtml = summary ? `
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:22px">
    <div class="stat-card stat-blue" style="cursor:default">
      <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:6px">📋 إجمالي المتفق عليه</div>
      <div style="font-size:20px;font-weight:800;color:#1e293b">${money(summary.total_agreed)}</div>
    </div>
    <div class="stat-card stat-green" style="cursor:default">
      <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:6px">✅ إجمالي المحصّل</div>
      <div style="font-size:20px;font-weight:800;color:#16a34a">${money(summary.total_collected)}</div>
    </div>
    <div class="stat-card stat-red" style="cursor:default">
      <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:6px">⏳ المتبقي</div>
      <div style="font-size:20px;font-weight:800;color:#dc2626">${money(summary.total_remaining)}</div>
    </div>
    <div class="stat-card" style="cursor:default">
      <div style="font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:6px">📅 أتعاب الشهر الحالي</div>
      <div style="font-size:20px;font-weight:800;color:#d97706">${money(summary.current_month_due)}</div>
      <div style="font-size:11px;color:#16a34a;margin-top:3px">محصّل: ${money(summary.current_month_paid)}</div>
    </div>
  </div>` : '';

  // Apply search filter to estData / mthData
  const _fq = _feesSearchQ.toLowerCase();
  const estData2 = _fq ? estData.filter(c=>(c.client_name||'').toLowerCase().includes(_fq)||(c.title||'').toLowerCase().includes(_fq)) : estData;
  const mthData2 = _fq ? mthData.filter(c=>(c.client_name||'').toLowerCase().includes(_fq)||(c.title||'').toLowerCase().includes(_fq)) : mthData;
  const invData2 = _fq ? invoicesData.filter(i=>(i.client_name||'').toLowerCase().includes(_fq)||(i.invoice_number||'').toLowerCase().includes(_fq)) : invoicesData;

  // Tab bar
  const tabs = [
    {id:'establishment', label:`🏗️ أتعاب التأسيس (${estData.length})`},
    {id:'monthly_fee',   label:`🔄 أتعاب الحسابات (${mthData.length})`},
    {id:'invoices',      label:`🧾 فواتير رسمية (${invoicesData.length})`},
  ];
  const tabBarHtml = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      ${tabs.map(t=>`<button onclick="_switchFeesTab('${t.id}')"
        class="btn btn-sm ${_feesTab===t.id?'btn-primary':'btn-secondary'}">${t.label}</button>`).join('')}
      <input class="input" style="font-size:12px;padding:5px 10px;width:180px" placeholder="🔍 بحث باسم الشركة..." value="${escH(_feesSearchQ)}" oninput="setFeesSearch(this.value)"/>
    </div>
    <div style="display:flex;gap:8px">
      ${_feesTab==='invoices'
        ? `<button class="btn btn-primary" onclick="showInvoiceModal()">+ فاتورة جديدة</button>`
        : `<button class="btn btn-primary" onclick="showCollectionModal('${_feesTab}')">+ إضافة</button>`}
    </div>
  </div>`;

  // Content per tab
  let bodyHtml = '';
  if (_feesTab === 'invoices') {
    const statusBadge = INV_STATUS_BADGE;
    const statusLabel = INV_STATUS_LABEL;
    bodyHtml = `<div class="card" style="overflow:hidden"><table>
      <thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>تاريخ الإصدار</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${invData2.length===0
        ? `<tr><td colspan="8" style="text-align:center;padding:40px;color:#94a3b8">${_fq?'لا توجد نتائج للبحث':'لا توجد فواتير — اضغط "+ فاتورة جديدة"'}</td></tr>`
        : invData2.map(inv=>`<tr>
            <td><span style="font-weight:700;color:#1a2472">${inv.invoice_number}</span></td>
            <td style="font-weight:500">${escH(inv.client_name||'')}</td>
            <td>${dateAr(inv.issue_date)}</td>
            <td style="font-weight:700">${money(inv.total)}</td>
            <td style="color:#16a34a;font-weight:600">${money(inv.paid_amount)}</td>
            <td style="color:${inv.remaining>0?'#dc2626':'#16a34a'};font-weight:600">${money(inv.remaining)}</td>
            <td><span class="badge ${statusBadge[inv.status]||'badge-gray'}">${statusLabel[inv.status]||inv.status}</span></td>
            <td><div style="display:flex;gap:5px">
              ${inv.remaining>0&&inv.status!=='cancelled'?`<button class="btn btn-success btn-sm" onclick="showPaymentModal(${inv.id},${inv.remaining},'${inv.invoice_number}')">💵</button>`:''}
              <button class="btn btn-secondary btn-sm" onclick="showInvoiceModal(${inv.id})">✏️</button>
            </div></td>
          </tr>`).join('')}
      </tbody></table></div>`;
  } else {
    const rows = _feesTab === 'establishment' ? estData2 : mthData2;
    bodyHtml = `<div class="card" style="overflow:hidden"><table>
      <thead><tr>
        <th>العميل</th><th>الخدمة</th><th>المتفق عليه</th>
        ${_feesTab==='monthly_fee'?'<th>الشهري</th>':''}
        <th>المدفوع</th><th>المتبقي</th><th>آخر دفعة</th><th>الدفعات</th><th></th>
      </tr></thead>
      <tbody id="fees-tbody">
        ${rows.length===0
          ? `<tr><td colspan="9" style="text-align:center;padding:40px;color:#94a3b8">لا توجد عقود — اضغط "+ إضافة"</td></tr>`
          : rows.map((c,idx)=>{
              const lastPay = (c.payments||[]).length ? c.payments[c.payments.length-1] : null;
              const payCount = (c.payments||[]).length;
              return `<tr style="cursor:pointer" onclick="_toggleFeesExpand(${idx},'${c.id}')" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
                <td style="font-weight:700;color:#1e293b">${escH(c.client_name||'—')}</td>
                <td style="font-size:12px;color:#374151;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(c.title)}</td>
                <td style="font-weight:700;color:#1a2472">${money(c.agreed_amount)}</td>
                ${_feesTab==='monthly_fee'?`<td style="color:#5b8ec4;font-weight:600">${c.monthly_amount?money(c.monthly_amount)+'/شهر':'—'}</td>`:''}
                <td style="color:#16a34a;font-weight:700">${money(c.total_paid)}</td>
                <td style="color:${c.total_remaining>0?'#dc2626':'#16a34a'};font-weight:700">${money(c.total_remaining)}</td>
                <td style="font-size:12px;color:#64748b">${lastPay?dateAr(lastPay.payment_date):'—'}</td>
                <td><span style="background:#eef1fb;color:#1a2472;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">${payCount} دفعة</span></td>
                <td onclick="event.stopPropagation()"><div style="display:flex;gap:4px">
                  ${c.total_remaining>0?`<button class="btn btn-success btn-sm" onclick="showCollectionPaymentModal(${c.id},${c.total_remaining},'${escH(c.title)}',${c.collection_type==='monthly_fee'})">💵</button>`:''}
                  <button class="btn btn-secondary btn-sm" onclick="showCollectionEditModal(${c.id})" title="تعديل">✏️</button>
                  <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5" onclick="deleteCollectionContract(${c.id},'${escH(c.title)}')" title="حذف">🗑</button>
                </div></td>
              </tr>
              <tr id="fees-expand-${idx}" style="display:none;background:#f8fafc">
                <td colspan="9" style="padding:0">
                  <div style="padding:12px 20px 16px">
                    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">📋 سجل الدفعات</div>
                    ${!(c.payments||[]).length
                      ? `<div style="color:#94a3b8;font-size:12px;padding:8px 0">لا توجد دفعات مسجلة بعد</div>`
                      : `<table style="width:100%;border-collapse:collapse">
                          <thead><tr style="border-bottom:1px solid #e2e8f0">
                            <th style="text-align:right;padding:5px 10px;font-size:11px;color:#64748b;font-weight:600">المبلغ</th>
                            <th style="text-align:right;padding:5px 10px;font-size:11px;color:#64748b;font-weight:600">التاريخ</th>
                            <th style="text-align:right;padding:5px 10px;font-size:11px;color:#64748b;font-weight:600">طريقة الدفع</th>
                            ${_feesTab==='monthly_fee'?'<th style="text-align:right;padding:5px 10px;font-size:11px;color:#64748b;font-weight:600">عن شهر</th>':''}
                            <th style="text-align:right;padding:5px 10px;font-size:11px;color:#64748b;font-weight:600">المرجع</th>
                          </tr></thead>
                          <tbody>${(c.payments||[]).map(p=>`
                            <tr style="border-bottom:1px solid #f1f5f9">
                              <td style="padding:6px 10px;font-weight:700;color:#16a34a;font-size:13px">${money(p.amount)}</td>
                              <td style="padding:6px 10px;font-size:12px;color:#374151">${dateAr(p.payment_date)}</td>
                              <td style="padding:6px 10px;font-size:12px;color:#374151">${{cash:'نقدي',bank_transfer:'تحويل',check:'شيك',instapay:'InstaPay',vodafone_cash:'V.Cash'}[p.payment_method]||p.payment_method||'—'}</td>
                              ${_feesTab==='monthly_fee'?`<td style="padding:6px 10px;font-size:11px;color:#5b8ec4">${p.period_month?(['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][p.period_month-1]+' '+p.period_year):'—'}</td>`:''}
                              <td style="padding:6px 10px;font-size:11px;color:#94a3b8">${p.reference||'—'}</td>
                            </tr>`).join('')}
                          </tbody></table>`}
                  </div>
                </td>
              </tr>`;
            }).join('')}
      </tbody></table></div>`;
  }

  // Cache summary for tab switching
  if (summary) window._feesSummaryCache = summary;

  main.innerHTML = kpiHtml + tabBarHtml + bodyHtml;
}

window._toggleFeesExpand = function(idx, id) {
  const row = document.getElementById(`fees-expand-${idx}`);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? '' : 'none';
};

async function showInvoiceModal(id=null, preClientId=null) {
  let inv=null, clients=[];
  try {
    clients=await getClients();
    if(id) inv=invoicesData.find(x=>x.id===id);
  } catch(e){toast(e.message,'error');return}

  let items=inv?.items||[{description:'',quantity:1,unit_price:0,tax_percent:14}];

  const overlay=document.createElement('div');
  overlay.className='modal-overlay';

  function buildModal() {
    overlay.innerHTML=`<div class="modal" style="max-width:660px">
      <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
        <h2 style="font-size:17px;font-weight:700;color:#1e293b;margin:0">${inv?'تعديل أتعاب':'أتعاب جديدة'}</h2>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="padding:20px 24px">
        <div class="form-row" style="margin-bottom:14px">
          <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">العميل *</label>
            <select id="invClient" class="input">
              ${clients.map(c=>`<option value="${c.id}" ${(preClientId||inv?.client_id)==c.id?'selected':''}>${c.name}</option>`).join('')}
            </select></div>
          <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">تاريخ الإصدار</label>
            <input id="invDate" class="input" type="date" value="${inv?.issue_date||new Date().toISOString().split('T')[0]}"/></div>
        </div>
        <div style="margin-bottom:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <label style="font-size:13px;font-weight:700;color:#374151">بنود الفاتورة</label>
            <button class="btn btn-secondary btn-sm" id="addItemBtn">+ بند</button>
          </div>
          <div id="itemsContainer"></div>
        </div>
        <div style="background:#f8fafc;border-radius:10px;padding:14px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="color:#64748b">المجموع</span><span id="subTotal" style="font-weight:700">0</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="color:#64748b">ضريبة القيمة المضافة (14%)</span><span id="taxTotal" style="font-weight:700;color:#d97706">0</span></div>
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;border-top:1.5px solid #e5e7eb;padding-top:8px;margin-top:8px"><span>الإجمالي</span><span id="grandTotal" style="color:#1a2472">0</span></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
        <button id="saveInvBtn" class="btn btn-primary">💾 ${inv?'حفظ التعديلات':'إنشاء الأتعاب'}</button>
      </div>
    </div>`;

    function renderItems() {
      const cont=document.getElementById('itemsContainer');
      if(!cont) return;
      cont.innerHTML='';
      let sub=0;
      items.forEach((item,i)=>{
        const row=document.createElement('div');
        row.style='display:grid;grid-template-columns:2fr 80px 100px 40px;gap:8px;margin-bottom:8px;align-items:center';
        row.innerHTML=`
          <input class="input" value="${item.description}" placeholder="وصف البند" oninput="_invItems[${i}].description=this.value"/>
          <input class="input" type="number" value="${item.quantity}" placeholder="الكمية" min="0.1" step="0.1" oninput="_invItems[${i}].quantity=parseFloat(this.value)||0;renderItemsInner()"/>
          <input class="input" type="number" value="${item.unit_price}" placeholder="السعر" oninput="_invItems[${i}].unit_price=parseFloat(this.value)||0;renderItemsInner()"/>
          <button onclick="_invItems.splice(${i},1);renderItemsInner()" style="background:#fee2e2;border:none;border-radius:8px;padding:7px;cursor:pointer;color:#dc2626;font-size:14px">${items.length>1?'✕':''}</button>`;
        cont.append(row);
        sub+=item.quantity*item.unit_price;
      });
      const tax=sub*0.14;
      document.getElementById('subTotal').textContent=money(sub);
      document.getElementById('taxTotal').textContent=money(tax);
      document.getElementById('grandTotal').textContent=money(sub+tax);
    }
    window.renderItemsInner=renderItems;
    window._invItems=items;
    renderItems();

    document.getElementById('addItemBtn').onclick=()=>{items.push({description:'',quantity:1,unit_price:0,tax_percent:14});renderItems()};

    document.getElementById('saveInvBtn').onclick=async()=>{
      const btn=document.getElementById('saveInvBtn');
      btn.disabled=true; btn.textContent='جاري الحفظ...';
      try {
        const sub=items.reduce((s,it)=>s+it.quantity*it.unit_price,0);
        const tax=sub*0.14;
        const body={
          client_id:parseInt($('#invClient',overlay).value),
          issue_date:$('#invDate',overlay).value,
          due_date:new Date(new Date($('#invDate',overlay).value).getTime()+30*86400000).toISOString().split('T')[0],
          subtotal:sub,tax_percent:14,tax_amount:tax,total:sub+tax,
          discount_percent:0,discount_amount:0,stamp_tax:0,withholding_tax:0,
          items:items.filter(it=>it.description.trim())
        };
        if(inv) await api('PUT',`/api/invoices/${inv.id}`,body);
        else await api('POST','/api/invoices',body);
        toast(inv?'تم تحديث الفاتورة':'تم إنشاء الفاتورة بنجاح');
        overlay.remove(); loadInvoices(true);
      } catch(e){toast(e.message,'error');btn.disabled=false;btn.innerHTML=`💾 ${inv?'حفظ التعديلات':'إنشاء فاتورة'}`}
    };
  }

  buildModal();
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
}

function showPaymentModal(invId, remaining, invNum) {
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:420px">
    <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:17px;font-weight:700;color:#1e293b;margin:0">تسجيل دفعة — ${invNum}</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="padding:20px 24px">
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">المبلغ المدفوع (ج.م.)</label>
        <input id="payAmount" class="input" type="number" value="${remaining}" max="${remaining}" placeholder="المبلغ"/></div>
      <div style="margin-bottom:14px"><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">طريقة الدفع</label>
        <select id="payMethod" class="input">
          <option value="cash">نقدي</option><option value="bank_transfer">تحويل بنكي</option>
          <option value="check">شيك</option><option value="card">بطاقة</option>
        </select></div>
      <div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">ملاحظات</label>
        <textarea id="payNotes" class="input" rows="2" placeholder="ملاحظات اختيارية"></textarea></div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="savePayBtn" class="btn btn-success">💵 تسجيل الدفعة</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  document.getElementById('savePayBtn').onclick=async()=>{
    const btn=document.getElementById('savePayBtn');
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    try {
      await api('POST',`/api/invoices/${invId}/payments`,{
        amount:parseFloat($('#payAmount',overlay).value),
        payment_method:$('#payMethod',overlay).value,
        notes:$('#payNotes',overlay).value||null,
        payment_date:new Date().toISOString().split('T')[0]
      });
      toast('تم تسجيل الدفعة بنجاح');
      overlay.remove(); loadInvoices(true);
    } catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent='💵 تسجيل الدفعة'}
  };
}


// ══════════════════════════════════════════════
// ── TASKS — Daily Sheet v4 ─────────────────────────────────────────────
let tasksData      = [];
let tasksUsersData = [];
let _taskViewMode  = 'daily';
let _taskEmpFilter = null;
let _taskFilter    = 'all';

const TASK_EMPS = ['عمرو شعبان', 'محمد مصطفي', 'صلاح'];

let _tasksAutoRefresh=null;

