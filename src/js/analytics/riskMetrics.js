// PortfolioIQ analytics/riskMetrics.js
// Extracted from the original app.js to keep the vanilla JS app easier to review.

// ========== CORE FINANCE / STATISTICS ANALYTICS ==========
function dateKey(date){
  const d=date instanceof Date?date:new Date(date);
  return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
function asReturnValue(item){return typeof item==='number'?item:item?.return;}
function asReturnValues(series){return (series||[]).map(asReturnValue).filter(Number.isFinite);}
function seriesHasDates(series){return Array.isArray(series)&&series.some(x=>x&&typeof x==='object'&&x.date);}
function inferPeriodsPerYear(series){
  if(!seriesHasDates(series)||series.length<3)return 252;
  const first=new Date(series[0].date);
  const last=new Date(series[series.length-1].date);
  const spanDays=Math.max(1,(last-first)/86400000);
  const avgGap=spanDays/Math.max(1,series.length-1);
  return clamp(365.25/avgGap,1,365.25);
}
function compoundReturn(series){
  const returns=asReturnValues(series);
  if(!returns.length)return 0;
  return returns.reduce((growth,r)=>growth*(1+r),1)-1;
}
function yearFraction(series){
  if(seriesHasDates(series)&&series.length>1){
    const first=new Date(series[0].date);
    const last=new Date(series[series.length-1].date);
    return Math.max(1/365.25,(last-first)/86400000/365.25);
  }
  return asReturnValues(series).length/inferPeriodsPerYear(series);
}
// Price-to-return conversion uses the later date for each return, because that is the day the price change is realized.
function priceToReturnSeries(priceRows){
  const series=[];
  let skipped=0;
  for(let i=1;i<(priceRows||[]).length;i++){
    const prev=priceRows[i-1]?.close;
    const curr=priceRows[i]?.close;
    const key=dateKey(priceRows[i]?.date);
    if(!key||!Number.isFinite(prev)||!Number.isFinite(curr)||prev<=0){skipped++;continue;}
    series.push({date:key,return:(curr-prev)/prev});
  }
  return {series,skipped};
}
// Annualized return is the compound yearly growth rate implied by the observed return path, not a promise of the next year.
function annualizedReturn(series){
  const returns=asReturnValues(series);
  if(!returns.length)return 0;
  const growth=returns.reduce((g,r)=>g*Math.max(0.0001,1+r),1);
  const years=yearFraction(series);
  return years>0?Math.pow(growth,1/years)-1:0;
}
// Volatility measures the dispersion of periodic returns, scaled to a yearly estimate.
function annualizedVolatility(series){
  const returns=asReturnValues(series);
  return returns.length>1?std(returns)*Math.sqrt(inferPeriodsPerYear(series)):0;
}
// Sharpe measures excess annualized return earned per unit of total volatility.
function sharpeRatio(annReturn,annVol,rfr){
  return annVol>0?(annReturn-rfr)/annVol:0;
}
// Sortino is like Sharpe, but only penalizes downside volatility.
function sortinoRatio(series,annReturn,rfr){
  const downside=(series||[]).map(x=>({date:x?.date,return:Math.min(0,asReturnValue(x)||0)}));
  const downsideVol=annualizedVolatility(downside.length?downside:[{return:0}]);
  return downsideVol>0?(annReturn-rfr)/downsideVol:0;
}
// Max drawdown measures the worst historical peak-to-trough loss in the return path.
function maxDrawdown(series){
  let growth=1,peak=1,maxDD=0;
  asReturnValues(series).forEach(r=>{
    growth*=1+r;
    peak=Math.max(peak,growth);
    maxDD=Math.min(maxDD,(growth-peak)/peak);
  });
  return maxDD;
}
function hhiConcentration(weights){
  return weights.reduce((a,w)=>a+w*w,0);
}
// HHI summarizes concentration: higher values mean fewer holdings dominate the portfolio.
function diversificationScore(hhi){
  return Math.max(0,Math.min(100,(1-hhi)*100));
}
function alignTwoReturnSeries(a,b){
  if(seriesHasDates(a)&&seriesHasDates(b)){
    const bMap=new Map(b.map(x=>[x.date,asReturnValue(x)]).filter(([,v])=>Number.isFinite(v)));
    const rows=[];
    a.forEach(x=>{
      const av=asReturnValue(x),bv=bMap.get(x.date);
      if(Number.isFinite(av)&&Number.isFinite(bv))rows.push({date:x.date,a:av,b:bv});
    });
    return rows;
  }
  const av=asReturnValues(a),bv=asReturnValues(b);
  const len=Math.min(av.length,bv.length);
  return Array.from({length:len},(_,i)=>({a:av[av.length-len+i],b:bv[bv.length-len+i]}));
}
function correlation(a,b){
  const rows=alignTwoReturnSeries(a,b);
  if(rows.length<2)return 0;
  const ar=rows.map(r=>r.a),br=rows.map(r=>r.b);
  const ma=mean(ar),mb=mean(br);
  const den=Math.sqrt(ar.reduce((s,v)=>s+(v-ma)**2,0)*br.reduce((s,v)=>s+(v-mb)**2,0));
  return den?ar.reduce((s,v,i)=>s+(v-ma)*(br[i]-mb),0)/den:0;
}
// Beta measures sensitivity to a benchmark by comparing co-movement with benchmark variance.
function beta(portfolioSeries,benchmarkSeries){
  const rows=alignTwoReturnSeries(portfolioSeries,benchmarkSeries);
  if(rows.length<20)return null;
  const p=rows.map(r=>r.a),b=rows.map(r=>r.b);
  const mp=mean(p),mb=mean(b);
  const cov=p.reduce((sum,r,i)=>sum+(r-mp)*(b[i]-mb),0)/rows.length;
  const variance=b.reduce((sum,r)=>sum+(r-mb)**2,0)/rows.length;
  return variance>0?cov/variance:null;
}
function trackingDifference(portfolioSeries,benchmarkSeries){
  const rows=alignTwoReturnSeries(portfolioSeries,benchmarkSeries);
  if(!rows.length)return null;
  return compoundReturn(rows.map(r=>({return:r.a})))-compoundReturn(rows.map(r=>({return:r.b})));
}
function alphaApproximation(annReturn,benchmarkAnnReturn,betaValue,rfr){
  if(betaValue==null)return null;
  return annReturn-(rfr+betaValue*(benchmarkAnnReturn-rfr));
}
// Date alignment matters because different markets close on different holidays; unmatched dates would fabricate portfolio returns.
function alignPortfolioReturnSeries(validStocks,weights){
  const warnings=[];
  const maps=validStocks.map(p=>{
    const series=state.stockCache[p.ticker]?.returnSeries||[];
    if(series.length<30)warnings.push(`${p.ticker} has only ${series.length} usable daily returns; statistics may be unstable.`);
    return new Map(series.map(x=>[x.date,x.return]).filter(([,v])=>Number.isFinite(v)));
  });
  if(!maps.length)return{dates:[],portfolioSeries:[],assetReturnsByTicker:{},warnings};
  const commonDates=[...maps[0].keys()].filter(d=>maps.every(m=>m.has(d))).sort();
  const smallest=Math.min(...maps.map(m=>m.size));
  if(commonDates.length<smallest*0.7&&validStocks.length>1){
    warnings.push(`Only ${commonDates.length} shared trading dates are available across all holdings after aligning calendars.`);
  }
  const assetReturnsByTicker={};
  validStocks.forEach(p=>{assetReturnsByTicker[p.ticker]=[];});
  // Portfolio returns must be calculated from aligned asset returns so each day's weighted return uses the same calendar date.
  const portfolioSeries=commonDates.map(date=>{
    let r=0;
    validStocks.forEach((p,i)=>{
      const assetReturn=maps[i].get(date);
      assetReturnsByTicker[p.ticker].push({date,return:assetReturn});
      r+=assetReturn*weights[i];
    });
    return{date,return:r};
  });
  if(portfolioSeries.length<60)warnings.push('Portfolio-level metrics use fewer than 60 shared return observations; treat results as preliminary.');
  return{dates:commonDates,portfolioSeries,assetReturnsByTicker,warnings};
}
function validateAssetMetrics(ticker,series,skipped,metrics){
  const warnings=[];
  if(series.length<60)warnings.push(`${ticker}: limited history (${series.length} daily returns).`);
  if(skipped>0)warnings.push(`${ticker}: skipped ${skipped} invalid or missing price observations.`);
  if(seriesHasDates(series)&&series.length>2){
    let maxGap=0;
    for(let i=1;i<series.length;i++){
      maxGap=Math.max(maxGap,(new Date(series[i].date)-new Date(series[i-1].date))/86400000);
    }
    if(maxGap>10)warnings.push(`${ticker}: return history has a ${Math.round(maxGap)}-day calendar gap; aligned portfolio metrics may use fewer dates.`);
  }
  if(!Number.isFinite(metrics.annReturn)||!Number.isFinite(metrics.annVol))warnings.push(`${ticker}: metrics could not be computed reliably.`);
  if(Math.abs(metrics.annReturn)>1.5)warnings.push(`${ticker}: unusually high annualized return; check selected period and data quality.`);
  if(metrics.annVol>1.2)warnings.push(`${ticker}: unusually high volatility; check ticker/data quality.`);
  if(metrics.maxDD<-0.85)warnings.push(`${ticker}: extreme drawdown detected; verify data history.`);
  return warnings;
}
function getPortfolioAnalytics(validStocks=state.portfolio.filter(p=>state.stockCache[p.ticker])){
  const excluded=state.portfolio.filter(p=>!state.stockCache[p.ticker]?.returnSeries?.length);
  validStocks=validStocks.filter(p=>state.stockCache[p.ticker]?.returnSeries?.length);
  const totalWeight=validStocks.reduce((a,p)=>a+(p.weight||0),0);
  const weights=validStocks.map(p=>weightShare(p,totalWeight,validStocks.length));
  if(!validStocks.length)return null;

  const aligned=alignPortfolioReturnSeries(validStocks,weights);
  const portfolioReturnSeries=aligned.portfolioSeries;
  const portfolioReturns=portfolioReturnSeries.map(x=>x.return);
  if(!portfolioReturns.length)return null;

  const annReturn=annualizedReturn(portfolioReturnSeries);
  const annVol=annualizedVolatility(portfolioReturnSeries);
  const rfr=parseFloat(document.getElementById('rfr-slider').value)/100||0.045;
  const sharpe=sharpeRatio(annReturn,annVol,rfr);
  const sortino=sortinoRatio(portfolioReturnSeries,annReturn,rfr);
  const maxDD=maxDrawdown(portfolioReturnSeries);
  const cumulative=compoundReturn(portfolioReturnSeries);
  const hhi=hhiConcentration(weights);
  const diversification=diversificationScore(hhi);
  const currencyExposure=calculateCurrencyExposure(validStocks,weights);
  const contributions=validStocks.map((p,i)=>({
    ticker:p.ticker,
    contribution:compoundReturn(aligned.assetReturnsByTicker[p.ticker])*weights[i],
  })).sort((a,b)=>b.contribution-a.contribution);
  const warnings=[
    ...excluded.map(p=>`${p.ticker}: excluded from portfolio metrics because no valid return series is available.`),
    ...aligned.warnings,
    ...validStocks.flatMap(p=>state.stockCache[p.ticker]?.warnings||[]),
    ...getCurrencyWarnings(currencyExposure),
  ];

  return{validStocks,weights,portfolioReturns,portfolioReturnSeries,portfolioDates:aligned.dates,assetReturnsByTicker:aligned.assetReturnsByTicker,annReturn,annVol,sharpe,sortino,maxDD,cumulative,hhi,diversification,currencyExposure,contributions,warnings};
}


// VaR estimates the historical loss threshold breached in the worst tail of observed returns.
function historicalVaR(series,confidence=0.95){
  const returns=asReturnValues(series);
  return returns.length?percentile(returns,(1-confidence)*100):null;
}

// CVaR / Expected Shortfall averages losses beyond VaR, making tail severity visible instead of only the cutoff point.
function historicalCVaR(series,confidence=0.95){
  const varCutoff=historicalVaR(series,confidence);
  if(varCutoff==null)return null;
  const tail=asReturnValues(series).filter(r=>r<=varCutoff);
  return tail.length?mean(tail):varCutoff;
}

// Downside deviation annualizes only below-zero returns, which is the risk Sortino uses as its denominator.
function downsideDeviation(series){
  const downside=(series||[]).map(x=>({date:x?.date,return:Math.min(0,asReturnValue(x)||0)}));
  return annualizedVolatility(downside);
}

// The drawdown curve tracks distance below the running high-water mark through time.
function drawdownCurve(series){
  let growth=1,peak=1;
  return (series||[]).map(x=>{
    growth*=1+x.return;
    peak=Math.max(peak,growth);
    return{date:x.date,drawdown:(growth-peak)/peak};
  });
}

// Rolling volatility shows whether risk is stable or clustering over recent windows.
function rollingVolatility(series,window=63){
  const out=[];
  for(let i=window-1;i<(series||[]).length;i++){
    const slice=series.slice(i-window+1,i+1);
    out.push({date:series[i].date,value:annualizedVolatility(slice)});
  }
  return out;
}

// Rolling beta estimates changing benchmark sensitivity over a moving aligned return window.
function rollingBeta(portfolioSeries,benchmarkSeries,window=63){
  const aligned=alignTwoReturnSeries(portfolioSeries,benchmarkSeries);
  const out=[];
  for(let i=window-1;i<aligned.length;i++){
    const slice=aligned.slice(i-window+1,i+1);
    const p=slice.map(x=>({date:x.date,return:x.a}));
    const b=slice.map(x=>({date:x.date,return:x.b}));
    out.push({date:aligned[i].date,value:beta(p,b)});
  }
  return out.filter(x=>x.value!=null&&Number.isFinite(x.value));
}

// Return distribution bins daily outcomes to reveal skew, fat tails, and how often losses cluster.
function returnDistribution(series,bins=28){
  const returns=asReturnValues(series);
  if(!returns.length)return{labels:[],counts:[]};
  const min=Math.min(...returns),max=Math.max(...returns);
  const width=(max-min)/bins||0.0001;
  const counts=Array(bins).fill(0);
  returns.forEach(r=>{counts[Math.min(bins-1,Math.max(0,Math.floor((r-min)/width)))]++;});
  const labels=Array.from({length:bins},(_,i)=>fmtPctPlain((min+i*width)*100,1));
  return{labels,counts,min,width};
}
