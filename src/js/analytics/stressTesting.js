// PortfolioIQ analytics/stressTesting.js
// Extracted from the original app.js to keep the vanilla JS app easier to review.

// ========== HISTORICAL STRESS TESTING ==========
// Stress testing matters because it asks a practical question: how would today's allocation have behaved in known market breaks?
// Historical crisis windows are useful because they preserve real co-movement, liquidity pressure, and market sequencing from those periods.
const STRESS_PERIODS = [
  {id:'covid2020',name:'COVID Crash 2020',start:'2020-02-19',end:'2020-03-23'},
  {id:'rates2022',name:'2022 Rate-Hike Bear Market',start:'2022-01-03',end:'2022-10-12'},
  {id:'q42018',name:'2018 Q4 Selloff',start:'2018-10-01',end:'2018-12-24'},
  {id:'gfc2008',name:'2008 Financial Crisis',start:'2008-09-01',end:'2009-03-09'},
];

// Historical crisis windows show how today's weights would have behaved in real market regimes instead of simulated shocks.
function alignStressReturnSeries(included,weights){
  const maps=included.map(h=>new Map(h.returnSeries.map(x=>[x.date,x.return]).filter(([,v])=>Number.isFinite(v))));
  if(!maps.length)return{portfolioSeries:[],assetReturnsByTicker:{}};
  const commonDates=[...maps[0].keys()].filter(d=>maps.every(m=>m.has(d))).sort();
  const assetReturnsByTicker={};
  included.forEach(h=>{assetReturnsByTicker[h.ticker]=[];});
  // Aligned dates are necessary so every stress-period portfolio return compares the same trading day across holdings.
  const portfolioSeries=commonDates.map(date=>{
    let r=0;
    included.forEach((h,i)=>{
      const ar=maps[i].get(date);
      assetReturnsByTicker[h.ticker].push({date,return:ar});
      r+=ar*weights[i];
    });
    return{date,return:r};
  });
  return{portfolioSeries,assetReturnsByTicker};
}

function stressKpi(label,value,cls='neu'){
  return `<div class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-val ${cls}" style="font-size:18px">${value}</div></div>`;
}

function stressInterpretation(result,benchmarkTicker){
  if(result.status!=='ok')return result.message;
  const rel=result.relative;
  const direction=result.portfolioReturn>=0?'gained':'declined';
  const compare=rel>=0?'held up better than':'underperformed';
  return `During ${result.name}, this portfolio ${direction} approximately ${fmtPctPlain(Math.abs(result.portfolioReturn)*100)}, compared with ${fmtPct(result.benchmarkReturn*100)} for ${benchmarkTicker}, meaning it ${compare} the benchmark by ${fmtPctPlain(Math.abs(rel)*100)}.`;
}

async function calculateStressPeriod(period,benchmarkTicker){
  const totalWeight=state.portfolio.reduce((a,p)=>a+(p.weight||0),0);
  const activeHoldings=state.portfolio.filter(p=>weightShare(p,totalWeight,state.portfolio.length)>0.0001);
  const included=[],skipped=[];
  for(const p of activeHoldings){
    try{
      const rows=await fetchYahooDataWindow(p.ticker,period.start,period.end);
      const {series:returnSeries}=priceToReturnSeries(rows);
      // Insufficient history matters because newer assets cannot honestly be replayed through older crises.
      if(returnSeries.length<5){
        skipped.push({ticker:p.ticker,reason:'insufficient crisis-window history'});
      } else {
        included.push({ticker:p.ticker,name:p.name,weight:weightShare(p,totalWeight,state.portfolio.length),returnSeries});
      }
    }catch(e){
      skipped.push({ticker:p.ticker,reason:'data unavailable'});
    }
  }
  if(!included.length){
    return{...period,status:'insufficient',message:'Insufficient holding history for this stress window.',includedCount:0,skippedCount:skipped.length,skipped};
  }
  const includedWeight=included.reduce((a,h)=>a+h.weight,0)||1;
  const weights=included.map(h=>h.weight/includedWeight);
  const aligned=alignStressReturnSeries(included,weights);
  if(aligned.portfolioSeries.length<5){
    return{...period,status:'insufficient',message:'Too few shared aligned dates across holdings for this stress window.',includedCount:included.length,skippedCount:skipped.length,skipped};
  }

  let benchmarkSeries=[];
  try{
    const bRows=await fetchYahooDataWindow(benchmarkTicker,period.start,period.end);
    benchmarkSeries=priceToReturnSeries(bRows).series;
  }catch(e){}
  if(benchmarkSeries.length<5){
    return{...period,status:'benchmark-missing',message:'Benchmark history is unavailable for this stress window.',includedCount:included.length,skippedCount:skipped.length,skipped};
  }

  const alignedBenchmark=alignTwoReturnSeries(aligned.portfolioSeries,benchmarkSeries);
  if(alignedBenchmark.length<5){
    return{...period,status:'benchmark-missing',message:'Too few overlapping dates between portfolio and benchmark for this stress window.',includedCount:included.length,skippedCount:skipped.length,skipped};
  }
  const portfolioSeries=alignedBenchmark.map(x=>({date:x.date,return:x.a}));
  const benchmarkAligned=alignedBenchmark.map(x=>({date:x.date,return:x.b}));
  const portfolioReturn=compoundReturn(portfolioSeries);
  const benchmarkReturn=compoundReturn(benchmarkAligned);
  const relative=portfolioReturn-benchmarkReturn;
  const worstDrawdown=maxDrawdown(portfolioSeries);
  const contributions=included.map((h,i)=>({
    ticker:h.ticker,
    contribution:compoundReturn(aligned.assetReturnsByTicker[h.ticker]||[])*weights[i],
  })).sort((a,b)=>b.contribution-a.contribution);

  return{
    ...period,status:'ok',includedCount:included.length,skippedCount:skipped.length,skipped,
    portfolioReturn,benchmarkReturn,relative,worstDrawdown,contributions,
    best:contributions.slice(0,3),worst:[...contributions].sort((a,b)=>a.contribution-b.contribution).slice(0,3),
    alignedDays:portfolioSeries.length,
  };
}

function renderStressResultCard(result,benchmarkTicker){
  if(result.status!=='ok'){
    return `<div class="stress-card">
      <div class="stress-head"><div><div class="stress-title">${escapeHtml(result.name)}</div><div class="stress-window">${result.start} to ${result.end}</div></div>${metricBadge('Insufficient History','amber')}</div>
      <div class="warning-msg">${escapeHtml(result.message)} Holdings with data: ${result.includedCount||0}. Skipped: ${result.skippedCount||0}.</div>
    </div>`;
  }
  const relCls=result.relative>=0?'pos':'neg';
  return `<div class="stress-card">
    <div class="stress-head">
      <div><div class="stress-title">${escapeHtml(result.name)}</div><div class="stress-window">${result.start} to ${result.end} · ${result.alignedDays} aligned trading days</div></div>
      ${metricBadge(result.relative>=0?'Defensive vs Benchmark':'Lagged Benchmark',result.relative>=0?'emerald':'rose')}
    </div>
    <div class="stress-kpis">
      ${stressKpi('Portfolio Return',fmtPct(result.portfolioReturn*100),result.portfolioReturn>=0?'pos':'neg')}
      ${stressKpi(`${benchmarkTicker} Return`,fmtPct(result.benchmarkReturn*100),result.benchmarkReturn>=0?'pos':'neg')}
      ${stressKpi('Relative',fmtPct(result.relative*100),relCls)}
      ${stressKpi('Worst Drawdown',fmtPct(result.worstDrawdown*100),'neg')}
      ${stressKpi('Holdings Used',String(result.includedCount),'neu')}
      ${stressKpi('Skipped',String(result.skippedCount),result.skippedCount?'neu':'pos')}
    </div>
    <div class="footnote" style="margin-bottom:10px">${escapeHtml(stressInterpretation(result,benchmarkTicker))}</div>
    <div class="grid-2">
      <div><div class="metric-label">Best Defensive Contributors</div><div class="footnote">${result.best.map(x=>`${x.ticker} ${fmtPct(x.contribution*100)}`).join(', ')||'—'}</div></div>
      <div><div class="metric-label">Worst Contributors</div><div class="footnote">${result.worst.map(x=>`${x.ticker} ${fmtPct(x.contribution*100)}`).join(', ')||'—'}</div></div>
    </div>
  </div>`;
}

async function runHistoricalStressTests(){
  const el=document.getElementById('stress-testing-results');
  const btn=document.getElementById('stress-run-btn');
  if(!el)return;
  if(!state.portfolio.length){el.innerHTML='<div class="empty-state" style="padding:20px">Build a portfolio before running historical stress tests</div>';return;}
  const benchmarkTicker=document.getElementById('benchmark-select').value||'SPY';
  if(btn){btn.disabled=true;btn.textContent='Running stress tests...';}
  el.innerHTML='<div class="loading"><div class="spinner"></div>Fetching historical crisis windows...</div>';
  const results=[];
  for(const period of STRESS_PERIODS){
    if(btn)btn.textContent='Testing '+period.name+'...';
    results.push(await calculateStressPeriod(period,benchmarkTicker));
    await yieldToBrowser();
  }
  state.lastStressResults={benchmarkTicker,results,ranAt:new Date().toISOString()};
  el.innerHTML=`<div class="stress-grid">${results.map(r=>renderStressResultCard(r,benchmarkTicker)).join('')}</div>
    <div class="footnote" style="margin-top:10px">Historical stress testing replays current weights through real crisis windows. It is not a forecast, and skipped holdings are excluded when they lack enough history.</div>`;
  if(btn){btn.disabled=false;btn.textContent='Run Stress Tests';}
}
