import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Coins, Zap, RefreshCw, DollarSign, ArrowRight, AlertCircle } from 'lucide-react';
import { TOKEN_ABI } from '../config.js';
import { Card, Button, Input, StatCard, SectionHeader, Notification } from '../components/UI.jsx';

export default function BuyTokensPage({ provider, signer, account, deployments, onBalanceChange }) {
  const [saleData, setSaleData] = useState(null);
  const [isSaleActive, setIsSaleActive] = useState(false);
  const [tokenBalance, setTokenBalance] = useState('0');
  const [tokenOwner, setTokenOwner] = useState('');
  const [stablecoins, setStablecoins] = useState([]);
  const [stablecoinInfos, setStablecoinInfos] = useState({});

  // ETH purchase
  const [ethAmount, setEthAmount] = useState('');
  const [ethPreview, setEthPreview] = useState('');

  // Stablecoin purchase
  const [selectedStablecoin, setSelectedStablecoin] = useState('');
  const [stableAmount, setStableAmount] = useState('');
  const [stablePreview, setStablePreview] = useState('');
  const [stableApproved, setStableApproved] = useState(false);

  // Admin
  const [adminTab, setAdminTab] = useState('start');
  const [saleAdmin, setSaleAdmin] = useState({ tokensPerEth: '1000', minPurchase: '0.01', maxPurchase: '1', saleSupply: '100000', duration: '24', hardCap: '100', whitelistEnabled: false });
  const [stablecoinConfig, setStablecoinConfig] = useState({ address: '', tokensPerUnit: '1000', decimals: '6', enabled: true });
  const [whitelistAddresses, setWhitelistAddresses] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const TOKEN_ADDRESS = deployments?.token;
  const isOwner = account && tokenOwner && ethers.getAddress(account) === ethers.getAddress(tokenOwner);

  const loadData = async () => {
    if (!provider || !TOKEN_ADDRESS) return;
    try {
      const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, provider);
      const [active, config, raised, sold, owner, bal, stableAddrs] = await Promise.all([
        token.saleActive(),
        token.saleConfig(),
        token.totalRaised(),
        token.tokensSold(),
        token.owner(),
        account ? token.balanceOf(account) : 0n,
        token.getSupportedStablecoins().catch(() => []),
      ]);

      setIsSaleActive(active);
      setTokenOwner(owner);
      setTokenBalance(account ? ethers.formatEther(bal) : '0');
      setSaleData({
        tokensPerEth: config[0].toString(),
        minPurchase: ethers.formatEther(config[1]),
        maxPurchase: ethers.formatEther(config[2]),
        saleSupply: ethers.formatEther(config[3]),
        startTime: Number(config[4]) > 0 ? new Date(Number(config[4]) * 1000).toLocaleString() : 'Not set',
        endTime: Number(config[5]) > 0 ? new Date(Number(config[5]) * 1000).toLocaleString() : 'Not set',
        hardCap: ethers.formatEther(config[6]),
        whitelistEnabled: config[7],
        totalRaised: ethers.formatEther(raised),
        tokensSold: ethers.formatEther(sold),
      });

      setStablecoins(stableAddrs);

      // Load stablecoin configs
      const infos = {};
      await Promise.all(stableAddrs.map(async addr => {
        const cfg = await token.stablecoinConfigs(addr).catch(() => null);
        if (cfg) infos[addr] = { tokensPerUnit: cfg.tokensPerUnit.toString(), decimals: cfg.stablecoinDecimals, enabled: cfg.enabled };
      }));
      setStablecoinInfos(infos);
      if (stableAddrs.length > 0 && !selectedStablecoin) setSelectedStablecoin(stableAddrs[0]);

      onBalanceChange?.(account ? ethers.formatEther(bal) : '0');
    } catch (err) {
      console.error('Load sale data error:', err);
    }
  };

  useEffect(() => { loadData(); }, [provider, account, deployments]);

  // ETH preview
  useEffect(() => {
    if (!ethAmount || !saleData) { setEthPreview(''); return; }
    try {
      const tokens = parseFloat(ethAmount) * parseFloat(saleData.tokensPerEth);
      setEthPreview(isNaN(tokens) ? '' : tokens.toLocaleString());
    } catch { setEthPreview(''); }
  }, [ethAmount, saleData]);

  // Stablecoin preview
  useEffect(() => {
    if (!stableAmount || !selectedStablecoin || !stablecoinInfos[selectedStablecoin]) { setStablePreview(''); return; }
    try {
      const info = stablecoinInfos[selectedStablecoin];
      const tokens = (parseFloat(stableAmount) * parseFloat(info.tokensPerUnit));
      setStablePreview(isNaN(tokens) ? '' : tokens.toLocaleString());
    } catch { setStablePreview(''); }
  }, [stableAmount, selectedStablecoin, stablecoinInfos]);

  const doTx = async (fn, pending, done) => {
    setLoading(true);
    setMessage({ type: 'info', text: pending });
    try {
      const tx = await fn();
      await tx.wait();
      setMessage({ type: 'success', text: done });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.reason || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBuyEth = () => {
    if (!signer || !ethAmount) return;
    const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    doTx(() => token.buyTokens({ value: ethers.parseEther(ethAmount) }), 'Buying tokens with ETH...', 'Tokens purchased!');
  };

  const handleApproveStable = async () => {
    if (!signer || !stableAmount || !selectedStablecoin) return;
    setLoading(true);
    setMessage({ type: 'info', text: 'Approving stablecoin...' });
    try {
      const erc20 = new ethers.Contract(selectedStablecoin, ['function approve(address,uint256) returns (bool)', 'function decimals() view returns (uint8)'], signer);
      const dec = await erc20.decimals().catch(() => 18);
      const rawAmount = ethers.parseUnits(stableAmount, dec);
      const tx = await erc20.approve(TOKEN_ADDRESS, rawAmount);
      await tx.wait();
      setStableApproved(true);
      setMessage({ type: 'success', text: 'Stablecoin approved!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.reason || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBuyStable = async () => {
    if (!signer || !stableAmount || !selectedStablecoin) return;
    const erc20 = new ethers.Contract(selectedStablecoin, ['function decimals() view returns (uint8)'], provider);
    const dec = await erc20.decimals().catch(() => 18);
    const rawAmount = ethers.parseUnits(stableAmount, dec);
    const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    doTx(() => token.buyTokensWithStablecoin(selectedStablecoin, rawAmount), 'Buying tokens with stablecoin...', 'Tokens purchased!');
  };

  const handleStartSale = () => {
    if (!signer) return;
    const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    doTx(() => token.startSale(
      BigInt(saleAdmin.tokensPerEth),
      ethers.parseEther(saleAdmin.minPurchase),
      ethers.parseEther(saleAdmin.maxPurchase),
      ethers.parseEther(saleAdmin.saleSupply),
      BigInt(saleAdmin.duration),
      ethers.parseEther(saleAdmin.hardCap),
      saleAdmin.whitelistEnabled,
    ), 'Starting sale...', 'Sale started!');
  };

  const handleEndSale = () => {
    if (!signer) return;
    const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    doTx(() => token.endSale(), 'Ending sale...', 'Sale ended.');
  };

  const handleSetStablecoin = () => {
    if (!signer || !stablecoinConfig.address) return;
    const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    doTx(
      () => token.setStablecoinRate(stablecoinConfig.address, BigInt(stablecoinConfig.tokensPerUnit), parseInt(stablecoinConfig.decimals), stablecoinConfig.enabled),
      'Configuring stablecoin...', 'Stablecoin configured!'
    );
  };

  const handleWhitelist = (add) => {
    if (!signer || !whitelistAddresses) return;
    const addrs = whitelistAddresses.split(',').map(a => a.trim()).filter(a => a);
    const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    doTx(
      () => token[add ? 'addToWhitelist' : 'removeFromWhitelist'](addrs),
      `${add ? 'Adding' : 'Removing'} addresses...`, 'Whitelist updated!'
    );
  };

  const timeLeft = saleData && isSaleActive ? (() => {
    const end = new Date(saleData.endTime).getTime();
    const diff = end - Date.now();
    if (diff <= 0) return 'Ended';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m remaining`;
  })() : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <SectionHeader title="Buy Tokens" sub="Purchase settlement tokens to participate in markets" />
      <Notification message={message} onClose={() => setMessage({ type: '', text: '' })} />

      {/* Balance */}
      {account && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600/20 rounded-xl">
                <Coins className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Your Balance</p>
                <p className="text-2xl font-bold">{parseFloat(tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-sm text-slate-400">tokens</span></p>
              </div>
            </div>
            <button onClick={loadData} className="p-2 text-slate-500 hover:text-slate-300 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </Card>
      )}

      {/* Sale stats */}
      {saleData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard title="Status" value={isSaleActive ? 'Active' : 'Inactive'} />
          <StatCard title="Rate" value={`${Number(saleData.tokensPerEth).toLocaleString()} / ETH`} />
          <StatCard title="Sold" value={parseFloat(saleData.tokensSold).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
          <StatCard title="Raised" value={`${parseFloat(saleData.totalRaised).toFixed(4)} ETH`} />
        </div>
      )}

      {isSaleActive ? (
        <div className="space-y-4">
          {timeLeft && (
            <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-900/20 border border-amber-500/30 rounded-xl px-4 py-2.5">
              <AlertCircle className="w-4 h-4" /> {timeLeft}
            </div>
          )}

          {/* ETH Purchase */}
          <Card>
            <h3 className="text-base font-bold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" /> Buy with ETH
            </h3>
            <div className="space-y-4">
              <Input
                label="ETH Amount"
                type="number" value={ethAmount} onChange={e => setEthAmount(e.target.value)}
                placeholder="0.1" min={saleData?.minPurchase} max={saleData?.maxPurchase}
              />
              {ethPreview && (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <ArrowRight className="w-4 h-4" /> You receive ≈ {ethPreview} tokens
                </div>
              )}
              <p className="text-xs text-slate-500">Min: {saleData?.minPurchase} ETH · Max: {saleData?.maxPurchase} ETH · Hard cap: {saleData?.hardCap} ETH</p>
              <Button variant="primary" onClick={handleBuyEth} loading={loading} disabled={!ethAmount || !account} className="w-full">
                Buy with ETH
              </Button>
            </div>
          </Card>

          {/* Stablecoin Purchase */}
          {stablecoins.length > 0 && (
            <Card>
              <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-400" /> Buy with Stablecoin
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Select Stablecoin</label>
                  <select
                    value={selectedStablecoin}
                    onChange={e => { setSelectedStablecoin(e.target.value); setStableApproved(false); }}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-slate-100"
                  >
                    {stablecoins.map(addr => (
                      <option key={addr} value={addr}>
                        {addr.slice(0, 10)}... ({stablecoinInfos[addr]?.tokensPerUnit} tokens per unit)
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Amount"
                  type="number" value={stableAmount} onChange={e => { setStableAmount(e.target.value); setStableApproved(false); }}
                  placeholder="100"
                />
                {stablePreview && (
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <ArrowRight className="w-4 h-4" /> You receive ≈ {stablePreview} tokens
                  </div>
                )}
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={handleApproveStable} loading={loading} disabled={!stableAmount || !account || stableApproved} className="flex-1">
                    {stableApproved ? 'Approved ✓' : 'Approve'}
                  </Button>
                  <Button variant="primary" onClick={handleBuyStable} loading={loading} disabled={!stableAmount || !account || !stableApproved} className="flex-1">
                    Buy Tokens
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <div className="text-center py-8 text-slate-500">
            <Coins className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No active token sale</p>
            <p className="text-sm mt-1">Check back later or contact the platform admin.</p>
          </div>
        </Card>
      )}

      {/* Admin Panel */}
      {isOwner && (
        <Card className="border-orange-600/30 bg-orange-900/5">
          <h3 className="text-base font-bold mb-4 flex items-center gap-2 text-orange-400">
            <AlertCircle className="w-5 h-5" /> Sale Administration
          </h3>
          <div className="flex gap-2 mb-5 border-b border-slate-700 pb-3">
            {['start', 'stablecoins', 'whitelist'].map(t => (
              <button key={t} onClick={() => setAdminTab(t)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium capitalize transition-colors ${adminTab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
                {t}
              </button>
            ))}
          </div>

          {adminTab === 'start' && (
            <div className="space-y-4">
              {!isSaleActive ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['tokensPerEth', 'Tokens per ETH'],
                      ['saleSupply', 'Sale Supply (tokens)'],
                      ['minPurchase', 'Min Purchase (ETH)'],
                      ['maxPurchase', 'Max Purchase (ETH)'],
                      ['hardCap', 'Hard Cap (ETH)'],
                      ['duration', 'Duration (hours)'],
                    ].map(([k, label]) => (
                      <Input key={k} label={label} type="number" value={saleAdmin[k]}
                        onChange={e => setSaleAdmin(prev => ({ ...prev, [k]: e.target.value }))} />
                    ))}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={saleAdmin.whitelistEnabled} onChange={e => setSaleAdmin(prev => ({ ...prev, whitelistEnabled: e.target.checked }))} />
                    <span className="text-slate-300">Enable Whitelist</span>
                  </label>
                  <Button variant="warning" onClick={handleStartSale} loading={loading} className="w-full">Start Sale</Button>
                </>
              ) : (
                <Button variant="danger" onClick={handleEndSale} loading={loading} className="w-full">End Sale</Button>
              )}
            </div>
          )}

          {adminTab === 'stablecoins' && (
            <div className="space-y-3">
              <Input label="Stablecoin Address" value={stablecoinConfig.address} onChange={e => setStablecoinConfig(p => ({ ...p, address: e.target.value }))} placeholder="0x..." />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Tokens Per Unit" type="number" value={stablecoinConfig.tokensPerUnit} onChange={e => setStablecoinConfig(p => ({ ...p, tokensPerUnit: e.target.value }))} />
                <Input label="Stablecoin Decimals" type="number" value={stablecoinConfig.decimals} onChange={e => setStablecoinConfig(p => ({ ...p, decimals: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={stablecoinConfig.enabled} onChange={e => setStablecoinConfig(p => ({ ...p, enabled: e.target.checked }))} />
                <span className="text-slate-300">Enabled</span>
              </label>
              <Button variant="secondary" onClick={handleSetStablecoin} loading={loading} className="w-full">Configure Stablecoin</Button>
            </div>
          )}

          {adminTab === 'whitelist' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Addresses (comma-separated)</label>
                <textarea value={whitelistAddresses} onChange={e => setWhitelistAddresses(e.target.value)}
                  placeholder="0x..., 0x..." rows={3}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => handleWhitelist(true)} loading={loading} className="flex-1">Add</Button>
                <Button variant="danger" onClick={() => handleWhitelist(false)} loading={loading} className="flex-1">Remove</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
