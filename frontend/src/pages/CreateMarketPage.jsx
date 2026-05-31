import { useState } from 'react';
import { ethers } from 'ethers';
import { PlusCircle, ChevronRight, Eye } from 'lucide-react';
import { FACTORY_ABI, TOKEN_ABI, TENANT_ABI, CATEGORIES, POPULAR_STOCKS, POPULAR_CRYPTOS, SPORTS } from '../config.js';
import { Card, Button, Input, Select, SectionHeader, CategoryBadge, Notification } from '../components/UI.jsx';

const TIMEFRAMES = ['End of this month', 'End of next month', 'Q1 2026', 'Q2 2026', 'Q3 2026', 'EOY 2026', 'EOY 2027'];

function buildMetadata(category, form) {
  if (category === 'stocks') {
    const question = `Will ${form.stockName} (${form.stockSymbol}) trade ${form.direction} $${form.priceTarget} by ${form.timeframe}?`;
    return JSON.stringify({
      question,
      category: 'stocks',
      stockSymbol: form.stockSymbol,
      outcomes: ['YES', 'NO'],
      direction: form.direction,
      priceTarget: form.priceTarget,
      timeframe: form.timeframe,
    });
  }
  if (category === 'crypto') {
    const question = `Will ${form.cryptoName} (${form.cryptoSymbol}) trade ${form.direction} $${form.priceTarget} by ${form.timeframe}?`;
    return JSON.stringify({
      question,
      category: 'crypto',
      cryptoSymbol: form.cryptoSymbol,
      outcomes: ['YES', 'NO'],
      direction: form.direction,
      priceTarget: form.priceTarget,
      timeframe: form.timeframe,
    });
  }
  if (category === 'sports') {
    const question = `${form.sport}: Who wins — ${form.teamA} vs ${form.teamB}?`;
    const outcomes = form.hasDraw ? [form.teamA, 'Draw', form.teamB] : [form.teamA, form.teamB];
    return JSON.stringify({ question, category: 'sports', sport: form.sport, outcomes });
  }
  if (category === 'politics') {
    const outcomes = form.options.filter(o => o.trim());
    return JSON.stringify({ question: form.question, category: 'politics', outcomes });
  }
  // custom
  const outcomes = form.customOutcomes.filter(o => o.trim());
  return JSON.stringify({ question: form.question, category: 'custom', outcomes: outcomes.length >= 2 ? outcomes : null });
}

function outcomeCount(category, form) {
  if (category === 'stocks' || category === 'crypto') return 2;
  if (category === 'sports') return form.hasDraw ? 3 : 2;
  if (category === 'politics') return form.options.filter(o => o.trim()).length;
  return Math.max(2, form.customOutcomes.filter(o => o.trim()).length);
}

export default function CreateMarketPage({ signer, account, deployments, setGlobalMessage, onMarketCreated }) {
  const [step, setStep] = useState(1); // 1=category, 2=details, 3=settings
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);
  const [isTenant, setIsTenant] = useState(false);
  const [tenantChecked, setTenantChecked] = useState(false);

  // Form state
  const [form, setForm] = useState({
    // stocks/crypto
    stockSymbol: 'AAPL', stockName: 'Apple Inc.',
    cryptoSymbol: 'BTC', cryptoName: 'Bitcoin',
    direction: 'above', priceTarget: '', timeframe: 'EOY 2026',
    // sports
    sport: 'Football', teamA: '', teamB: '', hasDraw: true,
    // politics/custom
    question: '',
    options: ['', '', '', ''],
    // custom
    customOutcomes: ['YES', 'NO', '', ''],
    // settings
    feeBps: '200',
    linkTenant: false,
  });

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const checkTenant = async () => {
    if (!signer || !deployments?.tenantRegistry) { setTenantChecked(true); return; }
    try {
      const registry = new ethers.Contract(deployments.tenantRegistry, TENANT_ABI, signer);
      const addr = await signer.getAddress();
      const is = await registry.isTenant(addr);
      setIsTenant(is);
    } catch { }
    setTenantChecked(true);
  };

  const preview = category ? buildMetadata(category, form) : '';
  const parsedPreview = preview ? JSON.parse(preview) : null;
  const numOutcomes = category ? outcomeCount(category, form) : 2;

  const handleCreate = async () => {
    if (!signer || !deployments?.factory) { setMessage({ type: 'error', text: 'Connect wallet first' }); return; }
    const metadata = buildMetadata(category, form);
    const count = outcomeCount(category, form);
    if (count < 2) { setMessage({ type: 'error', text: 'At least 2 valid outcomes required' }); return; }
    const feeBps = parseInt(form.feeBps) || 200;
    if (feeBps > 1000) { setMessage({ type: 'error', text: 'Fee cannot exceed 10%' }); return; }

    setLoading(true);
    setMessage({ type: 'info', text: 'Creating market...' });
    try {
      const factory = new ethers.Contract(deployments.factory, FACTORY_ABI, signer);
      const addr = await signer.getAddress();
      const tenant = form.linkTenant && isTenant ? addr : ethers.ZeroAddress;
      const tx = await factory.createMarket(deployments.token, metadata, count, feeBps, category, tenant);
      await tx.wait();
      setMessage({ type: 'success', text: 'Market created successfully!' });
      onMarketCreated?.();
    } catch (err) {
      setMessage({ type: 'error', text: err.reason || err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <SectionHeader title="Create Market" sub="Launch a new prediction market for any category" />
      <Notification message={message} onClose={() => setMessage({ type: '', text: '' })} />

      {/* Step 1: Category */}
      <Card>
        <h3 className="text-base font-semibold text-slate-300 mb-4">1. Choose Category</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
            <button key={cat.id} onClick={() => { setCategory(cat.id); !tenantChecked && checkTenant(); }}
              className={`flex items-center gap-2 p-4 rounded-xl border-2 text-left transition-all ${category === cat.id ? 'border-indigo-500 bg-indigo-600/10' : 'border-slate-700 hover:border-slate-500 bg-slate-800/60'}`}>
              <span className="text-2xl">{cat.icon}</span>
              <span className="font-semibold text-sm">{cat.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Step 2: Details */}
      {category && (
        <Card>
          <h3 className="text-base font-semibold text-slate-300 mb-4">2. Market Details</h3>
          {category === 'stocks' && <StocksForm form={form} set={set} />}
          {category === 'crypto' && <CryptoForm form={form} set={set} />}
          {category === 'sports' && <SportsForm form={form} set={set} />}
          {category === 'politics' && <PoliticsForm form={form} set={set} />}
          {category === 'custom' && <CustomForm form={form} set={set} />}
        </Card>
      )}

      {/* Step 3: Settings */}
      {category && (
        <Card>
          <h3 className="text-base font-semibold text-slate-300 mb-4">3. Settings</h3>
          <div className="space-y-4">
            <Input
              label={`Fee (basis points, e.g., 200 = 2%) — currently ${parseInt(form.feeBps) / 100 || 0}%`}
              type="number" value={form.feeBps} min="0" max="1000"
              onChange={e => set('feeBps', e.target.value)}
            />
            {isTenant && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.linkTenant} onChange={e => set('linkTenant', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-600" />
                <span className="text-sm text-slate-300">Link to my Betplace (tenant profile)</span>
              </label>
            )}
          </div>
        </Card>
      )}

      {/* Preview */}
      {parsedPreview && (
        <Card className="border-indigo-600/30 bg-indigo-900/10">
          <div className="flex items-center gap-2 mb-3 text-indigo-400">
            <Eye className="w-4 h-4" /> <span className="text-sm font-semibold">Preview</span>
          </div>
          <p className="font-bold text-slate-100 mb-3">{parsedPreview.question}</p>
          {parsedPreview.outcomes && (
            <div className="flex flex-wrap gap-2">
              {parsedPreview.outcomes.map((o, i) => (
                <span key={i} className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300">{o}</span>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-3">{numOutcomes} outcomes · {parseInt(form.feeBps) / 100}% fee</p>
        </Card>
      )}

      {category && (
        <Button variant="primary" onClick={handleCreate} loading={loading} disabled={!account} className="w-full" size="lg">
          <PlusCircle className="w-5 h-5" /> Create Market
        </Button>
      )}
      {!account && category && (
        <p className="text-center text-slate-500 text-sm">Connect wallet to create a market</p>
      )}
    </div>
  );
}

function StocksForm({ form, set }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Select label="Stock" value={form.stockSymbol} onChange={e => {
          const stock = POPULAR_STOCKS.find(s => s.symbol === e.target.value);
          set('stockSymbol', e.target.value);
          if (stock) set('stockName', stock.name);
        }}>
          {POPULAR_STOCKS.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol} — {s.name}</option>)}
        </Select>
        <Select label="Direction" value={form.direction} onChange={e => set('direction', e.target.value)}>
          <option value="above">Above</option>
          <option value="below">Below</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Price Target ($)" type="number" value={form.priceTarget} onChange={e => set('priceTarget', e.target.value)} placeholder="200.00" />
        <Select label="Timeframe" value={form.timeframe} onChange={e => set('timeframe', e.target.value)}>
          {TIMEFRAMES.map(t => <option key={t}>{t}</option>)}
        </Select>
      </div>
    </div>
  );
}

function CryptoForm({ form, set }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Select label="Asset" value={form.cryptoSymbol} onChange={e => {
          const c = POPULAR_CRYPTOS.find(x => x.symbol === e.target.value);
          set('cryptoSymbol', e.target.value);
          if (c) set('cryptoName', c.name);
        }}>
          {POPULAR_CRYPTOS.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol} — {c.name}</option>)}
        </Select>
        <Select label="Direction" value={form.direction} onChange={e => set('direction', e.target.value)}>
          <option value="above">Above</option>
          <option value="below">Below</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Price Target ($)" type="number" value={form.priceTarget} onChange={e => set('priceTarget', e.target.value)} placeholder="100000" />
        <Select label="Timeframe" value={form.timeframe} onChange={e => set('timeframe', e.target.value)}>
          {TIMEFRAMES.map(t => <option key={t}>{t}</option>)}
        </Select>
      </div>
    </div>
  );
}

function SportsForm({ form, set }) {
  return (
    <div className="space-y-4">
      <Select label="Sport" value={form.sport} onChange={e => set('sport', e.target.value)}>
        {SPORTS.map(s => <option key={s}>{s}</option>)}
      </Select>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Team / Player A" value={form.teamA} onChange={e => set('teamA', e.target.value)} placeholder="e.g. Man United" />
        <Input label="Team / Player B" value={form.teamB} onChange={e => set('teamB', e.target.value)} placeholder="e.g. Arsenal" />
      </div>
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={form.hasDraw} onChange={e => set('hasDraw', e.target.checked)} className="w-4 h-4 rounded" />
        <span className="text-sm text-slate-300">Include Draw option</span>
      </label>
    </div>
  );
}

function PoliticsForm({ form, set }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Question</label>
        <textarea
          value={form.question} onChange={e => set('question', e.target.value)}
          placeholder="Who will win the 2028 US Presidential Election?"
          rows={3}
          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Options (min 2)</label>
        <div className="space-y-2">
          {form.options.map((opt, i) => (
            <Input key={i} value={opt} onChange={e => {
              const next = [...form.options];
              next[i] = e.target.value;
              set('options', next);
            }} placeholder={`Option ${i + 1}${i < 2 ? ' (required)' : ' (optional)'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CustomForm({ form, set }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Question</label>
        <textarea
          value={form.question} onChange={e => set('question', e.target.value)}
          placeholder="Ask anything you want to predict..."
          rows={3}
          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Outcome Labels (min 2)</label>
        <div className="grid grid-cols-2 gap-2">
          {form.customOutcomes.map((opt, i) => (
            <Input key={i} value={opt} onChange={e => {
              const next = [...form.customOutcomes];
              next[i] = e.target.value;
              set('customOutcomes', next);
            }} placeholder={i === 0 ? 'YES' : i === 1 ? 'NO' : `Option ${i + 1}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
