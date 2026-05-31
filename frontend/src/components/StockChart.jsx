/**
 * StockChart — uses Twelve Data API (8 req/min free tier, vs Polygon's 5/min).
 * Get a free key at https://twelvedata.com → paste it in TWELVE_DATA_KEY below.
 * Falls back to Polygon.io if Twelve Data key is left empty.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Chart from 'chart.js/auto'; // auto-registers ALL controllers, scales & elements
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, Loader2, Clock, Target } from 'lucide-react';

// ─── API config ────────────────────────────────────────────────────────────────
// Twelve Data: 800 req/day, 8 req/min free — https://twelvedata.com (recommended)
const TWELVE_DATA_KEY = '';                              // ← paste your key here
const POLYGON_KEY     = 'FqrP7pJkh6g_y10ZJpmcdgiu_NLigePw'; // fallback

const USE_TWELVE_DATA = TWELVE_DATA_KEY.length > 0;
const SLOT_MS    = USE_TWELVE_DATA ? 8_000  : 13_000;   // 8 s or 13 s per request
const CACHE_TTL  = 5 * 60_000;
const BACKOFF_MS = USE_TWELVE_DATA ? 30_000 : 65_000;

// ─── Module-level rate limiter & cache ────────────────────────────────────────
let nextSlotAt = 0;
const cache = new Map(); // symbol → { closes, dates, fetchedAt }

function getCached(symbol) {
  const e = cache.get(symbol);
  if (!e || Date.now() - e.fetchedAt > CACHE_TTL) { cache.delete(symbol); return null; }
  return e;
}

function reserveSlot() {
  const now  = Date.now();
  const slot = Math.max(nextSlotAt, now);
  nextSlotAt = slot + SLOT_MS;
  return slot;
}

function waitUntil(ms, signal) {
  const delay = ms - Date.now();
  if (delay <= 0) return Promise.resolve();
  return new Promise((res, rej) => {
    const t = setTimeout(res, delay);
    signal.addEventListener('abort',
      () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); },
      { once: true }
    );
  });
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchTwelveData(symbol, signal) {
  const url = `https://api.twelvedata.com/time_series`
    + `?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=90`
    + `&apikey=${TWELVE_DATA_KEY}`;
  const res  = await fetch(url, { signal });
  if (!res.ok) {
    if (res.status === 429) throw Object.assign(new Error('Rate limited (429)'), { code: 'RATE_LIMIT' });
    throw new Error(`Twelve Data error — HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.status === 'error') throw new Error(json.message || 'Twelve Data API error');
  if (!json.values?.length) throw new Error(`No data for "${symbol}"`);

  // Twelve Data returns newest-first → reverse
  const rows   = [...json.values].reverse();
  const closes = rows.map(r => parseFloat(r.close));
  const dates  = rows.map(r => {
    const d = new Date(r.datetime);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  return { closes, dates };
}

async function fetchPolygon(symbol, signal) {
  const sym  = symbol.includes('.AX') ? `XASX:${symbol.replace('.AX', '')}` : symbol;
  const to   = new Date();
  const from = new Date(); from.setDate(to.getDate() - 90);
  const url  = `https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/`
    + `${from.toISOString().split('T')[0]}/${to.toISOString().split('T')[0]}`
    + `?adjusted=true&sort=asc&limit=120&apiKey=${POLYGON_KEY}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    if (res.status === 429) throw Object.assign(new Error('Rate limited (429)'), { code: 'RATE_LIMIT' });
    throw new Error(`Polygon error — HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.status === 'ERROR') throw new Error(json.error || 'Polygon API error');
  if (!json.results?.length) throw new Error(`No data for "${symbol}"`);

  const closes = json.results.map(r => r.c);
  const dates  = json.results.map(r =>
    new Date(r.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  return { closes, dates };
}

async function fetchStockData(symbol, signal) {
  const cached = getCached(symbol);
  if (cached) return cached;

  const slot = reserveSlot();
  await waitUntil(slot, signal);

  try {
    const data = USE_TWELVE_DATA
      ? await fetchTwelveData(symbol, signal)
      : await fetchPolygon(symbol, signal);

    const result = { ...data, symbol, fetchedAt: Date.now() };
    cache.set(symbol, result);
    return result;
  } catch (err) {
    if (err.code === 'RATE_LIMIT') {
      nextSlotAt = Math.max(nextSlotAt, Date.now() + BACKOFF_MS);
    }
    throw err;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function StockChart({ stockSymbol, targetPrice = null }) {
  const [status,      setStatus]      = useState('loading');
  const [waitSecs,    setWaitSecs]    = useState(0);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [isRateLimit, setIsRateLimit] = useState(false);
  const [info,        setInfo]        = useState(null);

  const canvasRef    = useRef(null);
  const chartRef     = useRef(null);
  const chartDataRef = useRef(null);  // avoids extra renders
  const abortRef     = useRef(null);
  const countdownRef = useRef(null);

  // ── Chart builder ─────────────────────────────────────────────────────────
  const buildChart = useCallback(() => {
    // Guard: canvas must be in the DOM
    if (!canvasRef.current || !chartDataRef.current) return;

    // Always destroy previous chart first — prevents "Canvas already in use"
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const { closes, dates } = chartDataRef.current;
    const change = closes[closes.length - 1] - closes[0];
    const up     = change >= 0;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');

    // Vertical gradient — created from live canvas height
    const h        = canvas.clientHeight || 260;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    const [r, g, b] = up ? [52, 211, 153] : [248, 113, 113];
    gradient.addColorStop(0,   `rgba(${r},${g},${b},0.3)`);
    gradient.addColorStop(0.55,`rgba(${r},${g},${b},0.07)`);
    gradient.addColorStop(1,   `rgba(${r},${g},${b},0)`);

    const lineColor = `rgb(${r},${g},${b})`;

    const datasets = [
      {
        label: stockSymbol,
        data: closes,
        borderColor: lineColor,
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.38,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: lineColor,
        pointHoverBorderColor: '#0f172a',
        pointHoverBorderWidth: 2,
      },
    ];

    if (targetPrice && targetPrice > 0) {
      datasets.push({
        label: 'Target',
        data: Array(dates.length).fill(targetPrice),
        borderColor: 'rgba(251,191,36,0.8)',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [6, 4],
        fill: false,
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
      });
    }

    try {
      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: { labels: dates, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 600, easing: 'easeInOutCubic' },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(2,6,23,0.95)',
              titleColor: '#cbd5e1',
              bodyColor: '#94a3b8',
              borderColor: '#1e293b',
              borderWidth: 1,
              padding: 12,
              displayColors: true,
              boxWidth: 10,
              boxHeight: 10,
              callbacks: {
                title: items => items[0]?.label ?? '',
                label: item => {
                  const prefix = item.dataset.label === 'Target' ? ' Target ' : ' Close  ';
                  return `${prefix} $${Number(item.parsed.y).toFixed(2)}`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: '#475569', maxTicksLimit: 8, font: { size: 11 } },
            },
            y: {
              position: 'right',
              grid: { color: 'rgba(30,41,59,0.9)', drawBorder: false },
              border: { display: false },
              ticks: {
                color: '#475569',
                font: { size: 11 },
                callback: v => '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }),
              },
            },
          },
        },
      });
    } catch (chartErr) {
      // Don't let Chart.js errors crash the whole React tree
      console.error('Chart.js build error:', chartErr);
      setErrorMsg(`Chart render failed: ${chartErr.message}`);
      setStatus('error');
    }
  }, [stockSymbol, targetPrice]);

  // ── Trigger chart build only AFTER canvas is in the DOM ──────────────────
  useEffect(() => {
    if (status === 'ready') buildChart();
  }, [status, buildChart]);

  // ── Data fetch ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!stockSymbol) return;

    if (abortRef.current)     abortRef.current.abort();
    if (countdownRef.current) clearInterval(countdownRef.current);

    const controller = new AbortController();
    abortRef.current = controller;
    chartDataRef.current = null;

    setStatus('loading');
    setErrorMsg('');
    setIsRateLimit(false);
    setInfo(null);

    // Show countdown if we know a wait is coming
    const previewWait = Math.max(0, nextSlotAt - Date.now());
    if (previewWait > 1500 && !getCached(stockSymbol)) {
      setWaitSecs(Math.ceil(previewWait / 1000));
      setStatus('waiting');
      countdownRef.current = setInterval(() => {
        setWaitSecs(s => {
          if (s <= 1) { clearInterval(countdownRef.current); return 0; }
          return s - 1;
        });
      }, 1000);
    }

    try {
      const { closes, dates } = await fetchStockData(stockSymbol, controller.signal);
      if (controller.signal.aborted) return;

      clearInterval(countdownRef.current);

      const last   = closes[closes.length - 1];
      const change = last - closes[0];
      const pct    = ((change / closes[0]) * 100).toFixed(2);
      const high   = Math.max(...closes);
      const low    = Math.min(...closes);
      const dist   = targetPrice ? (((targetPrice - last) / last) * 100).toFixed(1) : null;

      setInfo({
        lastPrice: last.toFixed(2),
        change: change.toFixed(2),
        pct,
        high: high.toFixed(2),
        low: low.toFixed(2),
        dist,
        aboveTarget: targetPrice ? last >= targetPrice : null,
      });

      chartDataRef.current = { closes, dates };
      setStatus('ready'); // → triggers buildChart via useEffect
    } catch (err) {
      if (err.name === 'AbortError') return; // normal unmount
      clearInterval(countdownRef.current);
      setIsRateLimit(err.code === 'RATE_LIMIT');
      setErrorMsg(err.message);
      setStatus('error');
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    }
  }, [stockSymbol, targetPrice]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    load();
    return () => {
      if (abortRef.current)     abortRef.current.abort();
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (chartRef.current)     { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [load]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const up       = info ? parseFloat(info.change) >= 0 : true;
  const clr      = up ? 'text-emerald-400' : 'text-red-400';
  const iconBg   = up ? 'bg-emerald-500/10' : 'bg-red-500/10';

  const rangePct = info
    ? ((parseFloat(info.lastPrice) - parseFloat(info.low)) /
       (parseFloat(info.high) - parseFloat(info.low))) * 100
    : 0;

  const targetRangePct = (info && targetPrice)
    ? ((targetPrice - parseFloat(info.low)) /
       (parseFloat(info.high) - parseFloat(info.low))) * 100
    : null;

  // ── States ────────────────────────────────────────────────────────────────
  if (status === 'loading') return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center gap-3" style={{ height: '300px' }}>
      <Loader2 className="animate-spin w-5 h-5 text-indigo-400 shrink-0" />
      <span className="text-slate-400 text-sm">Fetching {stockSymbol} chart data…</span>
    </div>
  );

  if (status === 'waiting') return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3" style={{ height: '300px' }}>
      <Clock className="w-6 h-6 text-amber-400 animate-pulse" />
      <p className="text-amber-300 font-semibold text-sm">
        Rate-limit queue — loading in <span className="tabular-nums">{waitSecs}s</span>
      </p>
      <div className="w-52 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-1000"
          style={{ width: `${Math.max(0, 100 - (waitSecs / (SLOT_MS / 1000)) * 100)}%` }}
        />
      </div>
      <p className="text-xs text-slate-600">
        {USE_TWELVE_DATA ? 'Twelve Data' : 'Polygon.io'} free-tier spacing
      </p>
    </div>
  );

  if (status === 'error') return (
    <div className="bg-slate-900 border border-red-500/25 rounded-2xl p-6">
      <div className="flex gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-300 mb-1">Chart unavailable</p>
          <p className="text-xs text-slate-500 mb-3 font-mono">{errorMsg}</p>
          {isRateLimit && (
            <p className="text-xs text-amber-400/80 mb-3">
              Free tier limit hit. The queue will back off automatically — retry in ~{Math.round(BACKOFF_MS / 1000)}s.
            </p>
          )}
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      </div>
    </div>
  );

  // ── Ready ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${iconBg}`}>
            {up
              ? <TrendingUp  className="w-5 h-5 text-emerald-400" />
              : <TrendingDown className="w-5 h-5 text-red-400" />
            }
          </div>
          <div>
            <p className="font-bold text-lg tracking-tight">{stockSymbol}</p>
            <p className="text-xs text-slate-600">
              90-day · {USE_TWELVE_DATA ? 'Twelve Data' : 'Polygon.io'}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-3xl font-bold tracking-tight">${info?.lastPrice}</p>
          <p className={`text-sm font-semibold mt-0.5 ${clr}`}>
            {up ? '▲' : '▼'} ${Math.abs(parseFloat(info?.change ?? 0)).toFixed(2)}
            {' '}({up ? '+' : ''}{info?.pct}%)
          </p>
        </div>
      </div>

      {/* 90-day range bar */}
      {info && (
        <div className="px-5 pb-3">
          <div className="flex justify-between text-xs text-slate-600 mb-1.5">
            <span>Low ${info.low}</span>
            <span>90-day range</span>
            <span>High ${info.high}</span>
          </div>
          <div className="relative h-2 bg-slate-800 rounded-full">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500/20 via-slate-700/30 to-emerald-500/20" />

            {/* Target tick */}
            {targetRangePct !== null && targetRangePct >= 0 && targetRangePct <= 100 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 rounded-full"
                style={{ left: `${targetRangePct}%` }}
              />
            )}

            {/* Current price dot */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-slate-900 shadow"
              style={{
                left: `clamp(0%, calc(${rangePct}% - 7px), calc(100% - 14px))`,
                backgroundColor: up ? 'rgb(52,211,153)' : 'rgb(248,113,113)',
              }}
            />
          </div>

          {/* Target distance */}
          {info.dist !== null && (
            <div className={`flex items-center gap-1.5 mt-2 text-xs font-medium ${info.aboveTarget ? 'text-emerald-400' : 'text-amber-400'}`}>
              <Target className="w-3 h-3" />
              {info.aboveTarget
                ? `${Math.abs(parseFloat(info.dist))}% above target ($${targetPrice})`
                : `${Math.abs(parseFloat(info.dist))}% to target ($${targetPrice})`
              }
            </div>
          )}
        </div>
      )}

      {/* Canvas — fixed pixel height so Chart.js can measure it */}
      <div className="px-2" style={{ height: '240px', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800/80">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          {USE_TWELVE_DATA ? 'Twelve Data' : 'Polygon.io · 5 req/min free'}
          {targetPrice && (
            <span className="flex items-center gap-1.5 text-amber-500/60">
              <span className="w-4 border-t border-dashed border-amber-400/60 inline-block" />
              Target ${targetPrice}
            </span>
          )}
        </div>
        <button onClick={load}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition-colors">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
    </div>
  );
}
