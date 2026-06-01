// PortfolioIQ ui/charts.js
// Extracted from the original app.js to keep the vanilla JS app easier to review.

function renderAllocation(){
  const legend=document.getElementById('allocLegend');
  if(!state.portfolio.length){
    if(allocChartInst){allocChartInst.destroy();allocChartInst=null;}
    const ctx=document.getElementById('allocChart').getContext('2d');
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
    legend.innerHTML='<div style="font-size:12px;color:var(--text3)">No stocks yet</div>';
    return;
  }
  const totalWeight=state.portfolio.reduce((a,p)=>a+(p.weight||0),0);
  const labels=state.portfolio.map(p=>p.ticker);
  const data=state.portfolio.map(p=>(weightShare(p,totalWeight,state.portfolio.length)*100).toFixed(1));
  const colors=SECTOR_COLORS.slice(0,state.portfolio.length);

  if(allocChartInst)allocChartInst.destroy();
  allocChartInst=new Chart(document.getElementById('allocChart'),{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:colors,borderColor:'#080c14',borderWidth:2,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+ctx.label+': '+ctx.parsed+'%'}}},cutout:'60%'}
  });

  legend.innerHTML=labels.map((l,i)=>`<div class="alloc-legend-item"><div class="alloc-dot" style="background:${colors[i]}"></div><span style="flex:1">${l}</span><span class="mono" style="color:var(--text)">${data[i]}%</span></div>`).join('');
}

// ========== GROWTH CHART ==========
let growthChartInst=null;
function renderGrowthChart(){
  const valid=state.portfolio.filter(p=>state.stockCache[p.ticker]);
  if(!valid.length)return;

  const analytics=getPortfolioAnalytics(valid);
  if(!analytics?.portfolioReturnSeries?.length)return;
  const datasets=[];

  let portGrowth=1;
  const portCumulative=analytics.portfolioReturnSeries.map(x=>{
    portGrowth*=1+x.return;
    return +(portGrowth*100-100).toFixed(2);
  });
  datasets.push({label:'Your Portfolio',data:portCumulative,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.05)',fill:true,borderWidth:2,pointRadius:0,tension:0.2});

  valid.slice(0,4).forEach((p,i)=>{
    let assetGrowth=1;
    const aligned=analytics.assetReturnsByTicker[p.ticker]||[];
    const d=aligned.map(x=>{
      assetGrowth*=1+x.return;
      return +(assetGrowth*100-100).toFixed(2);
    });
    datasets.push({label:p.ticker,data:d,borderColor:SECTOR_COLORS[i+1]||SECTOR_COLORS[i],backgroundColor:'transparent',borderWidth:1,pointRadius:0,tension:0.2,borderDash:i>0?[4,2]:[]});
  });

  const labels=analytics.portfolioDates;

  if(growthChartInst)growthChartInst.destroy();
  growthChartInst=new Chart(document.getElementById('growthChart'),{
    type:'line',
    data:{labels,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,position:'top',labels:{color:'#8fa3c0',font:{size:11},boxWidth:10,padding:10}},tooltip:{backgroundColor:'#0e1420',borderColor:'#1e2d4a',borderWidth:1,titleColor:'#e8edf5',bodyColor:'#8fa3c0',callbacks:{label:ctx=>ctx.dataset.label+': '+(ctx.raw>=0?'+':'')+ctx.raw+'%'}}},
      scales:{x:{ticks:{color:'#4a6080',maxTicksLimit:8,font:{size:10}},grid:{color:'#1a2340'}},y:{ticks:{color:'#4a6080',font:{size:10},callback:v=>(v>=0?'+':'')+v+'%'},grid:{color:'#1a2340'}}}
    }
  });
}

// ========== CORRELATION ==========
function renderCorrelation(){
  const el=document.getElementById('corr-matrix-wrap');
  const valid=state.portfolio.filter(p=>state.stockCache[p.ticker]);
  if(valid.length<2){el.innerHTML='<div class="empty-state" style="padding:20px">Add 2+ stocks to see correlations</div>';return;}

  const n=Math.min(valid.length,6);
  const stocks=valid.slice(0,n);
  const returnSets=stocks.map(p=>state.stockCache[p.ticker].returnSeries);

  function corrColor(r){
    if(r>0.7) return '#ef4444';
    if(r>0.4) return '#f59e0b';
    if(r<-0.3) return '#10b981';
    return '#253560';
  }

  let html=`<div style="overflow-x:auto"><table style="width:auto;min-width:100%"><thead><tr><th></th>`;
  stocks.forEach(p=>{html+=`<th style="text-align:center;font-family:'DM Mono',monospace;color:var(--accent);padding:6px 8px">${p.ticker}</th>`;});
  html+='</tr></thead><tbody>';
  stocks.forEach((p,i)=>{
    html+=`<tr><td class="mono" style="color:var(--accent);padding:6px 8px;font-weight:500">${p.ticker}</td>`;
    stocks.forEach((q,j)=>{
      const r=correlation(returnSets[i],returnSets[j]);
      const bg=i===j?'var(--bg4)':corrColor(r);
      html+=`<td class="corr-cell" style="background:${bg};color:${i===j?'var(--text2)':'#fff'}">${r.toFixed(2)}</td>`;
    });
    html+='</tr>';
  });
  html+='</tbody></table>';
  html+=`<div class="footnote" style="margin-top:8px">🟥 High correlation (>0.7) · 🟨 Moderate (0.4–0.7) · 🟩 Negative correlation (diversifying)</div></div>`;
  el.innerHTML=html;
}

// ========== ANALYZE PORTFOLIO ==========


let riskDrawdownChartInst=null,riskRollingVolChartInst=null,riskRollingBetaChartInst=null,riskDistributionChartInst=null;


function destroyRiskLabCharts(){
  [riskDrawdownChartInst,riskRollingVolChartInst,riskRollingBetaChartInst,riskDistributionChartInst].forEach(c=>{if(c)c.destroy();});
  riskDrawdownChartInst=riskRollingVolChartInst=riskRollingBetaChartInst=riskDistributionChartInst=null;
}


function renderRiskLabCharts(series,benchmarkSeries){
  const drawdowns=drawdownCurve(series);
  const rollingVol=rollingVolatility(series,63);
  const rollingB=benchmarkSeries.length?rollingBeta(series,benchmarkSeries,63):[];
  const dist=returnDistribution(series);

  if(riskDrawdownChartInst)riskDrawdownChartInst.destroy();
  riskDrawdownChartInst=new Chart(document.getElementById('riskDrawdownChart'),{
    type:'line',
    data:{labels:drawdowns.map(x=>x.date),datasets:[{label:'Drawdown',data:drawdowns.map(x=>+(x.drawdown*100).toFixed(2)),borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,.10)',fill:true,borderWidth:2,pointRadius:0,tension:.2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'Drawdown: '+ctx.raw+'%'}}},scales:{x:{ticks:{color:'#4a6080',maxTicksLimit:8},grid:{color:'#1a2340'}},y:{ticks:{color:'#4a6080',callback:v=>v+'%'},grid:{color:'#1a2340'}}}}
  });

  if(riskRollingVolChartInst)riskRollingVolChartInst.destroy();
  riskRollingVolChartInst=new Chart(document.getElementById('riskRollingVolChart'),{
    type:'line',
    data:{labels:rollingVol.map(x=>x.date),datasets:[{label:'63-day rolling volatility',data:rollingVol.map(x=>+(x.value*100).toFixed(2)),borderColor:'#f59e0b',backgroundColor:'rgba(245,158,11,.08)',fill:true,borderWidth:2,pointRadius:0,tension:.2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#8fa3c0',font:{size:11}}}},scales:{x:{ticks:{color:'#4a6080',maxTicksLimit:8},grid:{color:'#1a2340'}},y:{ticks:{color:'#4a6080',callback:v=>v+'%'},grid:{color:'#1a2340'}}}}
  });

  if(riskRollingBetaChartInst)riskRollingBetaChartInst.destroy();
  riskRollingBetaChartInst=new Chart(document.getElementById('riskRollingBetaChart'),{
    type:'line',
    data:{labels:rollingB.map(x=>x.date),datasets:[{label:'63-day rolling beta',data:rollingB.map(x=>+x.value.toFixed(2)),borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,.08)',fill:true,borderWidth:2,pointRadius:0,tension:.2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#8fa3c0',font:{size:11}}}},scales:{x:{ticks:{color:'#4a6080',maxTicksLimit:8},grid:{color:'#1a2340'}},y:{ticks:{color:'#4a6080'},grid:{color:'#1a2340'}}}}
  });

  if(riskDistributionChartInst)riskDistributionChartInst.destroy();
  riskDistributionChartInst=new Chart(document.getElementById('riskDistributionChart'),{
    type:'bar',
    data:{labels:dist.labels,datasets:[{label:'Daily returns',data:dist.counts,backgroundColor:dist.labels.map(label=>label.startsWith('-')?'rgba(239,68,68,.65)':'rgba(16,185,129,.60)'),borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.raw+' days'}}},scales:{x:{ticks:{color:'#4a6080',maxTicksLimit:8},grid:{display:false}},y:{ticks:{color:'#4a6080'},grid:{color:'#1a2340'}}}}
  });
}
