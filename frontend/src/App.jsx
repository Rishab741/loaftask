import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wallet, TrendingUp, Award, Settings, AlertCircle, CheckCircle, PlusCircle, BarChart2 } from 'lucide-react';

// --- CONTRACT CONFIGURATION ---
// ABIs remain the same
const MARKET_ABI = ["function placeBet(uint256 outcome, uint256 amount) external", "function claimWinnings() external", "function resolve(uint256 _winningOutcome) external", "function cancelMarket() external", "function state() view returns (uint8)", "function totalPool() view returns (uint256)", "function winningOutcome() view returns (uint256)", "function outcomesCount() view returns (uint256)", "function totalBetsPerOutcome(uint256) view returns (uint256)", "function bets(address, uint256) view returns (uint256)", "function metadata() view returns (string)", "function feeBps() view returns (uint256)", "event BetPlaced(address indexed user, uint256 indexed outcome, uint256 amount)", "event MarketResolved(uint256 indexed winningOutcome)", "event WinningsClaimed(address indexed user, uint256 amount)"];
const TOKEN_ABI = ["function approve(address spender, uint256 amount) returns (bool)", "function allowance(address owner, address spender) view returns (uint256)", "function balanceOf(address account) view returns (uint256)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"];
const FACTORY_ABI = ["function createMarket(address settlementToken, string calldata metadata, uint256 outcomesCount, uint256 feeBps) external returns (address)", "function getMarkets() external view returns (address[] memory)", "event MarketCreated(address indexed market, address creator)"];

// **Hardcoded Sepolia contract addresses**
const FACTORY_ADDRESS = "0x73B2CAD64a74901D728c33B38C3878EfF84Ede59";
const TOKEN_ADDRESS = "0x9ecF1946dEB0FCb8E5d1d377577fcDD326594971";

// --- UI COMPONENTS ---

const StatCard = ({ title, value, icon }) => (
  <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
    <div className="flex items-center gap-2 text-sm text-slate-400">
      {icon}
      <span>{title}</span>
    </div>
    <div className="text-2xl font-bold mt-1">{value}</div>
  </div>
);

const Notification = ({ message }) => {
  if (!message.text) return null;

  const baseClasses = "flex items-center gap-3 p-4 rounded-md border text-sm";
  const styles = {
    error: 'bg-red-900/50 border-red-500 text-red-200',
    success: 'bg-green-900/50 border-green-500 text-green-200',
    info: 'bg-blue-900/50 border-blue-500 text-blue-200',
  };

  return (
    <div className={`${baseClasses} ${styles[message.type] || styles.info}`}>
      {message.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
      <span>{message.text}</span>
    </div>
  );
};


// --- MAIN APP COMPONENT ---

export default function LoafPredictionApp() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  
  const [marketAddress, setMarketAddress] = useState('');
  const [markets, setMarkets] = useState([]);
  const [marketData, setMarketData] = useState(null);
  const [userBets, setUserBets] = useState({});
  
  const [betAmount, setBetAmount] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [newMarketMetadata, setNewMarketMetadata] = useState('');
  const [newMarketOutcomes, setNewMarketOutcomes] = useState('2');
  const [resolveOutcome, setResolveOutcome] = useState('0');
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('bet');

  // Auto-load markets on connect and market data on selection
  useEffect(() => {
    if (provider) loadMarkets();
  }, [provider]);

  useEffect(() => {
    if (marketAddress) loadMarketData();
  }, [marketAddress]);

  async function connectWallet() {
    try {
      if (!window.ethereum) {
        setMessage({ type: 'error', text: 'Please install MetaMask' });
        return;
      }
      const prov = new ethers.BrowserProvider(window.ethereum);
      await prov.send("eth_requestAccounts", []);
      const s = await prov.getSigner();
      const addr = await s.getAddress();
      
      setProvider(prov);
      setSigner(s);
      setAccount(addr);
      setMessage({ type: 'success', text: `Wallet connected!` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  }

  async function loadMarkets() {
    if (!provider) return;
    try {
      setLoading(true);
      const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
      const marketAddresses = await factory.getMarkets();
      setMarkets([...marketAddresses].reverse()); // Show newest first
      if (marketAddresses.length > 0) {
        setMarketAddress(marketAddresses[0]); // Auto-select the latest market
      }
      setMessage({ type: 'success', text: `Found ${marketAddresses.length} markets` });
    } catch (error) {
      setMessage({ type: 'error', text: `Could not load markets: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function loadMarketData() {
    if (!provider || !marketAddress) return;
    try {
      setLoading(true);
      const market = new ethers.Contract(marketAddress, MARKET_ABI, provider);
      const [state, totalPool, outcomesCount, metadata, feeBps] = await Promise.all([
        market.state(), market.totalPool(), market.outcomesCount(), market.metadata(), market.feeBps()
      ]);
      
      const outcomeData = await Promise.all(
        Array.from({ length: Number(outcomesCount) }).map((_, i) => market.totalBetsPerOutcome(i))
      );
      
      let winningOutcome = (Number(state) === 1) ? await market.winningOutcome() : null;
      
      setMarketData({
        state: ['Active', 'Resolved', 'Cancelled'][Number(state)],
        totalPool: ethers.formatEther(totalPool),
        outcomesCount: Number(outcomesCount),
        outcomeData,
        metadata,
        feeBps: Number(feeBps),
        winningOutcome: winningOutcome !== null ? Number(winningOutcome) : null
      });
      
      if (account) {
        const bets = {};
        const userBetsPromises = Array.from({ length: Number(outcomesCount) }).map((_, i) => market.bets(account, i));
        const userBetsResults = await Promise.all(userBetsPromises);
        userBetsResults.forEach((bet, i) => {
          bets[i] = ethers.formatEther(bet);
        });
        setUserBets(bets);
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error loading market: ${error.message}` });
      setMarketData(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleTransaction(txFunction, loadingMessage, successMessage) {
    try {
      setLoading(true);
      setMessage({ type: 'info', text: loadingMessage });
      const tx = await txFunction();
      await tx.wait();
      setMessage({ type: 'success', text: successMessage });
      await loadMarketData();
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: `Transaction failed: ${error.data?.message || error.message}` });
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function approveTokens() {
    if (!signer || !betAmount) return;
    const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    const amount = ethers.parseEther(betAmount);
    await handleTransaction(() => token.approve(marketAddress, amount), 'Approving tokens...', 'Tokens approved!');
  }

  async function placeBet() {
    if (!signer || !betAmount) return;
    const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);
    const amount = ethers.parseEther(betAmount);
    await handleTransaction(() => market.placeBet(selectedOutcome, amount), 'Placing bet...', 'Bet placed successfully!');
  }

  async function claimWinnings() {
    if (!signer) return;
    const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);
    await handleTransaction(() => market.claimWinnings(), 'Claiming winnings...', 'Winnings claimed!');
  }

  async function resolveMarket() {
    if (!signer) return;
    const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);
    await handleTransaction(() => market.resolve(parseInt(resolveOutcome)), 'Resolving market...', 'Market resolved!');
  }
  
  async function createMarket() {
    if (!signer || !newMarketMetadata) return;
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
    const success = await handleTransaction(
      () => factory.createMarket(TOKEN_ADDRESS, newMarketMetadata, parseInt(newMarketOutcomes), 200),
      'Creating new market...',
      'Market created successfully!'
    );
    if (success) await loadMarkets(); // Refresh market list
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-indigo-400" />
            <h1 className="text-3xl font-bold tracking-tight">Loaf Prediction</h1>
          </div>
          <button
            onClick={connectWallet}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-all font-semibold shadow-md shadow-indigo-600/20"
          >
            <Wallet className="w-5 h-5" />
            {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
          </button>
        </header>

        <div className="mb-6"><Notification message={message} /></div>

        {/* Main Content Grid */}
        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Markets List */}
          <aside className="lg:col-span-1 space-y-4">
            <h2 className="text-xl font-bold px-2">Available Markets</h2>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
              {markets.length > 0 ? markets.map((addr, idx) => (
                <div
                  key={idx}
                  onClick={() => setMarketAddress(addr)}
                  className={`p-4 rounded-lg cursor-pointer transition-all border-2 ${
                    marketAddress === addr
                      ? 'bg-slate-700 border-indigo-500'
                      : 'bg-slate-800 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <p className="font-mono text-sm break-words">{addr}</p>
                  <span className="text-xs text-slate-400">Market #{markets.length - 1 - idx}</span>
                </div>
              )) : (
                <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 text-center text-slate-400">
                  {account ? 'No markets found.' : 'Connect wallet to see markets.'}
                </div>
              )}
            </div>
          </aside>

          {/* Right Column: Market Details & Actions */}
          <div className="lg:col-span-2 space-y-8">
            {marketData ? (
              <>
                {/* Market Info */}
                <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                  <p className="text-slate-400 text-sm">Market Question</p>
                  <h2 className="text-2xl font-bold mb-4">{marketData.metadata}</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard title="Status" value={marketData.state} icon={<CheckCircle size={16} />} />
                    <StatCard title="Total Pool" value={`${parseFloat(marketData.totalPool).toFixed(2)}`} icon={<BarChart2 size={16} />} />
                    <StatCard title="Outcomes" value={marketData.outcomesCount} icon={<Settings size={16} />} />
                    <StatCard title="Fee" value={`${marketData.feeBps / 100}%`} icon={<TrendingUp size={16} />} />
                  </div>
                  {marketData.winningOutcome !== null && (
                    <div className="mt-4 bg-green-900/50 border border-green-500 p-3 rounded-lg flex items-center gap-2 font-semibold">
                      <Award className="w-5 h-5 text-green-400" />
                      <span>Winning Outcome: {marketData.winningOutcome}</span>
                    </div>
                  )}
                </section>

                {/* Action Tabs */}
                <section>
                  <div className="flex border-b border-slate-700 mb-6">
                    {['bet', 'claim', 'admin', 'create'].map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-3 font-semibold transition-colors -mb-px border-b-2 ${
                          activeTab === tab
                            ? 'text-indigo-400 border-indigo-400'
                            : 'text-slate-400 border-transparent hover:text-white'
                        }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                    {activeTab === 'bet' && (
                      <div>
                        <h3 className="text-xl font-bold mb-4">Place Your Bet</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                          {Array.from({ length: marketData.outcomesCount }).map((_, i) => (
                            <div key={i} onClick={() => setSelectedOutcome(i)} className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedOutcome === i ? 'bg-indigo-600/20 border-indigo-500' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}>
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-lg">Outcome {i}</span>
                                <span className="text-sm text-slate-400">{ethers.formatEther(marketData.outcomeData[i] || '0')} tokens</span>
                              </div>
                              {userBets[i] && parseFloat(userBets[i]) > 0 && <div className="mt-2 text-xs text-green-400 font-semibold">Your Bet: {userBets[i]}</div>}
                            </div>
                          ))}
                        </div>
                        <div className="space-y-4">
                          <input type="text" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} placeholder="10.0" className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          <div className="flex gap-4">
                            <button onClick={approveTokens} disabled={loading || !betAmount} className="flex-1 py-3 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors">Approve</button>
                            <button onClick={placeBet} disabled={loading || !betAmount} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors">Place Bet</button>
                          </div>
                        </div>
                      </div>
                    )}
                    {activeTab === 'claim' && (
                       <div>
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Award /> Claim Winnings</h3>
                        {marketData.state === 'Resolved' ? (
                          <div className="space-y-4">
                            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                                <p>Winning outcome: <span className="font-bold text-green-400">{marketData.winningOutcome}</span></p>
                                <p>Your winning bet: <span className="font-bold text-green-400">{userBets[marketData.winningOutcome] || '0.0'} tokens</span></p>
                            </div>
                            <button onClick={claimWinnings} disabled={loading} className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold">Claim Winnings</button>
                          </div>
                        ) : (
                          <p className="text-slate-400">Market is not resolved yet.</p>
                        )}
                      </div>
                    )}
                    {activeTab === 'admin' && (
                      <div>
                        <h3 className="text-xl font-bold mb-4">Market Administration</h3>
                        <div className="space-y-4">
                          <label className="block text-sm font-semibold mb-2">Resolve Market</label>
                          <div className="flex gap-4">
                            <input type="number" value={resolveOutcome} onChange={(e) => setResolveOutcome(e.target.value)} min="0" className="flex-1 px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            <button onClick={resolveMarket} disabled={loading} className="px-6 py-3 bg-orange-600 hover:bg-orange-500 rounded-lg font-semibold">Resolve</button>
                          </div>
                        </div>
                      </div>
                    )}
                    {activeTab === 'create' && (
                      <div>
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><PlusCircle/> Create New Market</h3>
                        <div className="space-y-4">
                          <input type="text" value={newMarketMetadata} onChange={(e) => setNewMarketMetadata(e.target.value)} placeholder="Market Question (e.g., Will ETH reach $5k by EOY?)" className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          <input type="number" value={newMarketOutcomes} onChange={(e) => setNewMarketOutcomes(e.target.value)} min="2" placeholder="2" className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          <button onClick={createMarket} disabled={loading || !newMarketMetadata} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg font-semibold">Create Market</button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-12 text-center text-slate-400">
                <p>{account ? 'Select a market from the left to view details.' : 'Please connect your wallet to begin.'}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}