const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

const UNIVERSE = [
  {t:'AAPL',n:'Apple',s:'Technology',mc:3e12,pe:29.5,div:0.5,h52:237},{t:'MSFT',n:'Microsoft',s:'Technology',mc:3.1e12,pe:35.2,div:0.7,h52:468},
  {t:'NVDA',n:'NVIDIA',s:'Technology',mc:3.3e12,pe:55.1,div:0.03,h52:149},{t:'GOOGL',n:'Alphabet',s:'Technology',mc:2.2e12,pe:23.8,div:0,h52:207},
  {t:'META',n:'Meta',s:'Technology',mc:1.5e12,pe:28.4,div:0.5,h52:740},{t:'AMZN',n:'Amazon',s:'Technology',mc:2.3e12,pe:45.2,div:0,h52:242},
  {t:'TSLA',n:'Tesla',s:'Technology',mc:1.1e12,pe:180.5,div:0,h52:488},{t:'AMD',n:'Advanced Micro Devices',s:'Technology',mc:260e9,pe:48,div:0,h52:228},
  {t:'AVGO',n:'Broadcom',s:'Technology',mc:1.4e12,pe:36,div:1.1,h52:1440},{t:'ORCL',n:'Oracle',s:'Technology',mc:390e9,pe:34,div:1.0,h52:146},
  {t:'CRM',n:'Salesforce',s:'Technology',mc:290e9,pe:45,div:0.6,h52:318},{t:'ADBE',n:'Adobe',s:'Technology',mc:210e9,pe:32,div:0,h52:638},
  {t:'JPM',n:'JPMorgan',s:'Financial Services',mc:688e9,pe:13.2,div:2.2,h52:288},{t:'V',n:'Visa',s:'Financial Services',mc:620e9,pe:32.5,div:0.8,h52:321},
  {t:'MA',n:'Mastercard',s:'Financial Services',mc:498e9,pe:38.2,div:0.6,h52:574},{t:'BRK-B',n:'Berkshire',s:'Financial Services',mc:1.05e12,pe:21.4,div:0,h52:505},
  {t:'BAC',n:'Bank of America',s:'Financial Services',mc:310e9,pe:14,div:2.4,h52:48},{t:'GS',n:'Goldman Sachs',s:'Financial Services',mc:185e9,pe:16,div:2.1,h52:612},
  {t:'MS',n:'Morgan Stanley',s:'Financial Services',mc:170e9,pe:17,div:3.1,h52:136},{t:'C',n:'Citigroup',s:'Financial Services',mc:120e9,pe:12,div:3.2,h52:73},
  {t:'JNJ',n:'Johnson & Johnson',s:'Healthcare',mc:384e9,pe:15.8,div:3.1,h52:168},{t:'LLY',n:'Eli Lilly',s:'Healthcare',mc:780e9,pe:55.9,div:0.7,h52:972},
  {t:'UNH',n:'UnitedHealth',s:'Healthcare',mc:502e9,pe:22.3,div:1.6,h52:613},{t:'MRK',n:'Merck',s:'Healthcare',mc:320e9,pe:18,div:2.4,h52:134},
  {t:'ABBV',n:'AbbVie',s:'Healthcare',mc:300e9,pe:17,div:3.6,h52:207},{t:'PFE',n:'Pfizer',s:'Healthcare',mc:160e9,pe:14,div:5.8,h52:34},
  {t:'XOM',n:'ExxonMobil',s:'Energy',mc:488e9,pe:14.2,div:3.4,h52:126},{t:'CVX',n:'Chevron',s:'Energy',mc:267e9,pe:15.1,div:4.2,h52:169},
  {t:'COP',n:'ConocoPhillips',s:'Energy',mc:130e9,pe:13,div:2.7,h52:135},{t:'SLB',n:'Schlumberger',s:'Energy',mc:70e9,pe:17,div:2.0,h52:62},
  {t:'WMT',n:'Walmart',s:'Consumer Cyclical',mc:782e9,pe:38.5,div:1.0,h52:96},{t:'COST',n:'Costco',s:'Consumer Cyclical',mc:387e9,pe:54.2,div:0.7,h52:1077},
  {t:'HD',n:'Home Depot',s:'Consumer Cyclical',mc:360e9,pe:24,div:2.4,h52:421},{t:'MCD',n:"McDonald's",s:'Consumer Cyclical',mc:210e9,pe:25,div:2.3,h52:318},
  {t:'KO',n:'Coca-Cola',s:'Consumer Defensive',mc:270e9,pe:25,div:3.1,h52:74},{t:'PEP',n:'PepsiCo',s:'Consumer Defensive',mc:240e9,pe:24,div:3.0,h52:183},
  {t:'PG',n:'Procter & Gamble',s:'Consumer Defensive',mc:390e9,pe:26,div:2.4,h52:180},{t:'NEE',n:'NextEra Energy',s:'Utilities',mc:160e9,pe:22,div:2.7,h52:86},
  {t:'CAT',n:'Caterpillar',s:'Industrials',mc:170e9,pe:18,div:1.6,h52:418},{t:'DE',n:'Deere',s:'Industrials',mc:115e9,pe:14,div:1.4,h52:469},
  {t:'SPY',n:'SPDR S&P 500 ETF',s:'ETF',mc:500e9,pe:24,div:1.2,h52:620},{t:'QQQ',n:'Invesco Nasdaq 100',s:'ETF',mc:300e9,pe:31,div:0.6,h52:540},
  {t:'VTI',n:'Vanguard Total Market',s:'ETF',mc:430e9,pe:24,div:1.3,h52:305},{t:'GLD',n:'SPDR Gold Shares',s:'ETF',mc:75e9,pe:0,div:0,h52:240},
  {t:'AGG',n:'iShares Core US Bond',s:'ETF',mc:110e9,pe:0,div:3.5,h52:103},{t:'IWM',n:'iShares Russell 2000',s:'ETF',mc:70e9,pe:18,div:1.3,h52:244},
  {t:'PETR4.SA',n:'Petrobras PN',s:'Energy',mc:95e9,pe:5,div:12,h52:44},{t:'VALE3.SA',n:'Vale ON',s:'Materials',mc:55e9,pe:7,div:7,h52:78},
  {t:'ITUB4.SA',n:'Itaú Unibanco PN',s:'Financial Services',mc:70e9,pe:9,div:5,h52:36},{t:'BBDC4.SA',n:'Bradesco PN',s:'Financial Services',mc:30e9,pe:8,div:4,h52:17},
  {t:'WEGE3.SA',n:'WEG ON',s:'Industrials',mc:35e9,pe:32,div:1.4,h52:46},
];

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function validTicker(ticker) {
  return /^[A-Z0-9.\-^=]{1,20}$/i.test(ticker);
}

async function fetchYahooChart(ticker, range, interval, period1, period2) {
  const safeTicker = encodeURIComponent(ticker.toUpperCase());
  const query = period1 && period2
    ? `period1=${encodeURIComponent(period1)}&period2=${encodeURIComponent(period2)}&interval=${encodeURIComponent(interval)}`
    : `range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${safeTicker}?${query}&events=div,split`;
  const key = period1 && period2 ? `chart:${ticker}:${period1}:${period2}:${interval}` : `chart:${ticker}:${range}:${interval}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 PortfolioIQ/1.0',
      Accept: 'application/json,text/plain,*/*',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Yahoo returned HTTP ${response.status}: ${text.slice(0, 160)}`);
  }
  const data = JSON.parse(text);
  if (data.chart?.error) {
    throw new Error(data.chart.error.description || 'Yahoo chart error');
  }
  cache.set(key, { time: Date.now(), data });
  return data;
}

async function handleChart(req, res, url) {
  const ticker = (url.searchParams.get('ticker') || '').trim().toUpperCase();
  const range = url.searchParams.get('range') || '2y';
  const interval = url.searchParams.get('interval') || '1d';
  const period1 = url.searchParams.get('period1');
  const period2 = url.searchParams.get('period2');
  if (!validTicker(ticker)) {
    send(res, 400, { error: 'Invalid ticker symbol.' });
    return;
  }
  if ((period1 && !/^\d{1,12}$/.test(period1)) || (period2 && !/^\d{1,12}$/.test(period2))) {
    send(res, 400, { error: 'Invalid date window.' });
    return;
  }

  try {
    send(res, 200, await fetchYahooChart(ticker, range, interval, period1, period2));
  } catch (error) {
    send(res, 502, { error: error.message || 'Could not fetch market data.' });
  }
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function handleAI(req, res) {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const { prompt } = await readRequestJson(req);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      send(res, 200, {
        setupRequired: true,
        error: 'OPENAI_API_KEY is not configured on the local server.',
      });
      return;
    }
    if (!prompt) {
      send(res, 400, { error: 'Prompt is required.' });
      return;
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.2',
        input: [
          {
            role: 'system',
            content: 'You are PortfolioIQ, a careful educational portfolio analytics assistant. Give practical, numerate analysis without claiming to be a licensed financial advisor.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      send(res, response.status, { error: data?.error?.message || `OpenAI returned HTTP ${response.status}` });
      return;
    }
    const text = data.output_text ||
      (data.output || [])
        .flatMap((item) => item.content || [])
        .map((part) => part.text || '')
        .join('');
    send(res, 200, { text, raw: data });
  } catch (error) {
    send(res, 500, { error: error.message || 'AI request failed.' });
  }
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? '/portfolio_analytics_platform.html' : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/chart') {
    await handleChart(req, res, url);
    return;
  }
  if (url.pathname === '/api/health') {
    send(res, 200, {
      ok: true,
      service: 'PortfolioIQ backend',
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || 'gpt-5.2',
    });
    return;
  }
  if (url.pathname === '/api/universe') {
    send(res, 200, { universe: UNIVERSE, count: UNIVERSE.length });
    return;
  }
  if (url.pathname === '/api/ai') {
    await handleAI(req, res);
    return;
  }
  await serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`PortfolioIQ running at http://localhost:${PORT}/portfolio_analytics_platform.html`);
});
