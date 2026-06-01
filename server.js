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
const STOCK_UNIVERSE_PATH = path.join(ROOT, 'src', 'data', 'stockUniverse.json');
let stockUniverseCache = null;

async function loadStockUniverse() {
  if (stockUniverseCache) return stockUniverseCache;
  const raw = await fs.readFile(STOCK_UNIVERSE_PATH, 'utf8');
  const data = JSON.parse(raw);
  const universe = Array.isArray(data.universe) ? data.universe : [];
  const search = Array.isArray(data.search) ? data.search : [];
  stockUniverseCache = {
    ...data,
    universe,
    search,
    count: universe.length,
    searchCount: search.length,
  };
  return stockUniverseCache;
}

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

async function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
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
      advisorMode: 'local-rule-based',
    });
    return;
  }
  if (url.pathname === '/api/universe') {
    try {
      send(res, 200, await loadStockUniverse());
    } catch (error) {
      send(res, 500, { error: error.message || 'Could not load stock universe.' });
    }
    return;
  }
  await serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`PortfolioIQ running at http://localhost:${PORT}/index.html`);
});
