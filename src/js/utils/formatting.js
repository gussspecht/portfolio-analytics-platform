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
function getTotalInvested(){
  const holdingAmounts=state.portfolio.reduce((a,p)=>a+(p.investAmount||0),0);
  return holdingAmounts>0?holdingAmounts:(Number.isFinite(state.initialInvestment)?state.initialInvestment:10000);
}
function scoreFactor(value,label,tone='sky'){
  return {value:Math.round(clamp(value,0,100)),label,tone};
}
