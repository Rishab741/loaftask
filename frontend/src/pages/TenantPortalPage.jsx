import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Users, Building, RefreshCw, BarChart2, CheckCircle, Loader2 } from 'lucide-react';
import { TENANT_ABI, FACTORY_ABI, MARKET_ABI, parseMetadata } from '../config.js';
import { Card, Button, Input, SectionHeader, StatusBadge, Notification } from '../components/UI.jsx';

export default function TenantPortalPage({ provider, signer, account, deployments, onSelectMarket }) {
  const [isTenant, setIsTenant] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [myMarkets, setMyMarkets] = useState([]);
  const [allTenants, setAllTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [tab, setTab] = useState('profile');
  const [regFee, setRegFee] = useState('0');

  const [form, setForm] = useState({
    name: '',
    description: '',
    website: '',
    twitter: '',
    feeRecipient: '',
  });

  const REGISTRY = deployments?.tenantRegistry;
  const FACTORY = deployments?.factory;

  const load = async () => {
    if (!provider || !REGISTRY) return;
    try {
      const registry = new ethers.Contract(REGISTRY, TENANT_ABI, provider);
      const fee = await registry.registrationFee().catch(() => 0n);
      setRegFee(ethers.formatEther(fee));

      const tenantAddrs = await registry.getTenants().catch(() => []);
      const tenantData = await Promise.all(tenantAddrs.map(async addr => {
        const info = await registry.getTenantInfo(addr).catch(() => null);
        if (!info) return null;
        let meta = {};
        try { meta = JSON.parse(info.metadata); } catch { }
        return { address: addr, name: info.name, feeRecipient: info.feeRecipient, active: info.active, registeredAt: Number(info.registeredAt), ...meta };
      }));
      setAllTenants(tenantData.filter(Boolean));

      if (account) {
        const is = await registry.isTenant(account).catch(() => false);
        setIsTenant(is);
        if (is) {
          const info = await registry.getTenantInfo(account).catch(() => null);
          if (info) {
            let meta = {};
            try { meta = JSON.parse(info.metadata); } catch { }
            setTenantInfo({ name: info.name, feeRecipient: info.feeRecipient, ...meta });
            setForm({
              name: info.name,
              description: meta.description || '',
              website: meta.website || '',
              twitter: meta.twitter || '',
              feeRecipient: info.feeRecipient,
            });
          }
        } else {
          setForm(prev => ({ ...prev, feeRecipient: account }));
        }
      }
    } catch (err) {
      console.error('Load tenant error:', err);
    }
  };

  const loadMyMarkets = async () => {
    if (!provider || !FACTORY || !account) return;
    setLoadingMarkets(true);
    try {
      const factory = new ethers.Contract(FACTORY, FACTORY_ABI, provider);
      const addrs = await factory.getCreatorMarkets(account).catch(() => []);
      const items = await Promise.all(addrs.map(async addr => {
        const market = new ethers.Contract(addr, MARKET_ABI, provider);
        const [rawMeta, state, totalPool, outcomesCount, feeBps] = await Promise.all([
          market.metadata(), market.state(), market.totalPool(), market.outcomesCount(), market.feeBps(),
        ]).catch(() => ['', 0, 0n, 2n, 200n]);
        const meta = parseMetadata(rawMeta);
        const info = await factory.getMarketInfo(addr).catch(() => ({ category: 'custom' }));
        return {
          address: addr,
          question: meta.question,
          category: info.category || meta.category || 'custom',
          state: ['Active', 'Resolved', 'Cancelled'][Number(state)],
          totalPool: ethers.formatEther(totalPool),
          outcomesCount: Number(outcomesCount),
          feeBps: Number(feeBps),
        };
      }));
      setMyMarkets(items.reverse());
    } catch (err) {
      console.error('Load markets error:', err);
    } finally {
      setLoadingMarkets(false);
    }
  };

  useEffect(() => { load(); }, [provider, account, deployments]);
  useEffect(() => { if (tab === 'markets') loadMyMarkets(); }, [tab, account]);

  const doTx = async (fn, pending, done) => {
    setLoading(true);
    setMessage({ type: 'info', text: pending });
    try {
      const tx = await fn();
      await tx.wait();
      setMessage({ type: 'success', text: done });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err.reason || err.message });
    } finally {
      setLoading(false);
    }
  };

  const buildMeta = () => JSON.stringify({
    description: form.description,
    website: form.website,
    twitter: form.twitter,
  });

  const handleRegister = () => {
    if (!signer || !REGISTRY) return;
    if (!form.name) { setMessage({ type: 'error', text: 'Name is required' }); return; }
    const registry = new ethers.Contract(REGISTRY, TENANT_ABI, signer);
    doTx(
      () => registry.registerTenant(form.name, buildMeta(), form.feeRecipient || account, { value: ethers.parseEther(regFee || '0') }),
      'Registering betplace...', 'Betplace registered!'
    );
  };

  const handleUpdate = () => {
    if (!signer || !REGISTRY) return;
    const registry = new ethers.Contract(REGISTRY, TENANT_ABI, signer);
    doTx(
      () => registry.updateTenant(form.name, buildMeta(), form.feeRecipient || account),
      'Updating profile...', 'Profile updated!'
    );
  };

  if (!REGISTRY) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <div className="text-center py-12 text-slate-500">
            <Building className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">TenantRegistry not deployed</p>
            <p className="text-sm mt-1">Deploy the updated contracts to use this feature.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <SectionHeader
        title="Betplace Portal"
        sub="Register as an operator to brand your markets and build your betting community"
      />
      <Notification message={message} onClose={() => setMessage({ type: '', text: '' })} />

      {account ? (
        <>
          {/* Status banner */}
          {isTenant ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-900/30 border border-emerald-500/40 rounded-xl text-emerald-300">
              <CheckCircle className="w-5 h-5" />
              <div>
                <p className="font-semibold">{tenantInfo?.name}</p>
                <p className="text-sm text-emerald-400/70">Registered betplace operator</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-400">
              <Building className="w-5 h-5" />
              <p className="text-sm">Not registered as a betplace operator yet.</p>
              {regFee !== '0' && <span className="ml-auto text-xs text-slate-500">Fee: {regFee} ETH</span>}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 border-b border-slate-700 pb-2">
            {['profile', 'markets', 'directory'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-semibold capitalize rounded-lg transition-colors ${tab === t ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-slate-200'}`}>
                {t === 'profile' ? 'My Profile' : t === 'markets' ? 'My Markets' : 'All Betplaces'}
              </button>
            ))}
          </div>

          {tab === 'profile' && (
            <Card>
              <h3 className="text-base font-semibold mb-4">{isTenant ? 'Edit Profile' : 'Register as Operator'}</h3>
              <div className="space-y-4">
                <Input label="Betplace Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="My Prediction Hub" />
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Tell users about your betplace..."
                    rows={3}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Website" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} placeholder="https://..." />
                  <Input label="Twitter" value={form.twitter} onChange={e => setForm(p => ({ ...p, twitter: e.target.value }))} placeholder="@handle" />
                </div>
                <Input
                  label="Fee Recipient Address"
                  value={form.feeRecipient} onChange={e => setForm(p => ({ ...p, feeRecipient: e.target.value }))}
                  placeholder={account}
                />
                <Button variant={isTenant ? 'secondary' : 'primary'} onClick={isTenant ? handleUpdate : handleRegister} loading={loading} className="w-full">
                  {isTenant ? 'Update Profile' : `Register Betplace${regFee !== '0' ? ` (${regFee} ETH)` : ''}`}
                </Button>
              </div>
            </Card>
          )}

          {tab === 'markets' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">{myMarkets.length} market{myMarkets.length !== 1 ? 's' : ''} created by you</p>
                <button onClick={loadMyMarkets} className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              {loadingMarkets ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-indigo-400" /></div>
              ) : myMarkets.length === 0 ? (
                <Card>
                  <div className="text-center py-8 text-slate-500">
                    <BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No markets created yet. Go to Create Market to get started.</p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-3">
                  {myMarkets.map(m => (
                    <div key={m.address} onClick={() => onSelectMarket?.(m)}
                      className="flex items-center justify-between p-4 bg-slate-800/60 border border-slate-700 hover:border-indigo-500/50 rounded-xl cursor-pointer transition-all group">
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="font-semibold text-sm text-slate-100 truncate group-hover:text-white">{m.question}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{parseFloat(m.totalPool).toLocaleString()} tokens · {m.outcomesCount} outcomes · {m.feeBps / 100}% fee</p>
                      </div>
                      <StatusBadge status={m.state} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'directory' && (
            <div className="space-y-3">
              {allTenants.length === 0 ? (
                <Card>
                  <div className="text-center py-8 text-slate-500">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No betplaces registered yet. Be the first!</p>
                  </div>
                </Card>
              ) : (
                allTenants.map(t => (
                  <Card key={t.address} className="hover:border-slate-600 transition-all">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold">{t.name}</p>
                        {t.description && <p className="text-sm text-slate-400 mt-1">{t.description}</p>}
                        <div className="flex gap-3 mt-2">
                          {t.website && <a href={t.website} target="_blank" rel="noopener" className="text-xs text-indigo-400 hover:underline">{t.website}</a>}
                          {t.twitter && <span className="text-xs text-slate-500">@{t.twitter}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-slate-600 font-mono">{t.address.slice(0, 10)}...</span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </>
      ) : (
        <Card>
          <div className="text-center py-12 text-slate-500">
            <Building className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Connect your wallet</p>
            <p className="text-sm mt-1">Connect to register or manage your betplace</p>
          </div>
        </Card>
      )}
    </div>
  );
}
