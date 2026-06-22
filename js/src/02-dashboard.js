// ── DASHBOARD ──────────────────────────────────────
async function loadDashboard(silent=false) {
  const main = document.getElementById('main');
  if(main&&!silent){main.className='page';main.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:20px">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
        ${Array(4).fill('').map(()=>`<div style="height:130px;border-radius:16px" class="skeleton"></div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
        <div style="height:300px;border-radius:16px" class="skeleton"></div>
        <div style="height:300px;border-radius:16px" class="skeleton"></div>
      </div>
    </div>`;}

  try {
    const [stats, chartData, activity, oblStats, oblUpcoming, leadsRaw, fmStats, oblAll, fmOblStats, collSummary] = await Promise.all([
      api('GET','/api/dashboard/stats'),
      api('GET','/api/dashboard/revenue-chart?months=12'),
      api('GET','/api/dashboard/recent-activity'),
      api('GET','/api/obligations/stats').catch(()=>null),
      api('GET','/api/obligations/upcoming?days=14').catch(()=>[]),
      api('GET','/api/leads?limit=5000').catch(()=>({items:[]})),
      api('GET','/api/formation/stats').catch(()=>null),
      api('GET','/api/obligations?page_size=1000').catch(()=>({items:[]})),
      api('GET','/api/formation-obligations/stats').catch(()=>null),
      api('GET','/api/collections/summary').catch(()=>null),
    ]);
    if(!stats) return;

    const main = document.getElementById('main');
    main.className = 'page';

    const months12   = Array.isArray(chartData) ? chartData : (chartData?.months||[]);
    const invStatus  = chartData?.invoice_status||{};
    // Use collections summary for financial stats (more complete than invoice-only data)
    const collTotalCollected = collSummary?.total_collected||0;
    const collTotalAgreed    = collSummary?.total_agreed||0;
    const collTotalRemaining = collSummary?.total_remaining||0;
    const collected  = Math.max(stats.financial.total_collected||0, collTotalCollected);
    const invoiced   = Math.max(stats.financial.total_invoiced||0, collTotalAgreed)||1;
    const outstand   = collTotalRemaining||(stats.financial.total_outstanding||0);
    const overdueAmt = stats.financial.total_overdue||0;
    const collPct    = Math.min(100,Math.round(collected/invoiced*100));
    const leads      = leadsRaw?.items||[];
    const upcoming   = Array.isArray(oblUpcoming)?oblUpcoming:[];
    const overdueObl = upcoming.filter(o=>o.days_remaining<0).length;
    const urgentObl  = upcoming.filter(o=>o.days_remaining>=0&&o.days_remaining<=3).length;
    const fTotal     = fmStats?.total||0;
    const fCompleted = fmStats?.completed||0;
    const fStageData = fmStats?.stages||{};

    const lCount = s => leads.filter(l=>l.status===s).length;

    // ── Obligation breakdown by type ─────────────────
    const _oblList = Array.isArray(oblAll) ? oblAll : (oblAll?.items||[]);
    const _withholdingClients = new Set(_oblList.filter(o=>o.obligation_type==='withholding_monthly').map(o=>o.client_id)).size;
    // Use stats from API (based on tax_obligations field — accurate count)
    const _incomeClients  = stats.clients.income_declaration  ?? new Set(_oblList.filter(o=>o.obligation_type==='income_annual').map(o=>o.client_id)).size;
    const _vatClients     = stats.clients.vat_declaration     ?? new Set(_oblList.filter(o=>o.obligation_type==='vat_monthly').map(o=>o.client_id)).size;
    const _payrollClients = stats.clients.payroll_declaration ?? new Set(_oblList.filter(o=>o.obligation_type==='payroll_monthly').map(o=>o.client_id)).size;
    // Use active clients count (excludes soft-deleted/inactive)
    const _totalClients = stats.clients.active||stats.clients.total||0;

    const revVals  = months12.map(m=>m.invoiced||0);
    const collVals = months12.map(m=>m.revenue||m.collected||0);
    const clientVals = months12.map(m=>m.new_clients||m.clients||0);

    // month-over-month
    const lastM  = months12[months12.length-2]||{};
    const thisM  = months12[months12.length-1]||{};
    const collDiff = thisM.revenue&&lastM.revenue ? Math.round((thisM.revenue-lastM.revenue)/Math.max(lastM.revenue,1)*100) : null;

    const trendBadge = (val) => {
      if(val===null||val===undefined) return '';
      const up = val>=0;
      return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;color:${up?'rgba(255,255,255,.9)':'rgba(255,255,255,.7)'};background:rgba(255,255,255,.2);padding:2px 8px;border-radius:99px">${up?'↑':'↓'} ${Math.abs(val)}%</span>`;
    };

    const sparkPath = (vals, w=70, h=28, color='rgba(255,255,255,.6)') => {
      if(!vals||vals.length<2) return '';
      const min=Math.min(...vals), max=Math.max(...vals), range=max-min||1;
      const pts = vals.map((v,i)=>`${(i/(vals.length-1)*w).toFixed(1)},${(h-(v-min)/range*(h*0.8)).toFixed(1)}`).join(' ');
      return `<svg width="${w}" height="${h}" style="overflow:visible"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/></svg>`;
    };

    main.innerHTML = `
    <style>
      @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      .ea-in{animation:slideUp .45s cubic-bezier(.22,.68,0,1.15) both}
      .ea-kpi{cursor:pointer;border-radius:18px;padding:22px 20px;position:relative;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.13);transition:transform .2s,box-shadow .2s}
      .ea-kpi:hover{transform:translateY(-4px);box-shadow:0 10px 32px rgba(0,0,0,.2)}
      .ea-kpi::before{content:'';position:absolute;top:-30px;right:-30px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.07)}
      .ea-kpi::after{content:'';position:absolute;bottom:-40px;left:-20px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.04)}
      .ea-white-card{background:#fff;border-radius:18px;border:1px solid #e8edf3;box-shadow:0 2px 12px rgba(0,0,0,.05)}
      .ea-label{font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:.8px;text-transform:uppercase;margin-bottom:14px;display:flex;align-items:center;gap:8px}
      .ea-label::after{content:'';flex:1;height:1px;background:linear-gradient(to left,transparent,#e2e8f0)}
      /* Dashboard mobile */
      @media(max-width:768px){
        .dash-kpi-grid{grid-template-columns:1fr 1fr!important;gap:10px!important}
        .dash-obl-breakdown{grid-template-columns:repeat(3,1fr)!important;gap:8px!important}
        .dash-charts-row{grid-template-columns:1fr!important}
        .dash-2col{grid-template-columns:1fr!important}
        .dash-formation-pipeline{grid-template-columns:repeat(5,1fr)!important;overflow-x:auto}
        .ea-kpi{padding:14px 12px!important}
        .ea-in{margin-bottom:0}
        .rev-stats-bar{flex-wrap:wrap!important;gap:8px!important}
        .rev-stats-bar>*{flex:1 1 40%!important;min-width:0}
        .rev-stats-bar .bar-divider{display:none!important}
      }
      @media(max-width:480px){
        .dash-kpi-grid{grid-template-columns:1fr!important}
        .dash-obl-breakdown{grid-template-columns:repeat(2,1fr)!important}
        .dash-formation-pipeline{grid-template-columns:repeat(3,1fr)!important}
        .ea-kpi .big-num{font-size:28px!important}
      }
    </style>

    <!-- ══ SECTION 1 — EXECUTIVE SUMMARY ══ -->
    <div class="ea-in" style="animation-delay:.02s">
      <div class="ea-label">Executive Summary</div>
      <div class="dash-kpi-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">

        <!-- kpi-grid start (dash-kpi-grid injected above) -->
        <!-- Clients -->
        <div class="ea-kpi" onclick="navigate('clients')"
          style="background:linear-gradient(135deg,#0f1f6b 0%,#1a2472 60%,#2540c0 100%)">
          <div style="position:relative;z-index:1">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <div style="width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px">👥</div>
              ${sparkPath(clientVals)}
            </div>
            <div class="big-num" style="font-size:38px;font-weight:900;color:#fff;line-height:1;letter-spacing:-1.5px">${stats.clients.active||stats.clients.total}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:6px;font-weight:600">إجمالي العملاء</div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
              <span style="font-size:11px;color:rgba(255,255,255,.5)">${stats.clients.active} نشط</span>
            </div>
          </div>
        </div>

        <!-- New this month -->
        <div class="ea-kpi" onclick="navigate('clients')"
          style="background:linear-gradient(135deg,#065f46 0%,#059669 60%,#10b981 100%)">
          <div style="position:relative;z-index:1">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <div style="width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px">✨</div>
              ${sparkPath(clientVals,'rgba(255,255,255,.5)')}
            </div>
            <div class="big-num" style="font-size:38px;font-weight:900;color:#fff;line-height:1;letter-spacing:-1.5px">${stats.clients.new_this_month}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:6px;font-weight:600">عميل جديد هذا الشهر</div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
              <span style="font-size:11px;color:rgba(255,255,255,.5)">${leads.length} محتمل في الانتظار</span>
            </div>
          </div>
        </div>

        <!-- Collected -->
        <div class="ea-kpi" onclick="navigate('invoices')"
          style="background:linear-gradient(135deg,#134e4a 0%,#0f766e 50%,#14b8a6 100%)">
          <div style="position:relative;z-index:1">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <div style="width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px">💰</div>
              ${sparkPath(collVals)}
            </div>
            <div style="font-size:26px;font-weight:900;color:#fff;line-height:1;letter-spacing:-.5px">${money(collected)}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:6px;font-weight:600">إجمالي المحصّل</div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
              ${trendBadge(collDiff)}
              <span style="font-size:11px;color:rgba(255,255,255,.5)">${collSummary?'هذا الشهر: '+money(collSummary.current_month_paid||0):'مقارنة بالشهر الماضي'}</span>
            </div>
          </div>
        </div>

        <!-- Outstanding -->
        <div class="ea-kpi" onclick="navigate('invoices')"
          style="background:${overdueAmt>0?'linear-gradient(135deg,#7f1d1d,#b91c1c,#ef4444)':'linear-gradient(135deg,#78350f,#b45309,#f59e0b)'}">
          <div style="position:relative;z-index:1">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <div style="width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px">${overdueAmt>0?'⚠️':'⏳'}</div>
              ${sparkPath(revVals)}
            </div>
            <div style="font-size:26px;font-weight:900;color:#fff;line-height:1;letter-spacing:-.5px">${money(outstand)}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:6px;font-weight:600">المتبقي للتحصيل</div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
              <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,.8)">${collSummary&&collSummary.current_month_due>0?'هذا الشهر: '+money(collSummary.current_month_due):overdueAmt>0?money(overdueAmt)+' متأخر':collPct+'% نسبة التحصيل'}</span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ══ SECTION 1.5 — CLIENT OBLIGATIONS BREAKDOWN ══ -->
    <div class="ea-in ea-white-card" style="animation-delay:.05s;padding:20px 24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="font-size:14px;font-weight:800;color:#0f172a">توزيع العملاء على الالتزامات</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">إجمالي العملاء النشطين في المنظومة</div>
        </div>
        <button onclick="navigate('obligations')" style="background:#eef1fb;border:1px solid #c7d2fe;color:#1a2472;font-size:11px;font-weight:700;padding:5px 14px;border-radius:10px;cursor:pointer;font-family:inherit">إدارة الالتزامات ←</button>
      </div>
      <div class="dash-obl-breakdown" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
        ${[
          {label:'إجمالي العملاء',val:_totalClients,icon:'👥',color:'#1a2472',bg:'#eef1fb',border:'#c7d2fe',page:'clients'},
          {label:'ض ق م شهري',val:_vatClients,icon:'🧾',color:'#0369a1',bg:'#e0f2fe',border:'#bae6fd',page:'obligations'},
          {label:'توحيد مرتبات',val:_payrollClients,icon:'👔',color:'#7c3aed',bg:'#f5f3ff',border:'#ddd6fe',page:'obligations'},
          {label:'دخل سنوي',val:_incomeClients,icon:'📊',color:'#b45309',bg:'#fffbeb',border:'#fde68a',page:'obligations'},
        ].map(k=>`
          <div onclick="navigate('${k.page}')" style="background:${k.bg};border:1.5px solid ${k.border};border-radius:14px;padding:16px 14px;cursor:pointer;transition:all .2s;text-align:center"
            onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 18px rgba(0,0,0,.1)'"
            onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div style="font-size:24px;margin-bottom:8px">${k.icon}</div>
            <div style="font-size:32px;font-weight:900;color:${k.color};line-height:1;letter-spacing:-1px">${k.val}</div>
            <div style="font-size:10.5px;font-weight:700;color:${k.color};opacity:.75;margin-top:6px;line-height:1.3">${k.label}</div>
            <div style="margin-top:8px;height:3px;border-radius:99px;background:${k.color};opacity:.2">
              <div style="height:100%;border-radius:99px;background:${k.color};width:${_totalClients>0?Math.round(k.val/_totalClients*100):0}%"></div>
            </div>
            <div style="font-size:9px;color:${k.color};opacity:.6;margin-top:3px;font-weight:700">${_totalClients>0?Math.round(k.val/_totalClients*100):0}% من الإجمالي</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- ══ SECTION 2 — REVENUE + COLLECTIONS ══ -->
    <div class="ea-in dash-charts-row" style="animation-delay:.07s;display:grid;grid-template-columns:3fr 2fr;gap:16px">

      <!-- Revenue Chart -->
      <div class="ea-white-card" style="padding:24px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px">
          <div>
            <div style="font-size:15px;font-weight:800;color:#0f172a">Revenue Analytics</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:3px">الإيرادات والتحصيل — آخر 12 شهر</div>
          </div>
          <div style="display:flex;gap:16px">
            ${[['#1a2472','فواتير'],['#10b981','محصّل']].map(([c,l])=>`
              <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#374151">
                <span style="width:14px;height:3px;border-radius:99px;background:${c};display:inline-block"></span>${l}
              </span>`).join('')}
          </div>
        </div>
        <div class="rev-stats-bar" style="display:flex;gap:24px;padding:12px 16px;background:#f8fafc;border-radius:12px;margin-bottom:16px">
          ${[
            {l:'إجمالي الإيرادات',v:money(invoiced),c:'#1a2472'},
            {l:'إجمالي المحصّل',v:money(collected),c:'#10b981'},
            {l:'متوسط شهري',v:money(Math.round(revVals.reduce((a,b)=>a+b,0)/Math.max(revVals.filter(v=>v>0).length,1))),c:'#6366f1'},
            {l:'نسبة التحصيل',v:collPct+'%',c:collPct>=80?'#059669':collPct>=50?'#d97706':'#dc2626'},
          ].map(x=>`
            <div style="flex:1;text-align:center">
              <div style="font-size:15px;font-weight:900;color:${x.c}">${x.v}</div>
              <div style="font-size:10px;color:#94a3b8;font-weight:600;margin-top:3px">${x.l}</div>
            </div>`).join('<div class="bar-divider" style="width:1px;background:#e2e8f0"></div>')}
        </div>
        <canvas id="revChart" style="max-height:200px"></canvas>
      </div>

      <!-- Collections Donut -->
      <div class="ea-white-card" style="padding:24px">
        <div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:4px">Collections</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:16px">توزيع التحصيل حسب الحالة</div>
        <div style="position:relative;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <canvas id="collDonut" style="max-height:170px;max-width:170px"></canvas>
          <div style="position:absolute;text-align:center">
            <div style="font-size:28px;font-weight:900;color:#0f172a">${collPct}%</div>
            <div style="font-size:10px;color:#94a3b8;font-weight:600">محصّل</div>
          </div>
        </div>
        ${[
          {l:'محصّل',v:collected,c:'#10b981'},
          {l:'قيد التحصيل',v:Math.max(0,outstand-overdueAmt),c:'#f59e0b'},
          {l:'متأخر',v:overdueAmt,c:'#f43f5e'},
        ].map(r=>{
          const pct=invoiced>0?Math.round(r.v/invoiced*100):0;
          return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="width:10px;height:10px;border-radius:3px;background:${r.c};display:inline-block;flex-shrink:0"></span>
            <span style="font-size:12px;color:#64748b;flex:1">${r.l}</span>
            <span style="font-size:12px;font-weight:800;color:#0f172a">${money(r.v)}</span>
            <span style="font-size:10px;font-weight:700;color:${r.c};min-width:32px;text-align:left">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- ══ SECTION 3 — SALES FUNNEL + CLIENT GROWTH ══ -->
    <div class="ea-in dash-2col" style="animation-delay:.1s;display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- Sales Funnel -->
      <div class="ea-white-card" style="padding:24px">
        <div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:4px">Sales Funnel</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:22px">رحلة العميل — نسبة التحويل بين المراحل</div>
        ${(()=>{
          const stages = [
            {l:'إجمالي العملاء المحتملين',c:leads.length,col:'#6366f1',bg:'#eef2ff'},
            {l:'مهتم',c:lCount('interested'),col:'#15803d',bg:'#f0fdf4'},
            {l:'كلمني لاحقاً',c:lCount('call_later'),col:'#d97706',bg:'#fefce8'},
            {l:'عرض مرسل',c:lCount('quotation_sent'),col:'#f97316',bg:'#fff7ed'},
            {l:'قيد التأسيس',c:lCount('under_establishment'),col:'#0891b2',bg:'#ecfeff'},
            {l:'خسارة',c:lCount('lost'),col:'#dc2626',bg:'#fef2f2'},
          ];
          const top = stages[0].c||1;
          return stages.map((s,i)=>{
            const w = Math.round(s.c/top*100);
            const conv = i>0&&stages[i-1].c>0 ? Math.round(s.c/stages[i-1].c*100) : null;
            return `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:${i<stages.length-1?'6px':'0'}">
              <div style="width:120px;font-size:11.5px;color:#374151;font-weight:700;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.l}</div>
              <div style="flex:1;height:34px;background:#f1f5f9;border-radius:8px;overflow:hidden;position:relative">
                <div style="position:absolute;inset:0;width:${w}%;background:linear-gradient(90deg,${s.col},${s.col}cc);border-radius:8px;transition:width 1.3s ease"></div>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;padding:0 10px">
                  <span style="font-size:15px;font-weight:900;color:${w>20?'#fff':'#374151'}">${s.c}</span>
                  ${conv!==null?`<span style="font-size:10px;font-weight:700;color:${w>45?'rgba(255,255,255,.8)':'#94a3b8'}">${conv}%</span>`:''}
                </div>
              </div>
            </div>
            ${i<stages.length-1?`<div style="display:flex;padding:0 0 6px 120px"><div style="flex:1;display:flex;justify-content:center"><div style="width:1.5px;height:5px;background:#e2e8f0"></div></div></div>`:''}`;
          }).join('');
        })()}
      </div>

      <!-- Client Growth -->
      <div class="ea-white-card" style="padding:24px">
        <div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:4px">Client Growth</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:16px">نمو العملاء الجدد — آخر 12 شهر</div>
        <div style="display:flex;gap:0;margin-bottom:16px">
          ${[
            {l:'إجمالي العملاء',v:stats.clients.active||stats.clients.total,c:'#1a2472'},
            {l:'جدد هذا الشهر',v:'+'+stats.clients.new_this_month,c:'#059669'},
            {l:'إقرارات دخل',v:stats.clients.income_declaration??'—',c:'#7c3aed'},
            {l:'قيمة مضافة',v:stats.clients.vat_declaration??'—',c:'#0ea5e9'},
            {l:'توحيد مرتبات',v:stats.clients.payroll_declaration??'—',c:'#059669'},
          ].map((x,i)=>`
            ${i>0?'<div style="width:1px;background:#f1f5f9;margin:0 12px"></div>':''}
            <div>
              <div style="font-size:20px;font-weight:900;color:${x.c}">${x.v}</div>
              <div style="font-size:10px;color:#94a3b8;font-weight:600;margin-top:2px">${x.l}</div>
            </div>`).join('')}
        </div>
        <canvas id="clientGrowthChart" style="max-height:200px"></canvas>
      </div>
    </div>

    <!-- ══ SECTION 4 — FORMATION PIPELINE ══ -->
    ${fTotal>0?`
    <div class="ea-in ea-white-card" style="animation-delay:.13s;padding:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div>
          <div style="font-size:15px;font-weight:800;color:#0f172a">Company Formation Pipeline</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:3px">${fTotal} ملف — ${fCompleted} مكتمل — ${fTotal-fCompleted} جارٍ</div>
        </div>
        <button onclick="navigate('establishment')" style="background:#eef1fb;border:1px solid #c7d2fe;color:#1a2472;font-size:12px;font-weight:700;padding:7px 16px;border-radius:10px;cursor:pointer;font-family:inherit">عرض الكل ←</button>
      </div>
      <div class="dash-formation-pipeline" style="display:grid;grid-template-columns:repeat(10,1fr);gap:8px;margin-bottom:14px">
        ${[
          {k:'name_reservation',l:'حجز اسم',i:'📝',c:'#6366f1',g:'linear-gradient(135deg,#4338ca,#6366f1)'},
          {k:'name_approved',l:'إقرار قبول',i:'✅',c:'#8b5cf6',g:'linear-gradient(135deg,#6d28d9,#8b5cf6)'},
          {k:'under_review',l:'تحت المراجعة',i:'🔍',c:'#0ea5e9',g:'linear-gradient(135deg,#0369a1,#0ea5e9)'},
          {k:'fees_payment',l:'دفع الرسوم والتوقيع',i:'💳',c:'#0284c7',g:'linear-gradient(135deg,#075985,#0284c7)'},
          {k:'follow_up',l:'في المتابعة',i:'📞',c:'#d97706',g:'linear-gradient(135deg,#92400e,#d97706)'},
          {k:'lawyers_syndicate',l:'نقابة المحامين',i:'⚖️',c:'#b45309',g:'linear-gradient(135deg,#78350f,#b45309)'},
          {k:'real_estate',l:'الشهر العقاري',i:'🏢',c:'#dc2626',g:'linear-gradient(135deg,#991b1b,#dc2626)'},
          {k:'chamber_commerce',l:'الغرفة التجارية',i:'🏛️',c:'#7c3aed',g:'linear-gradient(135deg,#5b21b6,#7c3aed)'},
          {k:'commercial_register',l:'السجل التجاري',i:'📋',c:'#16a34a',g:'linear-gradient(135deg,#14532d,#16a34a)'},
          {k:'docs_received',l:'استلام المستندات',i:'📂',c:'#0369a1',g:'linear-gradient(135deg,#1e3a8a,#0369a1)'},
          {k:'tax_card',l:'الضرائب',i:'🪪',c:'#059669',g:'linear-gradient(135deg,#065f46,#059669)'},
          {k:'completed',l:'مكتمل',i:'🎉',c:'#166534',g:'linear-gradient(135deg,#14532d,#15803d)'},
        ].map(s=>{
          const cnt = fStageData[s.k]?.count||0;
          const pct = fTotal>0?Math.round(cnt/fTotal*100):0;
          return `<div onclick="navigate('establishment')" style="
            text-align:center;padding:12px 6px;border-radius:12px;cursor:pointer;
            background:${cnt>0?s.g:'#f8fafc'};
            box-shadow:${cnt>0?'0 3px 10px rgba(0,0,0,.15)':'none'};
            border:1.5px solid ${cnt>0?'transparent':'#f1f5f9'};
            transition:all .2s" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform=''">
            <div style="font-size:18px;margin-bottom:5px">${s.i}</div>
            <div style="font-size:20px;font-weight:900;color:${cnt>0?'#fff':'#cbd5e1'};line-height:1">${cnt}</div>
            <div style="font-size:8.5px;color:${cnt>0?'rgba(255,255,255,.75)':'#94a3b8'};margin-top:4px;font-weight:600;line-height:1.3">${s.l}</div>
            ${pct>0?`<div style="font-size:9px;color:rgba(255,255,255,.9);font-weight:800;margin-top:3px">${pct}%</div>`:''}
          </div>`;
        }).join('')}
      </div>
      <!-- coloured progress bar -->
      <div style="display:flex;gap:2px;height:5px;border-radius:99px;overflow:hidden">
        ${[
          {k:'name_reservation',c:'#6366f1'},{k:'name_approved',c:'#8b5cf6'},
          {k:'under_review',c:'#0ea5e9'},{k:'fees_payment',c:'#0284c7'},
          {k:'follow_up',c:'#d97706'},{k:'lawyers_syndicate',c:'#b45309'},
          {k:'real_estate',c:'#dc2626'},{k:'chamber_commerce',c:'#7c3aed'},
          {k:'commercial_register',c:'#16a34a'},{k:'docs_received',c:'#0369a1'},
          {k:'tax_card',c:'#059669'},{k:'completed',c:'#166534'}
        ].map(s=>{
          const pct=fTotal>0?Math.round((fStageData[s.k]?.count||0)/fTotal*100):0;
          return pct>0?`<div style="flex:${pct};background:${s.c}" title="${pct}%"></div>`:'';
        }).join('')}
      </div>
    </div>`:''}

    <!-- ══ SECTION 5 — ACTIVITY + SMART ALERTS ══ -->
    <div class="ea-in dash-2col" style="animation-delay:.15s;display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- Activity -->
      <div class="ea-white-card" style="padding:24px">
        <div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:4px">Recent Activity</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:18px">آخر الأنشطة في النظام</div>
        <div id="dashAct"></div>
      </div>

      <!-- Smart Alerts -->
      <div class="ea-white-card" style="padding:24px">
        <div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:4px">Smart Alerts</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:18px">تنبيهات تحتاج اهتمامك</div>
        <div id="dashAlerts"></div>
      </div>
    </div>

    <!-- ══ SECTION 6 — OBLIGATIONS ══ -->
    <div class="ea-in ea-white-card" style="animation-delay:.18s;padding:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div>
          <div style="font-size:15px;font-weight:800;color:#0f172a">الالتزامات الضريبية القادمة</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:3px">خلال الـ 14 يوم القادمة</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          ${overdueObl>0?`<span style="background:linear-gradient(135deg,#dc2626,#f87171);color:#fff;font-size:11px;font-weight:700;padding:5px 14px;border-radius:99px;box-shadow:0 2px 8px rgba(220,38,38,.3)">${overdueObl} متأخر</span>`:''}
          ${urgentObl>0?`<span style="background:linear-gradient(135deg,#d97706,#fbbf24);color:#fff;font-size:11px;font-weight:700;padding:5px 14px;border-radius:99px;box-shadow:0 2px 8px rgba(217,119,6,.3)">${urgentObl} عاجل</span>`:''}
          ${!overdueObl&&!urgentObl?`<span style="background:linear-gradient(135deg,#059669,#34d399);color:#fff;font-size:11px;font-weight:700;padding:5px 14px;border-radius:99px">🎉 لا متأخرات</span>`:''}
          <button onclick="navigate('obligations')" style="background:#eef1fb;border:1px solid #c7d2fe;color:#1a2472;font-size:11px;font-weight:700;padding:5px 14px;border-radius:10px;cursor:pointer;font-family:inherit">عرض الكل</button>
        </div>
      </div>
      <div id="dashObl" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px"></div>
    </div>

    <!-- ══ SECTION 7 — FORMATION OBLIGATIONS ══ -->
    ${fmOblStats&&(fmOblStats.total_open>0||fmOblStats.completed>0)?`
    <div class="ea-in ea-white-card" style="animation-delay:.2s;padding:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div>
          <div style="font-size:15px;font-weight:800;color:#0f172a">🏗️ التزامات التأسيس</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:3px">تقدم ملفات التأسيس النشطة</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${fmOblStats.late>0?`<span style="background:linear-gradient(135deg,#dc2626,#f87171);color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:99px">${fmOblStats.late} متأخر</span>`:''}
          <span style="background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-size:11px;font-weight:700;padding:4px 12px;border-radius:99px">${fmOblStats.total_open} مفتوح</span>
          <button onclick="navigate('formation_obligations')" style="background:#eef1fb;border:1px solid #c7d2fe;color:#1a2472;font-size:11px;font-weight:700;padding:5px 14px;border-radius:10px;cursor:pointer;font-family:inherit">عرض الكل ←</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${(fmOblStats.cases_with_progress||[]).slice(0,5).map(cp=>`
        <div onclick="navigate('formation_obligations')" style="padding:12px 16px;border-radius:12px;background:#f8fafc;border:1px solid #f1f5f9;cursor:pointer;transition:all .15s" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:13px;font-weight:700;color:#0f172a">${escH(cp.company_name||'')}</span>
            <span style="font-size:12px;font-weight:800;color:${cp.progress_pct>=80?'#10b981':cp.progress_pct>=40?'#f59e0b':'#64748b'}">${cp.progress_pct}%</span>
          </div>
          <div style="height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${cp.progress_pct}%;background:${cp.progress_pct>=80?'#10b981':cp.progress_pct>=40?'#f59e0b':'#6366f1'};border-radius:99px;transition:width .3s"></div>
          </div>
          <div style="font-size:10.5px;color:#94a3b8;margin-top:6px">${cp.completed_steps}/${cp.total_steps} خطوة${cp.remaining&&cp.remaining.length?` — متبقي: ${cp.remaining.slice(0,2).join(' • ')}${cp.remaining.length>2?` +${cp.remaining.length-2}`:''}`:''}</div>
        </div>`).join('')}
      </div>
    </div>`:''}
`;

    // ══ Charts ════════════════════════════════════════════
    // Revenue Chart
    const rCtx = document.getElementById('revChart')?.getContext('2d');
    if(rCtx){
      const gR=rCtx.createLinearGradient(0,0,0,200);
      gR.addColorStop(0,'rgba(26,36,114,.18)'); gR.addColorStop(1,'rgba(26,36,114,0)');
      const gG=rCtx.createLinearGradient(0,0,0,200);
      gG.addColorStop(0,'rgba(16,185,129,.22)'); gG.addColorStop(1,'rgba(16,185,129,0)');
      chartInstances.revChart=new Chart(rCtx,{
        type:'bar',
        data:{
          labels:months12.map(m=>m.month||''),
          datasets:[
            {label:'فواتير',data:months12.map(m=>m.invoiced||0),backgroundColor:'rgba(26,36,114,.12)',borderColor:'#1a2472',borderWidth:1.5,borderRadius:5,type:'bar'},
            {label:'محصّل',data:months12.map(m=>m.revenue||m.collected||0),borderColor:'#10b981',backgroundColor:gG,borderWidth:2.5,fill:true,tension:.4,type:'line',pointRadius:3.5,pointBackgroundColor:'#10b981',pointBorderColor:'white',pointBorderWidth:1.5,yAxisID:'y'},
          ]
        },
        options:{
          responsive:true,maintainAspectRatio:true,
          interaction:{mode:'index',intersect:false},
          plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f172a',padding:12,titleFont:{family:'Cairo',size:11},bodyFont:{family:'Cairo',size:10},callbacks:{label:c=>' '+c.dataset.label+': '+money(c.raw)}}},
          scales:{
            x:{grid:{display:false},ticks:{font:{family:'Cairo',size:10},color:'#94a3b8'},border:{display:false}},
            y:{grid:{color:'#f8fafc'},ticks:{font:{family:'Cairo',size:9},color:'#94a3b8',callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v},border:{display:false}}
          }
        }
      });
    }

    // Collections Donut
    const dCtx=document.getElementById('collDonut')?.getContext('2d');
    if(dCtx){
      const c1=Math.max(0,collected), c2=Math.max(0,outstand-overdueAmt), c3=Math.max(0,overdueAmt);
      chartInstances.collDonut=new Chart(dCtx,{
        type:'doughnut',
        data:{labels:['محصّل','قيد التحصيل','متأخر'],datasets:[{data:[c1,c2,c3],backgroundColor:['#10b981','#f59e0b','#f43f5e'],borderWidth:0,hoverOffset:5}]},
        options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.label}: ${money(c.raw)}`}}},cutout:'72%'}
      });
    }

    // Client Growth Chart
    const cgCtx=document.getElementById('clientGrowthChart')?.getContext('2d');
    if(cgCtx){
      const gCg=cgCtx.createLinearGradient(0,0,0,200);
      gCg.addColorStop(0,'rgba(99,102,241,.2)'); gCg.addColorStop(1,'rgba(99,102,241,0)');
      chartInstances.clientGrowth=new Chart(cgCtx,{
        type:'line',
        data:{labels:months12.map(m=>m.month||''),datasets:[{label:'عملاء جدد',data:clientVals,borderColor:'#6366f1',backgroundColor:gCg,borderWidth:2.5,fill:true,tension:.5,pointRadius:4,pointBackgroundColor:'#6366f1',pointBorderColor:'white',pointBorderWidth:2}]},
        options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f172a',padding:10,titleFont:{family:'Cairo',size:11},bodyFont:{family:'Cairo',size:10},callbacks:{label:c=>` عملاء جدد: ${c.raw}`}}},scales:{x:{grid:{display:false},ticks:{font:{family:'Cairo',size:10},color:'#94a3b8'},border:{display:false}},y:{grid:{color:'#f8fafc'},ticks:{font:{family:'Cairo',size:9},color:'#94a3b8',stepSize:1},border:{display:false},min:0}}}
      });
    }

    // ══ Activity Feed ════════════════════════════════
    const actEl=document.getElementById('dashAct');
    if(actEl){
      const aMap={
        create_client:{i:'👤',c:'linear-gradient(135deg,#1a2472,#2540c0)',l:'عميل جديد'},
        create_invoice:{i:'💳',c:'linear-gradient(135deg,#0369a1,#0ea5e9)',l:'فاتورة جديدة'},
        update_invoice:{i:'📝',c:'linear-gradient(135deg,#b45309,#f59e0b)',l:'تحديث فاتورة'},
        create_task:{i:'✅',c:'linear-gradient(135deg,#065f46,#10b981)',l:'مهمة جديدة'},
        create_lead:{i:'🎯',c:'linear-gradient(135deg,#6d28d9,#8b5cf6)',l:'عميل محتمل'},
        payment_received:{i:'💰',c:'linear-gradient(135deg,#134e4a,#14b8a6)',l:'دفعة مستلمة'},
        update_client:{i:'✏️',c:'linear-gradient(135deg,#1e293b,#475569)',l:'تحديث بيانات'},
      };
      const acts=Array.isArray(activity)?activity:[];
      if(acts.length){
        actEl.innerHTML=acts.slice(0,8).map((a,i)=>{
          const m=aMap[a.action]||{i:'📌',c:'linear-gradient(135deg,#475569,#64748b)',l:'نشاط'};
          return `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;${i>0?'border-top:1px solid #f8fafc':''}">
            <div style="width:36px;height:36px;border-radius:10px;background:${m.c};display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,.12)">${m.i}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
                <span style="font-size:11px;font-weight:700;color:#1a2472;background:#eef1fb;padding:1px 8px;border-radius:99px">${m.l}</span>
                <span style="font-size:10px;color:#94a3b8">${dateAr(a.created_at)}</span>
              </div>
              <div style="font-size:12.5px;color:#374151;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(a.description||'')}</div>
            </div>
          </div>`;
        }).join('');
      } else actEl.innerHTML='<div style="text-align:center;padding:32px;color:#94a3b8"><div style="font-size:32px;margin-bottom:8px">📭</div><div style="font-size:12px">لا توجد نشاطات بعد</div></div>';
    }

    // ══ Smart Alerts ════════════════════════════════
    const alertEl=document.getElementById('dashAlerts');
    if(alertEl){
      const staleLeads=leads.filter(l=>l.status==='new'&&l.created_at&&(Date.now()-new Date(l.created_at))>7*86400000);
      const alerts=[];
      if(overdueObl>0) alerts.push({i:'🔴',t:'التزامات ضريبية متأخرة',d:`${overdueObl} التزام تجاوز موعده`,g:'linear-gradient(135deg,#7f1d1d,#b91c1c)',p:'obligations'});
      if(overdueAmt>0) alerts.push({i:'💸',t:'مدفوعات متأخرة',d:`${money(overdueAmt)} لم تُحصَّل بعد الموعد`,g:'linear-gradient(135deg,#78350f,#c2410c)',p:'invoices'});
      if(staleLeads.length>0) alerts.push({i:'📞',t:'عملاء بدون متابعة',d:`${staleLeads.length} محتمل منذ أكثر من 7 أيام`,g:'linear-gradient(135deg,#713f12,#a16207)',p:'leads'});
      if(stats.tasks.overdue>0) alerts.push({i:'⏰',t:'مهام متأخرة',d:`${stats.tasks.overdue} مهمة تجاوزت الموعد`,g:'linear-gradient(135deg,#4c1d95,#6d28d9)',p:'tasks'});
      if(urgentObl>0) alerts.push({i:'⚠️',t:'التزامات عاجلة',d:`${urgentObl} التزام خلال 3 أيام`,g:'linear-gradient(135deg,#78350f,#d97706)',p:'obligations'});
      if(alerts.length===0){
        alertEl.innerHTML=`<div style="text-align:center;padding:32px 16px">
          <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#059669,#34d399);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:28px;box-shadow:0 4px 16px rgba(5,150,105,.3)">✅</div>
          <div style="font-size:14px;font-weight:800;color:#0f172a">كل شيء على ما يرام</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:4px">لا تنبيهات حرجة الآن</div>
        </div>`;
      } else {
        alertEl.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px">
          ${alerts.map(a=>`<div onclick="navigate('${a.p}')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:${a.g};cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);transition:all .15s" onmouseover="this.style.transform='translateX(-3px)';this.style.boxShadow='0 4px 14px rgba(0,0,0,.2)'" onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(0,0,0,.15)'">
            <span style="font-size:22px;flex-shrink:0">${a.i}</span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:700;color:#fff">${a.t}</div>
              <div style="font-size:11px;color:rgba(255,255,255,.65);margin-top:2px">${a.d}</div>
            </div>
            <span style="font-size:14px;color:rgba(255,255,255,.5)">→</span>
          </div>`).join('')}
        </div>`;
      }
    }

    // ══ Obligations ═════════════════════════════════
    const oblEl=document.getElementById('dashObl');
    if(oblEl){
      if(upcoming.length){
        oblEl.innerHTML=upcoming.slice(0,8).map(inst=>{
          const over=inst.days_remaining<0,td=inst.days_remaining===0,cl=inst.days_remaining>0&&inst.days_remaining<=3;
          const g=over?'linear-gradient(135deg,#fef2f2,#fee2e2)':td?'linear-gradient(135deg,#fffbeb,#fef9c3)':cl?'linear-gradient(135deg,#fffbeb,#fef3c7)':'#f8fafc';
          const bc=over?'#fca5a5':td?'#fde68a':cl?'#fde68a':'#e2e8f0';
          const tc=over?'#dc2626':td?'#92400e':cl?'#b45309':'#059669';
          const pillG=over?'linear-gradient(135deg,#dc2626,#f87171)':td?'linear-gradient(135deg,#d97706,#fbbf24)':cl?'linear-gradient(135deg,#b45309,#f59e0b)':'linear-gradient(135deg,#059669,#34d399)';
          const dt=over?`-${Math.abs(inst.days_remaining)}ي`:td?'اليوم':`${inst.days_remaining}ي`;
          return `<div onclick="navigate('obligations')" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;cursor:pointer;background:${g};border:1px solid ${bc};transition:all .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
            <span style="font-size:18px;flex-shrink:0">${OBL_ICON[inst.obligation_type]||'📋'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(inst.client_name||'—')}</div>
              <div style="font-size:10.5px;color:#64748b;margin-top:1px">${OBL_NAME_AR[inst.obligation_type]||''}</div>
            </div>
            <span style="font-size:11px;font-weight:700;background:${pillG};color:#fff;padding:3px 10px;border-radius:99px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.15)">${dt}</span>
          </div>`;
        }).join('');
      } else oblEl.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:24px;color:#94a3b8"><div style="font-size:32px;margin-bottom:8px">🎉</div><div style="font-size:13px;font-weight:600">لا التزامات قادمة خلال 14 يوم</div></div>';
    }

  } catch(e){ toast(e.message,'error'); }
}


// ── CLIENTS ────────────────────────────────────────
let clientsData=[], clientSearch='', clientFilter='all', clientTypeFilter='all';

