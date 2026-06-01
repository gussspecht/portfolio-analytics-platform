// PortfolioIQ state.js
// Extracted from the original app.js to keep the vanilla JS app easier to review.

// ========== STATE ==========
const state = {
  portfolio: [],      // [{ticker, name, weight, investAmount, data:[]}]
  stockCache: {},     // ticker -> {prices, returns, metrics}
  benchmarkCache: {},
  growthChart: null,
  allocChart: null,
  mcChart: null,
  mcDistChart: null,
  lastMonteCarloResults: null,
  lastStressResults: null,
  compareChart: null,
  activeSectors: new Set(['tech','finance','health','energy','consumer','etf']),
  aiSectors: new Set(['tech','finance','health','etf']),
  watchlist: [],
  initialInvestment: 10000,
};

const RISK_LABELS = ['Very Low','Low','Moderate','High','Very High'];
const STORAGE_KEY = 'portfolioiq:v2';
const SCREENER_CACHE_KEY = 'portfolioiq:screenerMetrics:v1';
const SCREENER_CACHE_MS = 24 * 60 * 60 * 1000;

// ========== KNOWN STOCKS DB ==========
const STOCKS_DB = [
  {t:'AAPL',n:'Apple Inc.',s:'tech'},{t:'MSFT',n:'Microsoft Corp.',s:'tech'},{t:'NVDA',n:'NVIDIA Corp.',s:'tech'},
  {t:'GOOGL',n:'Alphabet Inc.',s:'tech'},{t:'META',n:'Meta Platforms',s:'tech'},{t:'AMZN',n:'Amazon.com Inc.',s:'tech'},
  {t:'TSLA',n:'Tesla Inc.',s:'tech'},{t:'AMD',n:'Advanced Micro Devices',s:'tech'},{t:'INTC',n:'Intel Corp.',s:'tech'},
  {t:'CRM',n:'Salesforce Inc.',s:'tech'},{t:'ORCL',n:'Oracle Corp.',s:'tech'},{t:'ADBE',n:'Adobe Inc.',s:'tech'},
  {t:'NFLX',n:'Netflix Inc.',s:'tech'},{t:'SHOP',n:'Shopify Inc.',s:'tech'},{t:'PLTR',n:'Palantir Technologies',s:'tech'},
  {t:'JPM',n:'JPMorgan Chase',s:'finance'},{t:'BAC',n:'Bank of America',s:'finance'},{t:'GS',n:'Goldman Sachs',s:'finance'},
  {t:'MS',n:'Morgan Stanley',s:'finance'},{t:'V',n:'Visa Inc.',s:'finance'},{t:'MA',n:'Mastercard Inc.',s:'finance'},
  {t:'BRK-B',n:'Berkshire Hathaway',s:'finance'},{t:'C',n:'Citigroup Inc.',s:'finance'},{t:'WFC',n:'Wells Fargo',s:'finance'},
  {t:'JNJ',n:'Johnson & Johnson',s:'health'},{t:'UNH',n:'UnitedHealth Group',s:'health'},{t:'PFE',n:'Pfizer Inc.',s:'health'},
  {t:'MRK',n:'Merck & Co.',s:'health'},{t:'ABBV',n:'AbbVie Inc.',s:'health'},{t:'LLY',n:'Eli Lilly',s:'health'},
  {t:'BMY',n:'Bristol-Myers Squibb',s:'health'},{t:'AMGN',n:'Amgen Inc.',s:'health'},{t:'GILD',n:'Gilead Sciences',s:'health'},
  {t:'XOM',n:'ExxonMobil Corp.',s:'energy'},{t:'CVX',n:'Chevron Corp.',s:'energy'},{t:'COP',n:'ConocoPhillips',s:'energy'},
  {t:'SLB',n:'Schlumberger Ltd.',s:'energy'},{t:'EOG',n:'EOG Resources',s:'energy'},
  {t:'WMT',n:'Walmart Inc.',s:'consumer'},{t:'AMZN',n:'Amazon.com',s:'consumer'},{t:'PG',n:"Procter & Gamble",s:'consumer'},
  {t:'KO',n:'Coca-Cola Co.',s:'consumer'},{t:'PEP',n:'PepsiCo Inc.',s:'consumer'},{t:'MCD',n:"McDonald's Corp.",s:'consumer'},
  {t:'COST',n:'Costco Wholesale',s:'consumer'},{t:'NKE',n:'Nike Inc.',s:'consumer'},
  {t:'SPY',n:'SPDR S&P 500 ETF',s:'etf'},{t:'QQQ',n:'Invesco Nasdaq 100',s:'etf'},{t:'VTI',n:'Vanguard Total Market',s:'etf'},
  {t:'IWM',n:'iShares Russell 2000',s:'etf'},{t:'GLD',n:'SPDR Gold Shares',s:'etf'},{t:'AGG',n:'iShares Core US Bond',s:'etf'},
  {t:'VNQ',n:'Vanguard Real Estate',s:'etf'},{t:'ARKK',n:'ARK Innovation ETF',s:'etf'},{t:'XLF',n:'Financial Select SPDR',s:'etf'},
  {t:'PETR4.SA',n:'Petrobras (BR)',s:'energy'},{t:'VALE3.SA',n:'Vale SA (BR)',s:'materials'},{t:'ITUB4.SA',n:'Itaú Unibanco (BR)',s:'finance'},
  {t:'BBDC4.SA',n:'Bradesco (BR)',s:'finance'},{t:'WEGE3.SA',n:'Weg SA (BR)',s:'industrial'},
  {t:'BTC-USD',n:'Bitcoin USD',s:'crypto'},{t:'ETH-USD',n:'Ethereum USD',s:'crypto'},
];

const BRAZIL_MARKET_STOCKS = [
  {t:'ABEV3.SA',n:'Ambev ON',s:'Consumer Defensive',searchSector:'consumer',mc:35e9,pe:14,div:6,h52:15},
  {t:'BBAS3.SA',n:'Banco do Brasil ON',s:'Financial Services',searchSector:'finance',mc:33e9,pe:5,div:9,h52:33},
  {t:'B3SA3.SA',n:'B3 Brasil Bolsa Balcao ON',s:'Financial Services',searchSector:'finance',mc:14e9,pe:15,div:4,h52:15},
  {t:'BPAC11.SA',n:'BTG Pactual Units',s:'Financial Services',searchSector:'finance',mc:32e9,pe:14,div:2,h52:38},
  {t:'SANB11.SA',n:'Santander Brasil Units',s:'Financial Services',searchSector:'finance',mc:20e9,pe:14,div:5,h52:33},
  {t:'BBSE3.SA',n:'BB Seguridade ON',s:'Financial Services',searchSector:'finance',mc:13e9,pe:9,div:8,h52:37},
  {t:'ELET3.SA',n:'Eletrobras ON',s:'Utilities',searchSector:'utilities',mc:18e9,pe:8,div:1,h52:46},
  {t:'ELET6.SA',n:'Eletrobras PNB',s:'Utilities',searchSector:'utilities',mc:15e9,pe:8,div:1,h52:50},
  {t:'EQTL3.SA',n:'Equatorial Energia ON',s:'Utilities',searchSector:'utilities',mc:12e9,pe:20,div:1,h52:36},
  {t:'SBSP3.SA',n:'Sabesp ON',s:'Utilities',searchSector:'utilities',mc:12e9,pe:12,div:1.5,h52:100},
  {t:'CMIG4.SA',n:'Cemig PN',s:'Utilities',searchSector:'utilities',mc:6e9,pe:6,div:8,h52:15},
  {t:'TAEE11.SA',n:'Taesa Units',s:'Utilities',searchSector:'utilities',mc:4e9,pe:8,div:8,h52:38},
  {t:'PRIO3.SA',n:'PRIO ON',s:'Energy',searchSector:'energy',mc:8e9,pe:12,div:0,h52:55},
  {t:'UGPA3.SA',n:'Ultrapar ON',s:'Energy',searchSector:'energy',mc:5e9,pe:14,div:2,h52:32},
  {t:'VBBR3.SA',n:'Vibra Energia ON',s:'Energy',searchSector:'energy',mc:5e9,pe:10,div:4,h52:28},
  {t:'SUZB3.SA',n:'Suzano ON',s:'Materials',searchSector:'materials',mc:15e9,pe:8,div:2,h52:65},
  {t:'GGBR4.SA',n:'Gerdau PN',s:'Materials',searchSector:'materials',mc:8e9,pe:6,div:6,h52:28},
  {t:'CSNA3.SA',n:'CSN ON',s:'Materials',searchSector:'materials',mc:4e9,pe:8,div:4,h52:22},
  {t:'USIM5.SA',n:'Usiminas PNA',s:'Materials',searchSector:'materials',mc:2e9,pe:7,div:3,h52:12},
  {t:'KLBN11.SA',n:'Klabin Units',s:'Materials',searchSector:'materials',mc:7e9,pe:12,div:4,h52:24},
  {t:'EMBR3.SA',n:'Embraer ON',s:'Industrials',searchSector:'industrial',mc:7e9,pe:28,div:0,h52:55},
  {t:'RAIL3.SA',n:'Rumo ON',s:'Industrials',searchSector:'industrial',mc:7e9,pe:24,div:0.5,h52:26},
  {t:'RENT3.SA',n:'Localiza ON',s:'Consumer Cyclical',searchSector:'consumer',mc:9e9,pe:22,div:1,h52:70},
  {t:'LREN3.SA',n:'Lojas Renner ON',s:'Consumer Cyclical',searchSector:'consumer',mc:3e9,pe:16,div:3,h52:20},
  {t:'MGLU3.SA',n:'Magazine Luiza ON',s:'Consumer Cyclical',searchSector:'consumer',mc:1e9,pe:0,div:0,h52:16},
  {t:'ASAI3.SA',n:'Assai ON',s:'Consumer Defensive',searchSector:'consumer',mc:3e9,pe:14,div:0,h52:16},
  {t:'CRFB3.SA',n:'Carrefour Brasil ON',s:'Consumer Defensive',searchSector:'consumer',mc:3e9,pe:12,div:2,h52:13},
  {t:'RADL3.SA',n:'Raia Drogasil ON',s:'Healthcare',searchSector:'health',mc:10e9,pe:30,div:1,h52:30},
  {t:'HAPV3.SA',n:'Hapvida ON',s:'Healthcare',searchSector:'health',mc:5e9,pe:0,div:0,h52:6},
  {t:'VIVT3.SA',n:'Telefonica Brasil ON',s:'Communication Services',searchSector:'communication',mc:15e9,pe:14,div:5,h52:56},
  {t:'TIMS3.SA',n:'TIM Brasil ON',s:'Communication Services',searchSector:'communication',mc:8e9,pe:13,div:5,h52:20},
  {t:'TOTS3.SA',n:'Totvs ON',s:'Technology',searchSector:'tech',mc:4e9,pe:28,div:1,h52:35},
  {t:'LWSA3.SA',n:'Locaweb ON',s:'Technology',searchSector:'tech',mc:0.5e9,pe:0,div:0,h52:6},
  {t:'JBSS3.SA',n:'JBS ON',s:'Consumer Defensive',searchSector:'consumer',mc:14e9,pe:10,div:5,h52:42},
  {t:'BRFS3.SA',n:'BRF ON',s:'Consumer Defensive',searchSector:'consumer',mc:5e9,pe:18,div:0,h52:25},
  {t:'BOVA11.SA',n:'iShares Ibovespa ETF',s:'ETF',searchSector:'etf',mc:8e9,pe:0,div:0,h52:145},
  {t:'SMAL11.SA',n:'iShares Small Cap ETF',s:'ETF',searchSector:'etf',mc:1e9,pe:0,div:0,h52:130},
  {t:'IVVB11.SA',n:'S&P 500 Brazil ETF',s:'ETF',searchSector:'etf',mc:2e9,pe:0,div:0,h52:380},
];

STOCKS_DB.push(...BRAZIL_MARKET_STOCKS.map(s=>({t:s.t,n:s.n,s:s.searchSector})));

const SECTOR_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4','#84cc16','#f97316','#ef4444','#14b8a6'];
