// Apply saved language on load
window.addEventListener('ms-app-ready', ()=>{
  if(_currentLang === 'en') toggleLanguage();
});

window.toggleLanguage = toggleLanguage;
window.t = t;

// ── Daily Revenues Page ───────────────────────────────────────────────────────
async function loadDailyRevenues() {
  const main = document.getElementById('main');
  main.className = 'page';
  main.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';
  await renderDailyRevenuesPage();
}

async function renderDailyRevenuesPage() {
  const el = document.getElementById('main');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280">جاري التحميل...</div>';

  const now = new Date();
  const _isOwner = currentUser?.role === 'admin';
  const todayStr = now.toISOString().slice(0,10);
  let selYear = now.getFullYear(), selMonth = now.getMonth() + 1;

  async function load() {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280">جاري التحميل...</div>';
    let data;
    try {
      data = await api('GET', '/api/office/revenues?year=' + selYear + '&month=' + selMonth + '&page_size=500');
    } catch(e) {
      el.innerHTML = '<div style="padding:20px;color:#dc2626">حدث خطأ في التحميل</div>'; return;
    }

    const MONTHS_AR = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const years = [now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1];
    const yearOpts = years.map(function(y){ return '<option value="'+y+'"'+(y===selYear?' selected':'')+'>'+y+'</option>'; }).join('');
    const monthOpts = MONTHS_AR.slice(1).map(function(m,i){ return '<option value="'+(i+1)+'"'+((i+1)===selMonth?' selected':'')+'>'+m+'</option>'; }).join('');

    let items = data.items || [];
    // Non-owner: show today only
    if (!_isOwner) items = items.filter(function(r){ return (r.date||r.tx_date||'').slice(0,10) === todayStr; });

    const rows = items.length ? items.map(function(r) {
      var d = new Date(r.date||r.tx_date||'');
      var dateStr = isNaN(d) ? (r.date||'') : d.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit',year:'numeric'});
      var cat = r.category_label || r.category || '';
      return '<tr style="border-bottom:1px solid #f1f5f9">'
        + '<td style="padding:10px 12px">'+dateStr+'</td>'
        + '<td style="padding:10px 12px">'+(r.client_name||'—')+'</td>'
        + '<td style="padding:10px 12px">'+cat+'</td>'
        + '<td style="padding:10px 12px">'+(r.description||'—')+'</td>'
        + '<td style="padding:10px 12px;font-weight:600;color:#059669">'+Number(r.amount||0).toLocaleString('ar-EG')+' ج.م</td>'
        + '<td style="padding:10px 12px;color:#6b7280;font-size:12px">'+(r.notes||'')+'</td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="6" style="padding:30px;text-align:center;color:#9ca3af">لا توجد إيرادات لهذا اليوم</td></tr>';

    var total = Number(data.total_amount||0).toLocaleString('ar-EG');

    var header = _isOwner
      ? '<div style="padding:16px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid #e5e7eb">'
        + '<select id="dr-year" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit">'+yearOpts+'</select>'
        + '<select id="dr-month" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit">'+monthOpts+'</select>'
        + '<button onclick="window._drLoad()" style="padding:6px 16px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit">عرض</button>'
        + '<span style="margin-right:auto;font-weight:700;color:#059669">الإجمالي: '+total+' ج.م</span>'
        + '<span style="color:#6b7280;font-size:13px">('+items.length+' إيراد)</span>'
        + '</div>'
      : '<div style="padding:12px 20px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px">'
        + '📅 ' + now.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit',year:'numeric'})
        + ' — ' + items.length + ' إيراد'
        + '</div>';

    el.innerHTML = header
      + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">'
      + '<thead><tr style="background:#f8fafc;font-weight:600;color:#374151">'
      + '<th style="padding:10px 12px;text-align:right">التاريخ</th>'
      + '<th style="padding:10px 12px;text-align:right">العميل</th>'
      + '<th style="padding:10px 12px;text-align:right">الفئة</th>'
      + '<th style="padding:10px 12px;text-align:right">البيان</th>'
      + '<th style="padding:10px 12px;text-align:right">المبلغ</th>'
      + '<th style="padding:10px 12px;text-align:right">ملاحظات</th>'
      + '</tr></thead>'
      + '<tbody>'+rows+'</tbody>'
      + '</table></div>';
  }

  window._drLoad = function() {
    selYear = parseInt(document.getElementById('dr-year').value);
    selMonth = parseInt(document.getElementById('dr-month').value);
    load();
  };

  await load();
}
// ── System Logs Screen ────────────────────────────────────────────────────────
const _LOG_COLORS = {
  js:      { bg:'#fee2e2', text:'#dc2626', label:'JS Error' },
  api:     { bg:'#fef9c3', text:'#a16207', label:'API Error' },
  network: { bg:'#ffe4e6', text:'#be123c', label:'Network'  },
  promise: { bg:'#ede9fe', text:'#6d28d9', label:'Promise'  },
  upload:  { bg:'#dbeafe', text:'#1d4ed8', label:'Upload'   },
};

function loadSystemLogs() {
  const el = document.getElementById('main');
  el.className = 'page';

  const logs  = _EL.getAll();
  const total = logs.length;

  // Count by type
  const counts = {};
  logs.forEach(l => { counts[l.type] = (counts[l.type]||0)+1; });

  const typeLabels = Object.entries(_LOG_COLORS);
  const statCards  = typeLabels.map(([type, cfg]) => `
    <div style="background:${cfg.bg};border-radius:12px;padding:14px 18px;text-align:center;min-width:100px">
      <div style="font-size:22px;font-weight:800;color:${cfg.text}">${counts[type]||0}</div>
      <div style="font-size:11px;color:${cfg.text};font-weight:600;margin-top:2px">${cfg.label}</div>
    </div>`).join('');

  const rows = logs.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af">لا توجد أخطاء مسجّلة 🎉</td></tr>`
    : logs.map((l, i) => {
        const cfg   = _LOG_COLORS[l.type] || { bg:'#f3f4f6', text:'#374151', label:l.type };
        const time  = new Date(l.ts).toLocaleString('ar-EG');
        const short = l.message.length > 80 ? l.message.slice(0,80)+'…' : l.message;
        return `
          <tr style="cursor:pointer" onclick="_logExpand(${i})" title="انقر للتفاصيل">
            <td style="font-size:11px;color:#6b7280;white-space:nowrap">${time}</td>
            <td><span style="background:${cfg.bg};color:${cfg.text};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${cfg.label}</span></td>
            <td style="font-size:12px;color:#111;max-width:320px;word-break:break-word">${escH(short)}</td>
            <td style="font-size:11px;color:#6b7280">${escH(l.page||'—')}</td>
            <td style="font-size:11px;color:#6b7280">${escH(l.user||'—')}</td>
            <td><button onclick="event.stopPropagation();_logDelete(${i})" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:14px" title="حذف">🗑</button></td>
          </tr>
          <tr id="_logDetail_${i}" style="display:none;background:#f8fafc">
            <td colspan="6" style="padding:10px 16px">
              <pre style="font-size:11px;color:#374151;white-space:pre-wrap;margin:0;background:#f1f5f9;padding:10px;border-radius:8px;max-height:200px;overflow-y:auto">${escH(l.detail||'لا توجد تفاصيل إضافية')}</pre>
              ${l.source ? `<div style="font-size:10px;color:#9ca3af;margin-top:4px">المصدر: ${escH(l.source)}</div>` : ''}
            </td>
          </tr>`;
      }).join('');

  el.innerHTML = `
    <div style="padding:20px;max-width:1200px;margin:0 auto">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:20px;font-weight:800;color:#111;margin:0">🔍 سجل الأخطاء</h2>
          <p style="font-size:12px;color:#6b7280;margin:4px 0 0">${total} سجل مخزّن — آخر ${Math.min(total,_EL.MAX)} خطأ</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="_logCopyAll()" class="btn btn-secondary btn-sm">📋 نسخ الكل</button>
          <button onclick="_logClearAll()" class="btn btn-danger btn-sm">🗑 مسح الكل</button>
          <button onclick="loadSystemLogs()" class="btn btn-primary btn-sm">🔄 تحديث</button>
        </div>
      </div>

      <!-- Stat Cards -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
        ${statCards}
        <div style="background:#f0fdf4;border-radius:12px;padding:14px 18px;text-align:center;min-width:100px">
          <div style="font-size:22px;font-weight:800;color:#15803d">${total}</div>
          <div style="font-size:11px;color:#15803d;font-weight:600;margin-top:2px">الإجمالي</div>
        </div>
      </div>

      <!-- Logs Table -->
      <div class="card" style="overflow:hidden">
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>النوع</th>
                <th>الرسالة</th>
                <th>الصفحة</th>
                <th>المستخدم</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="_logsBody">${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

window._logExpand = function(i) {
  const row = document.getElementById('_logDetail_' + i);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
};

window._logDelete = function(i) {
  try {
    const logs = _EL.getAll();
    logs.splice(i, 1);
    localStorage.setItem(_EL.KEY, JSON.stringify(logs));
    loadSystemLogs();
  } catch(e) {}
};

window._logClearAll = function() {
  if (!confirm('مسح جميع السجلات؟')) return;
  _EL.clear();
  loadSystemLogs();
  toast('تم مسح جميع السجلات', 'success');
};

window._logCopyAll = function() {
  const logs = _EL.getAll();
  const text = logs.map(l =>
    `[${l.ts}] [${l.type.toUpperCase()}] ${l.message}\n${l.detail||''}\nPage:${l.page} User:${l.user}\n---`
  ).join('\n');
  navigator.clipboard.writeText(text).then(() => toast('تم النسخ ✓', 'success')).catch(() => toast('فشل النسخ', 'error'));
};

window.loadSystemLogs = loadSystemLogs;

// ── Backup Management Screen ──────────────────────────────────────────────────
const _BK_TYPE_CFG = {
  daily:       { icon:'📅', label:'يومية',       color:'#3b82f6', bg:'#dbeafe' },
  weekly:      { icon:'📆', label:'أسبوعية',     color:'#8b5cf6', bg:'#ede9fe' },
  monthly:     { icon:'🗓️', label:'شهرية',       color:'#059669', bg:'#d1fae5' },
  manual:      { icon:'🖐️', label:'يدوية',       color:'#d97706', bg:'#fef3c7' },
  'pre-deploy':{ icon:'🚀', label:'قبل النشر',   color:'#dc2626', bg:'#fee2e2' },
  restore:     { icon:'🔄', label:'استعادة',     color:'#6b7280', bg:'#f3f4f6' },
};

async function loadBackup() {
  const el = document.getElementById('main');
  el.className = 'page';
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>';

  try {
    const [stats, list] = await Promise.all([
      api('GET', '/api/backup/stats'),
      api('GET', '/api/backup/list?limit=50'),
    ]);
    _bkRender(stats, list);
  } catch(e) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:#dc2626">فشل التحميل: ${escH(e.message)}</div>`;
  }
}

function _bkRender(stats, list) {
  const el = document.getElementById('main');

  // ── KPI cards ──
  const types = ['daily','weekly','monthly','manual','pre-deploy'];
  const kpiCards = types.map(t => {
    const cfg = _BK_TYPE_CFG[t];
    const info = stats.by_type?.[t] || {};
    const lastRun = info.last_run ? new Date(info.last_run).toLocaleDateString('ar-EG') : 'لم يتم بعد';
    const ok = info.last_status === 'completed';
    return `
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:28px;margin-bottom:6px">${cfg.icon}</div>
        <div style="font-size:13px;font-weight:700;color:#111;margin-bottom:4px">${cfg.label}</div>
        <div style="font-size:11px;color:#6b7280">آخر نسخة: ${lastRun}</div>
        <div style="margin-top:8px">
          <span style="background:${ok?'#d1fae5':info.last_status==='never'?'#f3f4f6':'#fee2e2'};color:${ok?'#15803d':info.last_status==='never'?'#6b7280':'#dc2626'};padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">
            ${ok?'✓ مكتمل':info.last_status==='never'?'لم يتم':'✕ فشل'}
          </span>
        </div>
        <div style="font-size:10px;color:#9ca3af;margin-top:4px">${info.count||0} نسخة محفوظة</div>
      </div>`;
  }).join('');

  // ── Backup table rows ──
  const backups = list.backups || [];
  const rows = backups.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:#9ca3af">لا توجد نسخ احتياطية بعد</td></tr>`
    : backups.map(b => {
        const cfg  = _BK_TYPE_CFG[b.backup_type] || _BK_TYPE_CFG.manual;
        const date = new Date(b.created_at).toLocaleString('ar-EG');
        const ok   = b.status === 'completed';
        const stats = b.db_stats || {};
        const hint = [
          stats.clients ? `${stats.clients} عميل` : '',
          stats.tasks   ? `${stats.tasks} مهمة`   : '',
        ].filter(Boolean).join(' · ') || '—';
        const sizeMb = b.total_size_kb > 0 ? (b.total_size_kb/1024).toFixed(2)+' MB' : '—';
        return `
          <tr>
            <td style="white-space:nowrap;font-size:12px;color:#6b7280">${date}</td>
            <td><span style="background:${cfg.bg};color:${cfg.color};padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">${cfg.icon} ${cfg.label}</span></td>
            <td><span style="background:${ok?'#d1fae5':'#fee2e2'};color:${ok?'#15803d':'#dc2626'};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600">${ok?'مكتمل':'فشل'}</span></td>
            <td style="font-size:12px;color:#374151">${hint}</td>
            <td style="font-size:12px;color:#374151">${sizeMb}</td>
            <td style="font-size:11px;color:#6b7280">${b.emailed_to ? '📧 '+escH(b.emailed_to) : '—'}</td>
            <td style="white-space:nowrap">
              ${ok ? `<button onclick="_bkDownload()" class="btn btn-secondary btn-sm" title="تحميل نسخة احتياطية جديدة">⬇️</button>` : ''}
              <button onclick="_bkDelete(${b.id})" class="btn btn-sm" style="background:#fee2e2;color:#dc2626;margin-right:4px" title="حذف السجل">🗑</button>
            </td>
          </tr>
          ${b.error_message ? `<tr style="background:#fff5f5"><td colspan="7" style="font-size:11px;color:#dc2626;padding:6px 14px">⚠️ ${escH(b.error_message)}</td></tr>` : ''}`;
      }).join('');

  el.innerHTML = `
    <div style="padding:20px;max-width:1200px;margin:0 auto">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:20px;font-weight:800;color:#111;margin:0">🗄️ النسخ الاحتياطية</h2>
          <p style="font-size:12px;color:#6b7280;margin:4px 0 0">
            آخر نسخة: ${stats.last_backup_at ? new Date(stats.last_backup_at).toLocaleString('ar-EG') : 'لم يتم بعد'}
            ${stats.last_failure ? ` · <span style="color:#dc2626">آخر فشل: ${new Date(stats.last_failure).toLocaleDateString('ar-EG')}</span>` : ''}
          </p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="_bkCreate()" class="btn btn-primary" id="bkCreateBtn">
            <span id="bkCreateIcon">🗄️</span> إنشاء نسخة احتياطية الآن
          </button>
          <button onclick="_bkDownload()" class="btn btn-secondary">⬇️ تحميل مباشر</button>
          <button onclick="_bkRestoreDialog()" class="btn btn-secondary">🔄 استعادة</button>
          <button onclick="loadBackup()" class="btn btn-secondary btn-sm">🔄 تحديث</button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">
        ${kpiCards}
      </div>

      <!-- Schedule Info -->
      <div class="card" style="padding:16px;margin-bottom:20px;background:#f0fdf4;border-color:#bbf7d0">
        <div style="font-size:13px;font-weight:700;color:#15803d;margin-bottom:8px">📅 جدول النسخ التلقائية</div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:12px;color:#374151">
          <span>📅 <strong>يومية</strong> — كل يوم منتصف الليل</span>
          <span>📆 <strong>أسبوعية</strong> — الأحد الساعة 2 صباحاً</span>
          <span>🗓️ <strong>شهرية</strong> — أول كل شهر الساعة 1 صباحاً</span>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-top:8px">
          الاحتفاظ: 7 يومية · 4 أسبوعية · 12 شهرية · 20 يدوية
          · كل نسخة تُرسل تلقائياً على البريد الإلكتروني
        </div>
      </div>

      <!-- Disaster Recovery -->
      <details class="card" style="padding:16px;margin-bottom:20px;cursor:pointer">
        <summary style="font-size:13px;font-weight:700;color:#dc2626;list-style:none;display:flex;align-items:center;gap:8px">
          <span>🚨</span> خطة الاسترجاع في حالات الطوارئ (Disaster Recovery)
        </summary>
        <div style="margin-top:12px;font-size:12px;color:#374151;line-height:1.8">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <div style="font-weight:700;margin-bottom:6px">🔴 تلف قاعدة البيانات</div>
              <ol style="margin:0;padding-right:16px">
                <li>ابحث عن آخر إيميل نسخة احتياطية</li>
                <li>احفظ ملف .sql.gz من الإيميل</li>
                <li>استخدم زر "استعادة" لرفع الملف</li>
                <li>أعد تشغيل الخادم من Railway</li>
                <li>وقت الاسترجاع: <strong>5-15 دقيقة</strong></li>
              </ol>
            </div>
            <div>
              <div style="font-weight:700;margin-bottom:6px">🟡 حذف ملفات بالخطأ</div>
              <ol style="margin:0;padding-right:16px">
                <li>ملفات الـ uploads مخزّنة على Railway Volume</li>
                <li>تواصل مع Railway Support فوراً</li>
                <li>⚠️ لا يوجد backup للملفات حالياً (Railway Volumes مطلوب)</li>
              </ol>
            </div>
            <div>
              <div style="font-weight:700;margin-bottom:6px">🟠 فشل Deployment</div>
              <ol style="margin:0;padding-right:16px">
                <li>Railway يحتفظ بآخر 5 deployments</li>
                <li>روح Railway Dashboard → Deployments → Rollback</li>
                <li>وقت الاسترجاع: <strong>2-5 دقائق</strong></li>
              </ol>
            </div>
            <div>
              <div style="font-weight:700;margin-bottom:6px">⚪ مشكلة في السيرفر</div>
              <ol style="margin:0;padding-right:16px">
                <li>Railway يعيد التشغيل تلقائياً</li>
                <li>DB على PostgreSQL منفصل — لا يتأثر</li>
                <li>وقت الاسترجاع: <strong>1-3 دقائق</strong></li>
              </ol>
            </div>
          </div>
          <div style="margin-top:12px;padding:10px;background:#fff3cd;border-radius:8px;border:1px solid #fde68a">
            ⚠️ <strong>تحذير مهم:</strong> Railway filesystem مؤقت — الملفات المرفوعة (uploads) قد تُحذف عند كل Deployment.
            لحماية الملفات بشكل دائم تحتاج Railway Volume أو خدمة تخزين خارجية (S3/Google Drive).
          </div>
        </div>
      </details>

      <!-- Backups Table -->
      <div class="card" style="overflow:hidden">
        <div style="padding:14px 18px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:700;color:#111">
          سجل النسخ الاحتياطية (${backups.length})
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>التاريخ والوقت</th>
                <th>النوع</th>
                <th>الحالة</th>
                <th>محتويات</th>
                <th>الحجم</th>
                <th>البريد</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

window._bkCreate = async function() {
  const btn  = document.getElementById('bkCreateBtn');
  const icon = document.getElementById('bkCreateIcon');
  if (btn) btn.disabled = true;
  if (icon) { icon.textContent = '⏳'; icon.style.animation = 'spin 1s linear infinite'; }
  try {
    const r = await api('POST', '/api/backup/create?include_uploads=true&send_email=true', null, {useCache:false});
    if (r.success) {
      toast(`✅ ${r.message} — ${(r.total_size_kb/1024).toFixed(1)} MB`, 'success');
    } else {
      toast(`فشل: ${r.error || r.message}`, 'error');
    }
    loadBackup();
  } catch(e) { toast('فشل إنشاء النسخة: ' + e.message, 'error'); }
  finally {
    if (btn) btn.disabled = false;
    if (icon) { icon.textContent = '🗄️'; icon.style.animation = ''; }
  }
};

window._bkDownload = function() {
  window.open(API + '/api/backup/download', '_blank');
};

window._bkDelete = async function(id) {
  if (!confirm('حذف سجل هذه النسخة الاحتياطية؟')) return;
  try {
    await api('DELETE', `/api/backup/${id}`, null, {useCache:false});
    toast('تم الحذف', 'success');
    loadBackup();
  } catch(e) { toast(e.message, 'error'); }
};

window._bkRestoreDialog = function() {
  document.getElementById('bkRestoreModal')?.remove();
  const m = document.createElement('div');
  m.id = 'bkRestoreModal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">🔄 استعادة نسخة احتياطية</h3>
        <button onclick="document.getElementById('bkRestoreModal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">✕</button>
      </div>
      <div style="padding:20px">
        <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:10px;padding:14px;margin-bottom:16px;font-size:12px;color:#dc2626">
          ⚠️ <strong>تحذير:</strong> هذا الإجراء سيستبدل قاعدة البيانات الحالية بالكامل. تأكد من إنشاء نسخة احتياطية أولاً.
        </div>
        <div style="margin-bottom:14px">
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">اختر ملف النسخة الاحتياطية (.sql أو .sql.gz)</label>
          <input type="file" id="bkRestoreFile" accept=".sql,.sql.gz" class="input">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button onclick="document.getElementById('bkRestoreModal').remove()" class="btn btn-secondary">إلغاء</button>
          <button onclick="_bkDoRestore()" class="btn btn-danger" id="bkDoRestoreBtn">🔄 تنفيذ الاستعادة</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target===m) m.remove(); });
};

window._bkDoRestore = async function() {
  const file = document.getElementById('bkRestoreFile')?.files?.[0];
  if (!file) { toast('اختر ملفاً أولاً', 'warning'); return; }
  if (!confirm('هل أنت متأكد؟ هذا الإجراء لا يمكن التراجع عنه.')) return;

  const btn = document.getElementById('bkDoRestoreBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الاستعادة...'; }

  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(API + '/api/backup/restore', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await r.json();
    if (r.ok) {
      toast(data.message, 'success');
      document.getElementById('bkRestoreModal')?.remove();
    } else {
      toast(data.detail || 'فشلت الاستعادة', 'error');
    }
  } catch(e) { toast(e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '🔄 تنفيذ الاستعادة'; } }
};

window.loadBackup = loadBackup;

// ─── Migration Dashboard ───────────────────────────────────────────────────
const MIGRATION_MODULES = [
  // Phase 0 – Setup
  {id:'setup_infra',    label:'إعداد البنية (Vite + CI)',   phase:0, status:'pending'},
  {id:'setup_ws',       label:'WebSocket Zustand Store',     phase:0, status:'pending'},
  {id:'setup_rq',       label:'React Query + useApi()',      phase:0, status:'pending'},
  // Phase 1 – Auth
  {id:'login',          label:'Login + Auth',                phase:1, status:'pending'},
  {id:'shell',          label:'Sidebar / Nav Shell',         phase:1, status:'pending'},
  // Phase 2 – Dashboard
  {id:'dashboard',      label:'Dashboard',                   phase:2, status:'pending'},
  // Phase 3 – Clients
  {id:'clients',        label:'Clients',                     phase:3, status:'pending'},
  // Phase 4 – Leads
  {id:'leads',          label:'Leads',                       phase:4, status:'pending'},
  // Phase 5 – Tasks
  {id:'tasks',          label:'Tasks (Kanban)',               phase:5, status:'pending'},
  // Phase 6 – Obligations
  {id:'obligations',    label:'Obligations',                  phase:6, status:'pending'},
  {id:'establishment',  label:'Establishment',                phase:6, status:'pending'},
  // Phase 7 – Finance
  {id:'collections',    label:'Collections (الإيرادات)',     phase:7, status:'pending'},
  {id:'monthly_fees',   label:'Monthly Fees (الرسوم)',       phase:7, status:'pending'},
  // Phase 8 – Finance Center
  {id:'finance_center', label:'Finance Center',               phase:8, status:'pending'},
  // Phase 9 – Tax + Invoices
  {id:'tax',            label:'Tax Center',                   phase:9, status:'pending'},
  {id:'invoices',       label:'Invoices + PDF',               phase:9, status:'pending'},
  // Phase 10 – HR
  {id:'employees',      label:'Employees',                   phase:10, status:'pending'},
  {id:'payroll',        label:'Payroll',                     phase:10, status:'pending'},
  {id:'settlements',    label:'Settlements',                 phase:10, status:'pending'},
  // Phase 11 – Documents
  {id:'documents',      label:'Documents',                   phase:11, status:'pending'},
  {id:'archive',        label:'Archive',                     phase:11, status:'pending'},
  // Phase 12 – Permissions + Portal
  {id:'permissions',    label:'Permissions (RBAC)',           phase:12, status:'pending'},
  {id:'portal',         label:'Client Portal',               phase:12, status:'pending'},
  {id:'settings',       label:'Settings',                    phase:12, status:'pending'},
  // Phase 13 – System
  {id:'mail',           label:'Mail',                        phase:13, status:'pending'},
  {id:'backup_ui',      label:'Backup UI',                   phase:13, status:'pending'},
  {id:'system_logs_ui', label:'System Logs UI',              phase:13, status:'pending'},
];

const _MGKEY = 'ms_migration_progress';

function _mgLoad() {
  try { return JSON.parse(localStorage.getItem(_MGKEY) || '{}'); } catch { return {}; }
}
function _mgSave(data) {
  localStorage.setItem(_MGKEY, JSON.stringify(data));
}
function _mgGetStatus(id) {
  return _mgLoad()[id] || 'pending';
}
window.mgSetStatus = function(id, status) {
  const d = _mgLoad();
  d[id] = status;
  _mgSave(d);
  loadMigrationDashboard();
};

async function loadMigrationDashboard() {
  const pg = document.getElementById('page-content');
  if (!pg) return;

  const saved = _mgLoad();
  const modules = MIGRATION_MODULES.map(m => ({...m, status: saved[m.id] || m.status}));

  const done   = modules.filter(m => m.status === 'done').length;
  const inprog = modules.filter(m => m.status === 'in_progress').length;
  const total  = modules.length;
  const pct    = Math.round((done / total) * 100);

  const currentPhase = modules.find(m => m.status === 'in_progress')?.phase
    ?? modules.find(m => m.status === 'pending')?.phase ?? 14;
  const nextModule   = modules.find(m => m.status === 'pending');

  const openIssues = [
    {text:'GitHub Actions يحتاج PAT + RAILWAY_TOKEN', severity:'high'},
    {text:'Vite config للـ GitHub Pages لم يُعدّ بعد', severity:'high'},
    {text:'WebSocket Zustand store لم يُبنَ بعد', severity:'high'},
    {text:'Desktop App تعتمد على index.html القديم', severity:'medium'},
    {text:'Railway filesystem ephemeral — uploads تُفقد عند deploy', severity:'medium'},
  ];

  const statusColor = {done:'#22c55e', in_progress:'#f59e0b', pending:'#94a3b8'};
  const statusLabel = {done:'✅ مكتمل', in_progress:'🔄 جارٍ', pending:'⏳ قادم'};

  const phaseNames = {
    0:'إعداد البنية', 1:'Login + Shell', 2:'Dashboard', 3:'Clients',
    4:'Leads', 5:'Tasks', 6:'Obligations', 7:'Collections + Fees',
    8:'Finance Center', 9:'Tax + Invoices', 10:'HR (Employees/Payroll)',
    11:'Documents + Archive', 12:'Permissions + Portal', 13:'System Modules',
    14:'اكتمل!'
  };

  const rowsHtml = modules.map(m => `
    <tr>
      <td style="padding:10px 12px;font-weight:600">${m.label}</td>
      <td style="padding:10px 12px;color:#64748b">المرحلة ${m.phase}</td>
      <td style="padding:10px 12px">
        <span style="background:${statusColor[m.status]}22;color:${statusColor[m.status]};padding:3px 10px;border-radius:20px;font-size:13px;font-weight:600">
          ${statusLabel[m.status]}
        </span>
      </td>
      <td style="padding:10px 12px">
        <select onchange="mgSetStatus('${m.id}', this.value)"
          style="border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;font-size:13px;cursor:pointer">
          <option value="pending"   ${m.status==='pending'   ?'selected':''}>⏳ قادم</option>
          <option value="in_progress" ${m.status==='in_progress'?'selected':''}>🔄 جارٍ</option>
          <option value="done"      ${m.status==='done'      ?'selected':''}>✅ مكتمل</option>
        </select>
      </td>
    </tr>`).join('');

  const issuesHtml = openIssues.map(i => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${i.severity==='high'?'#fef2f2':'#fffbeb'};border-right:3px solid ${i.severity==='high'?'#ef4444':'#f59e0b'};border-radius:8px;margin-bottom:8px">
      <span>${i.severity==='high'?'🔴':'🟡'}</span>
      <span style="font-size:14px">${i.text}</span>
    </div>`).join('');

  // Fetch live baseline metrics
  let metricsHtml = '<p style="color:#94a3b8;font-size:13px">جارٍ تحميل البيانات...</p>';
  try {
    const resp = await api('GET', '/api/admin/metrics/baseline');
    if (resp) {
      metricsHtml = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
          ${[
            ['👥 العملاء',       resp.clients.total],
            ['🏢 الشركات',       resp.clients.companies],
            ['👤 الأفراد',       resp.clients.individuals],
            ['🎯 الـ Leads',     resp.leads.total],
            ['👨‍💼 الموظفين',   resp.employees.total],
            ['📋 المهام',        resp.tasks.total],
            ['⚖️ الالتزامات',   resp.obligations.templates],
            ['📄 المستندات',    resp.documents.total],
            ['🏗️ المنشآت',     resp.establishments.total],
            ['📁 الملفات',       resp.files.count],
          ].map(([label, val]) => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center">
              <div style="font-size:22px;font-weight:700;color:#1e293b">${val ?? 0}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">${label}</div>
            </div>`).join('')}
        </div>
        <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 16px;font-size:13px">
            🗄️ حجم قاعدة البيانات: <strong>${resp.database.size_human}</strong>
          </div>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 16px;font-size:13px">
            📦 حجم الملفات: <strong>${resp.files.size_human}</strong>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px;font-size:13px;color:#64748b">
            🕐 ${new Date(resp.generated_at).toLocaleString('ar-EG')}
          </div>
        </div>`;
    }
  } catch {}

  pg.innerHTML = `
    <div style="max-width:900px;margin:0 auto;padding:24px 16px" dir="rtl">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <h2 style="font-size:22px;font-weight:700;color:#1e293b;margin:0">🚀 لوحة تقدم React Migration</h2>
        <button onclick="loadMigrationDashboard()" style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer">🔄 تحديث</button>
      </div>

      <!-- Progress Bar -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-size:15px;font-weight:600;color:#374151">نسبة الإنجاز</span>
          <span style="font-size:28px;font-weight:700;color:#6366f1">${pct}%</span>
        </div>
        <div style="background:#e2e8f0;border-radius:999px;height:12px;overflow:hidden">
          <div style="background:linear-gradient(90deg,#6366f1,#8b5cf6);height:100%;width:${pct}%;transition:width 0.5s;border-radius:999px"></div>
        </div>
        <div style="display:flex;gap:20px;margin-top:14px;font-size:13px;color:#64748b">
          <span>✅ مكتمل: <strong style="color:#22c55e">${done}</strong></span>
          <span>🔄 جارٍ: <strong style="color:#f59e0b">${inprog}</strong></span>
          <span>⏳ قادم: <strong>${total - done - inprog}</strong></span>
          <span>📦 الإجمالي: <strong>${total}</strong></span>
        </div>
      </div>

      <!-- Current / Next -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:18px">
          <div style="font-size:12px;font-weight:600;color:#3b82f6;margin-bottom:6px">المرحلة الحالية</div>
          <div style="font-size:16px;font-weight:700;color:#1e40af">المرحلة ${currentPhase}: ${phaseNames[currentPhase]}</div>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px">
          <div style="font-size:12px;font-weight:600;color:#16a34a;margin-bottom:6px">الـ Module القادم</div>
          <div style="font-size:16px;font-weight:700;color:#166534">${nextModule ? nextModule.label : '🎉 اكتمل كل شيء!'}</div>
        </div>
      </div>

      <!-- Open Issues -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 14px">🔴 المشاكل المفتوحة</h3>
        ${issuesHtml}
      </div>

      <!-- Baseline Metrics -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 14px">📊 إحصائيات النظام (PRE_REACT_MIGRATION)</h3>
        ${metricsHtml}
      </div>

      <!-- Modules Table -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
        <div style="padding:18px 20px;border-bottom:1px solid #f1f5f9">
          <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0">📋 تفاصيل الـ Modules</h3>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:10px 12px;text-align:right;font-size:13px;color:#64748b;font-weight:600">الـ Module</th>
              <th style="padding:10px 12px;text-align:right;font-size:13px;color:#64748b;font-weight:600">المرحلة</th>
              <th style="padding:10px 12px;text-align:right;font-size:13px;color:#64748b;font-weight:600">الحالة</th>
              <th style="padding:10px 12px;text-align:right;font-size:13px;color:#64748b;font-weight:600">تحديث</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>`;
}
window.loadMigrationDashboard = loadMigrationDashboard;

// ─── Baseline Metrics Report (saved to file) ──────────────────────────────
window.downloadBaselineReport = async function() {
  const resp = await api('GET', '/api/admin/metrics/baseline');
  if (!resp) return toast('فشل تحميل التقرير', 'error');
  const report = [
    `# Baseline Metrics Report — PRE_REACT_MIGRATION`,
    `Generated: ${new Date(resp.generated_at).toLocaleString('ar-EG')}`,
    ``,
    `## Clients`,
    `  Total:       ${resp.clients.total}`,
    `  Individuals: ${resp.clients.individuals}`,
    `  Companies:   ${resp.clients.companies}`,
    `  Active:      ${resp.clients.active}`,
    `  Inactive:    ${resp.clients.inactive}`,
    ``,
    `## Leads`,
    `  Total: ${resp.leads.total}`,
    ``,
    `## Employees`,
    `  Total: ${resp.employees.total}`,
    ``,
    `## Tasks`,
    `  Total: ${resp.tasks.total}`,
    ``,
    `## Obligations`,
    `  Templates:  ${resp.obligations.templates}`,
    `  Instances:  ${resp.obligations.instances}`,
    ``,
    `## Documents`,
    `  Total: ${resp.documents.total}`,
    ``,
    `## Establishments`,
    `  Total: ${resp.establishments.total}`,
    ``,
    `## Uploaded Files`,
    `  Count: ${resp.files.count}`,
    `  Size:  ${resp.files.size_human}`,
    ``,
    `## Database`,
    `  Size: ${resp.database.size_human}`,
  ].join('\n');
  const blob = new Blob([report], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `BASELINE_METRICS_${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('تم تنزيل التقرير', 'success');
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO ERROR-GUARD — يُغلّف كل دوال الحفظ غير المحمية بـ try/catch + toast
// يعمل فقط إذا كانت الدالة لا تعالج الخطأ داخلياً (لا تُعيد الرمي)
// ═══════════════════════════════════════════════════════════════════════════════
(function _patchSaveFns() {
  const savePat = /^(save|mfSave|vatSave|tcVatSave|tcCorpSave|etaSave|_saveFormationObl|saveFormationObl|savePortalCredentials|_saveLeadExpandField|_saveLeadExpandAll)./i;
  Object.keys(window).forEach(k => {
    if (!savePat.test(k) && k !== 'showCollectionPaymentModal') return;
    if (typeof window[k] !== 'function') return;
    const orig = window[k];
    window[k] = async function(...args) {
      try { return await orig.apply(this, args); }
      catch(e) { toast(e.message || 'فشل الحفظ — حاول مجدداً', 'error'); }
    };
  });
})();

// ══════════════════════════════════════════════════════════════════════════
// COMPANY NAME GENERATOR & APPROVAL PREDICTOR
// ══════════════════════════════════════════════════════════════════════════

let _cnResults = [];
let _cnRejected = [];
let _cnLoading = false;

async function loadCompanyNames() {
  const main = document.getElementById('main');
  main.className = 'page';
  _cnResults = [];
  try {
    _cnRejected = await api('GET', '/api/company-names/rejected');
  } catch(e) { _cnRejected = []; }
  _renderCompanyNamesPage();
}

function _cnToggleTypeWarning() {
  const type = document.getElementById('cnCompanyType')?.value;
  const warn = document.getElementById('cnTypeWarning');
  if (warn) warn.style.display = (type === 'single') ? 'block' : 'none';
}

function _renderCompanyNamesPage() {
  const main = document.getElementById('main');
  if (!main) return;

  main.innerHTML =
    '<div style="max-width:900px;margin:0 auto">' +

    // Header
    '<div style="background:linear-gradient(135deg,#1a2472,#2563eb);border-radius:18px;padding:28px 32px;margin-bottom:24px;color:white">' +
      '<div style="font-size:28px;margin-bottom:8px">🏢</div>' +
      '<h1 style="margin:0 0 6px;font-size:22px;font-weight:800">مولّد أسماء الشركات</h1>' +
      '<p style="margin:0;opacity:.8;font-size:14px">توليد أسماء مناسبة للسجل التجاري المصري مع تقييم احتمال القبول</p>' +
    '</div>' +

    // Form card
    '<div style="background:white;border-radius:16px;border:1.5px solid #e2e8f0;padding:24px;margin-bottom:20px">' +
      '<h2 style="margin:0 0 20px;font-size:16px;font-weight:700;color:#1e293b">📝 بيانات الشركة</h2>' +

      // Name parts row
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">المقطع الأول من الاسم *</label>' +
          '<input id="cnNamePart1" class="input" placeholder="مثال: KAO، النور، الفجر..." style="font-size:14px"/>' +
          '<div style="font-size:11px;color:#94a3b8;margin-top:4px">الجزء الأساسي الذي يظهر في كل الأسماء</div>' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">المقطع الثاني من الاسم</label>' +
          '<input id="cnNamePart2" class="input" placeholder="مثال: Group، Plus، المتحدة... (اختياري)" style="font-size:14px"/>' +
          '<div style="font-size:11px;color:#94a3b8;margin-top:4px">إضافة اختيارية تُكمل الاسم</div>' +
        '</div>' +
      '</div>' +

      // Activity + Company type row
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">النشاط التجاري *</label>' +
          '<input id="cnActivity" class="input" placeholder="مثال: استيراد وتصدير، خدمات لوجستية، مقاولات..." style="font-size:14px"/>' +
          '<div style="font-size:11px;color:#94a3b8;margin-top:4px">اكتب النشاط بحرية — كلما كان دقيقاً كانت الأسماء أفضل</div>' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">نوع الشركة *</label>' +
          '<select id="cnCompanyType" class="input" onchange="_cnToggleTypeWarning()" style="font-size:14px">' +
            '<option value="">— اختر نوع الشركة —</option>' +
            '<option value="single">شركة شخص واحد</option>' +
            '<option value="llc">شركة ذات مسئولية محدودة</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      // Warning for single-person company
      '<div id="cnTypeWarning" style="display:none;background:#fffbeb;border:1.5px solid #f59e0b;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#92400e">' +
        '⚠️ في شركات الشخص الواحد يُفضل أن يتضمن اسم الشركة النشاط التجاري — سيقوم النظام بتوليد أسماء تحتوي على النشاط تلقائياً' +
      '</div>' +

      // Keywords
      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">كلمات مفتاحية مفضلة (اختياري)</label>' +
        '<input id="cnKeywords" class="input" placeholder="مثال: الدولية، المتحدة، النيل — افصل بفاصلة" style="font-size:14px"/>' +
        '<div style="font-size:11px;color:#94a3b8;margin-top:4px">ادخل كلمات تحب ظهورها في الاسم — مفصولة بفاصلة</div>' +
      '</div>' +

      '<div style="display:flex;align-items:center;gap:12px">' +
        '<button onclick="runCompanyNameGenerator()" id="cnGenerateBtn" class="btn btn-primary" style="font-size:14px;padding:10px 28px">✨ توليد الأسماء</button>' +
        '<span style="font-size:12px;color:#64748b">سيتم توليد 25 اسم مع تقييم كل اسم</span>' +
      '</div>' +
    '</div>' +

    // Results area
    '<div id="cnResultsArea"></div>' +

    // Rejected names panel
    '<div style="background:white;border-radius:16px;border:1.5px solid #fee2e2;padding:20px;margin-top:20px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<h3 style="margin:0;font-size:14px;font-weight:700;color:#dc2626">🚫 قاعدة الأسماء المرفوضة (' + _cnRejected.length + ')</h3>' +
        '<button onclick="_cnShowAddRejected()" style="background:#fee2e2;border:none;border-radius:8px;padding:6px 14px;font-size:12px;color:#dc2626;cursor:pointer;font-weight:700;font-family:inherit">+ إضافة اسم مرفوض</button>' +
      '</div>' +
      (_cnRejected.length === 0
        ? '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">لا توجد أسماء مرفوضة مسجّلة — سيتم تحديثها تلقائياً عند تسجيل أي رفض</div>'
        : '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
            _cnRejected.map(function(r){
              return '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:5px 10px;font-size:12px;display:flex;align-items:center;gap:6px">' +
                '<span style="color:#374151;font-weight:600">' + escH(r.name) + '</span>' +
                (r.activity ? '<span style="color:#94a3b8">· ' + escH(r.activity) + '</span>' : '') +
                '<button onclick="_cnDeleteRejected(' + r.id + ')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:13px;padding:0;line-height:1">✕</button>' +
              '</div>';
            }).join('') +
          '</div>'
      ) +
    '</div>' +

    '</div>';
}

async function runCompanyNameGenerator() {
  const namePart1   = document.getElementById('cnNamePart1')?.value?.trim();
  const namePart2   = document.getElementById('cnNamePart2')?.value?.trim() || '';
  const activity    = document.getElementById('cnActivity')?.value?.trim();
  const companyType = document.getElementById('cnCompanyType')?.value;
  const keywordsRaw = document.getElementById('cnKeywords')?.value?.trim();

  if (!namePart1)    { toast('أدخل المقطع الأول من الاسم', 'error'); return; }
  if (!activity)     { toast('أدخل النشاط التجاري', 'error'); return; }
  if (!companyType)  { toast('اختر نوع الشركة', 'error'); return; }

  const keywords = keywordsRaw ? keywordsRaw.split(/[,،]/).map(function(k){ return k.trim(); }).filter(Boolean) : [];

  const btn = document.getElementById('cnGenerateBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;margin-left:6px"></span> جاري التوليد...'; }

  const area = document.getElementById('cnResultsArea');
  if (area) area.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div><div style="margin-top:12px;font-size:13px;color:#64748b">جاري توليد الأسماء وتقييمها...</div></div>';

  try {
    const data = await api('POST', '/api/company-names/generate', {
      name_part1:   namePart1,
      name_part2:   namePart2,
      activity:     activity,
      company_type: companyType,
      keywords:     keywords,
      count:        25
    });
    _cnResults = data.names || [];
    _renderCnResults(data);
  } catch(e) {
    if (area) area.innerHTML = '<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:12px;padding:20px;color:#dc2626;font-size:14px">❌ ' + escH(e.message) + '</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '✨ توليد الأسماء'; }
  }
}

function _renderCnResults(data) {
  const area = document.getElementById('cnResultsArea');
  if (!area) return;
  const names = data.names || [];
  if (!names.length) {
    area.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8">لم يتم توليد أسماء</div>';
    return;
  }

  const highCount = names.filter(function(n){ return n.level === 'High'; }).length;
  const medCount  = names.filter(function(n){ return n.level === 'Medium'; }).length;
  const lowCount  = names.filter(function(n){ return n.level === 'Low'; }).length;

  area.innerHTML =
    '<div style="background:white;border-radius:16px;border:1.5px solid #e2e8f0;overflow:hidden">' +

    // Summary bar
    '<div style="background:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:20px;flex-wrap:wrap">' +
      '<span style="font-size:14px;font-weight:700;color:#1e293b">✅ ' + names.length + ' اسم مقترح</span>' +
      '<span style="background:#dcfce7;color:#15803d;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700">🟢 عالي: ' + highCount + '</span>' +
      '<span style="background:#fef9c3;color:#92400e;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700">🟡 متوسط: ' + medCount + '</span>' +
      '<span style="background:#fee2e2;color:#dc2626;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700">🔴 منخفض: ' + lowCount + '</span>' +
    '</div>' +

    // Table
    '<div style="overflow-x:auto">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
    '<thead><tr style="background:#f1f5f9">' +
      '<th style="padding:10px 16px;text-align:right;color:#64748b;font-weight:700">#</th>' +
      '<th style="padding:10px 16px;text-align:right;color:#64748b;font-weight:700">اسم الشركة</th>' +
      '<th style="padding:10px 16px;text-align:center;color:#64748b;font-weight:700">الدرجة</th>' +
      '<th style="padding:10px 16px;text-align:center;color:#64748b;font-weight:700">التقييم</th>' +
      '<th style="padding:10px 16px;text-align:right;color:#64748b;font-weight:700">السبب</th>' +
      '<th style="padding:10px 16px;text-align:center;color:#64748b;font-weight:700">إجراء</th>' +
    '</tr></thead>' +
    '<tbody>' +
    names.map(function(n, i) {
      var levelColor = n.level === 'High' ? '#15803d' : n.level === 'Medium' ? '#92400e' : '#dc2626';
      var levelBg    = n.level === 'High' ? '#dcfce7'  : n.level === 'Medium' ? '#fef9c3'  : '#fee2e2';
      var levelAr    = n.level === 'High' ? 'عالي' : n.level === 'Medium' ? 'متوسط' : 'منخفض';
      var barWidth   = n.score + '%';
      var barColor   = n.score >= 75 ? '#15803d' : n.score >= 50 ? '#d97706' : '#dc2626';
      return '<tr style="border-top:1px solid #f1f5f9' + (n.is_rejected ? ';background:#fef2f2;opacity:.7' : '') + '">' +
        '<td style="padding:10px 16px;color:#94a3b8;font-size:12px">' + (i+1) + '</td>' +
        '<td style="padding:10px 16px">' +
          '<div style="font-size:15px;font-weight:700;color:' + (n.is_rejected ? '#dc2626' : '#1e293b') + '">' +
            (n.is_rejected ? '🚫 ' : '') + escH(n.name) +
          '</div>' +
        '</td>' +
        '<td style="padding:10px 16px;text-align:center">' +
          '<div style="font-size:16px;font-weight:800;color:' + barColor + '">' + n.score + '</div>' +
          '<div style="background:#e2e8f0;border-radius:4px;height:4px;margin-top:4px;width:60px;margin:4px auto 0">' +
            '<div style="background:' + barColor + ';height:4px;border-radius:4px;width:' + barWidth + '"></div>' +
          '</div>' +
        '</td>' +
        '<td style="padding:10px 16px;text-align:center">' +
          '<span style="background:' + levelBg + ';color:' + levelColor + ';border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700">' + levelAr + '</span>' +
        '</td>' +
        '<td style="padding:10px 16px;color:#475569;font-size:12px;max-width:250px">' + escH(n.reason || '') + '</td>' +
        '<td style="padding:10px 16px;text-align:center">' +
          (n.is_rejected
            ? '<span style="font-size:11px;color:#dc2626">مرفوض</span>'
            : '<button onclick="_cnMarkRejected(\'' + escH(n.name).replace(/'/g, "\\'") + '\')" ' +
              'style="background:#fee2e2;border:none;border-radius:7px;padding:5px 10px;font-size:11px;color:#dc2626;cursor:pointer;font-weight:700;font-family:inherit;white-space:nowrap">🚫 سجّل رفض</button>'
          ) +
        '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div></div>';
}

function _cnMarkRejected(name) {
  const activity = document.getElementById('cnActivity')?.value || '';
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML =
    '<div class="modal" style="max-width:420px">' +
      '<h3 style="margin:0 0 16px;font-size:15px;font-weight:800;color:#dc2626">🚫 تسجيل رفض الاسم</h3>' +
      '<div style="background:#fef2f2;border-radius:10px;padding:12px;margin-bottom:16px">' +
        '<div style="font-size:16px;font-weight:700;color:#1e293b">' + escH(name) + '</div>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom:12px">' +
        '<label class="label">سبب الرفض</label>' +
        '<input id="cnRejectReason" class="input" placeholder="مثال: اسم مشابه موجود / غير مناسب للنشاط..."/>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom:16px">' +
        '<label class="label">ملاحظات إضافية</label>' +
        '<input id="cnRejectNotes" class="input" placeholder="اختياري..."/>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button onclick="this.closest(\'.modal-overlay\').remove()" style="padding:8px 16px;background:#f1f5f9;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:600">إلغاء</button>' +
        '<button onclick="_cnConfirmReject(\'' + escH(name).replace(/'/g, "\\'") + '\',\'' + activity + '\')" class="btn" style="background:#dc2626;color:white;padding:8px 16px">تأكيد التسجيل</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  ov.onclick = function(e){ if(e.target===ov) ov.remove(); };
}

async function _cnConfirmReject(name, activity) {
  const reason = document.getElementById('cnRejectReason')?.value?.trim();
  const notes  = document.getElementById('cnRejectNotes')?.value?.trim();
  try {
    await api('POST', '/api/company-names/reject', {name: name, activity: activity, rejection_reason: reason, notes: notes});
    toast('✅ تم تسجيل الرفض — سيُستبعد من الاقتراحات مستقبلاً');
    document.querySelector('.modal-overlay')?.remove();
    _cnRejected = await api('GET', '/api/company-names/rejected');
    // Mark in current results
    _cnResults = _cnResults.map(function(r){ return r.name === name ? Object.assign({}, r, {is_rejected:true, score:0, level:'Low', reason:'مرفوض مسبقاً في مصر الرقمية'}) : r; });
    if (_cnResults.length) _renderCnResults({names: _cnResults});
  } catch(e) { toast(e.message, 'error'); }
}

function _cnShowAddRejected() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML =
    '<div class="modal" style="max-width:420px">' +
      '<h3 style="margin:0 0 16px;font-size:15px;font-weight:800;color:#dc2626">➕ إضافة اسم مرفوض يدوياً</h3>' +
      '<div class="form-group" style="margin-bottom:12px">' +
        '<label class="label">اسم الشركة المرفوض *</label>' +
        '<input id="cnManualName" class="input" placeholder="اسم الشركة الذي رُفض في مصر الرقمية"/>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom:12px">' +
        '<label class="label">النشاط</label>' +
        '<input id="cnManualActivity" class="input" placeholder="تجارة / خدمات / مقاولات..."/>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom:16px">' +
        '<label class="label">سبب الرفض</label>' +
        '<input id="cnManualReason" class="input" placeholder="اختياري..."/>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button onclick="this.closest(\'.modal-overlay\').remove()" style="padding:8px 16px;background:#f1f5f9;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:600">إلغاء</button>' +
        '<button onclick="_cnSaveManualReject()" class="btn" style="background:#dc2626;color:white;padding:8px 16px">حفظ</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  ov.onclick = function(e){ if(e.target===ov) ov.remove(); };
}

async function _cnSaveManualReject() {
  const name     = document.getElementById('cnManualName')?.value?.trim();
  const activity = document.getElementById('cnManualActivity')?.value?.trim();
  const reason   = document.getElementById('cnManualReason')?.value?.trim();
  if (!name) { toast('أدخل اسم الشركة', 'error'); return; }
  try {
    await api('POST', '/api/company-names/reject', {name: name, activity: activity, rejection_reason: reason});
    toast('✅ تم الحفظ');
    document.querySelector('.modal-overlay')?.remove();
    _cnRejected = await api('GET', '/api/company-names/rejected');
    _renderCompanyNamesPage();
  } catch(e) { toast(e.message, 'error'); }
}

async function _cnDeleteRejected(id) {
  if (!await confirmDlg('حذف هذا الاسم من قائمة المرفوضات؟')) return;
  try {
    await api('DELETE', '/api/company-names/rejected/' + id);
    toast('تم الحذف');
    _cnRejected = await api('GET', '/api/company-names/rejected');
    _renderCompanyNamesPage();
  } catch(e) { toast(e.message, 'error'); }
}

window.loadCompanyNames = loadCompanyNames;
window.runCompanyNameGenerator = runCompanyNameGenerator;
window._cnMarkRejected = _cnMarkRejected;
window._cnConfirmReject = _cnConfirmReject;
window._cnShowAddRejected = _cnShowAddRejected;
window._cnSaveManualReject = _cnSaveManualReject;
window._cnDeleteRejected = _cnDeleteRejected;

// Register service worker for cache control
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/ms-accounting/sw.js', {scope: '/ms-accounting/'})
    .catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'RELOAD') location.reload(true);
  });
}

// ── Health Check ─────────────────────────────────────────
async function loadHealthCheck() {
  const el = document.getElementById('main');
  el.innerHTML = `<div style="padding:24px;max-width:960px;margin:0 auto">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h2 style="margin:0;font-size:20px;font-weight:800;color:#1e293b">🩺 صحة النظام</h2>
      <button onclick="loadHealthCheck()" style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;font-weight:700">🔄 تحديث</button>
    </div>
    <div id="hc-body"><div style="text-align:center;padding:60px;color:#94a3b8;font-size:15px">⏳ جاري الفحص...</div></div>
  </div>`;

  const t0 = Date.now();
  const checks = await Promise.allSettled([
    api('GET', '/health'),
    api('GET', '/api/dashboard/stats'),
    api('GET', '/api/clients?page_size=1'),
    api('GET', '/api/clients?page_size=1&status=inactive'),
    api('GET', '/api/obligations?page_size=1'),
    api('GET', '/api/monthly-fees/dashboard'),
    api('GET', '/api/backup/list?limit=5'),
    api('GET', '/api/tax-center/vat/62?year=2026'),
    api('GET', '/api/audit-logs?limit=1'),
  ]);
  const elapsed = Date.now() - t0;

  const [health, dash, activeC, inactiveC, obls, mf, backups, vatList, audit] = checks.map(r =>
    r.status === 'fulfilled' ? r.value : null
  );

  // Build status rows
  const rows = [];

  // 1. API
  const apiOk = health && health.status === 'ok';
  rows.push({label:'API Server', val: apiOk ? '✅ يعمل' : '❌ لا يستجيب', ok: apiOk, detail: `وقت الاستجابة: ${elapsed}ms`});

  // 2. DB
  const dbOk = health && health.db === 'ok';
  rows.push({label:'قاعدة البيانات', val: dbOk ? '✅ متصلة' : '❌ مشكلة', ok: dbOk, detail: health?.db_detail || ''});

  // 3. Clients
  const totalActive = activeC?.total ?? '?';
  const totalInactive = inactiveC?.total ?? '?';
  rows.push({label:'العملاء النشطين', val: `${totalActive} عميل`, ok: true, detail:`محذوفون/مؤرشفون: ${totalInactive}`});

  // 4. Dashboard
  const dashOk = dash && typeof dash.clients !== 'undefined';
  rows.push({label:'لوحة التحكم', val: dashOk ? `${dash.clients} عميل · ${dash.obligations_due ?? 0} التزام مستحق` : '❌ خطأ', ok: dashOk, detail: dashOk ? `ض.ق.م: ${dash.vat_clients??0} · مرتبات: ${dash.payroll_clients??0}` : ''});

  // 5. Obligations
  const oblsOk = obls && typeof obls.total !== 'undefined';
  rows.push({label:'الالتزامات', val: oblsOk ? `${obls.total} التزام` : '❌ خطأ', ok: oblsOk, detail: ''});

  // 6. Monthly Fees
  const mfOk = mf && typeof mf.summary !== 'undefined';
  rows.push({label:'الرسوم الشهرية', val: mfOk ? `مستحق: ${(mf.summary?.total_due||0).toLocaleString('ar-EG')} ج.م` : '❌ خطأ', ok: mfOk, detail: mfOk ? `مدفوع: ${(mf.summary?.total_paid||0).toLocaleString('ar-EG')} ج.م` : ''});

  // 7. Backups
  const bkList = backups?.backups || [];
  const lastBk = bkList[0];
  const bkOk = lastBk && lastBk.status === 'completed';
  const bkLabel = !lastBk ? '⚠️ لا توجد نسخ' : lastBk.status === 'completed' ? `✅ ${lastBk.label}` : `⚠️ ${lastBk.label} (${lastBk.status})`;
  rows.push({label:'آخر نسخة احتياطية', val: bkLabel, ok: bkOk, detail: lastBk ? `الحجم: ${lastBk.total_size_kb ? lastBk.total_size_kb+' KB' : 'غير محدد'}` : ''});

  // 8. VAT Returns
  const vatArr = Array.isArray(vatList) ? vatList : [];
  rows.push({label:'إقرارات ض.ق.م.', val: `${vatArr.length} إقرار (2026)`, ok: true, detail: vatArr.length ? `آخر: ${vatArr[vatArr.length-1]?.month_label||''}` : ''});

  // 9. Audit Log
  const auditOk = Array.isArray(audit) || (audit && typeof audit.total !== 'undefined');
  rows.push({label:'سجل التدقيق', val: auditOk ? '✅ يعمل' : '⚠️ تحقق', ok: auditOk, detail: ''});

  const okCount = rows.filter(r => r.ok).length;
  const score = Math.round(okCount / rows.length * 100);
  const scoreColor = score >= 90 ? '#16a34a' : score >= 70 ? '#d97706' : '#dc2626';
  const scoreBg = score >= 90 ? '#f0fdf4' : score >= 70 ? '#fffbeb' : '#fef2f2';

  document.getElementById('hc-body').innerHTML = `
    <div style="background:${scoreBg};border:1px solid ${scoreColor}33;border-radius:16px;padding:20px;margin-bottom:20px;display:flex;align-items:center;gap:20px">
      <div style="width:72px;height:72px;border-radius:50%;background:${scoreColor};display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <span style="font-size:22px;font-weight:900;color:white">${score}%</span>
      </div>
      <div>
        <div style="font-size:18px;font-weight:800;color:${scoreColor}">${score>=90?'النظام يعمل بشكل ممتاز':score>=70?'النظام يعمل مع تحذيرات':'يوجد مشاكل تحتاج مراجعة'}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px">${okCount} من ${rows.length} فحوصات ناجحة · زمن الفحص: ${elapsed}ms · ${new Date().toLocaleString('ar-EG')}</div>
      </div>
    </div>
    <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:12px 16px;text-align:right;font-size:13px;color:#64748b;font-weight:600">الفحص</th>
            <th style="padding:12px 16px;text-align:right;font-size:13px;color:#64748b;font-weight:600">النتيجة</th>
            <th style="padding:12px 16px;text-align:right;font-size:13px;color:#64748b;font-weight:600">تفاصيل</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r,i) => `
            <tr style="border-top:1px solid #f1f5f9;${i%2?'background:#fafafa':''}">
              <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#1e293b">${r.label}</td>
              <td style="padding:12px 16px;font-size:13px;color:${r.ok?'#16a34a':'#dc2626'}">${r.val}</td>
              <td style="padding:12px 16px;font-size:12px;color:#94a3b8">${r.detail}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:16px;padding:14px 16px;background:#f0f7ff;border:1px solid #c7d2fe;border-radius:12px;font-size:13px;color:#1a2472">
      <strong>ملاحظات الاستقرار:</strong>
      <ul style="margin:8px 0 0;padding-right:18px;line-height:1.8">
        <li>العملاء غير النشطين (${totalInactive}) محفوظون بـ soft delete — لم يُحذف أي بيانات مالية</li>
        <li>جميع إقرارات ض.ق.م. و الخصم والتحصيل والشركات محمية من الحذف المباشر</li>
        <li>النسخ الاحتياطية التلقائية: يومية — راجع تقرير الـ backup لتفاصيل التنفيذ</li>
      </ul>
    </div>`;
}
window.loadHealthCheck = loadHealthCheck;


