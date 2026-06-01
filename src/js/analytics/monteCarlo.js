// PortfolioIQ analytics/monteCarlo.js
// Extracted from the original app.js to keep the vanilla JS app easier to review.

// ========== MONTE CARLO ==========
let mcChartInst=null,mcDistChartInst=null;
function monteCarloModelLabel(model){
  return ({
    bootstrap:'Historical Bootstrap',
    covariance:'Covariance Matrix Simulation',
    fatTail:'Fat-Tail Stress Model',
    normal:'Normal Approximation',
  })[model]||'Normal Approximation';
}
function choleskyDecomposition(matrix){
  const n=matrix.length;
  if(!n)return null;
  // Cholesky turns a covariance matrix into a lower-triangular matrix that can transform independent random shocks into correlated asset shocks.
  for(let attempt=0;attempt<5;attempt++){
    const jitter=attempt===0?0:1e-8*(10**attempt);
    const l=Array.from({length:n},()=>Array(n).fill(0));
    let ok=true;
    for(let i=0;i<n;i++){
      for(let j=0;j<=i;j++){
        let sum=matrix[i][j]+(i===j?jitter:0);
        for(let k=0;k<j;k++)sum-=l[i][k]*l[j][k];
        if(i===j){
          if(sum<=0||!Number.isFinite(sum)){ok=false;break;}
          l[i][j]=Math.sqrt(sum);
        } else {
          l[i][j]=sum/l[j][j];
        }
      }
      if(!ok)break;
    }
    if(ok)return l;
  }
  return null;
}
function buildCovarianceSimulationModel(analytics){
  if(!analytics?.validStocks?.length||!analytics?.assetReturnsByTicker)return null;
  const tickers=analytics.validStocks.map(p=>p.ticker);
  const rows=[];
  const len=Math.min(...tickers.map(t=>(analytics.assetReturnsByTicker[t]||[]).length));
  for(let i=0;i<len;i++){
    const row=tickers.map(t=>analytics.assetReturnsByTicker[t]?.[i]?.return);
    if(row.every(Number.isFinite))rows.push(row);
  }
  if(rows.length<30)return null;
  const means=tickers.map((_,col)=>mean(rows.map(row=>row[col])));
  const cov=means.map((mi,i)=>means.map((mj,j)=>{
    // Covariance captures how two assets move together; positive covariance means joint drawdowns are more likely than independent models imply.
    return rows.reduce((sum,row)=>sum+(row[i]-mi)*(row[j]-mj),0)/Math.max(1,rows.length-1);
  }));
  const chol=choleskyDecomposition(cov);
  if(!chol)return null;
  return {tickers,weights:analytics.weights,means,chol,observations:rows.length};
}
function drawCovariancePortfolioReturn(covModel,scenarioCfg){
  const shocks=covModel.tickers.map(()=>randn());
  const assetReturns=covModel.tickers.map((_,i)=>{
    let correlatedShock=0;
    for(let j=0;j<=i;j++)correlatedShock+=covModel.chol[i][j]*shocks[j];
    return covModel.means[i]*scenarioCfg.returnScale+correlatedShock*scenarioCfg.volScale;
  });
  return assetReturns.reduce((sum,r,i)=>sum+r*(covModel.weights[i]||0),0);
}
function formatAssumptions({initial,days,nsims,scenarioCfg,model,annualContrib,inflation,shockCfg,covModel,target}){
  const horizon=(days/252).toFixed(days%252===0?0:1);
  const covText=model==='covariance'
    ? (covModel?`Covariance-aware: ${covModel.tickers.length} assets and ${covModel.observations} aligned observations.`:'Covariance-aware requested, but insufficient aligned asset data forced a normal fallback.')
    : `${monteCarloModelLabel(model)} uses the aligned historical portfolio return series.`;
  return `
    <div><b>Initial investment:</b> ${fmt$(initial)} · <b>Target:</b> ${fmt$(target)}</div>
    <div><b>Horizon:</b> ${horizon} years · <b>Simulations:</b> ${nsims.toLocaleString('en-US')} paths · <b>Contribution:</b> ${fmt$(annualContrib)} / year</div>
    <div><b>Return model:</b> ${monteCarloModelLabel(model)} · <b>Scenario:</b> ${scenarioCfg.label} · <b>Shock:</b> ${shockCfg.label}</div>
    <div><b>Inflation assumption:</b> ${(inflation*100).toFixed(1)}% annually · ${covText}</div>
    <div style="margin-top:8px">Monte Carlo results are distributions, not predictions. Covariance matters because assets often move together, historical returns may not represent the future, and fat tails matter because crashes happen more often than a normal curve suggests.</div>
  `;
}
async function runMonteCarlo(){
  const valid=state.portfolio.filter(p=>state.stockCache[p.ticker]);
  if(!valid.length){alert('Build a portfolio first!');return;}

  const initial=parseFloat(document.getElementById('mc-invest').value)||10000;
  const target=parseFloat(document.getElementById('mc-target').value)||initial*1.5;
  const days=parseInt(document.getElementById('mc-horizon').value)||504;
  const nsims=parseInt(document.getElementById('mc-sims').value)||500;
  const scenario=document.getElementById('mc-scenario').value;
  const model=document.getElementById('mc-model').value;
  const shock=document.getElementById('mc-shock').value;
  const inflation=(parseFloat(document.getElementById('mc-inflation').value)||0)/100;
  const annualContrib=parseFloat(document.getElementById('mc-contrib').value)||0;
  const runBtn=document.getElementById('mc-run-btn');
  if(runBtn){runBtn.disabled=true;runBtn.textContent='Running simulation... 0%';}

  const totalWeight=state.portfolio.reduce((a,p)=>a+(p.weight||0),0);
  const analytics=getPortfolioAnalytics(valid);
  const historicalReturns=analytics?.portfolioReturns?.length?analytics.portfolioReturns:[];
  let portMeanDaily=historicalReturns.length?mean(historicalReturns):0;
  let portStdDaily=historicalReturns.length?std(historicalReturns):0;
  if(!historicalReturns.length){
    valid.forEach(p=>{
      const c=state.stockCache[p.ticker];
      const w=weightShare(p,totalWeight,valid.length);
      portMeanDaily+=mean(c.returns)*w;
      portStdDaily+=std(c.returns)*w;
    });
  }
  const scenarioMap={
    conservative:{returnScale:0.65,volScale:1.25,label:'Conservative'},
    base:{returnScale:1,volScale:1,label:'Base Case'},
    optimistic:{returnScale:1.15,volScale:0.95,label:'Optimistic'},
  };
  const scenarioCfg=scenarioMap[scenario]||scenarioMap.base;
  const covarianceModel=model==='covariance'?buildCovarianceSimulationModel(analytics):null;
  portMeanDaily*=scenarioCfg.returnScale;
  portStdDaily*=scenarioCfg.volScale;

  const dailyContrib=annualContrib/252;
  const years=days/252;
  const shockMap={
    none:{loss:0,label:'No explicit extra shock'},
    recession:{loss:-0.24,label:'Recession shock: one-time 24% portfolio hit'},
    inflation:{loss:-0.13,label:'Inflation/margin shock: one-time 13% portfolio hit'},
    rates:{loss:-0.17,label:'Rate spike shock: one-time 17% portfolio hit'},
    company:{loss:-0.10-Math.min(0.15,(analytics?.hhi||0)*0.25),label:'Company-specific shock scaled by concentration'},
  };
  const shockCfg=shockMap[shock]||shockMap.none;

  function drawReturn(day,shockDay){
    let r;
    if(model==='covariance'&&covarianceModel){
      // Covariance matrix simulation draws correlated asset returns so holdings can crash or rally together instead of moving independently.
      r=drawCovariancePortfolioReturn(covarianceModel,scenarioCfg);
    } else if(model==='bootstrap'&&historicalReturns.length){
      // Bootstrap simulation resamples real aligned portfolio returns, preserving empirical skew and clustered historical outcomes better than a formula.
      r=historicalReturns[Math.floor(Math.random()*historicalReturns.length)]*scenarioCfg.returnScale;
    } else {
      // Normal approximation uses the historical mean and volatility as a simple bell-curve model; it is fast but understates extreme market tails.
      r=portMeanDaily+portStdDaily*randn();
    }
    if(model==='fatTail'){
      // Fat-tail mode adds rare outsized shocks because large market moves occur more often than a pure normal distribution suggests.
      if(Math.random()<0.025)r-=Math.abs(randn())*portStdDaily*3.5;
      if(Math.random()<0.01)r+=Math.abs(randn())*portStdDaily*2;
    }
    if(shockCfg.loss&&day===shockDay)r+=shockCfg.loss;
    return Math.max(-0.85,r);
  }

  // Run simulations
  const finalValues=[];
  const realFinalValues=[];
  const samplePaths=[];
  const sampleCount=Math.min(80,nsims);

  for(let s=0;s<nsims;s++){
    let val=initial;
    const path=[val];
    const shockDay=shockCfg.loss?Math.floor(days*(0.15+Math.random()*0.35)):-1;
    for(let d=0;d<days;d++){
      const r=drawReturn(d,shockDay);
      val=val*(1+r)+dailyContrib;
      if(s<sampleCount) path.push(val);
    }
    finalValues.push(val);
    realFinalValues.push(val/((1+inflation)**years));
    if(s<sampleCount) samplePaths.push(path);
    if(s%25===0){
      if(runBtn)runBtn.textContent='Running simulation... '+Math.round((s+1)/nsims*100)+'%';
      await yieldToBrowser();
    }
  }
  if(runBtn)runBtn.textContent='Drawing charts...';

  const expV=mean(finalValues);
  const med=percentile(finalValues,50);
  const best=percentile(finalValues,95);
  const worst=percentile(finalValues,5);
  const varVal=initial-worst;
  const realMed=percentile(realFinalValues,50);
  const totalContrib=initial+annualContrib*years;
  // Probability of loss compares final simulated wealth against total capital invested, not just the starting balance.
  const probLoss=finalValues.filter(v=>v<totalContrib).length/finalValues.length;
  const probTarget=finalValues.filter(v=>v>=target).length/finalValues.length;
  // Percentiles turn thousands of simulated endings into a readable distribution from downside tail to upside tail.
  const p5=percentile(finalValues,5),p25=percentile(finalValues,25),p50=percentile(finalValues,50),p75=percentile(finalValues,75),p95=percentile(finalValues,95);
  // Final value CVaR / Expected Shortfall averages the worst 5% endings, making severe downside more concrete than a cutoff alone.
  const tailCutoff=p5;
  const cvarTail=finalValues.filter(v=>v<=tailCutoff);
  const finalCvar=cvarTail.length?mean(cvarTail):tailCutoff;
  state.lastMonteCarloResults={
    initial,
    target,
    days,
    years,
    simulations:nsims,
    model,
    modelLabel:monteCarloModelLabel(model),
    scenario:scenarioCfg.label,
    shock:shockCfg.label,
    inflation,
    annualContribution:annualContrib,
    expectedValue:expV,
    medianValue:med,
    probabilityOfLoss:probLoss,
    probabilityOfTarget:probTarget,
    percentiles:{p5,p25,p50,p75,p95},
    finalValueCvar:finalCvar,
    lossThreshold:totalContrib,
  };
  let pvInvested=initial;
  for(let y=1;y<=Math.ceil(years);y++){
    const partial=Math.min(1,Math.max(0,years-(y-1)));
    pvInvested+=annualContrib*partial/((1+inflation)**Math.min(y,years));
  }
  const npv=realMed-pvInvested;
  const realProfit=realMed-totalContrib;

  document.getElementById('mc-expected').textContent=fmt$(expV);
  document.getElementById('mc-median').textContent=fmt$(med);
  document.getElementById('mc-best').textContent=fmt$(best);
  document.getElementById('mc-worst').textContent=fmt$(worst);
  document.getElementById('mc-var').textContent=fmt$(Math.max(0,varVal));
  document.getElementById('mc-real-median').textContent=fmt$(realMed);
  document.getElementById('mc-real-profit').textContent=(realProfit>=0?'+':'-')+fmt$(realProfit);
  document.getElementById('mc-real-profit').className='metric-val '+(realProfit>=0?'pos':'neg');
  document.getElementById('mc-npv').textContent=(npv>=0?'+':'-')+fmt$(npv);
  document.getElementById('mc-npv').className='metric-val '+(npv>=0?'pos':'neg');
  document.getElementById('mc-prob-loss').textContent=fmtPctPlain(probLoss*100);
  document.getElementById('mc-prob-loss').className='metric-val '+(probLoss>0.35?'neg':probLoss>0.15?'neu':'pos');
  document.getElementById('mc-prob-target').textContent=fmtPctPlain(probTarget*100);
  document.getElementById('mc-prob-target').className='metric-val '+(probTarget>=0.7?'pos':probTarget>=0.35?'neu':'neg');
  document.getElementById('mc-cvar').textContent=fmt$(finalCvar);
  document.getElementById('mc-loss-threshold').textContent=fmt$(totalContrib);
  document.getElementById('mc-p5').textContent=fmt$(p5);
  document.getElementById('mc-p25').textContent=fmt$(p25);
  document.getElementById('mc-p50').textContent=fmt$(p50);
  document.getElementById('mc-p75').textContent=fmt$(p75);
  document.getElementById('mc-p95').textContent=fmt$(p95);
  document.getElementById('mc-assumptions').innerHTML=formatAssumptions({initial,days,nsims,scenarioCfg,model,annualContrib,inflation,shockCfg,covModel:covarianceModel,target});

  // Draw path chart
  const labels=Array.from({length:days+1},(_,i)=>i);
  const datasets=samplePaths.map((path,i)=>({
    data:path,borderColor:finalValues[i]>initial?'rgba(59,130,246,0.15)':'rgba(239,68,68,0.15)',
    borderWidth:1,pointRadius:0,tension:0.2,fill:false,
  }));
  // Add median path
  datasets.push({label:'Median',data:Array.from({length:days+1},(_,i)=>initial*Math.exp((portMeanDaily)*i)),borderColor:'#f59e0b',borderWidth:2,pointRadius:0,tension:0.2,fill:false});
  datasets.push({label:'Inflation-adjusted median guide',data:Array.from({length:days+1},(_,i)=>initial*Math.exp((portMeanDaily-(Math.log(1+inflation)/252))*i)),borderColor:'#10b981',borderWidth:2,pointRadius:0,tension:0.2,fill:false,borderDash:[6,4]});

  if(mcChartInst)mcChartInst.destroy();
  mcChartInst=new Chart(document.getElementById('mcChart'),{
    type:'line',
    data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,
      animation:false,
      plugins:{legend:{display:false},tooltip:{enabled:false}},
      scales:{
        x:{ticks:{display:false},grid:{color:'#1a2340'}},
        y:{ticks:{color:'#4a6080',callback:v=>'$'+Math.round(v/1000)+'k'},grid:{color:'#1a2340'}}
      }
    }
  });

  // Distribution histogram
  const bins=30;
  const minV=Math.min(...finalValues),maxV=Math.max(...finalValues);
  const binSize=(maxV-minV)/bins||1;
  const counts=Array(bins).fill(0);
  finalValues.forEach(v=>{const bi=Math.min(Math.floor((v-minV)/binSize),bins-1);counts[bi]++;});
  const binLabels=Array.from({length:bins},(_,i)=>'$'+Math.round((minV+i*binSize)/1000)+'k');
  const binColors=Array.from({length:bins},(_,i)=>{
    const val=minV+i*binSize;
    return val<initial?'rgba(239,68,68,0.6)':'rgba(59,130,246,0.6)';
  });

  if(mcDistChartInst)mcDistChartInst.destroy();
  mcDistChartInst=new Chart(document.getElementById('mcDistChart'),{
    type:'bar',
    data:{labels:binLabels,datasets:[{label:'Simulations',data:counts,backgroundColor:binColors,borderColor:binColors,borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.parsed.y+' simulations'}}},
      scales:{x:{ticks:{color:'#4a6080',maxTicksLimit:8,font:{size:10}},grid:{display:false}},y:{ticks:{color:'#4a6080'},grid:{color:'#1a2340'},title:{display:true,text:'# Simulations',color:'#4a6080',font:{size:10}}}}
    }
  });
  const note=document.querySelector('#panel-montecarlo .footnote');
  if(note)note.textContent=`${scenarioCfg.label} / ${monteCarloModelLabel(model)} / ${shockCfg.label}. Real values discount by ${(inflation*100).toFixed(1)}% annual inflation. CVaR is a severe downside scenario, not a prediction.`;
  if(runBtn){runBtn.disabled=false;runBtn.textContent='🎲 Run Simulation';}
}

function randn(){
  let u=0,v=0;
  while(u===0)u=Math.random();while(v===0)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
