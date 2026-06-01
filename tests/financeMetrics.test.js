const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = {
  console,
  Math,
  Date,
  Array,
  Number,
  String,
  Set,
  Map,
  document: {
    getElementById(id) {
      if (id === 'rfr-slider') return { value: '0' };
      return { value: '', textContent: '', innerHTML: '', className: '' };
    },
  },
};
vm.createContext(context);

[
  'src/js/state.js',
  'src/js/utils/formatting.js',
  'src/js/analytics/riskMetrics.js',
  'src/js/analytics/monteCarlo.js',
  'src/js/analytics/stressTesting.js',
].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
});

function run(code) {
  return vm.runInContext(code, context);
}

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

// Annualized return compounds the observed return path into a yearly growth rate.
approx(run("annualizedReturn(Array.from({length:252},()=>({return:0.001})))"), (1.001 ** 252) - 1, 1e-12);

// Volatility uses population standard deviation of periodic returns, annualized by sqrt(252) for undated daily series.
approx(run("annualizedVolatility([{return:0.01},{return:-0.01}])"), 0.01 * Math.sqrt(252), 1e-12);

// Sharpe is excess return per unit of annualized volatility.
approx(run("sharpeRatio(0.12,0.20,0.02)"), 0.5, 1e-12);

// Sortino penalizes downside volatility only, so it should be finite and larger than Sharpe when upside moves dominate.
const sortino = run("sortinoRatio([{return:0.08},{return:-0.02},{return:0.04},{return:-0.01}],0.12,0.02)");
assert.ok(Number.isFinite(sortino) && sortino > 0.5);

// Max drawdown is the worst peak-to-trough decline in the compounded path.
approx(run("maxDrawdown([{return:0.10},{return:-0.20},{return:0.05}])"), -0.2, 1e-12);

// Date alignment should only use dates shared by every selected asset.
run(`
state.portfolio=[
  {ticker:'AAA',name:'AAA',weight:50},
  {ticker:'BBB',name:'BBB',weight:50}
];
state.stockCache={
  AAA:{returnSeries:[{date:'2024-01-02',return:0.10},{date:'2024-01-03',return:0.20},{date:'2024-01-04',return:0.30}],warnings:[]},
  BBB:{returnSeries:[{date:'2024-01-03',return:0.04},{date:'2024-01-04',return:-0.02},{date:'2024-01-05',return:0.01}],warnings:[]}
};
`);
const aligned = run("getPortfolioAnalytics(state.portfolio)");
assert.deepStrictEqual(Array.from(aligned.portfolioDates), ['2024-01-03', '2024-01-04']);
approx(aligned.portfolioReturnSeries[0].return, 0.12, 1e-12);
approx(aligned.portfolioReturnSeries[1].return, 0.14, 1e-12);

// Percentile logic is used by Monte Carlo outputs and follows the app's floor-index convention.
assert.strictEqual(run("percentile([1,2,3,4,5,6,7,8,9,10],50)"), 6);
assert.strictEqual(run("percentile([1,2,3,4,5,6,7,8,9,10],5)"), 1);

// Stress-window alignment should replay only common crisis-window dates across included holdings.
const stress = run(`
alignStressReturnSeries([
  {ticker:'AAA',returnSeries:[{date:'2020-02-19',return:-0.10},{date:'2020-02-20',return:0.05}]},
  {ticker:'BBB',returnSeries:[{date:'2020-02-20',return:-0.02},{date:'2020-02-21',return:0.01}]}
],[0.25,0.75])
`);
assert.deepStrictEqual(Array.from(stress.portfolioSeries.map((x) => x.date)), ['2020-02-20']);
approx(stress.portfolioSeries[0].return, -0.0025, 1e-12);

// Currency diagnostics flag meaningful mixed USD/BRL listed exposure.
const fx = run(`
calculateCurrencyExposure([
  {ticker:'AAPL'},
  {ticker:'PETR4.SA'},
  {ticker:'IVVB11.SA'}
],[0.4,0.35,0.25])
`);
assert.strictEqual(fx.hasMixedCurrencies, true);
assert.ok(run(`getCurrencyWarnings(${JSON.stringify(fx)}).length`) >= 2);

console.log('Finance metric checks passed');
