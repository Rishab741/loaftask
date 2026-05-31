import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Award, RefreshCw, Loader2, TrendingUp, DollarSign, BarChart2 } from 'lucide-react';
import { MARKET_ABI, FACTORY_ABI, TOKEN_ABI, parseMetadata } from '../config.js';
import { Card, StatCard, StatusBadge, CategoryBadge, Button, SectionHeader, Notification } from '../components/UI.jsx';

const STATES = ['Active', 'Resolved', 'Cancelled'];

export default function DashboardPage({ provider, signer, account, deployments, onSelectMarket }) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [tokenBalance, setTokenBalance] = useState('0');
  const [totalBetValue, setTotalBetValue] = useState(0);
  const [claimableCount, setClaimableCount] = useState(0);

  const load = async () => {
    if (!provider || !account || !deployments?.factory) return;
    setLoading(true);
    try {
      const factory = new ethers.Contract(deployments.factory, FACTORY_ABI, provider);
      const allAddrs = await factory.getMarkets();

      // Load token balance
      if (deployments.token) {
        const token = new ethers.Contract(deployments.token, TOKEN_ABI, provider);
        const bal = await token.balanceOf(account);
        setTokenBalance(ethers.formatEther(bal));
      }

      // Check user's bets in each market
      const userPositions = [];
      await Promise.all(allAddrs.map(async addr => {
        const market = new ethers.Contract(addr, MARKET_ABI, provider);
        const [rawMeta, state, totalPool, outcomesCount, feeBps] = await Promise.all([
          market.metadata(), market.state(), market.totalPool(), market.outcomesCount(), market.feeBps(),
        ]).catch(() => null) ?? ['', 0n, 0n, 2n, 200n];

        const count = Number(outcomesCount);
        const userBets = await Promise.all(
          Array.from({ length: count }).map((_, i) => market.bets(account, i))
        );

        const hasBet = userBets.some(b => b > 0n);
        if (!hasBet) return;

        const stateNum = Number(state);
        const stateStr = STATES[stateNum];
        let winningOutcome = null;
        if (stateNum === 1) winningOutcome = Number(await market.winningOutcome());

        const meta = parseMetadata(rawMeta);
        const factoryInfo = await factory.getMarketInfo(addr).catch(() => null);

        userPositions.push({
          address: addr,
          question: meta.question,
          category: factoryInfo?.category || meta.category || 'custom',
          state: stateStr,
          totalPool: ethers.formatEther(totalPool),
          outcomesCount: count,
          feeBps: Number(feeBps),
          winningOutcome,
          userBets: userBets.map(b => ethers.formatEther(b)),
          outcomes: meta.outcomes || Array.from({ length: count }, (_, i) => i === 0 ? 'YES' : i === 1 ? 'NO' : `Option ${i + 1}`),
        });
      }));

      userPositions.sort((a, b) => {
        const order = { Active: 0, Resolved: 1, Cancelled: 2 };
        return order[a.state] - order[b.state];
      });

      setPositions(userPositions);
      setTotalBetValue(userPositions.reduce((sum, p) => {
        return sum + p.userBets.reduce((s, b) => s + parseFloat(b), 0);
      }, 0));
      setClaimableCount(userPositions.filter(p => {
        if (p.state !== 'Resolved' || p.winningOutcome === null) return false;
        return parseFloat(p.userBets[p.winningOutcome] || '0') > 0;
      }).length);
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to load positions: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [provider, account, deployments]);

  const handleClaim = async (marketAddr) => {
    if (!signer) return;
    const market = new ethers.Contract(marketAddr, MARKET_ABI, signer);
    setMessage({ type: 'info', text: 'Claiming winnings...' });
    try {
      const tx = await market.claimWinnings();
      await tx.wait();
      setMessage({ type: 'success', text: 'Winnings claimed!' });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err.reason || err.message });
    }
  };

  if (!account) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <div className="text-center py-12 text-slate-500">
            <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Connect your wallet</p>
            <p className="text-sm mt-1">Connect to see your bets and positions</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="My Portfolio"
        sub="Track your active bets and claim winnings"
        action={
          <button onClick={load} className="p-2 text-slate-500 hover:text-slate-300 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        }
      />
      <Notification message={message} onClose={() => setMessage({ type: '', text: '' })} />

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Token Balance" value={`${parseFloat(tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={<DollarSign size={14} />} />
        <StatCard title="Markets Entered" value={positions.length} icon={<BarChart2 size={14} />} />
        <StatCard title="Total Staked" value={`${totalBetValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={<TrendingUp size={14} />} />
        <StatCard title="Claimable" value={claimableCount > 0 ? `${claimableCount} wins` : '—'} icon={<Award size={14} />} />
      </div>

      {/* Claimable banner */}
      {claimableCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-900/30 border border-emerald-500/40 rounded-xl">
          <Award className="w-5 h-5 text-emerald-400" />
          <p className="text-emerald-300 font-semibold">
            You have {claimableCount} market{claimableCount !== 1 ? 's' : ''} with claimable winnings!
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin w-7 h-7 text-indigo-400" /></div>
      ) : positions.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-slate-500">
            <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No positions yet</p>
            <p className="text-sm mt-1">Head to the Marketplace to place your first bet!</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {positions.map(pos => (
            <PositionCard key={pos.address} pos={pos} onView={() => onSelectMarket?.(pos)} onClaim={() => handleClaim(pos.address)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PositionCard({ pos, onView, onClaim }) {
  const totalStake = pos.userBets.reduce((s, b) => s + parseFloat(b), 0);
  const isResolved = pos.state === 'Resolved';
  const won = isResolved && pos.winningOutcome !== null ? parseFloat(pos.userBets[pos.winningOutcome] || '0') : 0;
  const canClaim = won > 0;

  const estimatedPayout = canClaim ? (() => {
    const pool = parseFloat(pos.totalPool);
    const winPool = parseFloat(pos.userBets[pos.winningOutcome]);
    const totalWinPool = pool; // simplified
    return (pool * winPool / Math.max(totalWinPool, winPool) * (1 - pos.feeBps / 10000)).toFixed(2);
  })() : null;

  return (
    <Card className={`transition-all ${canClaim ? 'border-emerald-600/40 bg-emerald-900/5' : ''}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <CategoryBadge category={pos.category} />
            <StatusBadge status={pos.state} />
            {canClaim && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <Award className="w-3 h-3" /> Claim Available
              </span>
            )}
          </div>
          <p className="font-semibold text-slate-100 line-clamp-2">{pos.question}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm text-slate-400">Staked</p>
          <p className="font-bold">{totalStake.toFixed(2)}</p>
        </div>
      </div>

      {/* Bets breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {pos.userBets.map((bet, i) => {
          const amt = parseFloat(bet);
          if (amt === 0) return null;
          const isWinner = isResolved && pos.winningOutcome === i;
          return (
            <div key={i} className={`px-3 py-2 rounded-lg text-xs ${isWinner ? 'bg-emerald-900/30 border border-emerald-500/40' : 'bg-slate-800 border border-slate-700'}`}>
              <p className={`font-semibold ${isWinner ? 'text-emerald-300' : 'text-slate-300'}`}>
                {isWinner && '🏆 '}{pos.outcomes[i]}
              </p>
              <p className="text-slate-400">{amt.toFixed(4)} tokens</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onView} size="sm">View Market</Button>
        {canClaim && (
          <Button variant="success" onClick={onClaim} size="sm">
            <Award className="w-4 h-4" /> Claim Winnings
          </Button>
        )}
        {isResolved && !canClaim && (
          <p className="text-xs text-slate-500">You didn't back the winning outcome.</p>
        )}
      </div>
    </Card>
  );
}
