// PortfolioIQ data/yahoo.js
// Extracted from the original app.js to keep the vanilla JS app easier to review.

// ========== YAHOO FINANCE PROXY ==========
async function fetchJSONWithFallback(url){
  const parsed = new URL(url);
  const ticker = parsed.pathname.split('/').pop();
  const localApi = `/api/chart?ticker=${encodeURIComponent(ticker)}&range=${encodeURIComponent(parsed.searchParams.get('range')||'2y')}&interval=${encodeURIComponent(parsed.searchParams.get('interval')||'1d')}`;
  const attempts = [
    localApi,
    url,
    'https://api.allorigins.win/raw?url='+encodeURIComponent(url),
    'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(url),
  ];

  let lastError;
  for(const attempt of attempts){
    try{
      const r = await fetch(attempt,{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();
      if(data?.error) throw new Error(data.error);
      if(data?.chart?.error) throw new Error(data.chart.error.description||'Yahoo error');
      return data;
    } catch(e){
      lastError = e;
    }
  }
  throw lastError||new Error('Unable to fetch data');
}

async function fetchYahooData(ticker, period='2y'){
  const intervals = {
    '1y':{'range':'1y','interval':'1d'},
    '2y':{'range':'2y','interval':'1d'},
    '3y':{'range':'3y','interval':'1d'},
    '5y':{'range':'5y','interval':'1d'},
  };
  const {range,interval} = intervals[period]||intervals['2y'];
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&events=div,split`;
  try{
    const d = await fetchJSONWithFallback(url);
    const result = d.chart.result?.[0];
    if(!result?.timestamp?.length) throw new Error('No chart data');
    const timestamps = result.timestamp.map(t=>new Date(t*1000));
    const closes = result.indicators.adjclose?result.indicators.adjclose[0].adjclose:result.indicators.quote[0].close;
    const prices = closes.map((c,i)=>({date:timestamps[i],close:c})).filter(x=>x.close!=null);
    return prices;
  } catch(e){
    return null;
  }
}

function unixSeconds(dateStr,endOfDay=false){
  const suffix=endOfDay?'T23:59:59Z':'T00:00:00Z';
  return Math.floor(new Date(dateStr+suffix).getTime()/1000);
}

async function fetchYahooDataWindow(ticker,startDate,endDate){
  const period1=unixSeconds(startDate,false);
  const period2=unixSeconds(endDate,true);
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d&events=div,split`;
  const attempts = [
    `/api/chart?ticker=${encodeURIComponent(ticker)}&period1=${period1}&period2=${period2}&interval=1d`,
    url,
    'https://api.allorigins.win/raw?url='+encodeURIComponent(url),
  ];
  let lastError;
  for(const attempt of attempts){
    try{
      const r=await fetch(attempt,{cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();
      if(d?.error)throw new Error(d.error);
      if(d?.chart?.error)throw new Error(d.chart.error.description||'Yahoo error');
      const result=d.chart.result?.[0];
      if(!result?.timestamp?.length)throw new Error('No chart data');
      const timestamps=result.timestamp.map(t=>new Date(t*1000));
      const closes=result.indicators.adjclose?result.indicators.adjclose[0].adjclose:result.indicators.quote[0].close;
      return closes.map((c,i)=>({date:timestamps[i],close:c})).filter(x=>x.close!=null);
    }catch(e){lastError=e;}
  }
  throw lastError||new Error('Unable to fetch date-window data');
}

async function getQuickQuote(ticker){
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
  try{
    const d = await fetchJSONWithFallback(url);
    const res = d.chart.result[0];
    const meta = res.meta;
    return {
      price: meta.regularMarketPrice,
      change: meta.regularMarketPrice - meta.previousClose,
      changePct: (meta.regularMarketPrice - meta.previousClose)/meta.previousClose*100,
      name: meta.shortName||ticker,
      currency: meta.currency||'USD',
    };
  } catch(e){return null;}
}
