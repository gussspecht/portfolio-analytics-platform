// PortfolioIQ analytics/concentrationRisk.js
// Extracted from the original app.js to keep the vanilla JS app easier to review.

function calculateAverageCorrelation(validStocks){
  if(validStocks.length<2)return 0;
  const vals=[];
  for(let i=0;i<validStocks.length;i++){
    for(let j=i+1;j<validStocks.length;j++){
      vals.push(correlation(state.stockCache[validStocks[i].ticker].returnSeries,state.stockCache[validStocks[j].ticker].returnSeries));
    }
  }
  return mean(vals);
}

function getHoldingSector(p){
  const meta=getMeta(p.ticker);
  const sector=meta.s||p.s||'Unknown';
  const lower=String(sector).toLowerCase();
  if(['tech','technology'].includes(lower))return'Technology';
  if(lower.includes('financial'))return'Financial Services';
  if(lower.includes('health'))return'Healthcare';
  if(lower.includes('energy'))return'Energy';
  if(lower.includes('consumer'))return sector;
  if(lower.includes('industrial'))return'Industrials';
  if(lower.includes('material'))return'Materials';
  if(lower.includes('utilit'))return'Utilities';
  if(lower.includes('etf'))return'ETF';
  return sector;
}

function getHiddenRiskLabel(score){
  if(score>=76)return{label:'Severe',tone:'rose'};
  if(score>=56)return{label:'High / Watchlist',tone:'amber'};
  if(score>=31)return{label:'Moderate',tone:'teal'};
  return{label:'Low',tone:'emerald'};
}

function componentScore(value,threshold){
  return clamp(value/threshold*100,0,100);
}

function getCorrelationPairs(validStocks){
  const pairs=[];
  for(let i=0;i<validStocks.length;i++){
    for(let j=i+1;j<validStocks.length;j++){
      const corr=correlation(state.stockCache[validStocks[i].ticker].returnSeries,state.stockCache[validStocks[j].ticker].returnSeries);
      pairs.push({a:validStocks[i].ticker,b:validStocks[j].ticker,corr});
    }
  }
  return pairs.sort((a,b)=>b.corr-a.corr);
}

// Hidden Concentration Risk is separate from simple diversification: it asks whether many tickers still depend on the same sector, factor, beta, correlation, or volatility source.
async function analyzeHiddenConcentration(analytics){
  if(!analytics)return null;
  const holdings=analytics.validStocks.map((p,i)=>({
    ticker:p.ticker,
    weight:analytics.weights[i],
    sector:getHoldingSector(p),
    meta:getMeta(p.ticker),
    metrics:state.stockCache[p.ticker],
  }));
  const weights=holdings.map(h=>h.weight);
  const sortedWeights=[...weights].sort((a,b)=>b-a);
  const maxWeight=sortedWeights[0]||0;
  const top3Weight=sortedWeights.slice(0,3).reduce((a,b)=>a+b,0);
  const hhi=analytics.hhi;

  const pairs=getCorrelationPairs(analytics.validStocks);
  const avgCorr=pairs.length?mean(pairs.map(p=>p.corr)):0;
  const maxCorr=pairs[0]?.corr||0;
  const highCorrPairs=pairs.filter(p=>p.corr>0.75);

  const sectorWeights={};
  holdings.forEach(h=>{sectorWeights[h.sector]=(sectorWeights[h.sector]||0)+h.weight;});
  const sectorEntries=Object.entries(sectorWeights).sort((a,b)=>b[1]-a[1]);
  const maxSector=sectorEntries[0]||['Unknown',0];
  const technologyGrowthExposure=holdings.filter(h=>{
    const t=h.ticker;
    const s=String(h.sector).toLowerCase();
    return s.includes('tech')||['QQQ','ARKK','NVDA','AAPL','MSFT','GOOGL','META','AMZN','TSLA','AMD','AVGO','CRM','ORCL','ADBE','PLTR'].includes(t);
  }).reduce((sum,h)=>sum+h.weight,0);
  const etfExposure=holdings.filter(h=>String(h.sector).toLowerCase().includes('etf')||['SPY','QQQ','VTI','IWM','GLD','AGG','VNQ','ARKK','XLF'].includes(h.ticker)).reduce((sum,h)=>sum+h.weight,0);
  const brazilExposure=holdings.filter(h=>h.ticker.endsWith('.SA')).reduce((sum,h)=>sum+h.weight,0);

  let betaValue=null;
  try{
    const benchmark=await getRiskLabBenchmarkSeries();
    if(benchmark?.returnSeries?.length)betaValue=beta(analytics.portfolioReturnSeries,benchmark.returnSeries);
  }catch(e){}

  // HHI matters because even if the portfolio has many tickers, squared weights reveal whether a few names dominate capital allocation.
  const singleAssetScore=Math.max(
    componentScore(maxWeight,0.40),
    componentScore(top3Weight,0.75),
    componentScore(hhi,0.35)
  );
  // High correlation reduces diversification because positions can fall together even when ticker names differ.
  const correlationScore=Math.max(
    componentScore(Math.max(0,avgCorr),0.65),
    componentScore(Math.max(0,maxCorr),0.85),
    componentScore(highCorrPairs.length,Math.max(1,Math.ceil(pairs.length*0.35)))
  );
  // Sector concentration matters because different tickers can share the same macro, earnings, or valuation driver.
  const sectorScore=Math.max(
    componentScore(maxSector[1],0.60),
    componentScore(technologyGrowthExposure,0.60),
    componentScore(etfExposure,0.70),
    componentScore(brazilExposure,0.45)
  );
  // Beta concentration matters because a very high or very low beta means the whole portfolio is dominated by one market-sensitivity profile.
  const betaScore=betaValue==null?35:(betaValue>1.2?componentScore(betaValue-1,0.6):betaValue<0.6?componentScore(0.8-betaValue,0.5):15);

  const vols=holdings.map(h=>h.metrics.annVol||0);
  const riskBudgetRaw=holdings.map((h,i)=>h.weight*vols[i]);
  const riskBudgetTotal=riskBudgetRaw.reduce((a,b)=>a+b,0)||1;
  const riskContrib=holdings.map((h,i)=>({...h,riskContribution:riskBudgetRaw[i]/riskBudgetTotal})).sort((a,b)=>b.riskContribution-a.riskContribution);
  const topRisk=riskContrib[0]?.riskContribution||0;
  const top2Risk=riskContrib.slice(0,2).reduce((a,h)=>a+h.riskContribution,0);
  // Risk contribution can differ from dollar weight because a smaller volatile holding can drive more portfolio volatility than a larger stable one.
  const riskContributionScore=Math.max(componentScore(topRisk,0.45),componentScore(top2Risk,0.70));

  const components=[
    {key:'singleAsset',label:'Single Asset',score:singleAssetScore,value:`Max ${fmtPctPlain(maxWeight*100)} · Top 3 ${fmtPctPlain(top3Weight*100)} · HHI ${fmtNum(hhi)}`},
    {key:'correlation',label:'Correlation',score:correlationScore,value:`Avg ${fmtNum(avgCorr)} · Max ${fmtNum(maxCorr)} · ${highCorrPairs.length} high pairs`},
    {key:'sector',label:'Sector / Theme',score:sectorScore,value:`Top sector ${maxSector[0]} ${fmtPctPlain(maxSector[1]*100)} · Tech/growth ${fmtPctPlain(technologyGrowthExposure*100)}`},
    {key:'beta',label:'Market Beta',score:betaScore,value:betaValue==null?'Benchmark unavailable':`Beta ${fmtNum(betaValue)}`},
    {key:'riskContribution',label:'Risk Contribution',score:riskContributionScore,value:`Top risk ${riskContrib[0]?.ticker||'—'} ${fmtPctPlain(topRisk*100)} · Top 2 ${fmtPctPlain(top2Risk*100)}`},
  ];
  const score=Math.round(clamp(
    singleAssetScore*0.24+
    correlationScore*0.22+
    sectorScore*0.22+
    betaScore*0.14+
    riskContributionScore*0.18,
    0,100
  ));
  const label=getHiddenRiskLabel(score);

  const reasonCandidates=[
    {severity:singleAssetScore,text:`Top 3 holdings represent ${fmtPctPlain(top3Weight*100)} of total weight and max single holding is ${fmtPctPlain(maxWeight*100)}.`},
    {severity:correlationScore,text:highCorrPairs.length?`${highCorrPairs.length} pair${highCorrPairs.length===1?'':'s'} have correlation above 0.75, led by ${highCorrPairs[0].a}/${highCorrPairs[0].b} at ${fmtNum(highCorrPairs[0].corr)}.`:`Average pairwise correlation is ${fmtNum(avgCorr)}.`},
    {severity:sectorScore,text:`Largest sector/theme is ${maxSector[0]} at ${fmtPctPlain(maxSector[1]*100)}; technology/growth exposure is ${fmtPctPlain(technologyGrowthExposure*100)}.`},
    {severity:betaScore,text:betaValue==null?'Benchmark beta could not be calculated.':`Portfolio beta is ${fmtNum(betaValue)}, which ${betaValue>1.2?'amplifies':betaValue<0.6?'dampens':'roughly matches'} selected benchmark sensitivity.`},
    {severity:riskContributionScore,text:`${riskContrib[0]?.ticker||'Top holding'} contributes about ${fmtPctPlain(topRisk*100)} of estimated volatility risk budget.`},
  ].sort((a,b)=>b.severity-a.severity);
  const reasons=reasonCandidates.slice(0,3).map(x=>x.text);

  const suggestions=[];
  if(top3Weight>0.65)suggestions.push('Reduce top-three weight or add meaningful positions outside the current largest names.');
  if(highCorrPairs.length)suggestions.push(`Review high-correlation pairs such as ${highCorrPairs.slice(0,2).map(p=>`${p.a}/${p.b}`).join(', ')}; similar return behavior may not diversify stress periods.`);
  if(maxSector[1]>0.50)suggestions.push(`Add exposure outside ${maxSector[0]} or trim that sector to reduce one-theme dependence.`);
  if(technologyGrowthExposure>0.55)suggestions.push('Balance technology/growth exposure with assets driven by different factors, such as value, defensive sectors, bonds, or commodities.');
  if(brazilExposure>0.40)suggestions.push('Brazil exposure is high; consider whether currency, commodity, and local market risk are intentional.');
  if(betaValue!=null&&(betaValue>1.2||betaValue<0.6))suggestions.push('Adjust benchmark sensitivity toward your intended risk profile by mixing lower or higher beta assets.');
  if(topRisk>0.40)suggestions.push(`${riskContrib[0].ticker} dominates estimated volatility contribution; reducing it may lower risk more than its dollar weight suggests.`);
  if(!suggestions.length){
    if(score<=30)suggestions.push('Hidden concentration appears controlled; keep monitoring correlation and sector exposure after major price moves.');
    else if(score<=55)suggestions.push('Hidden concentration is moderate; rebalance only if the flagged exposures are not intentional.');
    else suggestions.push('Hidden concentration is elevated; review the highest component scores before adding more similar exposure.');
  }

  return{score,label,components,reasons,suggestions:suggestions.slice(0,4),details:{holdings,sectorEntries,technologyGrowthExposure,etfExposure,brazilExposure,betaValue,avgCorr,maxCorr,highCorrPairs,riskContrib,maxWeight,top3Weight,hhi}};
}
function computePortfolioHealth(analytics){
  if(!analytics)return null;
  const factors=[
    scoreFactor(50+analytics.sharpe*25,'Risk-adjusted return',analytics.sharpe>=1?'emerald':'amber'),
    scoreFactor(100-analytics.annVol*180,'Volatility control',analytics.annVol<0.2?'emerald':'amber'),
    scoreFactor(100+analytics.maxDD*180,'Drawdown resilience',analytics.maxDD>-0.2?'emerald':'rose'),
    scoreFactor(analytics.diversification,'Diversification','teal'),
    scoreFactor(100-analytics.hhi*140,'Concentration control',analytics.hhi<0.25?'emerald':'amber'),
    scoreFactor(50+analytics.sortino*22,'Downside quality',analytics.sortino>=1?'emerald':'amber'),
  ];
  const score=Math.round(mean(factors.map(f=>f.value)));
  const label=score>=80?'Strong':score>=65?'Healthy':score>=50?'Needs Attention':'Fragile';
  const tone=score>=80?'emerald':score>=65?'teal':score>=50?'amber':'rose';
  return{score,label,tone,factors};
}
function getRebalanceActions(analytics){
  if(!analytics)return [];
  const holdings=analytics.validStocks.map((p,i)=>({ticker:p.ticker,name:p.name,weight:analytics.weights[i]*100,metrics:state.stockCache[p.ticker]}));
  const actions=[];
  const top=[...holdings].sort((a,b)=>b.weight-a.weight)[0];
  if(top&&top.weight>35)actions.push({title:`Trim ${top.ticker} concentration`,body:`${top.ticker} is ${top.weight.toFixed(1)}% of the portfolio. Consider reducing it toward 25-30% unless this is intentional conviction risk.`});
  holdings.filter(h=>h.metrics.annVol>0.35&&h.weight>12).slice(0,3).forEach(h=>actions.push({title:`Reduce high-volatility exposure in ${h.ticker}`,body:`${h.ticker} has ${fmtPctPlain(h.metrics.annVol*100)} annualized volatility. A smaller weight can lower drawdown risk.`}));
  holdings.filter(h=>h.metrics.sharpe<0.5&&h.weight>8).slice(0,3).forEach(h=>actions.push({title:`Review weak Sharpe holding ${h.ticker}`,body:`The historical Sharpe ratio is ${fmtNum(h.metrics.sharpe)}. Check whether the thesis still justifies the risk budget.`}));
  if(analytics.diversification<55)actions.push({title:'Add a diversifying sleeve',body:'The diversification score is below 55. A broad ETF, bond ETF, gold, or lower-correlation sector can reduce single-theme dependence.'});
  const avgCorr=calculateAverageCorrelation(analytics.validStocks);
  if(avgCorr>0.65)actions.push({title:'Correlation risk is elevated',body:`Average pairwise correlation is ${fmtNum(avgCorr)}. In stress periods these holdings may fall together.`});
  if(!actions.length)actions.push({title:'Maintain and monitor',body:'No major automatic rebalancing flags triggered. Review after large moves, new contributions, or a change in your investment goal.'});
  return actions.slice(0,6);
}
