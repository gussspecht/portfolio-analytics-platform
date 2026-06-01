
function switchTab(tab){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-'+tab).classList.add('active');
  const idx={overview:0,build:1,montecarlo:2,risklab:3,screener:4,compare:5,ai:6,glossary:7}[tab];
  document.querySelectorAll('.nav-btn')[idx].classList.add('active');
  if(tab==='overview') refreshOverview();
  if(tab==='risklab') renderRiskLab();
}

async function checkBackendStatus(){
  const badge=document.getElementById('backend-status');
  try{
    const res=await fetch('/api/health',{cache:'no-store'});
    if(!res.ok)throw new Error('offline');
    badge.textContent='● Live Data Server';
    badge.style.background='var(--green-dim)';
    badge.style.color='var(--green)';
    badge.style.borderColor='rgba(16,185,129,0.2)';
  } catch(e){
    badge.textContent='● Static Mode';
    badge.style.background='var(--red-dim)';
    badge.style.color='var(--red)';
    badge.style.borderColor='rgba(239,68,68,0.2)';
  }
}

// ========== PERSISTENCE ==========
function serializePortfolio(){
  return state.portfolio.map(p=>({
    ticker:p.ticker,
    name:p.name,
    weight:p.weight||0,
    investAmount:p.investAmount||0,
    data:(p.data||[]).map(d=>({date:d.date instanceof Date?d.date.toISOString():d.date,close:d.close})),
  }));
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      portfolio:serializePortfolio(),
      watchlist:state.watchlist,
      settings:{
        initialInvestment:state.initialInvestment,
        rfr:document.getElementById('rfr-slider')?.value,
        benchmark:document.getElementById('benchmark-select')?.value,
        period:document.getElementById('period-select')?.value,
      },
      savedAt:new Date().toISOString(),
    }));
  } catch(e){
    console.warn('Could not persist portfolio',e);
  }
}

function updateInitialInvestment(value){
  const parsed=parseFloat(value);
  state.initialInvestment=isFinite(parsed)&&parsed>=0?parsed:0;
  renderOverviewMetrics();
  saveState();
}

function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return;
    const saved=JSON.parse(raw);
    if(saved.settings){
      if(saved.settings.initialInvestment!=null){
        const savedCapital=parseFloat(saved.settings.initialInvestment);
        state.initialInvestment=isFinite(savedCapital)?savedCapital:10000;
        const cap=document.getElementById('portfolio-capital');
        if(cap)cap.value=state.initialInvestment;
      }
      if(saved.settings.rfr)document.getElementById('rfr-slider').value=saved.settings.rfr;
      if(saved.settings.rfr)document.getElementById('rfr-val').textContent=parseFloat(saved.settings.rfr).toFixed(1)+'%';
      if(saved.settings.benchmark)document.getElementById('benchmark-select').value=saved.settings.benchmark;
      if(saved.settings.period)document.getElementById('period-select').value=saved.settings.period;
    }
    state.portfolio=(saved.portfolio||[]).map(p=>({
      ...p,
      data:(p.data||[]).map(d=>({date:new Date(d.date),close:d.close})).filter(d=>isFinite(d.close)),
    }));
    state.watchlist=Array.isArray(saved.watchlist)?saved.watchlist:[];
    if(state.portfolio.length && state.portfolio.reduce((a,p)=>a+(p.weight||0),0)===0){
      const equal=+(100/state.portfolio.length).toFixed(1);
      state.portfolio.forEach(p=>{p.weight=equal;});
    }
    state.stockCache={};
    state.portfolio.forEach(p=>computeMetrics(p.ticker));
  } catch(e){
    console.warn('Could not load saved portfolio',e);
  }
}

// ========== TICKER SEARCH ==========
function onTickerInput(val){
  const q=val.trim().toUpperCase();
  const el=document.getElementById('tickerSuggestions');
  if(!q||q.length<1){el.classList.remove('show');return;}
  const matches=STOCKS_DB.filter(s=>s.t.startsWith(q)||s.n.toUpperCase().includes(q)).slice(0,8);
  if(!matches.length){el.classList.remove('show');return;}
  el.innerHTML=matches.map(s=>`<div class="ticker-sug-item" onclick="selectTicker('${s.t}')"><span class="sug-ticker">${s.t}</span><span class="sug-name">${escapeHtml(s.n)}</span></div>`).join('');
  el.classList.add('show');
}

function selectTicker(t,n){
  document.getElementById('tickerInput').value=t;
  document.getElementById('tickerSuggestions').classList.remove('show');
}

document.addEventListener('click',e=>{
  if(!e.target.closest('.ticker-search-wrap'))document.getElementById('tickerSuggestions').classList.remove('show');
  if(!e.target.closest('.compare-input-wrap')){
    document.getElementById('compare-suggestions-A').classList.remove('show');
    document.getElementById('compare-suggestions-B').classList.remove('show');
  }
});

function onTickerInput2(val,side){
  const q=val.trim().toUpperCase();
  const el=document.getElementById('compare-suggestions-'+side);
  if(!q){el.classList.remove('show');return;}
  const matches=STOCKS_DB.filter(s=>s.t.startsWith(q)||s.n.toUpperCase().includes(q)).slice(0,6);
  if(!matches.length){el.classList.remove('show');return;}
  el.innerHTML=matches.map(s=>`<div class="ticker-sug-item" onclick="document.getElementById('compare${side}').value='${s.t}';this.closest('.ticker-suggestions').classList.remove('show')"><span class="sug-ticker">${s.t}</span><span class="sug-name">${escapeHtml(s.n)}</span></div>`).join('');
  el.classList.add('show');
}

// ========== SECTOR QUICK PICKS ==========
function renderQuickStocks(){
  const el=document.getElementById('quick-stocks');
  const stocks=STOCKS_DB.filter(s=>state.activeSectors.has(s.s)).slice(0,30);
  el.innerHTML=stocks.map(s=>`<div class="ticker-chip" onclick="selectTicker('${s.t}');document.getElementById('tickerInput').value='${s.t}'" style="cursor:pointer"><span class="mono" style="color:var(--accent)">${s.t}</span><span style="color:var(--text2);font-size:11px">${escapeHtml(s.n.split(' ').slice(0,2).join(' '))}</span></div>`).join('');
}

function toggleSector(el,sector){
  el.classList.toggle('sel');
  if(state.activeSectors.has(sector))state.activeSectors.delete(sector);
  else state.activeSectors.add(sector);
  renderQuickStocks();
}

function toggleAiSector(el){
  el.classList.toggle('sel');
}

renderQuickStocks();

// ========== WATCHLIST ==========
function renderWatchlist(){
  const el=document.getElementById('watchlist-wrap');
  if(!el)return;
  if(!state.watchlist.length){
    el.innerHTML='<div class="empty-state" style="padding:14px">Save stocks here before adding them to the portfolio</div>';
    return;
  }
  el.innerHTML=state.watchlist.map(item=>{
    const meta=getMeta(item.ticker);
    const cached=state.stockCache[item.ticker];
    const risk=cached?getVolatilityBadge(cached.annVol):null;
    return `<div class="watch-row">
      <span class="mono" style="color:var(--accent);width:70px">${item.ticker}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:var(--text)">${escapeHtml(item.name||meta.n||item.ticker)}</div>
        <div class="footnote" style="margin-top:0">${meta.s||'Watchlist'}${risk?' · '+risk.label:''}</div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="quickAddFromScreener('${item.ticker}')">Add</button>
      <button class="btn btn-ghost btn-sm btn-danger" onclick="removeFromWatchlist('${item.ticker}')">×</button>
    </div>`;
  }).join('');
}
function addToWatchlist(ticker,name){
  const t=String(ticker||'').trim().toUpperCase();
  if(!t)return;
  const meta=getMeta(t);
  if(!state.watchlist.find(x=>x.ticker===t)){
    state.watchlist.push({ticker:t,name:name||meta.n||t,addedAt:new Date().toISOString()});
  }
  renderWatchlist();
  saveState();
}
function addWatchlistFromInput(){
  const input=document.getElementById('watchInput');
  const ticker=input?.value?.trim().toUpperCase();
  if(!ticker)return;
  addToWatchlist(ticker);
  input.value='';
}
function removeFromWatchlist(ticker){
  state.watchlist=state.watchlist.filter(x=>x.ticker!==ticker);
  renderWatchlist();
  saveState();
}

// ========== ADD TO PORTFOLIO ==========
async function addTickerFromInput(){
  const ticker = document.getElementById('tickerInput').value.trim().toUpperCase();
  const weightRaw = document.getElementById('weightInput').value;
  const investRaw = document.getElementById('investInput').value;
  const errEl = document.getElementById('add-error');
  errEl.innerHTML='';

  if(!ticker){errEl.innerHTML='<div class="error-msg">Please enter a ticker symbol</div>';return;}
  if(state.portfolio.find(p=>p.ticker===ticker)){errEl.innerHTML='<div class="error-msg">'+ticker+' is already in your portfolio</div>';return;}

  const shouldNormalize = !weightRaw;
  const weight = weightRaw ? parseFloat(weightRaw) : defaultNewWeight();
  const investAmount = investRaw ? parseFloat(investRaw) : 0;

  errEl.innerHTML='<div class="loading"><div class="spinner"></div>Fetching data for '+ticker+'...</div>';

  const period = document.getElementById('period-select').value||'2y';
  const data = await fetchYahooData(ticker, period);
  if(!data||data.length<10){errEl.innerHTML='<div class="error-msg">Could not fetch data for '+ticker+'. Start the app with <span class="mono">npm start</span> and open <span class="mono">http://localhost:4173</span>, then try again.</div>';return;}

  const info = STOCKS_DB.find(s=>s.t===ticker);
  const name = info ? info.n : ticker;

  state.portfolio.push({ticker, name, weight, investAmount, data});
  if(shouldNormalize)normalizePortfolioWeights();
  computeMetrics(ticker);

  errEl.innerHTML='';
  document.getElementById('tickerInput').value='';
  document.getElementById('weightInput').value='';
  document.getElementById('investInput').value='';

  renderWeightSliders();
  renderOverviewMetrics();
  saveState();
}

function computeMetrics(ticker){
  const entry = state.portfolio.find(p=>p.ticker===ticker);
  if(!entry||!entry.data.length) return;
  const prices = entry.data.map(d=>d.close);
  const {series:returnSeries,skipped} = priceToReturnSeries(entry.data);
  const returns = returnSeries.map(x=>x.return);

  const annReturn = annualizedReturn(returnSeries);
  const annVol = annualizedVolatility(returnSeries);
  const rfr = parseFloat(document.getElementById('rfr-slider').value)/100||0.045;
  const sharpe = sharpeRatio(annReturn,annVol,rfr);
  const sortino = sortinoRatio(returnSeries,annReturn,rfr);
  const cumulative = compoundReturn(returnSeries);
  const maxDD = maxDrawdown(returnSeries);
  const metrics={annReturn,annVol,sharpe,sortino,cumulative,maxDD};
  const warnings=validateAssetMetrics(ticker,returnSeries,skipped,metrics);

  state.stockCache[ticker] = {prices, returns, returnSeries, annReturn, annVol, sharpe, sortino, cumulative, maxDD, warnings, dates:entry.data.map(d=>d.date)};
}

// ========== WEIGHT SLIDERS ==========
function renderWeightSliders(){
  const el = document.getElementById('weight-sliders');
  const sumEl = document.getElementById('weight-sum-row');
  if(!state.portfolio.length){el.innerHTML='<div class="empty-state">No stocks added yet</div>';sumEl.style.display='none';return;}
  sumEl.style.display='block';

  el.innerHTML = state.portfolio.map((p,i)=>`
    <div class="weight-row">
      <span class="weight-ticker">${p.ticker}</span>
      <input type="range" class="weight-slider" min="0" max="100" step="1" value="${p.weight||0}"
        id="wr-${i}" oninput="updateWeight(${i},+this.value)" style="flex:1"/>
      <input type="number" class="sim-weight-input" id="wi-${i}" min="0" max="100" step="0.1" value="${(p.weight||0).toFixed(1)}"
        oninput="updateWeight(${i},+this.value)" style="width:74px"/>
      <span class="weight-val" id="wv-${i}">${(p.weight||0).toFixed(0)}%</span>
      <button class="btn btn-ghost btn-sm btn-danger" onclick="removeStock(${i})" style="padding:2px 6px;font-size:10px">✕</button>
    </div>`).join('');
  updateWeightSum();
}

function updateWeight(i,val){
  if(!state.portfolio[i])return;
  val=clamp(isFinite(val)?val:0,0,100);
  if(state.portfolio.length===1){
    state.portfolio[i].weight=100;
  } else {
    const remaining=100-val;
    const otherIdx=state.portfolio.map((_,idx)=>idx).filter(idx=>idx!==i);
    const otherTotal=otherIdx.reduce((a,idx)=>a+(state.portfolio[idx].weight||0),0);
    state.portfolio[i].weight=val;
    if(otherTotal>0){
      otherIdx.forEach(idx=>{state.portfolio[idx].weight=(state.portfolio[idx].weight||0)/otherTotal*remaining;});
    } else {
      otherIdx.forEach(idx=>{state.portfolio[idx].weight=remaining/otherIdx.length;});
    }
  }
  syncWeightControls();
  updateWeightSum();
  renderOverviewMetrics();
  saveState();
}

function syncWeightControls(){
  state.portfolio.forEach((p,idx)=>{
    const rounded=+(p.weight||0).toFixed(1);
    const range=document.getElementById('wr-'+idx);
    const input=document.getElementById('wi-'+idx);
    const label=document.getElementById('wv-'+idx);
    if(range)range.value=rounded;
    if(input&&document.activeElement!==input)input.value=rounded.toFixed(1);
    if(label)label.textContent=rounded.toFixed(1)+'%';
  });
}

function updateWeightSum(){
  const total=state.portfolio.reduce((a,p)=>a+(p.weight||0),0);
  const el=document.getElementById('weight-sum-val');
  const bar=document.getElementById('weight-sum-bar');
  if(el){el.textContent=total+'%';el.style.color=Math.abs(total-100)<2?'var(--green)':'var(--amber)'}
  if(bar){bar.style.width=Math.min(total,100)+'%';bar.style.background=Math.abs(total-100)<2?'var(--green)':'var(--amber)'}
}

function removeStock(i){
  state.portfolio.splice(i,1);
  normalizePortfolioWeights();
  renderWeightSliders();
  renderOverviewMetrics();
  saveState();
}

function clearPortfolio(){
  state.portfolio=[];
  renderWeightSliders();
  renderOverviewMetrics();
  saveState();
}

// ========== PRESETS ==========
const PRESETS = {
  growth:[{t:'NVDA',w:30},{t:'TSLA',w:25},{t:'MSFT',w:25},{t:'ARKK',w:20}],
  balanced:[{t:'SPY',w:40},{t:'QQQ',w:20},{t:'GLD',w:15},{t:'AGG',w:15},{t:'VNQ',w:10}],
  dividend:[{t:'JNJ',w:25},{t:'KO',w:20},{t:'PG',w:20},{t:'WMT',w:20},{t:'XOM',w:15}],
  etf:[{t:'SPY',w:40},{t:'QQQ',w:25},{t:'IWM',w:20},{t:'GLD',w:15}],
  brazil:[{t:'PETR4.SA',w:30},{t:'VALE3.SA',w:25},{t:'ITUB4.SA',w:25},{t:'WEGE3.SA',w:20}],
};

async function loadPreset(name){
  state.portfolio=[];
  const preset=PRESETS[name];
  const erEl=document.getElementById('add-error');
  erEl.innerHTML='<div class="loading"><div class="spinner"></div>Loading preset...</div>';
  const period=document.getElementById('period-select').value||'2y';
  for(const {t,w} of preset){
    const data=await fetchYahooData(t,period);
    const info=STOCKS_DB.find(s=>s.t===t);
    if(data&&data.length>5){
      state.portfolio.push({ticker:t,name:info?info.n:t,weight:w,investAmount:0,data});
      computeMetrics(t);
    }
  }
  erEl.innerHTML='';
  renderWeightSliders();
  renderOverviewMetrics();
  saveState();
}

// ========== OVERVIEW ==========
function renderOverviewMetrics(){
  if(!state.portfolio.length){
    setMetric('ov-value','$—','Add stocks to begin','neu');
    setMetric('ov-return','—%','—','neu');
    setMetric('ov-vol','—%','—','neu');
    setMetric('ov-sharpe','—','Risk-adj. return','neu');
    setBadge('ov-return-badge',null);
    setBadge('ov-vol-badge',null);
    setBadge('ov-sharpe-badge',null);
    renderAnalyticsWarnings(null);
    renderInsightMetrics(null);
    renderPortfolioHealth(null);
    renderGoalPlanner();
    renderIncomeView(null);
    renderBenchmarkSnapshot(null);
    renderRebalanceSuggestions(null);
    renderHiddenConcentration(null);
    renderHoldingsTable();
    renderAllocation();
    renderCorrelation();
    return;
  }

  state.portfolio.forEach(p=>{if(!state.stockCache[p.ticker])computeMetrics(p.ticker);});
  const validStocks=state.portfolio.filter(p=>state.stockCache[p.ticker]);
  if(!validStocks.length){
    setMetric('ov-value','$—','Waiting for price data','neu');
    setMetric('ov-return','—%','—','neu');
    setMetric('ov-vol','—%','—','neu');
    setMetric('ov-sharpe','—','Risk-adj. return','neu');
    setBadge('ov-return-badge',null);
    setBadge('ov-vol-badge',null);
    setBadge('ov-sharpe-badge',null);
    renderAnalyticsWarnings({warnings:['No valid aligned return data is available yet.']});
    renderInsightMetrics(null);
    renderPortfolioHealth(null);
    renderGoalPlanner();
    renderIncomeView(null);
    renderBenchmarkSnapshot(null);
    renderRebalanceSuggestions(null);
    renderHiddenConcentration(null);
    renderHoldingsTable();
    renderAllocation();
    renderCorrelation();
    return;
  }
  const analytics=getPortfolioAnalytics(validStocks);
  const portReturn=analytics.annReturn;
  const portVol=analytics.annVol;
  const sharpe=analytics.sharpe;

  const totalInvested=getTotalInvested();
  const portCumReturn=analytics.cumulative;
  const currentValue=totalInvested*(1+portCumReturn);

  const selectedPeriod=document.getElementById('period-select').value||'2y';
  setMetric('ov-value',fmt$(currentValue),fmtPct(portCumReturn*100)+' total over '+periodLabel(selectedPeriod),portCumReturn>=0?'pos':'neg');
  setMetric('ov-return',fmtPct(portReturn*100),'Per year from '+periodLabel(selectedPeriod)+' history','neu');
  setMetric('ov-vol',fmtPctPlain(portVol*100),'Ann. Std. Deviation','neu');
  setMetric('ov-sharpe',fmtNum(sharpe),sharpe>1?'✓ Excellent':sharpe>0.5?'Good':'Below avg','neu');
  setBadge('ov-return-badge',getReturnBadge(portReturn));
  setBadge('ov-vol-badge',getVolatilityBadge(portVol));
  setBadge('ov-sharpe-badge',getSharpeBadge(sharpe));
  renderAnalyticsWarnings(analytics);
  renderInsightMetrics(analytics);
  renderPortfolioHealth(analytics);
  renderGoalPlanner();
  renderIncomeView(analytics);
  renderBenchmarkSnapshot(analytics);
  renderRebalanceSuggestions(analytics);
  renderHiddenConcentration(analytics,'hidden-concentration-overview');
  updateBenchmarkBeta(analytics);

  renderHoldingsTable();
  renderAllocation();
  renderGrowthChart();
  renderCorrelation();
}

function setMetric(id,val,sub,cls){
  const el=document.getElementById(id);if(el)el.textContent=val;
  const sid=id.replace('ov-','')+'-sub';
  const sel=id+'-sub'||id.replace('val','sub');
  // find sub by pattern
  const subs={'ov-value':'ov-change','ov-return':'ov-return-sub','ov-vol':'ov-vol-sub','ov-sharpe':'ov-sharpe-sub'};
  const subEl=document.getElementById(subs[id]);
  if(subEl){subEl.textContent=sub;subEl.className='metric-change '+cls}
}

function refreshOverview(){renderOverviewMetrics();}

function renderAnalyticsWarnings(analytics){
  const el=document.getElementById('analytics-warnings');
  if(!el)return;
  const warnings=[...(analytics?.warnings||[])];
  if(!warnings.length){el.innerHTML='';return;}
  const unique=[...new Set(warnings)].slice(0,5);
  el.innerHTML=`<div class="warning-msg"><strong>Data reliability notice:</strong> ${unique.map(escapeHtml).join(' ')}</div>`;
}

function renderInsightMetrics(analytics){
  const empty=()=>{
    ['ins-sortino','ins-drawdown','ins-diversification','ins-concentration','ins-beta','ins-best','ins-worst'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='—';});
  };
  if(!analytics){empty();return;}
  document.getElementById('ins-sortino').textContent=fmtNum(analytics.sortino);
  document.getElementById('ins-drawdown').textContent=fmtPct(analytics.maxDD*100);
  document.getElementById('ins-diversification').textContent=Math.round(analytics.diversification)+'/100';
  document.getElementById('ins-concentration').textContent=fmtNum(analytics.hhi,2);
  const best=analytics.contributions[0];
  const worst=analytics.contributions[analytics.contributions.length-1];
  document.getElementById('ins-best').textContent=best?`${best.ticker} ${fmtPct(best.contribution*100)}`:'—';
  document.getElementById('ins-worst').textContent=worst?`${worst.ticker} ${fmtPct(worst.contribution*100)}`:'—';
}

function renderPortfolioHealth(analytics){
  const el=document.getElementById('portfolio-health-wrap');
  if(!el)return;
  if(!analytics){
    el.innerHTML='<div class="empty-state" style="padding:20px">Build a portfolio to score risk, quality, concentration, and resilience</div>';
    return;
  }
  const health=computePortfolioHealth(analytics);
  const deg=health.score*3.6;
  el.innerHTML=`<div class="health-wrap">
    <div class="health-ring" style="background:conic-gradient(var(--${health.tone==='rose'?'red':health.tone==='amber'?'amber':'green'}) ${deg}deg,var(--bg4) ${deg}deg)">
      <div class="health-inner"><div style="text-align:center"><div class="health-score">${health.score}</div><div class="footnote" style="margin:0">${health.label}</div></div></div>
    </div>
    <div>
      ${health.factors.map(f=>`<div class="health-factor">
        <span>${f.label}</span>
        <div class="prog-bar"><div class="prog-fill" style="width:${f.value}%;background:${f.tone==='rose'?'var(--red)':f.tone==='amber'?'var(--amber)':f.tone==='teal'?'#14b8a6':'var(--green)'}"></div></div>
        <span class="mono">${f.value}</span>
      </div>`).join('')}
      <div class="footnote">Score weights are heuristic and designed for educational portfolio diagnostics.</div>
    </div>
  </div>`;
}

function renderGoalPlanner(){
  const el=document.getElementById('goal-results');
  if(!el)return;
  const analytics=getPortfolioAnalytics();
  if(!analytics){
    el.innerHTML='<div class="empty-state" style="padding:16px">Add holdings to compare projected return with your goal</div>';
    return;
  }
  const target=parseFloat(document.getElementById('goal-target')?.value)||50000;
  const years=Math.max(1,parseFloat(document.getElementById('goal-years')?.value)||5);
  const annualContrib=Math.max(0,parseFloat(document.getElementById('goal-contrib')?.value)||0);
  const current=getTotalInvested()*(1+analytics.cumulative);
  function futureValue(rate){
    let value=current;
    for(let y=0;y<years;y++)value=value*(1+rate)+annualContrib;
    return value;
  }
  let lo=-0.8,hi=1.5;
  for(let i=0;i<60;i++){
    const mid=(lo+hi)/2;
    if(futureValue(mid)<target)lo=mid;else hi=mid;
  }
  const required=hi;
  const projected=futureValue(analytics.annReturn);
  const gap=projected-target;
  const status=gap>=0?'On Track':required>0.18?'Aggressive Goal':'Needs Adjustment';
  const tone=gap>=0?'pos':required>0.18?'neg':'neu';
  el.innerHTML=`<div class="mini-kpi mb12">
    <div class="metric"><div class="metric-label">Required Return</div><div class="metric-val ${tone}">${fmtPct(required*100)}</div></div>
    <div class="metric"><div class="metric-label">Projected Value</div><div class="metric-val ${gap>=0?'pos':'neg'}">${fmt$(projected)}</div></div>
    <div class="metric"><div class="metric-label">Status</div><div class="metric-val ${tone}" style="font-size:18px">${status}</div></div>
  </div>
  <div class="footnote">Uses the portfolio's historical annualized return as a rough planning rate. Stress-test this in Projections before relying on it.</div>`;
}

function renderIncomeView(analytics){
  const el=document.getElementById('income-view');
  if(!el)return;
  if(!analytics){
    el.innerHTML='<div class="empty-state" style="padding:16px">Dividend estimate appears after adding holdings</div>';
    return;
  }
  const current=getTotalInvested()*(1+analytics.cumulative);
  let yld=0;
  const rows=analytics.validStocks.map((p,i)=>{
    const meta=getMeta(p.ticker);
    const div=(meta.div||0)/100;
    const weighted=div*analytics.weights[i];
    yld+=weighted;
    return {ticker:p.ticker,div,weighted};
  }).sort((a,b)=>b.weighted-a.weighted);
  const income=current*yld;
  el.innerHTML=`<div class="mini-kpi mb12">
    <div class="metric"><div class="metric-label">Yield</div><div class="metric-val">${fmtPctPlain(yld*100)}</div></div>
    <div class="metric"><div class="metric-label">Annual Income</div><div class="metric-val pos">${fmt$(income)}</div></div>
    <div class="metric"><div class="metric-label">Monthly Avg.</div><div class="metric-val">${fmt$(income/12)}</div></div>
  </div>
  <div class="footnote">Top income contributors: ${rows.slice(0,3).map(r=>`${r.ticker} ${fmtPctPlain(r.weighted*100,2)}`).join(', ')||'none'}.</div>`;
}

async function renderBenchmarkSnapshot(analytics){
  const el=document.getElementById('benchmark-snapshot');
  if(!el)return;
  if(!analytics){
    el.innerHTML='<div class="empty-state" style="padding:16px">Choose a benchmark in Build Portfolio</div>';
    return;
  }
  const benchmark=document.getElementById('benchmark-select').value||'SPY';
  const period=document.getElementById('period-select').value||'2y';
  el.innerHTML='<div class="loading" style="padding:8px 0"><div class="spinner"></div>Loading benchmark...</div>';
  try{
    const key=benchmark+':'+period+':prices';
    if(!state.benchmarkCache[key]){
      const data=await fetchYahooData(benchmark,period);
      if(data&&data.length>5){
        const prices=data.map(d=>d.close);
        const {series:returnSeries}=priceToReturnSeries(data);
        state.benchmarkCache[key]={prices,returnSeries,returns:returnSeries.map(x=>x.return),cumulative:compoundReturn(returnSeries),annReturn:annualizedReturn(returnSeries)};
      }
    }
    const b=state.benchmarkCache[key];
    if(!b){el.innerHTML='<div class="error-msg">Benchmark data unavailable in Static Mode.</div>';return;}
    const bBeta=beta(analytics.portfolioReturnSeries,b.returnSeries);
    const rfr=parseFloat(document.getElementById('rfr-slider').value)/100||0.045;
    const alpha=alphaApproximation(analytics.annReturn,b.annReturn,bBeta,rfr);
    const tracking=trackingDifference(analytics.portfolioReturnSeries,b.returnSeries);
    el.innerHTML=`<div class="mini-kpi mb12">
      <div class="metric"><div class="metric-label">Tracking Diff.</div><div class="metric-val ${tracking==null?'neu':tracking>=0?'pos':'neg'}">${tracking==null?'—':fmtPct(tracking*100)}</div></div>
      <div class="metric"><div class="metric-label">Beta</div><div class="metric-val">${bBeta==null?'—':fmtNum(bBeta)}</div></div>
      <div class="metric"><div class="metric-label">Alpha</div><div class="metric-val ${alpha==null?'neu':alpha>=0?'pos':'neg'}">${alpha==null?'—':fmtPct(alpha*100)}</div></div>
    </div>
    <div class="footnote">Compared with ${benchmark} over the selected historical period.</div>`;
  }catch(e){
    el.innerHTML='<div class="error-msg">Could not calculate benchmark snapshot.</div>';
  }
}

function renderRebalanceSuggestions(analytics){
  const el=document.getElementById('rebalance-suggestions');
  if(!el)return;
  if(!analytics){
    el.innerHTML='<div class="empty-state" style="padding:20px">Add holdings to see rebalancing actions</div>';
    return;
  }
  const actions=getRebalanceActions(analytics);
  el.innerHTML=`<div class="action-list">${actions.map(a=>`<div class="action-item"><div class="action-title">${escapeHtml(a.title)}</div><div class="footnote" style="margin:0">${escapeHtml(a.body)}</div></div>`).join('')}</div>`;
}

function hiddenRiskToneColor(tone){
  return tone==='rose'?'var(--red)':tone==='amber'?'var(--amber)':tone==='teal'?'#14b8a6':'var(--green)';
}

function renderHiddenConcentrationEmpty(targetId='hidden-concentration-overview'){
  const el=document.getElementById(targetId);
  if(el)el.innerHTML='<div class="empty-state" style="padding:20px">Add holdings to detect hidden concentration beyond ticker count</div>';
}

function renderHiddenConcentrationMarkup(analysis){
  const color=hiddenRiskToneColor(analysis.label.tone);
  return `<div>
    <div class="hidden-risk-wrap">
      <div class="hidden-risk-score">
        <div class="hidden-risk-num" style="color:${color}">${analysis.score}</div>
        <div class="hidden-risk-label" style="color:${color}">${analysis.label.label} Hidden Risk</div>
        <div class="footnote">0 = low overlap, 100 = severe hidden dependence</div>
      </div>
      <div>
        <div class="grid-2" style="gap:10px;margin-bottom:10px">
          <div class="action-item"><div class="action-title">Diversification Score</div><div class="footnote" style="margin:0">How spread out the portfolio is across holdings and sectors.</div></div>
          <div class="action-item"><div class="action-title">Hidden Concentration Risk</div><div class="footnote" style="margin:0">Whether many tickers secretly depend on the same correlations, themes, beta, or volatility drivers.</div></div>
        </div>
        <div class="action-list">
          ${analysis.reasons.map((r,i)=>`<div class="action-item"><div class="action-title">Reason ${i+1}</div><div class="footnote" style="margin:0">${escapeHtml(r)}</div></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="breakdown-grid">
      ${analysis.components.map(c=>`<div class="breakdown-item"><div class="breakdown-title">${escapeHtml(c.label)}</div><div class="breakdown-val">${Math.round(c.score)}/100</div><div class="footnote" style="margin-top:4px">${escapeHtml(c.value)}</div></div>`).join('')}
    </div>
    <div class="divider"></div>
    <div class="grid-2">
      <div>
        <h3 style="margin-bottom:8px">Improvement Suggestions</h3>
        <div class="action-list">${analysis.suggestions.map(s=>`<div class="action-item"><div class="footnote" style="margin:0">${escapeHtml(s)}</div></div>`).join('')}</div>
      </div>
      <div>
        <h3 style="margin-bottom:8px">Exposure Snapshot</h3>
        <div class="footnote">Top sector: ${escapeHtml(analysis.details.sectorEntries[0]?.[0]||'—')} ${fmtPctPlain((analysis.details.sectorEntries[0]?.[1]||0)*100)} · ETF exposure: ${fmtPctPlain(analysis.details.etfExposure*100)} · Brazil exposure: ${fmtPctPlain(analysis.details.brazilExposure*100)} · High-correlation pairs: ${analysis.details.highCorrPairs.length}</div>
      </div>
    </div>
  </div>`;
}

async function renderHiddenConcentration(analytics,targetId='hidden-concentration-overview'){
  const el=document.getElementById(targetId);
  if(!el)return;
  if(!analytics){renderHiddenConcentrationEmpty(targetId);return;}
  el.innerHTML='<div class="loading"><div class="spinner"></div>Analyzing hidden concentration...</div>';
  try{
    const analysis=await analyzeHiddenConcentration(analytics);
    if(!analysis){renderHiddenConcentrationEmpty(targetId);return;}
    el.innerHTML=renderHiddenConcentrationMarkup(analysis);
  }catch(e){
    el.innerHTML=`<div class="warning-msg">Hidden concentration analysis could not be completed: ${escapeHtml(e.message||'unknown error')}</div>`;
  }
}

async function updateBenchmarkBeta(analytics){
  const el=document.getElementById('ins-beta');
  if(!el||!analytics){return;}
  const benchmark=document.getElementById('benchmark-select').value||'SPY';
  const period=document.getElementById('period-select').value||'2y';
  const key=benchmark+':'+period;
  try{
    el.textContent='…';
    if(!state.benchmarkCache[key]){
      const data=await fetchYahooData(benchmark,period);
      if(data&&data.length>5){
        const {series:returnSeries}=priceToReturnSeries(data);
        state.benchmarkCache[key]={returnSeries,returns:returnSeries.map(x=>x.return)};
      }
    }
    const bSeries=Array.isArray(state.benchmarkCache[key])?state.benchmarkCache[key]:state.benchmarkCache[key]?.returnSeries;
    const b=bSeries?beta(analytics.portfolioReturnSeries,bSeries):null;
    el.textContent=b==null?'—':fmtNum(b,2);
    el.className='insight-value '+(b>1.2?'neg':b<0.8?'pos':'');
  } catch(e){
    el.textContent='—';
  }
}

// ========== HOLDINGS TABLE ==========
function renderHoldingsTable(){
  const el=document.getElementById('holdings-table-wrap');
  if(!state.portfolio.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">📈</div>Build your portfolio to see holdings analysis</div>';return;}

  const totalWeight=state.portfolio.reduce((a,p)=>a+(p.weight||0),0);

  let html=`<table><thead><tr><th>Ticker</th><th>Name</th><th>Weight</th><th>Ann. Return</th><th>Volatility</th><th>Sharpe</th><th>Sortino</th><th>Max Drawdown</th><th>Cumul. Return</th></tr></thead><tbody>`;
  for(const p of state.portfolio){
    const c=state.stockCache[p.ticker];
    if(!c){html+=`<tr><td class="mono" style="color:var(--accent)">${p.ticker}</td><td style="color:var(--text2)">${p.name}</td><td colspan="7" style="color:var(--text3)">Loading...</td></tr>`;continue;}
    const w=(weightShare(p,totalWeight,state.portfolio.length)*100).toFixed(1);
    const warningNote=c.warnings?.length?`<div class="footnote" style="margin-top:2px;color:#fcd34d">${escapeHtml(c.warnings[0])}</div>`:'';
    html+=`<tr>
      <td class="mono" style="color:var(--accent)">${p.ticker}</td>
      <td style="color:var(--text2);font-size:12px">${p.name}${warningNote}</td>
      <td>${w}%</td>
      <td class="${c.annReturn>=0?'pos':'neg'}">${fmtPct(c.annReturn*100)}</td>
      <td class="neu">${fmtPctPlain(c.annVol*100)}</td>
      <td class="${c.sharpe>1?'pos':c.sharpe>0.5?'neu':'neg'}">${fmtNum(c.sharpe)}</td>
      <td class="${c.sortino>1?'pos':c.sortino>0.5?'neu':'neg'}">${fmtNum(c.sortino)}</td>
      <td class="neg">${fmtPct(c.maxDD*100)}</td>
      <td class="${c.cumulative>=0?'pos':'neg'}">${fmtPct(c.cumulative*100)}</td>
    </tr>`;
  }
  html+='</tbody></table>';
  el.innerHTML=html;
}

// ========== ALLOCATION CHART ==========
let allocChartInst=null;
function analyzePortfolio(){
  if(!state.portfolio.length){alert('Add stocks first!');return;}
  switchTab('overview');
  renderOverviewMetrics();
}

// ========== COMPARE ==========
let compareChartInst=null;
async function runComparison(){
  const a=document.getElementById('compareA').value.trim().toUpperCase();
  const b=document.getElementById('compareB').value.trim().toUpperCase();
  if(!a||!b){return;}

  const el=document.getElementById('compare-results');
  el.innerHTML='<div class="loading"><div class="spinner"></div>Fetching data for '+a+' and '+b+'...</div>';

  const period=document.getElementById('period-select').value||'2y';
  const [dA,dB]=await Promise.all([fetchYahooData(a,period),fetchYahooData(b,period)]);
  if(!dA){el.innerHTML='<div class="error-msg">Could not fetch '+a+'</div>';return;}
  if(!dB){el.innerHTML='<div class="error-msg">Could not fetch '+b+'</div>';return;}

  function calcStats(data){
    const prices=data.map(d=>d.close);
    const {series:returnSeries}=priceToReturnSeries(data);
    const returns=returnSeries.map(x=>x.return);
    const ann=annualizedReturn(returnSeries);
    const vol=annualizedVolatility(returnSeries);
    const rfr=0.045;
    const sharpe=sharpeRatio(ann,vol,rfr);
    const cumul=compoundReturn(returnSeries);
    const maxDD=maxDrawdown(returnSeries);
    return{prices,returns,returnSeries,ann,vol,sharpe,cumul,maxDD,dates:data.map(d=>d.date),latest:prices[prices.length-1]};
  }

  const sA=calcStats(dA),sB=calcStats(dB);

  const html=`
    <div class="grid-2 mb16">
      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span class="mono" style="font-size:20px;font-weight:700;color:#3b82f6">${a}</span>
          <span style="font-size:13px;color:var(--text2)">${STOCKS_DB.find(s=>s.t===a)?.n||a}</span>
        </div>
        <div class="grid-2" style="gap:8px">
          <div class="metric"><div class="metric-label">Current Price</div><div class="metric-val">${fmt$(sA.latest)}</div></div>
          <div class="metric"><div class="metric-label">Cumul. Return</div><div class="metric-val ${sA.cumul>=0?'pos':'neg'}">${fmtPct(sA.cumul*100)}</div></div>
          <div class="metric"><div class="metric-label">Ann. Return</div><div class="metric-val ${sA.ann>=0?'pos':'neg'}">${fmtPct(sA.ann*100)}</div></div>
          <div class="metric"><div class="metric-label">Volatility</div><div class="metric-val">${fmtPct(sA.vol*100)}</div></div>
          <div class="metric"><div class="metric-label">Sharpe Ratio</div><div class="metric-val">${fmtNum(sA.sharpe)}</div></div>
          <div class="metric"><div class="metric-label">Max Drawdown</div><div class="metric-val neg">${fmtPct(sA.maxDD*100)}</div></div>
        </div>
      </div>
      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span class="mono" style="font-size:20px;font-weight:700;color:#10b981">${b}</span>
          <span style="font-size:13px;color:var(--text2)">${STOCKS_DB.find(s=>s.t===b)?.n||b}</span>
        </div>
        <div class="grid-2" style="gap:8px">
          <div class="metric"><div class="metric-label">Current Price</div><div class="metric-val">${fmt$(sB.latest)}</div></div>
          <div class="metric"><div class="metric-label">Cumul. Return</div><div class="metric-val ${sB.cumul>=0?'pos':'neg'}">${fmtPct(sB.cumul*100)}</div></div>
          <div class="metric"><div class="metric-label">Ann. Return</div><div class="metric-val ${sB.ann>=0?'pos':'neg'}">${fmtPct(sB.ann*100)}</div></div>
          <div class="metric"><div class="metric-label">Volatility</div><div class="metric-val">${fmtPct(sB.vol*100)}</div></div>
          <div class="metric"><div class="metric-label">Sharpe Ratio</div><div class="metric-val">${fmtNum(sB.sharpe)}</div></div>
          <div class="metric"><div class="metric-label">Max Drawdown</div><div class="metric-val neg">${fmtPct(sB.maxDD*100)}</div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <h3>Cumulative Return Comparison</h3>
      <div class="chart-wrap-tall"><canvas id="compareChartCanvas" role="img" aria-label="Comparison of cumulative returns between two stocks"></canvas></div>
    </div>`;

  el.innerHTML=html;

  // draw chart after DOM update
  setTimeout(()=>{
    const aligned=alignTwoReturnSeries(sA.returnSeries,sB.returnSeries);
    const labels=aligned.map(x=>x.date||'');
    let growthA=1,growthB=1;
    const dataA=aligned.map(x=>{growthA*=1+x.a;return +(growthA*100-100).toFixed(2);});
    const dataB=aligned.map(x=>{growthB*=1+x.b;return +(growthB*100-100).toFixed(2);});
    if(compareChartInst)compareChartInst.destroy();
    compareChartInst=new Chart(document.getElementById('compareChartCanvas'),{
      type:'line',
      data:{labels,datasets:[
        {label:a,data:dataA,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,.05)',fill:true,borderWidth:2,pointRadius:0,tension:0.2},
        {label:b,data:dataB,borderColor:'#10b981',backgroundColor:'rgba(16,185,129,.05)',fill:true,borderWidth:2,pointRadius:0,tension:0.2},
      ]},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{labels:{color:'#8fa3c0',font:{size:11}}},tooltip:{backgroundColor:'#0e1420',borderColor:'#1e2d4a',borderWidth:1,titleColor:'#e8edf5',bodyColor:'#8fa3c0'}},
        scales:{x:{ticks:{color:'#4a6080',maxTicksLimit:8},grid:{color:'#1a2340'}},y:{ticks:{color:'#4a6080',callback:v=>(v>=0?'+':'')+v+'%'},grid:{color:'#1a2340'}}}}
    });
  },50);
}

// ========== SCREENER ==========
let SCREENER_DATA = [
  {t:'AAPL',n:'Apple',s:'Technology',mc:3e12,pe:29.5,div:0.5,h52:237},
  {t:'MSFT',n:'Microsoft',s:'Technology',mc:3.1e12,pe:35.2,div:0.7,h52:468},
  {t:'NVDA',n:'NVIDIA',s:'Technology',mc:3.3e12,pe:55.1,div:0.03,h52:149},
  {t:'GOOGL',n:'Alphabet',s:'Technology',mc:2.2e12,pe:23.8,div:0,h52:207},
  {t:'META',n:'Meta',s:'Technology',mc:1.5e12,pe:28.4,div:0.5,h52:740},
  {t:'AMZN',n:'Amazon',s:'Technology',mc:2.3e12,pe:45.2,div:0,h52:242},
  {t:'JPM',n:'JPMorgan',s:'Financial Services',mc:688e9,pe:13.2,div:2.2,h52:288},
  {t:'V',n:'Visa',s:'Financial Services',mc:620e9,pe:32.5,div:0.8,h52:321},
  {t:'JNJ',n:'Johnson & Johnson',s:'Healthcare',mc:384e9,pe:15.8,div:3.1,h52:168},
  {t:'LLY',n:'Eli Lilly',s:'Healthcare',mc:780e9,pe:55.9,div:0.7,h52:972},
  {t:'UNH',n:'UnitedHealth',s:'Healthcare',mc:502e9,pe:22.3,div:1.6,h52:613},
  {t:'XOM',n:'ExxonMobil',s:'Energy',mc:488e9,pe:14.2,div:3.4,h52:126},
  {t:'CVX',n:'Chevron',s:'Energy',mc:267e9,pe:15.1,div:4.2,h52:169},
  {t:'WMT',n:'Walmart',s:'Consumer Cyclical',mc:782e9,pe:38.5,div:1.0,h52:96},
  {t:'COST',n:'Costco',s:'Consumer Cyclical',mc:387e9,pe:54.2,div:0.7,h52:1077},
  {t:'BRK-B',n:'Berkshire',s:'Financial Services',mc:1.05e12,pe:21.4,div:0,h52:505},
  {t:'MA',n:'Mastercard',s:'Financial Services',mc:498e9,pe:38.2,div:0.6,h52:574},
  {t:'TSLA',n:'Tesla',s:'Technology',mc:1.1e12,pe:180.5,div:0,h52:488},
  ...BRAZIL_MARKET_STOCKS.map(({t,n,s,mc,pe,div,h52})=>({t,n,s,mc,pe,div,h52})),
];

let screenerMetricCache = {};

async function loadScreenerUniverse(){
  try{
    const res=await fetch('/api/universe',{cache:'no-store'});
    if(!res.ok)return;
    const data=await res.json();
    if(Array.isArray(data.universe)&&data.universe.length>SCREENER_DATA.length){
      SCREENER_DATA=data.universe;
      const existing=new Set(STOCKS_DB.map(s=>s.t));
      data.universe.forEach(s=>{
        if(!existing.has(s.t)){
          STOCKS_DB.push({t:s.t,n:s.n,s:(s.s||'').toLowerCase().split(' ')[0]||'stock'});
          existing.add(s.t);
        }
      });
      renderQuickStocks();
      renderWatchlist();
      renderOverviewMetrics();
    }
  } catch(e){
    console.warn('Using bundled screener universe',e);
  }
}

function loadScreenerMetricCache(){
  try{
    const raw=localStorage.getItem(SCREENER_CACHE_KEY);
    screenerMetricCache=raw?JSON.parse(raw):{};
  }catch(e){
    screenerMetricCache={};
  }
}

function saveScreenerMetricCache(){
  try{
    localStorage.setItem(SCREENER_CACHE_KEY,JSON.stringify(screenerMetricCache));
  }catch(e){
    console.warn('Could not persist screener metric cache',e);
  }
}

function screenerCacheKey(ticker,period){
  return `${ticker}:${period}`;
}

function getCachedScreenerMetric(ticker,period){
  const cached=screenerMetricCache[screenerCacheKey(ticker,period)];
  if(!cached)return null;
  if(cached.asOf&&Date.now()-new Date(cached.asOf).getTime()>SCREENER_CACHE_MS)return null;
  if(cached.error)return cached;
  return cached;
}

function metricsFromPriceRows(ticker,rows,period){
  const {series,skipped}=priceToReturnSeries(rows);
  if(series.length<30){
    return{ticker,period,error:'Insufficient historical data',dataPoints:series.length,asOf:new Date().toISOString()};
  }
  const annReturn=annualizedReturn(series);
  const annVol=annualizedVolatility(series);
  const maxDD=maxDrawdown(series);
  return{
    ticker,period,source:'live',annReturn,annVol,maxDD,
    cumulative:compoundReturn(series),
    dataPoints:series.length,
    skipped,
    asOf:new Date().toISOString(),
  };
}

function getScreenerMetric(ticker,period,rfr){
  const portfolioMetric=state.stockCache[ticker];
  if(portfolioMetric?.returnSeries?.length){
    return{
      source:'portfolio',
      annReturn:portfolioMetric.annReturn,
      annVol:portfolioMetric.annVol,
      sharpe:portfolioMetric.annVol>0?(portfolioMetric.annReturn-rfr)/portfolioMetric.annVol:0,
      dataPoints:portfolioMetric.returnSeries.length,
    };
  }
  const cached=getCachedScreenerMetric(ticker,period);
  if(cached&&!cached.error){
    return{
      ...cached,
      sharpe:cached.annVol>0?(cached.annReturn-rfr)/cached.annVol:0,
    };
  }
  return cached||null;
}

async function fetchAndCacheScreenerMetric(stock,period){
  try{
    const rows=await fetchYahooData(stock.t,period);
    const metric=metricsFromPriceRows(stock.t,rows||[],period);
    screenerMetricCache[screenerCacheKey(stock.t,period)]=metric;
    return metric;
  }catch(e){
    const metric={ticker:stock.t,period,error:e.message||'Data unavailable',asOf:new Date().toISOString()};
    screenerMetricCache[screenerCacheKey(stock.t,period)]=metric;
    return metric;
  }
}

async function fetchScreenerMetrics(candidates,period,onProgress){
  const missing=candidates.filter(s=>!getCachedScreenerMetric(s.t,period)&&!state.stockCache[s.t]?.returnSeries?.length);
  let completed=0;
  const concurrency=5;
  for(let i=0;i<missing.length;i+=concurrency){
    const batch=missing.slice(i,i+concurrency);
    await Promise.all(batch.map(async stock=>{
      await fetchAndCacheScreenerMetric(stock,period);
      completed++;
      if(onProgress)onProgress(completed,missing.length,stock.t);
    }));
    await yieldToBrowser();
  }
  if(missing.length)saveScreenerMetricCache();
  return missing.length;
}

function buildScreenerResults(candidates,rfr,maxRisk,period){
  return candidates.map(s=>{
    const metric=getScreenerMetric(s.t,period,rfr);
    const annReturn=metric?.annReturn;
    const annVol=metric?.annVol;
    const sharpe=Number.isFinite(metric?.sharpe)?metric.sharpe:(annVol>0?(annReturn-rfr)/annVol:null);
    return{
      ...s,
      annReturn:Number.isFinite(annReturn)?annReturn:null,
      annVol:Number.isFinite(annVol)?annVol:null,
      sharpe:Number.isFinite(sharpe)?sharpe:null,
      metricSource:metric?.source||'unavailable',
      metricError:metric?.error||'',
      dataPoints:metric?.dataPoints||0,
    };
  }).filter(s=>{
    if(maxRisk<999&&s.annVol!=null&&s.annVol*100>maxRisk)return false;
    if(maxRisk<999&&s.annVol==null)return false;
    return true;
  });
}

function sortScreenerResults(results,sortBy){
  const numeric=(value,missing=-Infinity)=>Number.isFinite(value)?value:missing;
  if(sortBy==='peRatio') results.sort((a,b)=>numeric(a.pe,Infinity)-numeric(b.pe,Infinity));
  else if(sortBy==='dividendYield') results.sort((a,b)=>numeric(b.div)-numeric(a.div));
  else if(sortBy==='52wHigh') results.sort((a,b)=>numeric(b.h52)-numeric(a.h52));
  else if(sortBy==='riskLow') results.sort((a,b)=>numeric(a.annVol,Infinity)-numeric(b.annVol,Infinity));
  else if(sortBy==='riskHigh') results.sort((a,b)=>numeric(b.annVol)-numeric(a.annVol));
  else if(sortBy==='sharpe') results.sort((a,b)=>numeric(b.sharpe)-numeric(a.sharpe));
  else if(sortBy==='return') results.sort((a,b)=>numeric(b.annReturn)-numeric(a.annReturn));
  else results.sort((a,b)=>numeric(b.mc)-numeric(a.mc));
  return results;
}

function metricSourceBadge(source,error){
  if(source==='live')return metricBadge('Live','emerald');
  if(source==='portfolio')return metricBadge('Portfolio','teal');
  if(error)return metricBadge('No Data','amber');
  return metricBadge('Loading','amber');
}

function renderScreenerTable(results,{loading=false,progressText='',period='2y'}={}){
  const el=document.getElementById('screener-results');
  if(!results.length){
    el.innerHTML='<div class="empty-state">No stocks match your criteria</div>';
    return;
  }
  let html=`<div class="card">`;
  if(loading)html+=`<div class="loading" style="margin-bottom:12px"><div class="spinner"></div>${escapeHtml(progressText||'Fetching live historical metrics...')}</div>`;
  html+=`<table><thead><tr><th>Ticker</th><th>Company</th><th>Sector</th><th>Market Cap</th><th>Ann. Return</th><th>Risk</th><th>Sharpe</th><th>Data</th><th>P/E</th><th>Dividend</th><th>Action</th></tr></thead><tbody>`;
  results.forEach(s=>{
    const mc=s.mc>=1e12?'$'+(s.mc/1e12).toFixed(1)+'T':s.mc>=1e9?'$'+(s.mc/1e9).toFixed(0)+'B':'$'+(s.mc/1e6).toFixed(0)+'M';
    const riskBadge=s.annVol==null?null:getVolatilityBadge(s.annVol);
    html+=`<tr>
      <td class="mono" style="color:var(--accent)">${s.t}</td>
      <td>${s.n}</td>
      <td><span class="tag" style="background:var(--bg4);color:var(--text2)">${s.s}</span></td>
      <td class="mono">${mc}</td>
      <td class="mono ${s.annReturn==null?'neu':s.annReturn>=0?'pos':'neg'}">${s.annReturn==null?'—':fmtPct(s.annReturn*100)}</td>
      <td>${riskBadge?metricBadge(fmtPctPlain(s.annVol*100)+' '+riskBadge.label,riskBadge.tone):'<span class="neu">—</span>'}</td>
      <td class="mono ${s.sharpe==null?'neu':s.sharpe>=1?'pos':s.sharpe>=0.5?'neu':'neg'}">${s.sharpe==null?'—':fmtNum(s.sharpe)}</td>
      <td>${metricSourceBadge(s.metricSource,s.metricError)}${s.dataPoints?`<div class="footnote">${s.dataPoints} days</div>`:''}</td>
      <td class="mono">${s.pe||'—'}</td>
      <td class="mono ${s.div>2?'pos':''}">${s.div?s.div.toFixed(1)+'%':'—'}</td>
      <td><button class="btn btn-outline btn-sm" onclick="quickAddFromScreener('${s.t}')">+ Add</button> <button class="btn btn-ghost btn-sm" onclick="addToWatchlist('${s.t}')">Watch</button></td>
    </tr>`;
  });
  html+=`</tbody></table><div class="footnote">Return, risk, and Sharpe use live Yahoo historical data for ${escapeHtml(periodLabel(period))} when available and are cached locally for 24 hours. Rows marked No Data could not be calculated reliably.</div></div>`;
  el.innerHTML=html;
}

async function runScreener(){
  const sector=document.getElementById('screen-sector').value;
  const minCap=parseFloat(document.getElementById('screen-cap').value)||0;
  const maxRisk=parseFloat(document.getElementById('screen-risk').value)||999;
  const sortBy=document.getElementById('screen-sort').value;
  const period=document.getElementById('period-select')?.value||'2y';
  const rfr=parseFloat(document.getElementById('rfr-slider').value)/100||0.045;
  const btn=document.querySelector('#panel-screener .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Fetching live metrics...';}
  await loadScreenerUniverse();

  const candidates=SCREENER_DATA.filter(s=>{
    if(sector&&s.s!==sector)return false;
    if(s.mc<minCap)return false;
    return true;
  });

  let results=sortScreenerResults(buildScreenerResults(candidates,rfr,maxRisk,period),sortBy);
  renderScreenerTable(results,{loading:true,progressText:'Fetching live historical metrics...',period});

  await fetchScreenerMetrics(candidates,period,(done,total,ticker)=>{
    if(btn)btn.textContent=`Fetching live metrics... ${done}/${total}`;
    const progress=document.querySelector('#screener-results .loading');
    if(progress)progress.innerHTML=`<div class="spinner"></div>Fetching live metrics... ${done}/${total} (${escapeHtml(ticker)})`;
  });

  results=sortScreenerResults(buildScreenerResults(candidates,rfr,maxRisk,period),sortBy);
  renderScreenerTable(results,{period});
  if(btn){btn.disabled=false;btn.textContent='🔍 Screen Stocks';}
}

async function quickAddFromScreener(ticker,name){
  if(state.portfolio.find(p=>p.ticker===ticker)){alert(ticker+' already in portfolio');return;}
  const meta=getMeta(ticker);
  const displayName=name||meta.n||ticker;
  const period=document.getElementById('period-select').value||'2y';
  const data=await fetchYahooData(ticker,period);
  if(data&&data.length>5){
    state.portfolio.push({ticker,name:displayName,weight:defaultNewWeight(),investAmount:0,data});
    normalizePortfolioWeights();
    computeMetrics(ticker);
    renderWeightSliders();
    renderOverviewMetrics();
    saveState();
    alert(ticker+' added to portfolio! Go to Build Portfolio to set weights.');
  } else {
    alert('Could not fetch data for '+ticker);
  }
}

// ========== RISK LAB ==========
function riskMetricCard(title,value,explanation,diagnostic,tone='neu'){
  return `<div class="risk-metric">
    <div class="metric-label">${escapeHtml(title)}</div>
    <div class="metric-val ${tone}">${value}</div>
    <div class="risk-explain">${escapeHtml(explanation)}</div>
    <div class="risk-diagnostic ${tone}">${escapeHtml(diagnostic)}</div>
  </div>`;
}

async function getRiskLabBenchmarkSeries(){
  const benchmark=document.getElementById('benchmark-select').value||'SPY';
  const period=document.getElementById('period-select').value||'2y';
  const key=benchmark+':'+period+':risklab';
  if(!state.benchmarkCache[key]){
    const data=await fetchYahooData(benchmark,period);
    if(data&&data.length>5){
      const {series:returnSeries}=priceToReturnSeries(data);
      state.benchmarkCache[key]={ticker:benchmark,returnSeries,annReturn:annualizedReturn(returnSeries),cumulative:compoundReturn(returnSeries)};
    }
  }
  return state.benchmarkCache[key]||null;
}

function riskToneForLoss(value){
  if(value==null)return'neu';
  if(value<=-0.04)return'neg';
  if(value<=-0.025)return'neu';
  return'pos';
}

async function renderRiskLab(){
  const metricsEl=document.getElementById('risklab-metrics');
  const warningEl=document.getElementById('risklab-warning');
  if(!metricsEl||!warningEl)return;

  const analytics=getPortfolioAnalytics();
  if(!analytics){
    warningEl.innerHTML='';
    metricsEl.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🧪</div><div>Build a portfolio to analyze historical risk</div></div>';
    renderHiddenConcentrationEmpty('hidden-concentration-risklab');
    destroyRiskLabCharts();
    return;
  }

  const series=analytics.portfolioReturnSeries||[];
  const warnings=[...(analytics.warnings||[])];
  if(series.length<60)warnings.push(`Risk Lab has only ${series.length} aligned return dates. Add more history or holdings with overlapping data before treating the diagnostics as reliable.`);

  let benchmark=null;
  try{
    benchmark=await getRiskLabBenchmarkSeries();
    if(!benchmark?.returnSeries?.length)warnings.push('Benchmark data is unavailable, so beta, alpha, tracking difference, and rolling beta are not shown.');
    else if(alignTwoReturnSeries(series,benchmark.returnSeries).length<60)warnings.push('Benchmark overlap is limited; beta and alpha diagnostics may be unstable.');
  }catch(e){
    warnings.push('Benchmark data could not be fetched for Risk Lab calculations.');
  }

  const rfr=parseFloat(document.getElementById('rfr-slider').value)/100||0.045;
  const var95=historicalVaR(series,0.95);
  const cvar95=historicalCVaR(series,0.95);
  const downDev=downsideDeviation(series);
  const bBeta=benchmark?.returnSeries?.length?beta(series,benchmark.returnSeries):null;
  const alpha=benchmark?.returnSeries?.length?alphaApproximation(analytics.annReturn,benchmark.annReturn,bBeta,rfr):null;
  const tracking=benchmark?.returnSeries?.length?trackingDifference(series,benchmark.returnSeries):null;
  const benchmarkName=document.getElementById('benchmark-select').value||'benchmark';

  warningEl.innerHTML=warnings.length?`<div class="warning-msg"><strong>Risk Lab data notice:</strong> ${[...new Set(warnings)].slice(0,5).map(escapeHtml).join(' ')}</div>`:'';

  metricsEl.innerHTML=[
    riskMetricCard('Annualized Return',fmtPct(analytics.annReturn*100),'Compound yearly growth rate implied by the aligned historical portfolio return path.',analytics.annReturn>0.12?'Historically strong return, but check drawdowns and tail losses before extrapolating.':analytics.annReturn>0?'Positive historical return with moderate growth.':'Negative historical return over the aligned period.',analytics.annReturn>=0?'pos':'neg'),
    riskMetricCard('Annualized Volatility',fmtPctPlain(analytics.annVol*100),'Annualized standard deviation of aligned daily portfolio returns.',analytics.annVol>0.30?'Very high variability; outcomes can swing sharply.':analytics.annVol>0.15?'Equity-like risk profile.':'Lower-volatility profile.',analytics.annVol>0.30?'neg':analytics.annVol>0.15?'neu':'pos'),
    riskMetricCard('Sharpe Ratio',fmtNum(analytics.sharpe),'Excess return over the risk-free rate per unit of total volatility.',analytics.sharpe>=2?'Exceptional historical risk-adjusted return.':analytics.sharpe>=1?'Strong risk-adjusted return.':'Risk-adjusted return is weak or not well compensated.',analytics.sharpe>=1?'pos':'neg'),
    riskMetricCard('Sortino Ratio',fmtNum(analytics.sortino),'Excess return per unit of downside volatility.',analytics.sortino>=2?'Downside-adjusted return has been very strong.':analytics.sortino>=1?'Downside risk has been reasonably compensated.':'Downside risk is not well compensated.',analytics.sortino>=1?'pos':'neg'),
    riskMetricCard('Maximum Drawdown',fmtPct(analytics.maxDD*100),'Worst historical peak-to-trough decline in the aligned portfolio path.',analytics.maxDD<-0.35?'Large historical pain point; recovery risk deserves attention.':analytics.maxDD<-0.20?'Meaningful drawdown risk.':'Drawdowns have been relatively contained.',analytics.maxDD<-0.35?'neg':analytics.maxDD<-0.20?'neu':'pos'),
    riskMetricCard('Historical VaR 95%',var95==null?'—':fmtPct(var95*100),'Daily loss threshold breached in roughly the worst 5% of aligned historical days.',var95==null?'Not enough data.':`Based on history, the portfolio lost more than ${fmtPctPlain(Math.abs(var95)*100)} in about the worst 5% of trading days.`,riskToneForLoss(var95)),
    riskMetricCard('Historical CVaR 95%',cvar95==null?'—':fmtPct(cvar95*100),'Average daily return inside the worst 5% tail beyond VaR.',cvar95==null?'Not enough data.':`When days were worse than VaR, the average tail loss was about ${fmtPctPlain(Math.abs(cvar95)*100)}.`,riskToneForLoss(cvar95)),
    riskMetricCard('Downside Deviation',fmtPctPlain(downDev*100),'Annualized volatility of below-zero returns only.',downDev>0.25?'Downside movement is high and may dominate user experience.':downDev>0.12?'Moderate downside variability.':'Lower downside variability.',downDev>0.25?'neg':downDev>0.12?'neu':'pos'),
    riskMetricCard('Beta vs Benchmark',bBeta==null?'—':fmtNum(bBeta),'Sensitivity of aligned portfolio returns to the selected benchmark.',bBeta==null?'Benchmark overlap is unavailable or too short.':bBeta>1.2?`More sensitive than ${benchmarkName}; market moves may be amplified.`:bBeta<0.8?`Less sensitive than ${benchmarkName}; market moves may be dampened.`:`Similar market sensitivity to ${benchmarkName}.`,bBeta==null?'neu':bBeta>1.2?'neg':'pos'),
    riskMetricCard('Alpha Approximation',alpha==null?'—':fmtPct(alpha*100),'Annualized return above or below what beta and benchmark return imply.',alpha==null?'Alpha needs valid benchmark beta and return data.':alpha>0?'Positive historical alpha after beta adjustment.':'Negative historical alpha after beta adjustment.',alpha==null?'neu':alpha>=0?'pos':'neg'),
    riskMetricCard('Tracking Difference',tracking==null?'—':fmtPct(tracking*100),'Cumulative aligned return gap versus the selected benchmark.',tracking==null?'Tracking difference needs benchmark overlap.':tracking>0?'Portfolio outperformed the benchmark over the shared history.':'Portfolio lagged the benchmark over the shared history.',tracking==null?'neu':tracking>=0?'pos':'neg'),
  ].join('');

  renderHiddenConcentration(analytics,'hidden-concentration-risklab');

  renderRiskLabCharts(series,benchmark?.returnSeries||[]);
}

async function quickImportAlloc(ticker,weight){
  if(state.portfolio.find(p=>p.ticker===ticker)){alert(ticker+' already in portfolio');return;}
  const period=document.getElementById('period-select').value||'2y';
  const data=await fetchYahooData(ticker,period);
  const info=STOCKS_DB.find(s=>s.t===ticker);
  if(data&&data.length>5){
    state.portfolio.push({ticker,name:info?info.n:ticker,weight,investAmount:0,data});
    normalizePortfolioWeights();
    computeMetrics(ticker);
    renderWeightSliders();
    renderOverviewMetrics();
    saveState();
    alert(ticker+' added! Switch to "Build Portfolio" to review weights.');
  }
}

function exportPortfolioReport(){
  const analytics=getPortfolioAnalytics();
  if(!analytics){alert('Build a portfolio before exporting a report.');return;}
  const health=computePortfolioHealth(analytics);
  const totalInvested=getTotalInvested();
  const currentValue=totalInvested*(1+analytics.cumulative);
  const incomeYield=analytics.validStocks.reduce((sum,p,i)=>sum+((getMeta(p.ticker).div||0)/100)*analytics.weights[i],0);
  const actions=getRebalanceActions(analytics);
  const holdings=analytics.validStocks.map((p,i)=>{
    const c=state.stockCache[p.ticker];
    return `- ${p.ticker} (${(analytics.weights[i]*100).toFixed(1)}%): return ${fmtPct(c.annReturn*100)}, volatility ${fmtPctPlain(c.annVol*100)}, Sharpe ${fmtNum(c.sharpe)}, max drawdown ${fmtPct(c.maxDD*100)}`;
  }).join('\n');
  const report=`PortfolioIQ Report
Generated: ${new Date().toLocaleString()}

Portfolio Summary
- Current value estimate: ${fmt$(currentValue)}
- Annualized return: ${fmtPct(analytics.annReturn*100)}
- Annualized volatility: ${fmtPctPlain(analytics.annVol*100)}
- Sharpe ratio: ${fmtNum(analytics.sharpe)}
- Sortino ratio: ${fmtNum(analytics.sortino)}
- Max drawdown: ${fmtPct(analytics.maxDD*100)}
- Diversification score: ${Math.round(analytics.diversification)}/100
- Concentration HHI: ${fmtNum(analytics.hhi)}
- Portfolio health score: ${health.score}/100 (${health.label})
- Estimated dividend yield: ${fmtPctPlain(incomeYield*100)}
- Estimated annual income: ${fmt$(currentValue*incomeYield)}

Holdings
${holdings}

Rebalancing Suggestions
${actions.map((a,i)=>`${i+1}. ${a.title}: ${a.body}`).join('\n')}

Method Notes
- Live Mode uses the local Node backend to fetch Yahoo Finance chart data.
- Projections are educational estimates based on historical returns, bootstrap sampling, stress tests, and user assumptions.
- This is not licensed financial advice.`;
  const blob=new Blob([report],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='portfolioiq-report.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ========== INIT ==========
document.getElementById('rfr-slider').addEventListener('change',()=>{renderOverviewMetrics();saveState();});
document.getElementById('benchmark-select').addEventListener('change',()=>{renderOverviewMetrics();saveState();});
document.getElementById('period-select').addEventListener('change',saveState);
updateRiskLabel(3);
renderQuickStocks();
checkBackendStatus();
loadScreenerMetricCache();
loadScreenerUniverse();
loadState();
renderWeightSliders();
renderWatchlist();
renderOverviewMetrics();
