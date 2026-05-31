import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ArrowLeft, Award, Shield, BarChart2, DollarSign, RefreshCw } from 'lucide-react';
import { MARKET_ABI, TOKEN_ABI, parseMetadata } from '../config.js';
import { CategoryBadge, StatusBadge, StatCard, Button, Input, Notification, Card } from '../components/UI.jsx';
import StockChart from '../components/StockChart.jsx';

const STATES = ['Active', 'Resolved', 'Cancelled'];

export default function MarketDetailView({ marketAddr, factoryMeta, provider, signer, account, deployments, onBack, setGlobalMessage }) {
  const [marketData, setMarketData] = useState(null);
  const [userBets, setUserBets] = useState({});
  const [allowance, setAllowance] = useState('0');
  const [tokenBalance, setTokenBalance] = useState('0');
  const [betAmount, setBetAmount] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [resolveOutcome, setResolveOutcome] = useState('0');
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [tab, setTab] = useState('bet');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [marketOwner, setMarketOwner] = useState('');

  const TOKEN_ADDRESS = deployments?.token;
  const meta = marketData ? parseMetadata(marketData.rawMetadata) : null;

  const load = async () => {
    if (!provider || !marketAddr) return;
    setLoading(true);
    try {
      const market = new ethers.Contract(marketAddr, MARKET_ABI, provider);
      const [state, totalPool, outcomesCount, rawMetadata, feeBps, owner] = await Promise.all([
        market.state(), market.totalPool(), market.outcomesCount(), market.metadata(), market.feeBps(), market.owner(),
      ]);
      const count = Number(outcomesCount);
      const outcomeData = await Promise.all(Array.from({ length: count }).map((_, i) => market.totalBetsPerOutcome(i)));
      let winningOutcome = Number(state) === 1 ? Number(await market.winningOutcome()) : null;

      setMarketOwner(owner);
      setMarketData({
        state: STATES[Number(state)],
        totalPool: ethers.formatEther(totalPool),
        outcomesCount: count,
        outcomeData,
        rawMetadata,
        feeBps: Number(feeBps),
        winningOutcome,
      });

      if (account && TOKEN_ADDRESS) {
        const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, provider);
        const [bal, all, ...betsArr] = await Promise.all([
          token.balanceOf(account),
          token.allowance(account, marketAddr),
          ...Array.from({ length: count }).map((_, i) => market.bets(account, i)),
        ]);
        setTokenBalance(ethers.formatEther(bal));
        setAllowance(ethers.formatEther(all));
        const bets = {};
        betsArr.forEach((b, i) => { bets[i] = ethers.formatEther(b); });
        setUserBets(bets);
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to load market: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [marketAddr, account, provider]);

  const notify = (type, text) => setMessage({ type, text });

  const doTx = async (fn, pending, done) => {
    setLoading(true);
    notify('info', pending);
    try {
      const tx = await fn();
      await tx.wait();
      notify('success', done);
      await load();
      return true;
    } catch (err) {
      notify('error', err.reason || err.data?.message || err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const needsApproval = () => {
    if (!betAmount) return false;
    try { return ethers.parseEther(allowance) < ethers.parseEther(betAmount); } catch { return true; }
  };
  const hasBalance = () => {
    if (!betAmount) return true;
    try { return ethers.parseEther(tokenBalance) >= ethers.parseEther(betAmount); } catch { return false; }
  };

  const handleApprove = async () => {
    if (!signer || !betAmount) return;
    setApproving(true);
    const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    await doTx(() => token.approve(marketAddr, ethers.parseEther(betAmount)), 'Approving tokens...', 'Tokens approved!');
    setApproving(false);
  };

  const handleBet = async () => {
    if (!signer || !betAmount) return;
    const market = new ethers.Contract(marketAddr, MARKET_ABI, signer);
    await doTx(() => market.placeBet(selectedOutcome, ethers.parseEther(betAmount)), 'Placing bet...', 'Bet placed!');
  };

  const handleClaim = async () => {
    if (!signer) return;
    const market = new ethers.Contract(marketAddr, MARKET_ABI, signer);
    await doTx(() => market.claimWinnings(), 'Claiming winnings...', 'Winnings claimed!');
  };

  const handleResolve = async () => {
    if (!signer) return;
    const market = new ethers.Contract(marketAddr, MARKET_ABI, signer);
    await doTx(() => market.resolve(parseInt(resolveOutcome)), 'Resolving market...', 'Market resolved!');
  };

  const handleCancel = async () => {
    if (!signer) return;
    const market = new ethers.Contract(marketAddr, MARKET_ABI, signer);
    await doTx(() => market.cancelMarket(), 'Cancelling market...', 'Market cancelled.');
  };

  const isOwner = account && marketOwner && ethers.getAddress(account) === ethers.getAddress(marketOwner);

  const outcomeLabels = meta?.outcomes || Array.from({ length: marketData?.outcomesCount || 0 }, (_, i) => i === 0 ? 'YES' : i === 1 ? 'NO' : `Option ${i + 1}`);

  const tabs = ['bet', 'claim', ...(isOwner ? ['admin'] : [])];

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Marketplace
      </button>

      <Notification message={message} onClose={() => setMessage({ type: '', text: '' })} />

      {marketData ? (
        <>
          {/* Header */}
          <Card>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {factoryMeta?.category && <CategoryBadge category={factoryMeta.category} />}
              <StatusBadge status={marketData.state} />
              {factoryMeta?.tenant && factoryMeta.tenant !== ethers.ZeroAddress && (
                <span className="text-xs text-slate-500">by {factoryMeta.tenant.slice(0, 10)}...</span>
              )}
            </div>
            <h2 className="text-2xl font-bold text-slate-100 leading-snug mb-5">{meta?.question}</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <StatCard title="Total Pool" value={`${parseFloat(marketData.totalPool).toLocaleString()} tokens`} icon={<BarChart2 size={14} />} />
              <StatCard title="Status" value={marketData.state} icon={<Award size={14} />} />
              <StatCard title="Outcomes" value={marketData.outcomesCount} icon={<DollarSign size={14} />} />
              <StatCard title="Fee" value={`${marketData.feeBps / 100}%`} icon={<Shield size={14} />} />
            </div>

            {marketData.winningOutcome !== null && (
              <div className="flex items-center gap-2 px-4 py-3 bg-emerald-900/30 border border-emerald-500/40 rounded-xl text-emerald-300 font-semibold">
                <Award className="w-5 h-5" />
                Winning outcome: {outcomeLabels[marketData.winningOutcome] || `Outcome ${marketData.winningOutcome}`}
              </div>
            )}
          </Card>

          {/* Stock/Crypto Chart */}
          {meta?.stockSymbol && (
            <StockChart
              stockSymbol={meta.stockSymbol}
              targetPrice={meta.priceTarget ? parseFloat(meta.priceTarget) : null}
            />
          )}

          {/* Outcome bars */}
          <Card>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Outcome Distribution</h3>
            <div className="space-y-3">
              {Array.from({ length: marketData.outcomesCount }).map((_, i) => {
                const amount = parseFloat(ethers.formatEther(marketData.outcomeData[i] || 0n));
                const total = parseFloat(marketData.totalPool) || 1;
                const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0';
                const isWinner = marketData.winningOutcome === i;
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={`font-semibold ${isWinner ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {isWinner && '🏆 '}{outcomeLabels[i]}
                      </span>
                      <span className="text-slate-400">{amount.toLocaleString()} tokens ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isWinner ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {userBets[i] && parseFloat(userBets[i]) > 0 && (
                      <p className="text-xs text-indigo-400 mt-1">Your bet: {parseFloat(userBets[i]).toLocaleString()} tokens</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Action tabs */}
          {account ? (
            <Card>
              <div className="flex border-b border-slate-700 mb-6 -mt-2">
                {tabs.map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-5 py-3 font-semibold capitalize transition-colors -mb-px border-b-2 ${tab === t ? 'text-indigo-400 border-indigo-400' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
                    {t === 'bet' ? 'Place Bet' : t === 'claim' ? 'Claim' : 'Admin'}
                  </button>
                ))}
              </div>

              {tab === 'bet' && marketData.state === 'Active' && (
                <BetPanel
                  marketData={marketData} outcomeLabels={outcomeLabels} userBets={userBets}
                  betAmount={betAmount} setBetAmount={setBetAmount}
                  selectedOutcome={selectedOutcome} setSelectedOutcome={setSelectedOutcome}
                  tokenBalance={tokenBalance} allowance={allowance}
                  needsApproval={needsApproval} hasBalance={hasBalance}
                  onApprove={handleApprove} onBet={handleBet}
                  loading={loading} approving={approving}
                />
              )}
              {tab === 'bet' && marketData.state !== 'Active' && (
                <p className="text-slate-400">This market is {marketData.state.toLowerCase()} — no more bets can be placed.</p>
              )}

              {tab === 'claim' && (
                <ClaimPanel
                  marketData={marketData} outcomeLabels={outcomeLabels} userBets={userBets}
                  onClaim={handleClaim} loading={loading}
                />
              )}

              {tab === 'admin' && isOwner && (
                <AdminPanel
                  marketData={marketData} outcomeLabels={outcomeLabels}
                  resolveOutcome={resolveOutcome} setResolveOutcome={setResolveOutcome}
                  onResolve={handleResolve} onCancel={handleCancel} loading={loading}
                />
              )}
            </Card>
          ) : (
            <Card>
              <p className="text-center text-slate-400 py-4">Connect your wallet to place bets or claim winnings.</p>
            </Card>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center py-24">
          <div className="text-center text-slate-500">
            <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Loading market data...</p>
          </div>
        </div>
      )}
    </div>
  );
}

function BetPanel({ marketData, outcomeLabels, userBets, betAmount, setBetAmount, selectedOutcome, setSelectedOutcome, tokenBalance, allowance, needsApproval, hasBalance, onApprove, onBet, loading, approving }) {
  const sufficient = hasBalance();
  const approvalNeeded = needsApproval();
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-bold">Choose Outcome</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: marketData.outcomesCount }).map((_, i) => (
          <div key={i} onClick={() => setSelectedOutcome(i)}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedOutcome === i ? 'border-indigo-500 bg-indigo-600/10' : 'border-slate-700 hover:border-slate-500 bg-slate-800/60'}`}>
            <p className="font-bold">{outcomeLabels[i]}</p>
            <p className="text-xs text-slate-400 mt-0.5">{parseFloat(ethers.formatEther(marketData.outcomeData[i] || 0n)).toLocaleString()} tokens</p>
            {userBets[i] && parseFloat(userBets[i]) > 0 && <p className="text-xs text-indigo-400 mt-1">Your bet: {parseFloat(userBets[i]).toFixed(2)}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Bet Amount (tokens)</span>
          <button onClick={() => setBetAmount(parseFloat(tokenBalance).toFixed(2))} className="text-indigo-400 hover:text-indigo-300 text-xs">
            Max: {parseFloat(tokenBalance).toFixed(2)}
          </button>
        </div>
        <Input
          type="number" value={betAmount} onChange={e => setBetAmount(e.target.value)}
          placeholder="10.0" min="0" step="1"
        />
      </div>

      {betAmount && (
        <div className="text-sm space-y-1">
          {!sufficient && <p className="text-red-400">Insufficient balance ({parseFloat(tokenBalance).toFixed(2)} tokens available)</p>}
          {sufficient && approvalNeeded && <p className="text-yellow-400">Approval needed before betting</p>}
          {sufficient && !approvalNeeded && <p className="text-emerald-400">Ready to bet on: {outcomeLabels[selectedOutcome]}</p>}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="secondary" onClick={onApprove} loading={approving}
          disabled={!betAmount || !sufficient || !approvalNeeded}
          className="flex-1"
        >
          Approve
        </Button>
        <Button
          variant="primary" onClick={onBet} loading={loading}
          disabled={!betAmount || !sufficient || approvalNeeded}
          className="flex-1"
        >
          Place Bet
        </Button>
      </div>
    </div>
  );
}

function ClaimPanel({ marketData, outcomeLabels, userBets, onClaim, loading }) {
  if (marketData.state !== 'Resolved') {
    return <p className="text-slate-400">Market must be resolved before you can claim winnings.</p>;
  }
  const won = marketData.winningOutcome !== null ? parseFloat(userBets[marketData.winningOutcome] || '0') : 0;
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-bold">Claim Winnings</h3>
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Winning outcome</span>
          <span className="font-semibold text-emerald-400">{outcomeLabels[marketData.winningOutcome]}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Your winning bet</span>
          <span className="font-semibold">{won.toFixed(4)} tokens</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Total pool</span>
          <span className="font-semibold">{parseFloat(marketData.totalPool).toLocaleString()} tokens</span>
        </div>
        <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
          <span className="text-slate-400">Platform fee</span>
          <span className="text-slate-400">{marketData.feeBps / 100}%</span>
        </div>
      </div>
      {won > 0 ? (
        <Button variant="success" onClick={onClaim} loading={loading} className="w-full">
          Claim Winnings
        </Button>
      ) : (
        <p className="text-slate-500 text-sm">You didn't bet on the winning outcome.</p>
      )}
    </div>
  );
}

function AdminPanel({ marketData, outcomeLabels, resolveOutcome, setResolveOutcome, onResolve, onCancel, loading }) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold flex items-center gap-2"><Shield className="w-5 h-5 text-orange-400" /> Market Administration</h3>

      {marketData.state === 'Active' && (
        <>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-300">Resolve Market</p>
            <select
              value={resolveOutcome}
              onChange={e => setResolveOutcome(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-slate-100"
            >
              {Array.from({ length: marketData.outcomesCount }).map((_, i) => (
                <option key={i} value={i}>{outcomeLabels[i]}</option>
              ))}
            </select>
            <Button variant="warning" onClick={onResolve} loading={loading} className="w-full">
              Resolve Market
            </Button>
          </div>

          <div className="pt-4 border-t border-slate-700">
            <p className="text-sm text-slate-400 mb-3">Cancel this market and allow refunds</p>
            <Button variant="danger" onClick={onCancel} loading={loading} className="w-full">
              Cancel Market
            </Button>
          </div>
        </>
      )}
      {marketData.state !== 'Active' && (
        <p className="text-slate-400">Market is {marketData.state.toLowerCase()} — no admin actions available.</p>
      )}
    </div>
  );
}
