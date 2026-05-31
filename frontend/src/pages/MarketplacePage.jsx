import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Search, Filter, RefreshCw, BarChart2, Users, Loader2, TrendingUp } from 'lucide-react';
import { MARKET_ABI, FACTORY_ABI, TENANT_ABI, CATEGORIES, parseMetadata } from '../config.js';
import { CategoryBadge, StatusBadge, Card, Button } from '../components/UI.jsx';

const STATES = ['Active', 'Resolved', 'Cancelled'];

export default function MarketplacePage({ provider, deployments, account, onSelectMarket }) {
  const [markets, setMarkets] = useState([]);
  const [tenantNames, setTenantNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [tenants, setTenants] = useState([]);

  const load = async () => {
    if (!provider || !deployments?.factory) return;
    setLoading(true);
    try {
      const factory = new ethers.Contract(deployments.factory, FACTORY_ABI, provider);
      const addrs = await factory.getMarkets();

      // load factory metadata and market state in parallel
      const [infos, states] = await Promise.all([
        Promise.all(addrs.map(a => factory.getMarketInfo(a).catch(() => ({ creator: '', tenant: ethers.ZeroAddress, category: 'custom', createdAt: 0n })))),
        Promise.all(addrs.map(a => {
          const m = new ethers.Contract(a, MARKET_ABI, provider);
          return Promise.all([m.metadata(), m.state(), m.totalPool(), m.outcomesCount(), m.feeBps()])
            .catch(() => ['', 0n, 0n, 2n, 200n]);
        })),
      ]);

      const items = addrs.map((addr, i) => {
        const [metadata, state, totalPool, outcomesCount, feeBps] = states[i];
        const info = infos[i];
        const meta = parseMetadata(metadata);
        return {
          address: addr,
          creator: info.creator,
          tenant: info.tenant,
          category: info.category || meta.category || 'custom',
          createdAt: Number(info.createdAt),
          question: meta.question,
          stockSymbol: meta.stockSymbol,
          cryptoSymbol: meta.cryptoSymbol,
          outcomes: meta.outcomes,
          state: STATES[Number(state)],
          totalPool: ethers.formatEther(totalPool),
          outcomesCount: Number(outcomesCount),
          feeBps: Number(feeBps),
        };
      }).reverse();

      setMarkets(items);

      // load tenant names
      if (deployments.tenantRegistry) {
        const registry = new ethers.Contract(deployments.tenantRegistry, TENANT_ABI, provider);
        const tenantAddrs = await registry.getTenants().catch(() => []);
        const names = {};
        await Promise.all(tenantAddrs.map(async t => {
          const info = await registry.getTenantInfo(t).catch(() => null);
          if (info) names[t.toLowerCase()] = info.name;
        }));
        setTenantNames(names);

        const uniqueTenants = [...new Set(items.map(m => m.tenant).filter(t => t && t !== ethers.ZeroAddress))];
        setTenants(uniqueTenants);
      }
    } catch (err) {
      console.error('Error loading markets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [provider, deployments]);

  const filtered = markets.filter(m => {
    if (category !== 'all' && m.category !== category) return false;
    if (statusFilter !== 'all' && m.state !== statusFilter) return false;
    if (tenantFilter !== 'all' && m.tenant?.toLowerCase() !== tenantFilter.toLowerCase()) return false;
    if (search && !m.question.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              category === cat.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            <span>{cat.icon}</span> {cat.label}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search markets..."
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Resolved">Resolved</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        {tenants.length > 0 && (
          <select
            value={tenantFilter}
            onChange={e => setTenantFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Betplaces</option>
            {tenants.map(t => (
              <option key={t} value={t}>
                {tenantNames[t.toLowerCase()] || `${t.slice(0, 8)}...`}
              </option>
            ))}
          </select>
        )}
        <button onClick={load} className="p-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-slate-200 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Count */}
      <p className="text-sm text-slate-500">
        {loading ? 'Loading...' : `${filtered.length} market${filtered.length !== 1 ? 's' : ''} found`}
      </p>

      {/* Market grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin w-8 h-8 text-indigo-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-slate-500">
          <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No markets found</p>
          <p className="text-sm mt-1">Try adjusting your filters or create a new market.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(m => (
            <MarketCard
              key={m.address}
              market={m}
              tenantName={m.tenant && m.tenant !== ethers.ZeroAddress ? tenantNames[m.tenant.toLowerCase()] : null}
              onClick={() => onSelectMarket(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MarketCard({ market, tenantName, onClick }) {
  const pool = parseFloat(market.totalPool);
  return (
    <div
      onClick={onClick}
      className="bg-slate-800/60 border border-slate-700 hover:border-indigo-500/50 rounded-2xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-indigo-900/20 group"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex gap-1.5 flex-wrap">
          <CategoryBadge category={market.category} />
          <StatusBadge status={market.state} />
        </div>
        {tenantName && (
          <span className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap">
            <Users className="w-3 h-3" /> {tenantName}
          </span>
        )}
      </div>

      <h3 className="text-sm font-semibold text-slate-100 leading-snug mb-4 line-clamp-3 group-hover:text-white transition-colors">
        {market.question}
      </h3>

      <div className="flex items-center justify-between text-xs text-slate-500 mt-auto pt-3 border-t border-slate-700/60">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-300">{pool.toLocaleString(undefined, {maximumFractionDigits: 1})} tokens</span>
          <span>pool</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{market.outcomesCount} outcomes</span>
          <span>{market.feeBps / 100}% fee</span>
        </div>
      </div>
    </div>
  );
}
