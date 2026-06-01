// PortfolioIQ analytics/diagnosis.js
// Extracted from the original app.js to keep the vanilla JS app easier to review.

// ========== LOCAL PORTFOLIO DIAGNOSIS ==========
var portfolioDiagnosisData=null;
function updateRiskLabel(v){
  document.getElementById('ai-risk-val').textContent=RISK_LABELS[parseInt(v)-1];
}

function diagnosisToneClass(tone){
  return tone==='pos'?'emerald':tone==='neg'?'rose':tone==='warn'?'amber':'teal';
}

function diagnosisSection(title,body,tone='neu'){
  return `<div class="diagnosis-section">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
      <h4 style="margin:0">${escapeHtml(title)}</h4>
      ${metricBadge(tone==='pos'?'Favorable':tone==='neg'?'Risk Flag':tone==='warn'?'Watchlist':'Review',diagnosisToneClass(tone))}
    </div>
    <p>${body}</p>
  </div>`;
}

function sentenceList(items){
  return `<div class="diagnosis-list">${items.map(x=>`<div class="diagnosis-list-item">${escapeHtml(x)}</div>`).join('')}</div>`;
}

function classifyPortfolioProfile(data){
  const vol=data.risk.annualizedVolatility;
  const betaValue=data.benchmark.beta;
  const hidden=data.hiddenConcentration.score;
  if(vol>0.38||hidden>=76||(betaValue!=null&&betaValue>1.45))return 'speculative';
  if(vol>0.25||hidden>=56||(betaValue!=null&&betaValue>1.2))return 'aggressive';
  if(vol<0.12&&data.downsideRisk.maxDrawdown>-0.15)return 'conservative';
  return 'balanced';
}

function getStressSummary(stressTests){
  const results=stressTests?.results||[];
  const ok=results.filter(r=>r.status==='ok');
  const skipped=results.reduce((sum,r)=>sum+(r.skippedCount||0),0);
  if(!ok.length)return{available:false,beatRatio:null,worst:null,avgRelative:null,skipped};
  const beatCount=ok.filter(r=>r.relative>=0).length;
  const worst=[...ok].sort((a,b)=>a.portfolioReturn-b.portfolioReturn)[0];
  return{
    available:true,
    beatRatio:beatCount/ok.length,
    worst,
    avgRelative:mean(ok.map(r=>r.relative)),
    avgDrawdown:mean(ok.map(r=>r.worstDrawdown)),
    skipped,
    okCount:ok.length,
    totalCount:results.length,
  };
}

function computeDiagnosisRating(data){
  // The rating is deterministic and rule-based: the same portfolio metrics always produce the same diagnosis score.
  const sharpeSortino=clamp(50+(data.performance.sharpe||0)*18+(data.performance.sortino||0)*10,0,100);
  const volatility=clamp(100-data.risk.annualizedVolatility*220,0,100);
  const drawdown=clamp(100+data.downsideRisk.maxDrawdown*180,0,100);
  const tail=clamp(100-Math.abs(data.downsideRisk.historicalCvar||0)*2200-Math.abs(data.downsideRisk.historicalVar||0)*900,0,100);
  const diversification=clamp(data.diversification.score||0,0,100);
  const hidden=clamp(100-(data.hiddenConcentration.score||0),0,100);
  const stressSummary=getStressSummary(data.stressTests);
  const stress=stressSummary.available?clamp(55+(stressSummary.beatRatio-0.5)*50+(stressSummary.avgRelative||0)*180+(stressSummary.avgDrawdown||0)*70,0,100):55;
  const mc=data.monteCarlo?.probabilityOfLoss!=null?clamp(78-data.monteCarlo.probabilityOfLoss*120+(data.monteCarlo.probabilityOfTarget||0)*18,0,100):55;
  const components=[
    {label:'Sharpe / Sortino',score:sharpeSortino,weight:0.20,reason:`Sharpe ${fmtNum(data.performance.sharpe)} · Sortino ${fmtNum(data.performance.sortino)}`},
    {label:'Volatility Control',score:volatility,weight:0.14,reason:`Annualized volatility ${fmtPctPlain(data.risk.annualizedVolatility*100)}`},
    {label:'Drawdown Control',score:drawdown,weight:0.14,reason:`Max drawdown ${fmtPct(data.downsideRisk.maxDrawdown*100)}`},
    {label:'VaR / CVaR Tail Risk',score:tail,weight:0.12,reason:`VaR ${fmtPct(data.downsideRisk.historicalVar*100)} · CVaR ${fmtPct(data.downsideRisk.historicalCvar*100)}`},
    {label:'Diversification',score:diversification,weight:0.14,reason:`Diversification score ${Math.round(data.diversification.score)}/100 · HHI ${fmtNum(data.diversification.hhi)}`},
    {label:'Hidden Concentration',score:hidden,weight:0.12,reason:`Hidden risk ${data.hiddenConcentration.score}/100`},
    {label:'Stress Resilience',score:stress,weight:0.08,reason:stressSummary.available?`${Math.round(stressSummary.beatRatio*100)}% crisis beat rate vs benchmark`:'Run stress tests for a stronger rating'},
    {label:'Monte Carlo Outlook',score:mc,weight:0.06,reason:data.monteCarlo?.probabilityOfLoss!=null?`Loss probability ${fmtPctPlain(data.monteCarlo.probabilityOfLoss*100)} · target probability ${fmtPctPlain((data.monteCarlo.probabilityOfTarget||0)*100)}`:'Run Monte Carlo for simulation context'},
  ];
  const score=Math.round(components.reduce((sum,c)=>sum+c.score*c.weight,0));
  const label=score>=85?'Excellent':score>=75?'Strong':score>=62?'Balanced':score>=48?'Watchlist':score>=35?'High Risk':'Speculative';
  return{score,label,components,helped:components.filter(c=>c.score>=70).sort((a,b)=>b.score-a.score),hurt:components.filter(c=>c.score<55).sort((a,b)=>a.score-b.score)};
}

async function collectBenchmarkDiagnosis(analytics){
  const benchmarkTicker=document.getElementById('benchmark-select')?.value||'SPY';
  try{
    const benchmark=await getRiskLabBenchmarkSeries();
    if(!benchmark?.returnSeries?.length)return{ticker:benchmarkTicker,beta:null,alpha:null,trackingDifference:null,annReturn:null,warning:'Benchmark data unavailable.'};
    const bBeta=beta(analytics.portfolioReturnSeries,benchmark.returnSeries);
    const bAnn=annualizedReturn(benchmark.returnSeries);
    return{
      ticker:benchmarkTicker,
      beta:bBeta,
      alpha:alphaApproximation(analytics.annReturn,bAnn,bBeta,parseFloat(document.getElementById('rfr-slider').value)/100||0.045),
      trackingDifference:trackingDifference(analytics.portfolioReturnSeries,benchmark.returnSeries),
      annReturn:bAnn,
    };
  }catch(e){
    return{ticker:benchmarkTicker,beta:null,alpha:null,trackingDifference:null,annReturn:null,warning:'Benchmark data could not be loaded.'};
  }
}

async function buildPortfolioDiagnosisData({retTarget,riskLevel,amount,horizon,selectedSectors,context}){
  const analytics=getPortfolioAnalytics();
  if(!analytics)return null;
  const benchmark=await collectBenchmarkDiagnosis(analytics);
  const hidden=await analyzeHiddenConcentration(analytics);
  const pairs=getCorrelationPairs(analytics.validStocks);
  const highCorrPairs=pairs.filter(p=>p.corr>0.75);
  const sectorExposure=hidden?.details?.sectorEntries||[];
  const var95=historicalVaR(analytics.portfolioReturnSeries,0.95);
  const cvar95=historicalCVaR(analytics.portfolioReturnSeries,0.95);
  const downDev=downsideDeviation(analytics.portfolioReturnSeries);

  // The diagnosis object intentionally collects calculated metrics first. Rule-based text based on this object is more auditable than generic AI prose.
  return{
    holdings:analytics.validStocks.map((p,i)=>({ticker:p.ticker,name:p.name,sector:getHoldingSector(p),weight:analytics.weights[i],metrics:state.stockCache[p.ticker]})),
    weights:analytics.weights,
    preferences:{targetReturn:parseFloat(retTarget)/100,riskLevel,amount:parseFloat(amount)||0,horizon,selectedSectors,context},
    performance:{annualizedReturn:analytics.annReturn,sharpe:analytics.sharpe,sortino:analytics.sortino,contributions:analytics.contributions},
    risk:{annualizedVolatility:analytics.annVol},
    downsideRisk:{maxDrawdown:analytics.maxDD,historicalVar:var95,historicalCvar:cvar95,downsideDeviation:downDev},
    benchmark,
    diversification:{
      score:analytics.diversification,
      hhi:analytics.hhi,
      holdingsCount:analytics.validStocks.length,
      maxWeight:hidden?.details?.maxWeight||Math.max(...analytics.weights),
      top3Weight:hidden?.details?.top3Weight||[...analytics.weights].sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0),
      averageCorrelation:hidden?.details?.avgCorr??(pairs.length?mean(pairs.map(p=>p.corr)):0),
      maxCorrelation:hidden?.details?.maxCorr??(pairs[0]?.corr||0),
      highCorrelationWarnings:highCorrPairs,
      sectorExposure,
    },
    hiddenConcentration:{
      score:hidden?.score??0,
      label:hidden?.label?.label||'Low',
      reasons:hidden?.reasons||[],
      suggestions:hidden?.suggestions||[],
      sectorThemeExposure:sectorExposure,
      riskContributionByHolding:hidden?.details?.riskContrib||[],
      components:hidden?.components||[],
    },
    stressTests:state.lastStressResults||{results:[],warnings:['Historical Stress Testing has not been run in this session.']},
    monteCarlo:state.lastMonteCarloResults||{warnings:['Monte Carlo simulation has not been run in this session.']},
    warnings:[...(analytics.warnings||[]),benchmark.warning].filter(Boolean),
  };
}

function buildDiagnosisNarrative(data,rating){
  // Calculated metrics are used as evidence for each paragraph, which is more trustworthy and inspectable than generic AI-generated commentary.
  const profile=classifyPortfolioProfile(data);
  const strongest=rating.helped[0]?.label||'No clear strength yet';
  const weakest=rating.hurt[0]?.label||'No major weakness in the current rule set';
  const topRisk=data.hiddenConcentration.riskContributionByHolding[0];
  const mainRisk=topRisk?`${topRisk.ticker} estimated risk contribution (${fmtPctPlain(topRisk.riskContribution*100)})`:`${data.hiddenConcentration.label} hidden concentration risk`;
  const alpha=data.benchmark.alpha;
  const tracking=data.benchmark.trackingDifference;
  const maxSector=data.diversification.sectorExposure[0];
  const stress=getStressSummary(data.stressTests);
  const mc=data.monteCarlo;
  const cvarGap=Math.abs(data.downsideRisk.historicalCvar||0)-Math.abs(data.downsideRisk.historicalVar||0);
  const spread=mc?.percentiles?mc.percentiles.p95-mc.percentiles.p5:null;

  const sections=[];
  sections.push(diagnosisSection('Executive Summary',
    `Overall rating is <strong style="color:var(--text)">${rating.label}</strong> (${rating.score}/100). The portfolio currently looks <strong style="color:var(--text)">${profile}</strong> based on ${fmtPctPlain(data.risk.annualizedVolatility*100)} volatility, beta ${data.benchmark.beta==null?'unavailable':fmtNum(data.benchmark.beta)}, and hidden concentration risk ${data.hiddenConcentration.score}/100. Strongest point: ${escapeHtml(strongest)}. Biggest weakness: ${escapeHtml(weakest)}. Main risk driver: ${escapeHtml(mainRisk)}.`,
    rating.score>=70?'pos':rating.score>=48?'warn':'neg'));

  sections.push(diagnosisSection('Return Quality',
    `Annualized return is ${fmtPct(data.performance.annualizedReturn*100)} with Sharpe ${fmtNum(data.performance.sharpe)} and Sortino ${fmtNum(data.performance.sortino)}. ${data.performance.sharpe>1&&data.performance.sortino>1.5?'Return quality appears strong because both total-risk and downside-risk adjusted ratios are favorable.':data.performance.annualizedReturn>0.15&&data.risk.annualizedVolatility>0.25?'Returns are high, but they appear risk-heavy because volatility is also elevated.':'Return quality is mixed and should be compared with risk taken.'} ${alpha==null?'Benchmark-adjusted alpha is unavailable.':alpha>=0?`Alpha is historically positive at ${fmtPct(alpha*100)}, suggesting benchmark outperformance after beta adjustment.`:`Alpha is historically negative at ${fmtPct(alpha*100)}, so benchmark-relative efficiency may be weak.`} ${tracking==null?'':`Tracking difference versus ${data.benchmark.ticker} is ${fmtPct(tracking*100)}.`}`,
    data.performance.sharpe>1&&data.performance.sortino>1.5?'pos':data.performance.sharpe<0.7?'neg':'warn'));

  sections.push(diagnosisSection('Downside Risk',
    `Maximum drawdown is ${fmtPct(data.downsideRisk.maxDrawdown*100)}, 95% historical daily VaR is ${fmtPct(data.downsideRisk.historicalVar*100)}, and 95% historical CVaR is ${fmtPct(data.downsideRisk.historicalCvar*100)}. ${data.downsideRisk.maxDrawdown<-0.30?'Downside risk is high because the portfolio historically suffered a drawdown worse than -30%.':'Historical drawdowns are not in the extreme zone, but they still matter for investor behavior.'} ${cvarGap>0.01?'CVaR is meaningfully worse than VaR, which may indicate tail risk beyond the normal bad-day threshold.':'VaR and CVaR are relatively close, so the worst historical tail is not much deeper than the VaR cutoff.'} Downside deviation is ${fmtPctPlain(data.downsideRisk.downsideDeviation*100)}.`,
    data.downsideRisk.maxDrawdown<-0.30||Math.abs(data.downsideRisk.historicalCvar)>0.04?'neg':data.downsideRisk.maxDrawdown<-0.18?'warn':'pos'));

  sections.push(diagnosisSection('Diversification Quality',
    `Diversification score is ${Math.round(data.diversification.score)}/100 across ${data.diversification.holdingsCount} holdings. HHI is ${fmtNum(data.diversification.hhi)}, top 3 holdings represent ${fmtPctPlain(data.diversification.top3Weight*100)}, average correlation is ${fmtNum(data.diversification.averageCorrelation)}, and max correlation is ${fmtNum(data.diversification.maxCorrelation)}. ${maxSector?`Largest sector/theme exposure is ${maxSector[0]} at ${fmtPctPlain(maxSector[1]*100)}.`:''} ${data.diversification.averageCorrelation>0.65?'High average correlation may cause diversification to fail during market stress.':data.diversification.score>70?'The portfolio is reasonably spread by weights, though correlation and sector exposure still matter.':'The portfolio may need broader exposure to reduce dependence on a few holdings.'}`,
    data.diversification.score>70&&data.diversification.averageCorrelation<0.55?'pos':data.diversification.score<50||data.diversification.averageCorrelation>0.70?'neg':'warn'));

  sections.push(diagnosisSection('Hidden Concentration Risk',
    `Hidden concentration risk is <strong style="color:var(--text)">${data.hiddenConcentration.label}</strong> at ${data.hiddenConcentration.score}/100. ${escapeHtml(data.hiddenConcentration.reasons.join(' '))} ${topRisk?`Risk contribution is led by ${topRisk.ticker}, which contributes about ${fmtPctPlain(topRisk.riskContribution*100)} of estimated volatility risk budget; risk weight can differ from dollar weight because volatile assets drive more portfolio variance.`:''}`,
    data.hiddenConcentration.score>=76?'neg':data.hiddenConcentration.score>=56?'warn':data.hiddenConcentration.score>=31?'warn':'pos'));

  sections.push(diagnosisSection('Stress-Test Resilience',
    stress.available?
      `Historical stress tests are available for ${stress.okCount}/${stress.totalCount} crisis windows. Worst period was ${stress.worst.name}, with portfolio return ${fmtPct(stress.worst.portfolioReturn*100)} and worst drawdown ${fmtPct(stress.worst.worstDrawdown*100)}. The portfolio beat the benchmark in ${Math.round(stress.beatRatio*100)}% of available crisis windows. ${stress.beatRatio>=0.5?'Crisis resilience is relatively strong versus the selected benchmark.':'Crisis resilience is weak versus the selected benchmark.'} ${stress.skipped?'Some holdings lacked enough history, which lowers confidence.':''}`:
      'Historical stress tests have not been run in this session. Run the Risk Lab stress test to measure crisis-window performance, benchmark relative results, and skipped holdings.',
    stress.available?(stress.beatRatio>=0.5?'pos':'neg'):'warn'));

  sections.push(diagnosisSection('Simulation Outlook',
    mc?.probabilityOfLoss!=null?
      `Monte Carlo median final value is ${fmt$(mc.medianValue)}, expected value is ${fmt$(mc.expectedValue)}, probability of loss is ${fmtPctPlain(mc.probabilityOfLoss*100)}, and probability of reaching the target is ${fmtPctPlain((mc.probabilityOfTarget||0)*100)}. The 5th percentile is ${fmt$(mc.percentiles.p5)}, the 95th percentile is ${fmt$(mc.percentiles.p95)}, and final value CVaR is ${fmt$(mc.finalValueCvar)}. ${mc.probabilityOfLoss>0.30?'Loss probability is elevated, so downside uncertainty deserves attention.':''} ${(mc.probabilityOfTarget||0)<0.35?'Target probability is low; consider reviewing target value, time horizon, contributions, or risk level.':''} ${spread&&spread>mc.initial*2?'The wide 5th-to-95th percentile range indicates high uncertainty.':''}`:
      'Monte Carlo has not been run in this session. Run Projections to add probability of loss, target probability, percentile outcomes, and final value CVaR to this diagnosis.',
    mc?.probabilityOfLoss!=null?(mc.probabilityOfLoss>0.30?'neg':(mc.probabilityOfTarget||0)<0.35?'warn':'pos'):'warn'));

  return sections.join('');
}

function generateDiagnosisSuggestions(data){
  // Suggestions are educational risk-review prompts, not personalized financial advice or trade instructions.
  const suggestions=[];
  if(data.diversification.maxWeight>0.35)suggestions.push('Consider reviewing single-asset concentration; one holding is above 35% of portfolio weight.');
  if(data.diversification.top3Weight>0.65)suggestions.push('Consider reducing top-3 holding dependence or adding meaningful exposure outside the current largest names.');
  const maxSector=data.diversification.sectorExposure[0];
  if(maxSector&&maxSector[1]>0.35)suggestions.push(`Sector/theme exposure may be high: ${maxSector[0]} is ${fmtPctPlain(maxSector[1]*100)}. Consider diversifying away from that dominant driver.`);
  if(data.diversification.averageCorrelation>0.65)suggestions.push('Average correlation is high; consider lower-correlation assets because similar holdings may fall together during stress.');
  if(data.benchmark.beta!=null&&data.benchmark.beta>1.2)suggestions.push(`Portfolio beta is ${fmtNum(data.benchmark.beta)}; consider reviewing high-beta exposure if the intended risk profile is not aggressive.`);
  if(data.benchmark.beta!=null&&data.benchmark.beta<0.6)suggestions.push(`Portfolio beta is ${fmtNum(data.benchmark.beta)}; consider whether low market sensitivity fits the return objective.`);
  const topRisk=data.hiddenConcentration.riskContributionByHolding[0];
  if(topRisk&&topRisk.riskContribution>0.40)suggestions.push(`${topRisk.ticker} dominates estimated risk contribution. Reducing it may lower risk more than its dollar weight suggests.`);
  if(data.monteCarlo?.probabilityOfTarget!=null&&data.monteCarlo.probabilityOfTarget<0.35)suggestions.push('Monte Carlo target probability is low; consider increasing time horizon, contributions, or reviewing whether the target is realistic.');
  if(data.stressTests?.results?.some(r=>r.skippedCount>0))suggestions.push('Some stress-test windows skipped holdings with insufficient history; review newer assets separately before relying on crisis results.');
  if(data.warnings.length)suggestions.push('Review data reliability warnings before treating the diagnosis as final.');
  if(!suggestions.length)suggestions.push('No major automatic risk flags triggered. Continue monitoring after large price moves, new contributions, or changes in goals.');
  return suggestions;
}

function renderDiagnosisScoreBreakdown(rating){
  const rows=rating.components.map(c=>`
    <div style="padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;gap:10px">
        <span style="font-size:12px;color:var(--text)">${escapeHtml(c.label)}</span>
        <span class="mono ${c.score>=70?'pos':c.score<55?'neg':'neu'}">${Math.round(c.score)}/100</span>
      </div>
      <div class="prog-bar" style="margin-top:6px"><div class="prog-fill" style="width:${Math.round(c.score)}%;background:${c.score>=70?'var(--green)':c.score<55?'var(--red)':'var(--yellow)'}"></div></div>
      <div class="footnote" style="margin-top:5px">${escapeHtml(c.reason)} · weight ${(c.weight*100).toFixed(0)}%</div>
    </div>`).join('');
  document.getElementById('ai-suggested-alloc').innerHTML=rows+
    `<div class="footnote" style="margin-top:10px">Transparent weighted score. Helpful components raise the diagnosis; weak components lower it.</div>`;
}

function renderDiagnosisNotes(data,suggestions){
  // Historical risk describes observed past return behavior; Monte Carlo describes simulated uncertainty under assumptions, so the UI explains them separately.
  const warnings=[...(data.warnings||[]),...(data.stressTests?.warnings||[]),...(data.monteCarlo?.warnings||[])].filter(Boolean);
  document.getElementById('market-context-area').innerHTML=`
    <div class="diagnosis-box">
      <div style="font-size:12px;color:var(--text2);line-height:1.75">
        <strong style="color:var(--text)">Rule-Based Methodology</strong><br>
        This diagnosis is deterministic and local: it reads PortfolioIQ's calculated return, risk, benchmark, stress-test, concentration, and simulation metrics, then applies transparent thresholds. Historical risk and Monte Carlo are interpreted separately because one describes observed past behavior and the other describes simulated future uncertainty under selected assumptions.
      </div>
    </div>
    <div class="spacer"></div>
    <div class="card-sm">
      <div class="metric-label">Suggested Improvements</div>
      ${sentenceList(suggestions)}
    </div>
    <div class="spacer"></div>
    <div class="card-sm">
      <div class="metric-label">Reliability Warnings</div>
      ${warnings.length?sentenceList(warnings.slice(0,8)):'<div class="footnote">No major reliability warnings from the current data set.</div>'}
      <div class="footnote" style="margin-top:10px">This diagnosis is educational and based on historical and simulated metrics. It is not personalized financial advice.</div>
    </div>`;
}

async function runPortfolioDiagnosis(){
  const btn=document.querySelector('#panel-ai .btn-primary');
  const retTarget=document.getElementById('ai-return').value;
  const riskLevel=RISK_LABELS[parseInt(document.getElementById('ai-risk').value)-1];
  const amount=document.getElementById('ai-amount').value;
  const horizon=document.getElementById('ai-horizon').value;
  const context=document.getElementById('ai-context').value;
  const selectedSectors=[...document.querySelectorAll('#ai-sector-pills .sector-pill.sel')].map(el=>el.textContent.trim());
  const responseEl=document.getElementById('ai-response-text');
  const allocEl=document.getElementById('ai-suggested-alloc');
  const marketEl=document.getElementById('market-context-area');

  responseEl.innerHTML='<div class="loading"><div class="ai-typing"></div>&nbsp;Running local portfolio diagnosis...</div>';
  allocEl.innerHTML='<div class="loading"><div class="spinner"></div>Scoring components...</div>';
  marketEl.innerHTML='<div class="loading"><div class="spinner"></div>Collecting metric notes...</div>';
  if(btn){btn.disabled=true;btn.textContent='Diagnosing...';}
  try{
    portfolioDiagnosisData=await buildPortfolioDiagnosisData({retTarget,riskLevel,amount,horizon,selectedSectors,context});
    window.portfolioDiagnosisData=portfolioDiagnosisData;
    if(!portfolioDiagnosisData){
      responseEl.innerHTML='<div class="empty-state" style="padding:16px">Build a portfolio first. The diagnosis needs aligned return series and portfolio weights before it can score anything.</div>';
      allocEl.innerHTML='<div class="empty-state" style="padding:16px">No score yet</div>';
      marketEl.innerHTML='<div class="empty-state" style="padding:16px">Add holdings in Build Portfolio, then return here.</div>';
      return;
    }
    const rating=computeDiagnosisRating(portfolioDiagnosisData);
    const suggestions=generateDiagnosisSuggestions(portfolioDiagnosisData);
    responseEl.innerHTML=buildDiagnosisNarrative(portfolioDiagnosisData,rating);
    renderDiagnosisScoreBreakdown(rating);
    renderDiagnosisNotes(portfolioDiagnosisData,suggestions);
  } catch(e){
    responseEl.innerHTML=`<div class="error-msg">Diagnosis failed: ${escapeHtml(e.message||'unknown error')}</div>`;
    console.error(e);
  } finally {
    if(btn){btn.disabled=false;btn.textContent='🧭 Run Portfolio Diagnosis';}
  }
}
