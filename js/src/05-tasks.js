async function loadTasks(silent=false) {
  const main=document.getElementById('main');
  main.className='page';
  if(!silent) main.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  try {
    const [taskRes,userRes]=await Promise.all([
      api('GET','/api/tasks?page_size=500'),
      api('GET','/api/users').catch(()=>[]),
    ]);
    const todayStr=new Date().toISOString().slice(0,10);
    tasksData=(taskRes?.items||[]).map(t=>{
      const td=t.task_date||t.created_at?.slice(0,10);
      const carry=(td&&td<todayStr&&t.status!=='done'&&t.status!=='cancelled')
        ?Math.round((new Date(todayStr)-new Date(td))/86400000):0;
      return {...t,carry_over_days:carry};
    });
    tasksUsersData=Array.isArray(userRes)?userRes:(userRes?.items||[]);
    if(_taskViewMode==='daily')       renderDailySheet();
    else if(_taskViewMode==='kanban') renderKanban();
    else if(_taskEmpFilter)           renderEmployeeTasks();
    else                              renderTaskFolders();
    // start auto-refresh every 60s when on tasks page
    if(!_tasksAutoRefresh) {
      _tasksAutoRefresh=setInterval(()=>{
        if(currentPage==='tasks') loadTasks(true);
      },60000);
    }
  } catch(e){toast(e.message,'error');}
}

// stop auto-refresh when navigating away — patched after module init via window.navigate
document.addEventListener('_navigateTo', e=>{
  if(e.detail!=='tasks'&&_tasksAutoRefresh){clearInterval(_tasksAutoRefresh);_tasksAutoRefresh=null;}
});

// ── DESIGN B: Employee Daily Sheet (rebuilt from scratch) ─────────────
const _taskDoneAt={};
function _getEmpNotes(uid){try{return localStorage.getItem('empnotes_'+uid)||'';}catch(e){return '';}}
window._saveEmpNotes=function(uid,v){try{localStorage.setItem('empnotes_'+uid,v);}catch(e){}};

// ── Daily Sheet — Design B (Employee Daily Sheet) ─────────────────────
function renderDailySheet() {
  const main=document.getElementById('main');
  main.className='page';
  const today=new Date(); today.setHours(0,0,0,0);
  const todayLbl=today.toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const emps=TASK_EMPS.map(name=>tasksUsersData.find(u=>(u.name||'').trim()===name)).filter(Boolean);

  const allT=tasksData.filter(t=>t.status!=='cancelled');
  const total=allT.length;
  const doneCnt=allT.filter(t=>t.status==='done').length;
  const remaining=total-doneCnt;
  const late=allT.filter(t=>t.carry_over_days>0&&t.status!=='done').length;
  const pct=total?Math.round(doneCnt/total*100):0;

  const statsHTML=`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px">
    ${[{n:total,l:'إجمالي المهام',c:'#1d4ed8'},{n:doneCnt,l:'المهام المنجزة',c:'#15803d'},{n:remaining,l:'المهام المتبقية',c:'#d97706'},{n:late,l:'مهام متأخرة',c:'#dc2626'},{n:pct+'%',l:'نسبة الإنجاز',c:'#7c3aed'}]
      .map(s=>`<div style="background:var(--color-background-secondary);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:20px;font-weight:500;color:${s.c};margin-bottom:1px">${s.n}</div>
        <div style="font-size:10px;color:var(--color-text-secondary)">${s.l}</div>
      </div>`).join('')}
  </div>`;

  // Excel-like cell style helper
  const XL_BORDER='1px solid #c6c6c6';
  const xl=(extra='')=>`border:${XL_BORDER};padding:5px 8px;${extra}`;
  const xlH=(extra='')=>`border:${XL_BORDER};padding:6px 8px;background:#d8e4bc;font-size:10px;font-weight:700;color:#1a1a1a;${extra}`;

  const empSections=emps.map(u=>{
    const mine=tasksData.filter(t=>t.assigned_to===u.id&&t.status!=='cancelled');
    const doneT=mine.filter(t=>t.status==='done');
    const pendingT=mine.filter(t=>t.status!=='done');
    const lateT=mine.filter(t=>t.carry_over_days>0&&t.status!=='done');
    const notes=_getEmpNotes(u.id);
    const init=(u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2);
    const phone=String(u.phone||u.mobile||u.whatsapp_phone||'').replace(/\D/g,'');

    // pending rows only (main table)
    const rows=pendingT.map((t,i)=>{
      const carried=t.carry_over_days>0;
      const doneAt=_taskDoneAt[t.id]||'';
      const rowBg=carried?'#fffde7':i%2===0?'#ffffff':'#f7fbf0';
      const taskMsg=`السلام عليكم ${u.name} 👋\n\nتذكير بمهمة:\n*${t.title}*${t.client_name?'\n🏢 '+t.client_name:''}\n\n— MS Accounting`;
      return `<tr style="background:${rowBg}">
        <td style="${xl('text-align:center;font-size:10px;color:#555;width:3%')}">${i+1}</td>
        <td style="${xl('width:36%')}">
          ${carried?`<span style="background:#ff6d00;color:white;border-radius:2px;padding:0 4px;font-size:8px;font-weight:700;margin-left:4px">مرحّل</span>`:''}
          <span style="color:#1a1a1a;font-size:11.5px">${escH(t.title)}</span>
          ${t.client_name?`<span style="color:#666;font-size:10px"> · ${escH(t.client_name)}</span>`:''}
        </td>
        <td style="${xl('text-align:center;font-size:10px;color:#555;width:8%')}">${t.created_at?t.created_at.slice(5,10).replace('-','/'):'—'}</td>
        <td style="${xl('text-align:center;font-size:10px;color:'+(t.due_date&&new Date(t.due_date)<new Date()?'#c00':'#555')+';width:9%')}">${t.due_date||'—'}</td>
        <td style="${xl('text-align:center;font-size:10px;color:#555;width:12%')}">${doneAt}</td>
        <td style="${xl('text-align:center;width:6%')}">
          <div onclick="window._markDone(${t.id})"
            style="width:20px;height:20px;border-radius:3px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;transition:all .12s;background:white;border:1.5px solid #999;color:transparent">
            ✓
          </div>
        </td>
        <td style="${xl('text-align:center;width:8%')}">
          ${phone
            ?`<a href="https://wa.me/${phone}?text=${encodeURIComponent(taskMsg)}" target="_blank"
                style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:#25D366;border-radius:4px;text-decoration:none;font-size:13px">📲</a>`
            :`<span style="font-size:9px;color:#999">لا رقم</span>`
          }
        </td>
        <td style="${xl('text-align:center;width:6%')}">
          <button onclick="showTaskModal(${t.id})" style="background:#e8f0fe;border:1px solid #aac4ff;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:11px;color:#1a2472">✏️</button>
        </td>
        <td style="${xl('text-align:center;width:6%')}">
          <button onclick="deleteTask(${t.id},null)" style="background:#fce8e6;border:1px solid #f5c6c2;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:11px;color:#c00">🗑️</button>
        </td>
      </tr>`;
    }).join('');

    // completed tasks section
    const completedRows=doneT.map((t,i)=>{
      const doneAt=_taskDoneAt[t.id]||t.updated_at?.slice(11,16)||'';
      return `<tr style="background:#f6fef9">
        <td style="${xl('text-align:center;font-size:10px;color:#888;width:3%')}">${i+1}</td>
        <td style="${xl('width:36%')}">
          <span style="text-decoration:line-through;color:#888;font-size:11.5px">${escH(t.title)}</span>
          ${t.client_name?`<span style="color:#aaa;font-size:10px"> · ${escH(t.client_name)}</span>`:''}
        </td>
        <td style="${xl('text-align:center;font-size:10px;color:#aaa;width:8%')}">${t.created_at?t.created_at.slice(5,10).replace('-','/'):'—'}</td>
        <td style="${xl('text-align:center;font-size:10px;color:#aaa;width:9%')}">${t.due_date||'—'}</td>
        <td style="${xl('text-align:center;font-size:10px;color:#15803d;font-weight:600;width:12%')}">${doneAt||'✓'}</td>
        <td style="${xl('text-align:center;width:6%')}">
          <div onclick="window._markDone(${t.id})" title="إلغاء الإنجاز"
            style="width:20px;height:20px;border-radius:3px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:#1e7e34;color:white;border:1px solid #155724">
            ✓
          </div>
        </td>
        <td style="${xl('text-align:center;width:8%')}"></td>
        <td style="${xl('text-align:center;width:6%')}">
          <button onclick="showTaskModal(${t.id})" style="background:#e8f0fe;border:1px solid #aac4ff;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:11px;color:#1a2472">✏️</button>
        </td>
        <td style="${xl('text-align:center;width:6%')}">
          <button onclick="deleteTask(${t.id},null)" style="background:#fce8e6;border:1px solid #f5c6c2;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:11px;color:#c00">🗑️</button>
        </td>
      </tr>`;
    }).join('');

    const completedSection=doneT.length===0?'': `
      <details style="border-top:2px solid #bbf7d0">
        <summary style="padding:8px 14px;font-size:11px;font-weight:700;color:#15803d;cursor:pointer;background:#f0fdf4;user-select:none;list-style:none;display:flex;align-items:center;gap:6px">
          <span style="font-size:13px">✅</span> المهام المكتملة (${doneT.length})
          <span style="margin-right:auto;font-size:10px;color:#94a3b8">اضغط للعرض</span>
        </summary>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:540px">
            <tbody>${completedRows}</tbody>
          </table>
        </div>
      </details>`;

    return `<div style="background:white;border:1px solid #b0b0b0;border-radius:6px;margin-bottom:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <div style="background:#1a2472;padding:9px 14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:9px">
          <div style="width:30px;height:30px;border-radius:50%;background:#fff;color:#1a2472;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${escH(init)}</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:white">${escH(u.name)}</div>
            <div style="font-size:10px;color:rgba(255,255,255,.7)">${mine.length} مهمة · ${doneT.length} منجز · ${pendingT.length} متبق${lateT.length?` · <span style="color:#ffcc00">${lateT.length} متأخرة</span>`:''}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${doneT.length===mine.length&&mine.length>0?'<span style="background:#25D366;color:white;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700">مكتمل ✓</span>':''}
          <button onclick="window._empWA(${u.id})" style="background:#25D366;color:white;border:none;border-radius:5px;padding:5px 11px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:700">📱 إرسال الكل</button>
          <button onclick="window._empDelAll(${u.id})" style="background:#dc3545;color:white;border:none;border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer;font-family:inherit">🗑️ مسح الكل</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:540px">
          <thead><tr>
            <th style="${xlH('text-align:center;width:3%')}">#</th>
            <th style="${xlH('text-align:right;width:36%')}">المهمة</th>
            <th style="${xlH('text-align:center;width:8%')}">الإضافة</th>
            <th style="${xlH('text-align:center;width:9%')}">الاستحقاق</th>
            <th style="${xlH('text-align:center;width:12%')}">وقت الإنجاز</th>
            <th style="${xlH('text-align:center;width:6%')}">✓</th>
            <th style="${xlH('text-align:center;width:8%')}">واتساب</th>
            <th style="${xlH('text-align:center;width:6%')}">تعديل</th>
            <th style="${xlH('text-align:center;width:6%')}">حذف</th>
          </tr></thead>
          <tbody>
            ${pendingT.length===0?`<tr><td colspan="9" style="text-align:center;padding:12px;font-size:11px;color:#15803d;font-weight:600;border:${XL_BORDER}">🎉 جميع المهام مكتملة</td></tr>`:''}
            ${rows}
          </tbody>
        </table>
      </div>
      ${completedSection}
      <div style="padding:8px 12px;background:var(--color-background-secondary);border-top:0.5px dashed var(--color-border-tertiary);display:flex;align-items:center;gap:8px">
        <input id="newt_${u.id}" class="input" placeholder="اكتب مهمة جديدة واضغط Enter..."
          style="flex:1;font-size:11px;padding:6px 10px"
          onkeydown="if(event.key==='Enter')window._addEmpTask(${u.id})"/>
        <button onclick="window._addEmpTask(${u.id})" style="background:#1a2472;color:white;border:none;border-radius:7px;padding:6px 12px;font-size:11px;cursor:pointer;font-family:inherit">+ إضافة</button>
      </div>
      <div style="padding:6px 12px 8px;background:var(--color-background-secondary);display:flex;align-items:center;gap:6px;border-top:0.5px solid var(--color-border-tertiary)">
        <span style="font-size:12px;flex-shrink:0">📝</span>
        <input id="empnotes_${u.id}" value="${escH(notes)}" placeholder="ملاحظات للموظف..."
          style="flex:1;border:none;background:transparent;font-size:11px;font-family:inherit;color:var(--color-text-secondary);outline:none"
          onchange="window._saveEmpNotes(${u.id},this.value)"/>
      </div>
    </div>`;
  }).join('');

  main.innerHTML=`
  <div style="background:linear-gradient(135deg,#0d1540,#1a2472);border-radius:14px;padding:14px 18px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
    <div>
      <div style="color:white;font-size:15px;font-weight:500">📋 المهام اليومية — نظام التشغيل</div>
      <div style="color:rgba(255,255,255,.65);font-size:11px;margin-top:2px">${todayLbl}</div>
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button onclick="showTaskModal()" style="padding:6px 13px;border-radius:8px;background:white;color:#1a2472;border:none;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit">+ مهمة جديدة</button>
      <button onclick="window._genWAMessage()" style="padding:6px 13px;border-radius:8px;background:#25D366;color:white;border:none;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit">📱 واتساب الغد</button>
      <button onclick="window._refreshTasksBtn(this)" style="padding:6px 13px;border-radius:8px;background:rgba(255,255,255,.2);color:white;border:1px solid rgba(255,255,255,.4);font-size:12px;cursor:pointer;font-family:inherit">🔄 تحديث</button>
    </div>
  </div>
  ${statsHTML}
  ${empSections||'<div style="text-align:center;padding:40px;color:var(--color-text-secondary);font-size:13px">لا يوجد موظفون — أضفهم من صفحة المستخدمين</div>'}
  `;
}

// ── Action handlers ────────────────────────────────────────────────────
window._markDone = async function(id) {
  const t=tasksData.find(x=>x.id===id);
  if(!t) return;
  const isDone=t.status==='done';
  const newStatus=isDone?'todo':'done';
  try {
    await api('PUT',`/api/tasks/${id}`,{status:newStatus},{useCache:false});
    t.status=newStatus;
    if(!isDone){
      const now=new Date();
      _taskDoneAt[id]=now.toLocaleDateString('ar-EG',{day:'numeric',month:'numeric'})+' '+now.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
    } else { delete _taskDoneAt[id]; }
    renderDailySheet();
  } catch(e){toast(e.message,'error');}
};

window._addEmpTask = async function(uid) {
  const inp=document.getElementById('newt_'+uid);
  if(!inp||!inp.value.trim()) return;
  const txt=inp.value.trim();
  inp.value='';

  // Optimistic: add task locally right now, don't wait for server
  const tempId = 'tmp_' + Date.now();
  const tempTask = {
    id: tempId, title: txt, assigned_to: uid, status: 'todo',
    priority: 'medium', category: 'other',
    created_at: new Date().toISOString(), due_date: null,
    carry_over_days: 0, client_name: null, _optimistic: true
  };
  tasksData.push(tempTask);
  renderDailySheet();
  setTimeout(()=>{const el=document.getElementById('newt_'+uid);if(el)el.focus();},50);

  // Then sync with server in background
  try {
    const res=await api('POST','/api/tasks',{title:txt,assigned_to:uid,status:'todo',priority:'medium',category:'other'},{useCache:false});
    // Replace temp with real task
    const idx=tasksData.findIndex(t=>t.id===tempId);
    if(idx>=0) tasksData[idx]={...tempTask,...res,id:res.id,_optimistic:false};
    _AC.invalidate('/api/tasks');
    renderDailySheet();
  } catch(e){
    // Rollback
    tasksData=tasksData.filter(t=>t.id!==tempId);
    renderDailySheet();
    toast('فشل حفظ المهمة — '+e.message,'error');
  }
};

window._empWA = function(uid) {
  const u=tasksUsersData.find(x=>x.id===uid); if(!u) return;
  const pending=tasksData.filter(t=>t.assigned_to===uid&&t.status!=='done'&&t.status!=='cancelled');
  if(!pending.length){toast('لا توجد مهام متبقية لـ '+u.name,'warning');return;}
  const dateStr=new Date().toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const defaultMsg=`السلام عليكم ${u.name} 👋\n\nمهام اليوم — ${dateStr}:\n`
    +pending.map((t,i)=>`${i+1}- ${t.title}${t.client_name?' ('+t.client_name+')':''}`).join('\n')
    +`\n\nبالتوفيق 🙏\n— MS Accounting`;
  const phone=String(u.phone||u.mobile||u.whatsapp_phone||'').replace(/\D/g,'');

  const ov=document.createElement('div'); ov.className='modal-overlay';
  ov.innerHTML=`<div class="modal" style="max-width:440px">
    <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:14px;font-weight:700;color:#1e293b">📱 إرسال مباشر لـ ${escH(u.name)}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:2px">${pending.length} مهمة متبقية · ${phone?'رقم: '+phone:'⚠️ لا يوجد رقم مسجل'}</div>
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:18px;cursor:pointer">✕</button>
    </div>
    <div style="padding:14px 18px">
      <textarea id="empWATxt" style="width:100%;height:170px;background:#e9f5e1;border:1px solid #86efac;border-radius:8px;padding:12px;font-size:12px;color:#1a3c00;line-height:1.9;direction:rtl;resize:vertical;font-family:inherit;outline:none">${escH(defaultMsg)}</textarea>
      <div id="empWASendResult" style="margin:8px 0;min-height:20px"></div>
      <div style="display:flex;flex-direction:column;gap:7px">
        ${phone
          ? `<button id="empWASendBtn" onclick="window._empWASend(${uid})"
              style="background:#25D366;color:white;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
              📲 إرسال مباشر — بدون فتح واتساب
            </button>`
          : `<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:6px;padding:10px;font-size:11px;color:#92400e">
              ⚠️ لا يوجد رقم واتساب لـ ${escH(u.name)} — أضفه من صفحة الإعدادات → الفريق
            </div>
            <button onclick="navigator.clipboard?.writeText(document.getElementById('empWATxt').value);toast('📋 تم النسخ')"
              style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:12px;cursor:pointer;font-family:inherit">
              📋 نسخ الرسالة يدوياً
            </button>`
        }
        <button onclick="this.closest('.modal-overlay').remove()" style="background:var(--color-background-secondary);border:0.5px solid var(--color-border-tertiary);border-radius:8px;padding:8px;font-size:12px;cursor:pointer;font-family:inherit;color:var(--color-text-secondary)">إغلاق</button>
      </div>
    </div>
  </div>`;
  document.body.append(ov);
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
};

window._empWASend = async function(uid) {
  const u=tasksUsersData.find(x=>x.id===uid); if(!u) return;
  const phone=String(u.phone||u.mobile||u.whatsapp_phone||'').replace(/\D/g,'');
  const msg=document.getElementById('empWATxt')?.value?.trim();
  const resEl=document.getElementById('empWASendResult');
  const btn=document.getElementById('empWASendBtn');
  if(!phone||!msg) return;
  if(btn){btn.disabled=true;btn.textContent='⏳ جاري الإرسال...';}
  if(resEl) resEl.innerHTML='';
  try {
    await api('POST','/api/notifications/whatsapp-test',{
      phone, message:msg,
    },{useCache:false});
    if(resEl) resEl.innerHTML=`<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:9px 12px;font-size:12px;color:#15803d;font-weight:700">
      ✅ تم الإرسال بنجاح إلى ${escH(u.name)}<br>
      <span style="font-size:10px;font-weight:400;color:#64748b">${new Date().toLocaleString('ar-EG')}</span>
    </div>`;
    if(btn){btn.disabled=false;btn.textContent='📲 إرسال مرة أخرى';}
    toast(`✅ تم إرسال الرسالة لـ ${u.name}`);
  } catch(e) {
    const isNotConfigured=e.message?.includes('GREENAPI')||e.message?.includes('غير مُعيَّن');
    if(resEl) resEl.innerHTML=`<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:9px 12px;font-size:12px;color:#dc2626">
      ❌ فشل الإرسال: ${escH(e.message)}<br>
      ${isNotConfigured?`<span style="font-size:10px">→ اذهب للإعدادات → واتساب وأضف GREENAPI_INSTANCE_ID و GREENAPI_TOKEN</span>`:''}
    </div>`;
    if(btn){btn.disabled=false;btn.textContent='🔄 إعادة المحاولة';}
    toast('❌ فشل إرسال الواتساب: '+e.message,'error');
  }
};

window._empDelAll = async function(uid) {
  const u=tasksUsersData.find(x=>x.id===uid);
  const mine=tasksData.filter(t=>t.assigned_to===uid);
  if(!mine.length){toast('لا توجد مهام','warning');return;}
  if(!await confirmDlg(`حذف جميع مهام ${u?.name||'الموظف'}؟ (${mine.length} مهمة)`)) return;
  try {
    await Promise.all(mine.map(t=>api('DELETE',`/api/tasks/${t.id}`).catch(()=>{})));
    _AC.invalidate('/api/tasks');
    loadTasks(true);
    toast('تم مسح المهام ✅');
  } catch(e){toast(e.message,'error');}
};

async function _restoreTask(id) {
  try {
    await api('PUT',`/api/tasks/${id}`,{status:'todo'});
    tasksData=tasksData.map(t=>t.id===id?{...t,status:'todo'}:t);
    renderDailySheet(); toast('تمت إعادة المهمة');
  } catch(e){toast(e.message,'error');}
}

function _copyText(txt) {
  if(navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(()=>toast('📋 تم النسخ')).catch(()=>_copyFallback(txt));
  } else { _copyFallback(txt); }
}
function _copyFallback(txt) {
  const ta=document.createElement('textarea');
  ta.value=txt; ta.style.cssText='position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try{document.execCommand('copy');toast('📋 تم النسخ');}catch(e){toast('افتح وانسخ يدوياً','warning');}
  document.body.removeChild(ta);
}

window._refreshTasksBtn = function(btn) {
  const orig=btn.textContent; btn.textContent='⏳'; btn.disabled=true;
  loadTasks(true).finally(()=>{btn.textContent=orig;btn.disabled=false;});
};

window._genWAMessage = function() {
  try {
    const tmr=new Date(); tmr.setDate(tmr.getDate()+1);
    const dateStr=tmr.toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const lines=[`📋 *مهام يوم ${dateStr}*\n`];
    TASK_EMPS.forEach(name=>{
      const u=tasksUsersData.find(u=>(u.name||'').trim()===name); if(!u) return;
      const mine=tasksData.filter(t=>t.assigned_to===u.id&&t.status!=='done'&&t.status!=='cancelled');
      if(!mine.length) return;
      lines.push(`\n*${u.name}:*`);
      mine.forEach((t,i)=>lines.push(`${i+1}. ${t.title}${t.client_name?' ('+t.client_name+')':''}`));
    });
    const unassigned=tasksData.filter(t=>!t.assigned_to&&t.status!=='done'&&t.status!=='cancelled');
    if(unassigned.length){lines.push('\n*غير مكلف:*');unassigned.forEach((t,i)=>lines.push(`${i+1}. ${t.title}`));}
    const msg=lines.join('\n');
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.innerHTML=`<div class="modal" style="max-width:420px">
      <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:14px;font-weight:600;color:#1e293b">📱 رسالة واتساب الغد</div>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:18px;cursor:pointer">✕</button>
      </div>
      <div style="padding:14px 18px">
        <textarea id="waMsgTxt" style="width:100%;height:200px;background:#e9f5e1;border:none;border-radius:10px;padding:12px;font-size:12px;color:#1a3c00;line-height:1.9;direction:rtl;resize:vertical;font-family:inherit;outline:none">${escH(msg)}</textarea>
        <button id="copyWABtn" style="width:100%;background:#25D366;color:white;border:none;padding:11px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;margin-top:10px">📋 نسخ الرسالة</button>
      </div>
    </div>`;
    document.body.append(ov);
    ov.onclick=e=>{if(e.target===ov)ov.remove();};
    document.getElementById('copyWABtn').onclick=()=>_copyText(document.getElementById('waMsgTxt').value);
  } catch(e){toast('خطأ: '+e.message,'error');}
};

// ── Assign task (used by kanban/folders) ──────────────────────────────
async function _assignTask(taskId, userId, assign) {
  try {
    const newAssignee=assign?userId:null;
    await api('PUT',`/api/tasks/${taskId}`,{assigned_to:newAssignee});
    const emp=tasksUsersData.find(u=>u.id===userId);
    tasksData=tasksData.map(t=>t.id===taskId?{...t,assigned_to:newAssignee,assigned_to_name:assign?(emp?.name||null):null}:t);
    if(assign&&emp){
      const t=tasksData.find(t=>t.id===taskId);
      const due=t?.due_date?new Date(t.due_date).toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit',year:'numeric'}):'غير محدد';
      const msg=`📋 مهمة جديدة:\n\n*${t?.title||''}*\n🏢 ${t?.client_name||'—'}\n📅 ${due}\n\n— MS Accounting`;
      const phone=String(emp.phone||emp.mobile||'').replace(/\D/g,'');
      if(phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,'_blank');
      else {navigator.clipboard.writeText(msg).catch(()=>{});toast(`📋 تم نسخ رسالة لـ ${emp.name}`);}
    }
    renderDailySheet();
    toast(assign?`✅ تم تعيين المهمة لـ ${emp?.name||''}`:' تم إلغاء التعيين');
  } catch(e){toast(e.message,'error');}
}

// ── Employee folder cards view ──────────────────────────────────────
function renderTaskFolders() {
  const main = document.getElementById('main');
  const empMap = {};
  tasksData.forEach(t => {
    const key  = t.assigned_to || 0;
    const name = t.assigned_to_name || (key ? `مستخدم #${key}` : 'غير محدد');
    if (!empMap[key]) empMap[key] = {id: key, name, pending: [], done: []};
    if (t.status === 'done' || t.status === 'cancelled') empMap[key].done.push(t);
    else empMap[key].pending.push(t);
  });
  const emps = Object.values(empMap).sort((a,b) => b.pending.length - a.pending.length);
  main.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px">
    <div>
      <h2 style="font-size:18px;font-weight:800;color:#1e293b;margin:0">✅ المهام</h2>
      <p style="font-size:13px;color:#64748b;margin:4px 0 0">${tasksData.length} مهمة — ${emps.filter(e=>e.pending.length>0).length} موظف لديه مهام قيد التنفيذ</p>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="_taskViewMode='daily';renderDailySheet()"
        style="padding:8px 16px;background:white;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;color:#475569">📋 اليومية</button>
      <button onclick="showTaskModal()" class="btn btn-primary" style="font-size:13px">➕ مهمة جديدة</button>
    </div>
  </div>
  ${emps.find(e=>e.id===0) ? `
  <div style="background:#fff8f0;border:1.5px solid #fed7aa;border-radius:14px;padding:14px 18px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <span style="font-size:13px;font-weight:700;color:#c2410c">⚠️ مهام بدون موظف محدد</span>
      <span style="font-size:12px;color:#9a3412;margin-right:10px">${emps.find(e=>e.id===0).pending.length} معلقة</span>
    </div>
    <button onclick="openEmployeeTasks(0,'غير محدد')"
      style="padding:6px 14px;background:#f97316;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">عرض</button>
  </div>` : ''}
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
    ${emps.filter(e=>e.id!==0).map(emp => {
      const overdue = emp.pending.filter(t => t.due_date && daysUntil(t.due_date) < 0).length;
      const urgent  = emp.pending.filter(t => t.priority === 'urgent').length;
      return `
    <div style="background:white;border-radius:16px;padding:20px;border:1.5px solid #e8edf3;box-shadow:0 2px 8px rgba(0,0,0,.05);cursor:pointer;transition:transform .15s,box-shadow .15s"
         onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,.1)'"
         onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(0,0,0,.05)'"
         onclick="openEmployeeTasks(${emp.id},'${escH(emp.name)}')">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#1a2472,#2563eb);display:flex;align-items:center;justify-content:center;color:white;font-size:16px;font-weight:800;flex-shrink:0">${escH(emp.name[0])}</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#1e293b">${escH(emp.name)}</div>
          ${overdue > 0 ? `<div style="font-size:11px;color:#dc2626;font-weight:600">⚠️ ${overdue} متأخرة</div>` :
            urgent > 0  ? `<div style="font-size:11px;color:#f97316;font-weight:600">🔴 ${urgent} عاجل</div>` :
            `<div style="font-size:11px;color:#94a3b8">لا تنبيهات</div>`}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div style="background:#fef9c3;border-radius:10px;padding:10px;text-align:center;border:1px solid #fde68a">
          <div style="font-size:20px;font-weight:800;color:#92400e">${emp.pending.length}</div>
          <div style="font-size:10px;color:#92400e;font-weight:600">⏳ معلقة</div>
        </div>
        <div style="background:#f0fdf4;border-radius:10px;padding:10px;text-align:center;border:1px solid #bbf7d0">
          <div style="font-size:20px;font-weight:800;color:#15803d">${emp.done.length}</div>
          <div style="font-size:10px;color:#15803d;font-weight:600">✅ مكتملة</div>
        </div>
      </div>
      ${emp.pending.slice(0,2).map(t=>`
      <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;margin-bottom:5px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:#1e293b;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${escH(t.title)}</span>
        <span style="font-size:10px;font-weight:700;color:${PRIORITY_COLOR[t.priority]||'#64748b'};background:${PRIORITY_COLOR[t.priority]||'#64748b'}18;padding:2px 7px;border-radius:5px;white-space:nowrap">${PRIORITY_LABEL[t.priority]||''}</span>
      </div>`).join('')}
      ${emp.pending.length > 2 ? `<div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:4px">+ ${emp.pending.length-2} مهام أخرى</div>` : ''}
    </div>`}).join('')}
    ${emps.filter(e=>e.id!==0).length === 0 ? `
    <div style="grid-column:1/-1;text-align:center;padding:60px;color:#94a3b8">
      <div style="font-size:48px;margin-bottom:12px">✅</div>
      <div style="font-size:16px;font-weight:600">لا توجد مهام مسندة لموظفين</div>
    </div>` : ''}
  </div>`;
}

async function openEmployeeTasks(empId, empName) {
  _taskEmpFilter = {id: empId, name: empName};
  _taskViewMode  = 'folders';
  const main = document.getElementById('main');
  main.innerHTML='<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  try {
    const res = empId
      ? await api('GET', `/api/tasks?assigned_to=${empId}&page_size=200`)
      : await api('GET', '/api/tasks?page_size=200');
    tasksData = (res?.items || []).filter(t => empId === 0 ? !t.assigned_to : true);
    renderEmployeeTasks();
  } catch(e) { toast(e.message, 'error'); }
}

function renderEmployeeTasks() {
  const main = document.getElementById('main');
  const emp  = _taskEmpFilter;
  const pending = tasksData.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  const done    = tasksData.filter(t => t.status === 'done');
  const taskCard = (t, showDone = false) => {
    const overdue = t.due_date && daysUntil(t.due_date) < 0 && t.status !== 'done';
    return `
    <div style="background:white;border-radius:14px;padding:16px 18px;border:1.5px solid ${overdue?'#fecaca':'#e8edf3'};box-shadow:0 1px 6px rgba(0,0,0,.04);display:flex;gap:14px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-size:14px;font-weight:700;color:${showDone?'#94a3b8':'#1e293b'};${showDone?'text-decoration:line-through':''}">${escH(t.title)}</span>
          <span style="font-size:11px;font-weight:700;color:${PRIORITY_COLOR[t.priority]||'#64748b'};background:${PRIORITY_COLOR[t.priority]||'#64748b'}18;padding:2px 9px;border-radius:8px;white-space:nowrap">${PRIORITY_LABEL[t.priority]||''}</span>
        </div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#64748b">
          ${t.client_name ? `<span>👤 ${escH(t.client_name)}</span>` : ''}
          ${t.due_date    ? `<span style="color:${overdue?'#dc2626':'#64748b'};font-weight:${overdue?'700':'400'}">${overdue?'⚠️ متأخر: ':'📅 '}${dateAr(t.due_date)}</span>` : ''}
        </div>
        ${t.notes ? `<div style="font-size:11px;color:#94a3b8;margin-top:5px">${escH(t.notes)}</div>` : ''}
      </div>
      ${!showDone ? `
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button onclick="quickDoneTask(${t.id})"
          style="padding:7px 14px;background:#15803d;color:white;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">✅ خلصت</button>
        <button onclick="showTaskModal(${t.id})"
          style="padding:5px 10px;background:#f1f5f9;color:#475569;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer">تعديل</button>
      </div>` : `
      <div style="flex-shrink:0">
        <span style="background:#f0fdf4;color:#15803d;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700">✓ مكتمل</span>
      </div>`}
    </div>`;
  };
  main.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:20px">
    <div style="display:flex;align-items:center;gap:12px">
      <button onclick="_taskEmpFilter=null;loadTasks()"
        style="background:#f1f5f9;border:none;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:13px;color:#475569">← رجوع</button>
      <div>
        <h2 style="font-size:16px;font-weight:800;color:#1e293b;margin:0">👷 مهام ${escH(emp.name)}</h2>
        <p style="font-size:12px;color:#64748b;margin:2px 0 0">${pending.length} معلقة · ${done.length} مكتملة</p>
      </div>
    </div>
    <button onclick="showTaskModal()" class="btn btn-primary" style="font-size:13px">➕ مهمة جديدة</button>
  </div>
  <div style="margin-bottom:24px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <span style="font-size:15px;font-weight:800;color:#92400e">⏳ الشغل المفروض يعمله</span>
      <span style="background:#fef9c3;color:#92400e;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;border:1px solid #fde68a">${pending.length}</span>
    </div>
    ${pending.length === 0 ? `<div style="text-align:center;padding:40px;background:white;border-radius:14px;border:1.5px dashed #e2e8f0;color:#94a3b8"><div style="font-size:32px;margin-bottom:8px">🎉</div><div style="font-size:14px;font-weight:600">مفيش شغل معلق!</div></div>` :
    `<div style="display:flex;flex-direction:column;gap:10px">${pending.map(t => taskCard(t, false)).join('')}</div>`}
  </div>
  ${done.length > 0 ? `
  <div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <span style="font-size:15px;font-weight:800;color:#15803d">✅ الشغل اللي خلص</span>
      <span style="background:#f0fdf4;color:#15803d;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;border:1px solid #bbf7d0">${done.length}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">${done.map(t => taskCard(t, true)).join('')}</div>
  </div>` : ''}`;
}

async function quickDoneTask(id) {
  try {
    await api('PUT', `/api/tasks/${id}`, {status:'done'});
    tasksData = tasksData.map(t => t.id === id ? {...t, status:'done'} : t);
    renderEmployeeTasks();
    toast('✅ تم إنجاز المهمة');
  } catch(e) { toast(e.message, 'error'); }
}

// ── Kanban board view ───────────────────────────────────────────────
function renderKanban() {
  const main=document.getElementById('main');
  main.className='page';
  const cols=[
    {id:'todo',label:'قيد الانتظار',color:'#64748b',bg:'#f8fafc'},
    {id:'in_progress',label:'جاري التنفيذ',color:'#1a2472',bg:'#eef1fb'},
    {id:'done',label:'مكتمل',color:'#16a34a',bg:'#f0fdf4'},
    {id:'cancelled',label:'ملغى',color:'#dc2626',bg:'#fff5f5'},
  ];
  main.innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button onclick="_taskViewMode='daily';renderDailySheet()"
        style="padding:7px 14px;background:white;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;color:#475569">📋 اليومية</button>
      <button onclick="_taskViewMode='folders';_taskEmpFilter=null;renderTaskFolders()"
        style="padding:7px 14px;background:white;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;color:#475569">👥 الفولدرات</button>
      ${cols.map(c=>{const n=tasksData.filter(t=>t.status===c.id).length;return`<span style="font-size:12px;background:${c.bg};color:${c.color};padding:4px 12px;border-radius:8px;font-weight:700;border:1.5px solid ${c.color}22">${c.label} (${n})</span>`}).join('')}
    </div>
    <button class="btn btn-primary" onclick="showTaskModal()">+ مهمة جديدة</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start">
    ${cols.map(col=>`
    <div class="kanban-col" style="background:${col.bg};padding:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:13px;font-weight:700;color:${col.color}">${col.label}</span>
        <span style="background:${col.color};color:white;width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${tasksData.filter(t=>t.status===col.id).length}</span>
      </div>
      ${tasksData.filter(t=>t.status===col.id).map(t=>`
      <div class="kanban-card priority-${t.priority}" onclick="showTaskModal(${t.id})">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">
          <div style="font-size:13px;font-weight:600;color:#1e293b;line-height:1.4">${escH(t.title)}</div>
          <span style="font-size:10px;font-weight:700;color:${PRIORITY_COLOR[t.priority]||'#64748b'};white-space:nowrap;background:${PRIORITY_COLOR[t.priority]||'#64748b'}18;padding:2px 8px;border-radius:6px">${PRIORITY_LABEL[t.priority]||t.priority}</span>
        </div>
        ${t.assigned_to_name?`<div style="font-size:11px;color:#1a2472;margin-bottom:4px;font-weight:600">👷 ${escH(t.assigned_to_name)}</div>`:''}
        ${t.client_name?`<div style="font-size:11px;color:#64748b;margin-bottom:4px">👤 ${escH(t.client_name)}</div>`:''}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
          ${t.due_date?`<span style="font-size:11px;color:${(daysUntil(t.due_date)<=0&&t.status!=='done'&&t.status!=='cancelled')?'#dc2626':'#64748b'};font-weight:600">${(daysUntil(t.due_date)<=0&&t.status!=='done'&&t.status!=='cancelled')?'⚠ متأخر':dateAr(t.due_date)}</span>`:'<span></span>'}
        </div>
        <div style="margin-top:10px;display:flex;gap:6px" onclick="event.stopPropagation()">
          ${cols.filter(c=>c.id!==col.id).slice(0,2).map(c=>`<button onclick="updateTaskStatus(${t.id},'${c.id}')" style="font-size:10px;padding:3px 8px;border-radius:6px;background:${c.bg};color:${c.color};border:1px solid ${c.color}33;cursor:pointer;font-family:inherit;font-weight:600">${c.label}</button>`).join('')}
        </div>
      </div>`).join('')}
      ${tasksData.filter(t=>t.status===col.id).length===0?`<div style="text-align:center;padding:24px;color:#94a3b8;font-size:12px">لا مهام</div>`:''}
    </div>`).join('')}
  </div>`;
}

async function updateTaskStatus(id, status) {
  try {
    await api('PUT',`/api/tasks/${id}`,{status});
    tasksData=tasksData.map(t=>t.id===id?{...t,status}:t);
    renderKanban();
    toast('تم تحديث حالة المهمة');
  } catch(e){toast(e.message,'error')}
}

// ── Task Modal (add / edit) ────────────────────────────────────────────
async function showTaskModal(id=null) {
  const t = id ? tasksData.find(x=>x.id===id) : null;
  const defaultAssignee = _taskEmpFilter?.id || null;
  let clients=[];
  try { clients=await getClients(); } catch(e){}
  const users = TASK_EMPS.map(name=>tasksUsersData.find(u=>(u.name||'').trim()===name)).filter(Boolean);
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal" style="max-width:540px;max-height:90vh;overflow-y:auto">
    <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;z-index:1">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">${t?'✏️ تعديل مهمة':'➕ مهمة جديدة'}</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="padding:18px 22px;display:flex;flex-direction:column;gap:13px">
      <div>
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">عنوان المهمة *</label>
        <input id="tTitle" class="input" value="${escH(t?.title||'')}" placeholder="مثال: مراجعة إقرار ضريبة القيمة المضافة"/>
      </div>
      <div class="form-row">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">👷 الموظف المسؤول</label>
          <select id="tAssignee" class="input">
            <option value="">— بلا موظف —</option>
            ${users.map(u=>`<option value="${u.id}" ${(t?.assigned_to||defaultAssignee)==u.id?'selected':''}>${escH(u.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">العميل / الشركة</label>
          <input id="tClientName" class="input" value="${escH(t?.client_name||'')}" placeholder="اكتب اسم العميل أو الشركة..."/>
        </div>
      </div>
      <div class="form-row">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">📅 تاريخ الاستحقاق</label>
          <input id="tDue" class="input" type="date" value="${t?.due_date||''}"/>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الحالة</label>
          <select id="tStatus" class="input">
            <option value="todo"        ${!t||t?.status==='todo'       ?'selected':''}>⏳ لم تبدأ</option>
            <option value="in_progress"  ${t?.status==='in_progress'   ?'selected':''}>🔄 جاري العمل</option>
            <option value="waiting_docs" ${t?.status==='waiting_docs'  ?'selected':''}>📎 انتظار مستندات</option>
            <option value="done"         ${t?.status==='done'          ?'selected':''}>✅ تم التنفيذ</option>
            <option value="cancelled"    ${t?.status==='cancelled'     ?'selected':''}>❌ ملغى</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">الأولوية</label>
          <select id="tPriority" class="input">
            <option value="urgent" ${t?.priority==='urgent'?'selected':''}>🔴 عاجل</option>
            <option value="high"   ${t?.priority==='high'  ?'selected':''}>🟠 عالي</option>
            <option value="medium" ${!t||t?.priority==='medium'?'selected':''}>🟡 متوسط</option>
            <option value="low"    ${t?.priority==='low'   ?'selected':''}>🟢 منخفض</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">التصنيف</label>
          <select id="tCat" class="input">
            <option value="tax"        ${t?.category==='tax'       ?'selected':''}>ضرائب</option>
            <option value="accounting" ${t?.category==='accounting'?'selected':''}>محاسبة</option>
            <option value="payroll"    ${t?.category==='payroll'   ?'selected':''}>مرتبات</option>
            <option value="legal"      ${t?.category==='legal'     ?'selected':''}>قانوني</option>
            <option value="other"      ${!t||t?.category==='other' ?'selected':''}>أخرى</option>
          </select>
        </div>
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px">📝 ملاحظات</label>
        <textarea id="tNotes" class="input" rows="2" placeholder="مثال: العميل مستعجل — راجع أحمد قبل الإرسال">${escH(t?.notes||t?.inline_notes||'')}</textarea>
      </div>
      <!-- مهمة متكررة -->
      <div id="recurToggleRow" onclick="document.getElementById('tRecur').checked=!document.getElementById('tRecur').checked;_toggleRecurUI()"
        style="display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:10px;border:1.5px solid ${t?.is_recurring?'#7c3aed':'#e2e8f0'};background:${t?.is_recurring?'#ede9fe':'#f8fafc'};cursor:pointer;transition:all .15s">
        <input type="checkbox" id="tRecur" ${t?.is_recurring?'checked':''} style="pointer-events:none;accent-color:#7c3aed;width:16px;height:16px"/>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:#1e293b">🔁 مهمة متكررة</div>
          <div style="font-size:11px;color:#64748b">تتجدد تلقائياً في موعدها</div>
        </div>
        <select id="tRecurType" onclick="event.stopPropagation()" class="input" style="width:auto;padding:5px 10px;font-size:12px;${t?.is_recurring?'':'opacity:.4;pointer-events:none'}">
          <option value="monthly"     ${t?.recur_type==='monthly'    ?'selected':''}>شهرية</option>
          <option value="quarterly"   ${t?.recur_type==='quarterly'  ?'selected':''}>ربع سنوية</option>
          <option value="annual"      ${t?.recur_type==='annual'     ?'selected':''}>سنوية</option>
        </select>
      </div>
    </div>
    <div style="padding:14px 22px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end;position:sticky;bottom:0;background:white">
      ${t?`<button class="btn btn-secondary" onclick="deleteTask(${t.id},this.closest('.modal-overlay'))" style="color:#dc2626;border-color:#fecaca">🗑️ حذف</button>`:''}
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button id="saveTaskBtn" class="btn btn-primary">💾 ${t?'حفظ التعديلات':'إضافة مهمة'}</button>
    </div>
  </div>`;
  document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};

  function _toggleRecurUI(){
    const on=document.getElementById('tRecur').checked;
    const row=document.getElementById('recurToggleRow');
    const sel=document.getElementById('tRecurType');
    row.style.borderColor=on?'#7c3aed':'#e2e8f0';
    row.style.background=on?'#ede9fe':'#f8fafc';
    sel.style.opacity=on?'1':'0.4';
    sel.style.pointerEvents=on?'auto':'none';
  }

  document.getElementById('saveTaskBtn').onclick=async()=>{
    const btn=document.getElementById('saveTaskBtn');
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    try {
      const isRecur=document.getElementById('tRecur').checked;
      const body={
        title:       document.getElementById('tTitle').value.trim(),
        assigned_to: parseInt(document.getElementById('tAssignee').value)||null,
        client_id:   (()=>{const n=(document.getElementById('tClientName')?.value||'').trim();const m=clients.find(c=>c.name.trim()===n);return m?m.id:null;})(),
        priority:    document.getElementById('tPriority').value,
        category:    document.getElementById('tCat').value,
        status:      document.getElementById('tStatus').value,
        due_date:    document.getElementById('tDue').value||null,
        notes:       document.getElementById('tNotes').value||null,
        is_recurring:isRecur,
        recur_type:  isRecur?document.getElementById('tRecurType').value:null,
      };
      if(!body.title){toast('عنوان المهمة مطلوب','error');btn.disabled=false;return;}
      if(t) await api('PUT',`/api/tasks/${t.id}`,body);
      else  await api('POST','/api/tasks',body);
      // إغلاق المودال أولاً قبل أي عملية أخرى
      overlay.remove();
      toast(t?'تم تحديث المهمة ✅':'تمت إضافة المهمة ✅');
      loadTasks(true);
    } catch(e){toast(e.message||'فشل الحفظ، حاول مرة أخرى','error');btn.disabled=false;btn.innerHTML=`💾 ${t?'حفظ التعديلات':'إضافة مهمة'}`;}
  };
}

async function deleteTask(id, overlay) {
  if (!await confirmDlg('حذف هذه المهمة نهائياً؟')) return;
  try {
    await api('DELETE', `/api/tasks/${id}`);
    overlay?.remove();
    toast('تم حذف المهمة');
    loadTasks(true);
  } catch(e) { toast(e.message,'error'); }
}

// ── Legacy compat stubs ────────────────────────────────────────────────
function showTaskModalForClient(){showTaskModal();}
function renderTasksTable(){renderDailySheet();}
async function renderOverdueBoard(){loadTasks(false);}
window.backToTasks=()=>loadTasks(false);
window.showKanban=()=>loadTasks(false);
window.showFolders=()=>loadTasks(false);
window._taskClientFilter='';
window.filterTasksByClient=()=>{};

// ── DOCUMENTS ──────────────────────────────────────
// ── DOCUMENTS ──────────────────────────────────────
let docsData=[];

