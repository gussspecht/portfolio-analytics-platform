// PortfolioIQ utils/formatting.js
// Extracted from the original app.js to keep the vanilla JS app easier to review.

// ========== UTILITIES ==========
function fmt$(n){if(!isFinite(n))return'—';return'$'+Math.abs(n).toLocaleString('en-US',{maximumFractionDigits:0})}
function fmtPct(n,d=1){if(!isFinite(n))return'—';return(n>=0?'+':'')+n.toFixed(d)+'%'}
function fmtPctPlain(n,d=1){if(!isFinite(n))return'—';return n.toFixed(d)+'%'}
function fmtNum(n,d=2){if(!isFinite(n))return'—';return n.toFixed(d)}
function periodLabel(period){
  return ({'1y':'1 year','2y':'2 years','3y':'3 years','5y':'5 years'})[period]||period||'selected period';
}

function mean(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0}
function std(arr){if(!arr.length)return 0;const m=mean(arr);return Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length)}
function percentile(arr,p){if(!arr.length)return 0;const s=[...arr].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(p/100*s.length))]}
function yieldToBrowser(){return new Promise(resolve=>setTimeout(resolve,0))}
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function metricBadge(label,tone){return `<span class="metric-badge badge-${tone}">${label}</span>`}
function getVolatilityBadge(vol){
  const pct=vol*100;
  if(pct<5)return{label:'Ultra-Low Risk',tone:'emerald'};
  if(pct<=15)return{label:'Low to Moderate Risk',tone:'teal'};
  if(pct<=30)return{label:'High Risk',tone:'amber'};
  return{label:'Extreme Risk',tone:'rose'};
}
function getReturnBadge(ret){
  const pct=ret*100;
  if(pct<5)return{label:'Conservative Growth',tone:'teal'};
  if(pct<=12)return{label:'Moderate Growth',tone:'sky'};
  if(pct<=25)return{label:'Aggressive Growth',tone:'violet'};
  return{label:'Exceptional Growth',tone:'emerald'};
}
function getSharpeBadge(sharpe){
  if(sharpe<1)return{label:sharpe<0.5?'Sub-Optimal':'Acceptable',tone:'amber'};
  if(sharpe<2)return{label:'Excellent',tone:'emerald'};
  return{label:'Exceptional',tone:'violet'};
}
function setBadge(id,badge){
  const el=document.getElementById(id);
  if(el)el.innerHTML=badge?metricBadge(badge.label,badge.tone):'';
}
function defaultNewWeight(){
  const used=state.portfolio.reduce((a,p)=>a+(p.weight||0),0);
  if(!state.portfolio.length)return 100;
  return used>=100?Math.min(10,100/(state.portfolio.length+1)):Math.max(0,100-used);
}
function normalizePortfolioWeights(){
  const total=state.portfolio.reduce((a,p)=>a+(p.weight||0),0);
  if(total<=0&&state.portfolio.length){
    const equal=100/state.portfolio.length;
    state.portfolio.forEach(p=>{p.weight=equal;});
  } else if(total>0) {
    state.portfolio.forEach(p=>{p.weight=(p.weight||0)/total*100;});
  }
}
function weightShare(p,totalWeight,count){
  return totalWeight>0?(p.weight||0)/totalWeight:(count?1/count:0);
}


function returnsFromPrices(prices){
  const returns=[];
  for(let i=1;i<prices.length;i++)returns.push((prices[i]-prices[i-1])/prices[i-1]);
  return returns;
}

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function getMeta(ticker){
  return SCREENER_DATA.find(s=>s.t===ticker)||STOCKS_DB.find(s=>s.t===ticker)||{t:ticker,n:ticker,s:'Unknown',mc:0,pe:0,div:0,h52:0};
}
function inferTickerCurrency(ticker){
  const t=String(ticker||'').toUpperCase();
  if(t.endsWith('.SA'))return 'BRL';
  if(t.endsWith('-USD'))return 'USD';
  return 'USD';
}
function inferEconomicExposure(ticker){
  const t=String(ticker||'').toUpperCase();
  if(t==='IVVB11.SA')return 'USD equity exposure through a BRL-listed ETF';
  if(t.endsWith('.SA'))return 'Brazil/BRL local-market exposure';
  if(t.endsWith('-USD'))return 'USD crypto exposure';
  return 'US/USD market exposure';
}
function calculateCurrencyExposure(validStocks,weights){
  const byCurrency={};
  const byEconomicExposure={};
  (validStocks||[]).forEach((p,i)=>{
    const w=weights?.[i]??0;
    const currency=inferTickerCurrency(p.ticker);
    const economic=inferEconomicExposure(p.ticker);
    byCurrency[currency]=(byCurrency[currency]||0)+w;
    byEconomicExposure[economic]=(byEconomicExposure[economic]||0)+w;
  });
  const currencyEntries=Object.entries(byCurrency).sort((a,b)=>b[1]-a[1]);
  const economicEntries=Object.entries(byEconomicExposure).sort((a,b)=>b[1]-a[1]);
  return {
    weights:weights||[],
    byCurrency,
    byEconomicExposure,
    currencyEntries,
    economicEntries,
    primaryCurrency:currencyEntries[0]?.[0]||'USD',
    hasMixedCurrencies:currencyEntries.filter(([,w])=>w>0.05).length>1,
    brlListedWeight:byCurrency.BRL||0,
    usdListedWeight:byCurrency.USD||0,
  };
}
function getCurrencyWarnings(exposure){
  if(!exposure)return [];
  const warnings=[];
  if(exposure.hasMixedCurrencies){
    warnings.push(`Currency exposure notice: this portfolio mixes ${exposure.currencyEntries.map(([c,w])=>`${c} ${fmtPctPlain(w*100)}`).join(', ')} listed assets. PortfolioIQ currently analyzes local price returns and does not convert all holdings into one base currency, so FX moves can affect real results.`);
  }
  if(exposure.brlListedWeight>0.2&&exposure.usdListedWeight>0.2){
    warnings.push('FX risk notice: BRL-listed Brazilian assets and USD-listed assets may move differently because of exchange-rate changes, local rates, inflation, and country risk.');
  }
  const ivvbWeight=exposure.byEconomicExposure['USD equity exposure through a BRL-listed ETF']||0;
  if(ivvbWeight>0.05){
    warnings.push(`IVVB11.SA notice: ${fmtPctPlain(ivvbWeight*100)} is BRL-listed but tracks US equity exposure, so both S&P 500 movement and BRL/USD exchange rates can influence returns.`);
  }
  return warnings;
}
function recommendBenchmarkFromExposure(exposure,validStocks=[]){
  const tickers=new Set((validStocks||[]).map(p=>p.ticker));
  const brl=exposure?.brlListedWeight||0;
  const techGrowth=(validStocks||[]).reduce((sum,p,i)=>{
    const meta=getMeta(p.ticker);
    const sector=String(meta.s||'').toLowerCase();
    const isGrowth=['QQQ','ARKK','NVDA','AAPL','MSFT','GOOGL','META','AMZN','TSLA','AMD','AVGO'].includes(p.ticker)||sector.includes('tech');
    return sum+(isGrowth?(exposure?.weights?.[i]||0):0);
  },0);
  if(brl>=0.5)return {ticker:'BOVA11.SA',reason:'Brazil-heavy portfolio'};
  if(tickers.has('IVVB11.SA')&&brl>=0.25)return {ticker:'IVVB11.SA',reason:'Brazil-listed US equity ETF exposure'};
  if(techGrowth>=0.55)return {ticker:'QQQ',reason:'technology/growth-heavy portfolio'};
  if((validStocks||[]).some(p=>['VTI','VT'].includes(p.ticker)))return {ticker:'VTI',reason:'broad-market ETF portfolio'};
  return {ticker:'SPY',reason:'default US large-cap benchmark'};
}
function getTotalInvested(){
  const holdingAmounts=state.portfolio.reduce((a,p)=>a+(p.investAmount||0),0);
  return holdingAmounts>0?holdingAmounts:(Number.isFinite(state.initialInvestment)?state.initialInvestment:10000);
}
function scoreFactor(value,label,tone='sky'){
  return {value:Math.round(clamp(value,0,100)),label,tone};
}
