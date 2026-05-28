# PortfolioIQ

PortfolioIQ is a local web app with a small Node backend. Run it through the backend so Yahoo Finance data works reliably. The portfolio diagnosis system works fully locally without OpenAI, API keys, or any external AI service.

## Start

```bash
node server.js
```

Then open:

```text
http://localhost:4173/portfolio_analytics_platform.html
```

If your environment has npm available, this also works:

```bash
npm start
```

## Why the Backend Exists

Browsers block direct Yahoo Finance requests with CORS. The backend exposes `/api/chart`, fetches Yahoo data server-side with normal request headers, caches responses briefly, and returns data to the page.

## Local Portfolio Diagnosis

PortfolioIQ includes a rule-based Portfolio Diagnosis section. It creates a structured diagnosis from the app's own metrics:

- holdings and allocation weights
- annualized return, volatility, Sharpe, Sortino, and max drawdown
- historical VaR, CVaR / Expected Shortfall, and downside deviation
- beta, alpha approximation, and tracking difference versus the selected benchmark
- diversification score, HHI, correlations, sector exposure, and hidden concentration risk
- historical stress-test results when available
- Monte Carlo probability of loss, target probability, percentiles, and final value CVaR when available
- data reliability warnings

The diagnosis is deterministic: it applies transparent finance/statistics thresholds to calculated metrics and shows which score components helped or hurt the overall rating. It is designed to feel like an intelligent portfolio report while remaining fully auditable and free to run locally.

## Optional Legacy Endpoint

The backend still contains an optional `/api/ai` endpoint for experimentation, but the main PortfolioIQ product does not depend on it. You do not need `OPENAI_API_KEY` to use the app, the Portfolio Diagnosis, Monte Carlo simulator, Risk Lab, stress tests, screener, or charts.
