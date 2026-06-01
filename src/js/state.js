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

// ========== STOCK UNIVERSE ==========
// Populated from src/data/stockUniverse.json through /api/universe so frontend search,
// screener metadata, and backend responses share one source of truth.
const STOCKS_DB = [];

const SECTOR_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4','#84cc16','#f97316','#ef4444','#14b8a6'];
