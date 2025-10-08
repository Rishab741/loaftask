import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wallet, TrendingUp, Award, Settings, AlertCircle, CheckCircle, PlusCircle, BarChart2, DollarSign, RefreshCw } from 'lucide-react';
import StockChart from './StockChart.jsx';

// --- CONTRACT CONFIGURATION ---
const MARKET_ABI = ["function placeBet(uint256 outcome, uint256 amount) external", "function claimWinnings() external", "function resolve(uint256 _winningOutcome) external", "function cancelMarket() external", "function state() view returns (uint8)", "function totalPool() view returns (uint256)", "function winningOutcome() view returns (uint256)", "function outcomesCount() view returns (uint256)", "function totalBetsPerOutcome(uint256) view returns (uint256)", "function bets(address, uint256) view returns (uint256)", "function metadata() view returns (string)", "function feeBps() view returns (uint256)", "event BetPlaced(address indexed user, uint256 indexed outcome, uint256 amount)", "event MarketResolved(uint256 indexed winningOutcome)", "event WinningsClaimed(address indexed user, uint256 amount)"];

const TOKEN_ABI = ["function approve(address spender, uint256 amount) returns (bool)", "function allowance(address owner, address spender) view returns (uint256)", "function balanceOf(address account) view returns (uint256)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"];

const FACTORY_ABI = ["function createMarket(address settlementToken, string calldata metadata, uint256 outcomesCount, uint256 feeBps) external returns (address)", "function getMarkets() external view returns (address[] memory)", "event MarketCreated(address indexed market, address creator)"];

const FACTORY_ADDRESS = "0x73B2CAD64a74901D728c33B38C3878EfF84Ede59";
const TOKEN_ADDRESS = "0x9ecF1946dEB0FCb8E5d1d377577fcDD326594971";

// Popular stocks with FREE API access
const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'META', name: 'Meta (Facebook)' },
  { symbol: 'JPM', name: 'JPMorgan Chase' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'WMT', name: 'Walmart' },
  { symbol: 'DIS', name: 'Disney' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'BA', name: 'Boeing' },
  { symbol: 'COIN', name: 'Coinbase' },
  { symbol: 'UBER', name: 'Uber' }
];

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
  const [tokenAllowance, setTokenAllowance] = useState('0');
  const [tokenBalance, setTokenBalance] = useState('0');
 
  const [betAmount, setBetAmount] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [selectedStock, setSelectedStock] = useState(POPULAR_STOCKS[0].symbol);
  const [priceTarget, setPriceTarget] = useState('');
  const [timeframe, setTimeframe] = useState('EOY 2025');
  const [direction, setDirection] = useState('above');
  const [newMarketOutcomes, setNewMarketOutcomes] = useState('2');
  const [resolveOutcome, setResolveOutcome] = useState('0');
 
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('bet');

  useEffect(() => {
    if (provider) loadMarkets();
  }, [provider]);

  useEffect(() => {
    if (marketAddress) loadMarketData();
  }, [marketAddress]);

  // Check token allowance
  async function checkAllowance() {
    if (!provider || !account || !marketAddress) return;
    
    try {
      const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, provider);
      const allowance = await token.allowance(account, marketAddress);
      setTokenAllowance(ethers.formatEther(allowance));
    } catch (error) {
      console.error('Error checking allowance:', error);
    }
  }

  // Check token balance
  async function checkBalance() {
    if (!provider || !account) return;
    
    try {
      const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, provider);
      const balance = await token.balanceOf(account);
      setTokenBalance(ethers.formatEther(balance));
    } catch (error) {
      console.error('Error checking balance:', error);
    }
  }

  // Extract stock symbol from market metadata
  function extractStockSymbol(metadata) {
    const match = metadata.match(/\b([A-Z]{2,5})\b/);
    return match ? match[1] : null;
  }

  // Calculate if user has sufficient allowance
  const hasSufficientAllowance = () => {
    if (!betAmount) return false;
    try {
      const betAmountWei = ethers.parseEther(betAmount);
      const allowanceWei = ethers.parseEther(tokenAllowance || '0');
      return allowanceWei >= betAmountWei;
    } catch {
      return false;
    }
  };

  // Calculate if user has sufficient balance
  const hasSufficientBalance = () => {
    if (!betAmount) return false;
    try {
      const betAmountWei = ethers.parseEther(betAmount);
      const balanceWei = ethers.parseEther(tokenBalance || '0');
      return balanceWei >= betAmountWei;
    } catch {
      return false;
    }
  };

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
      const reversedMarkets = [...marketAddresses].reverse();
      setMarkets(reversedMarkets);
     
      if (reversedMarkets.length > 0) {
        setMarketAddress(reversedMarkets[0]);
      }
      setMessage({ type: 'success', text: `Found ${marketAddresses.length} stock markets` });
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

      // Check allowance and balance after loading market data
      await checkAllowance();
      await checkBalance();
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
      const errorMessage = error.reason || error.data?.message || error.message;
      setMessage({ type: 'error', text: `Transaction failed: ${errorMessage}` });
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function approveTokens() {
    if (!signer || !betAmount) return;
    try {
      setApproving(true);
      setMessage({ type: 'info', text: 'Approving tokens...' });
      const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
      const amount = ethers.parseEther(betAmount);
      const tx = await token.approve(marketAddress, amount);
      await tx.wait();
      setMessage({ type: 'success', text: 'Tokens approved!' });
      await checkAllowance(); // Refresh allowance after approval
    } catch (error) {
      const errorMessage = error.reason || error.data?.message || error.message;
      setMessage({ type: 'error', text: `Approval failed: ${errorMessage}` });
    } finally {
      setApproving(false);
    }
  }

  async function placeBet() {
    if (!signer || !betAmount) return;
    const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);
    const amount = ethers.parseEther(betAmount);
    const success = await handleTransaction(() => market.placeBet(selectedOutcome, amount), 'Placing bet...', 'Bet placed successfully!');
    if (success) {
      await checkBalance(); // Refresh balance after bet
    }
  }

  async function claimWinnings() {
    if (!signer) return;
    const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);
    const success = await handleTransaction(() => market.claimWinnings(), 'Claiming winnings...', 'Winnings claimed!');
    if (success) {
      await checkBalance(); // Refresh balance after claim
    }
  }

  async function resolveMarket() {
    if (!signer) return;
    const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);
    await handleTransaction(() => market.resolve(parseInt(resolveOutcome)), 'Resolving market...', 'Market resolved!');
  }
 
  async function createMarket() {
    if (!signer || !priceTarget) {
      setMessage({ type: 'error', text: 'Please fill in all fields' });
      return;
    }

    const stockName = POPULAR_STOCKS.find(s => s.symbol === selectedStock)?.name || selectedStock;
    const metadata = `Will ${stockName} (${selectedStock}) trade ${direction} $${priceTarget} by ${timeframe}?`;
    
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
    const success = await handleTransaction(
      () => factory.createMarket(TOKEN_ADDRESS, metadata, parseInt(newMarketOutcomes), 200),
      'Creating new stock market...',
      'Stock Market created successfully!'
    );
    if (success) {
      await loadMarkets();
      setPriceTarget('');
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
       
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-indigo-400" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Loaf Stock Predictions</h1>
              <p className="text-sm text-slate-400 mt-1">Predict stock market movements</p>
            </div>
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

        {/* Token Balance & Allowance Info */}
        {account && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-semibold">Balance:</span>
                  <span className="text-sm">{parseFloat(tokenBalance).toFixed(2)} tokens</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-semibold">Approved:</span>
                  <span className="text-sm">{parseFloat(tokenAllowance).toFixed(2)} tokens</span>
                </div>
              </div>
              <button
                onClick={() => { checkAllowance(); checkBalance(); }}
                className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-md transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>
          </div>
        )}

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         
          <aside className="lg:col-span-1 space-y-4">
            <h2 className="text-xl font-bold px-2">Stock Markets</h2>
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
                  {account ? 'No stock markets found. Create one!' : 'Connect wallet to see markets.'}
                </div>
              )}
            </div>
          </aside>

          <div className="lg:col-span-2 space-y-8">
            {marketData ? (
              <>
                <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <BarChart2 className="w-6 h-6 text-indigo-400 mt-1" />
                    <div className="flex-1">
                      <p className="text-slate-400 text-sm mb-1">Stock Market Question</p>
                      <h2 className="text-2xl font-bold">{marketData.metadata}</h2>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <StatCard title="Status" value={marketData.state} icon={<CheckCircle size={16} />} />
                    <StatCard title="Total Pool" value={`${parseFloat(marketData.totalPool).toFixed(2)}`} icon={<BarChart2 size={16} />} />
                    <StatCard title="Outcomes" value={marketData.outcomesCount} icon={<Settings size={16} />} />
                    <StatCard title="Fee" value={`${marketData.feeBps / 100}%`} icon={<TrendingUp size={16} />} />
                  </div>
                  
                  {marketData.winningOutcome !== null && (
                    <div className="mb-6 bg-green-900/50 border border-green-500 p-3 rounded-lg flex items-center gap-2 font-semibold">
                      <Award className="w-5 h-5 text-green-400" />
                      <span>Winning Outcome: {marketData.winningOutcome}</span>
                    </div>
                  )}

                  {(() => {
                    const stockSymbol = extractStockSymbol(marketData.metadata);
                    return stockSymbol ? <StockChart stockSymbol={stockSymbol} /> : (
                      <div className="bg-yellow-900/30 border border-yellow-600 p-4 rounded-lg text-sm">
                        <p>⚠️ Stock symbol not found in market metadata. Chart unavailable.</p>
                      </div>
                    );
                  })()}
                </section>

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
                          <input 
                            type="text" 
                            value={betAmount} 
                            onChange={(e) => setBetAmount(e.target.value)} 
                            placeholder="10.0" 
                            className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                          />
                          
                          {/* Allowance and Balance Feedback */}
                          {betAmount && (
                            <div className="space-y-2 text-sm">
                              {!hasSufficientBalance() && (
                                <p className="text-red-400">
                                  ❌ Insufficient balance. You have {parseFloat(tokenBalance).toFixed(2)} tokens.
                                </p>
                              )}
                              {hasSufficientBalance() && !hasSufficientAllowance() && (
                                <p className="text-yellow-400">
                                  ⚠️ Approval needed for {betAmount} tokens.
                                </p>
                              )}
                              {hasSufficientBalance() && hasSufficientAllowance() && (
                                <p className="text-green-400">
                                  ✅ Ready to bet! Allowance confirmed.
                                </p>
                              )}
                            </div>
                          )}
                          
                          <div className="flex gap-4">
                            <button 
                              onClick={approveTokens} 
                              disabled={approving || !betAmount || !hasSufficientBalance() || hasSufficientAllowance()}
                              className="flex-1 py-3 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                            >
                              {approving ? 'Approving...' : 'Approve Tokens'}
                            </button>
                            <button 
                              onClick={placeBet} 
                              disabled={loading || !betAmount || !hasSufficientBalance() || !hasSufficientAllowance()}
                              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                            >
                              {loading ? 'Placing Bet...' : 'Place Bet'}
                            </button>
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
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><PlusCircle/> Create Stock Market</h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-semibold mb-2 text-slate-300">Select Stock</label>
                            <select 
                              value={selectedStock} 
                              onChange={(e) => setSelectedStock(e.target.value)}
                              className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {POPULAR_STOCKS.map(stock => (
                                <option key={stock.symbol} value={stock.symbol}>
                                  {stock.name} ({stock.symbol})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold mb-2 text-slate-300">Direction</label>
                              <select 
                                value={direction} 
                                onChange={(e) => setDirection(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="above">Above</option>
                                <option value="below">Below</option>
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-semibold mb-2 text-slate-300">Price Target ($)</label>
                              <input 
                                type="number" 
                                value={priceTarget} 
                                onChange={(e) => setPriceTarget(e.target.value)} 
                                placeholder="200.00"
                                step="0.01"
                                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold mb-2 text-slate-300">Timeframe</label>
                            <select 
                              value={timeframe} 
                              onChange={(e) => setTimeframe(e.target.value)}
                              className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="end of this month">End of this month</option>
                              <option value="end of next month">End of next month</option>
                              <option value="Q1 2025">Q1 2025</option>
                              <option value="Q2 2025">Q2 2025</option>
                              <option value="Q3 2025">Q3 2025</option>
                              <option value="Q4 2025">Q4 2025</option>
                              <option value="EOY 2025">EOY 2025</option>
                              <option value="EOY 2026">EOY 2026</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold mb-2 text-slate-300">Number of Outcomes</label>
                            <input 
                              type="number" 
                              value={newMarketOutcomes} 
                              onChange={(e) => setNewMarketOutcomes(e.target.value)} 
                              min="2" 
                              placeholder="2"
                              className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                            />
                          </div>

                          <div className="bg-slate-900/50 border border-slate-600 p-4 rounded-lg">
                            <p className="text-sm text-slate-400 mb-2">Preview:</p>
                            <p className="font-semibold">
                              Will {POPULAR_STOCKS.find(s => s.symbol === selectedStock)?.name} ({selectedStock}) trade {direction} ${priceTarget || '___'} by {timeframe}?
                            </p>
                          </div>

                          <button 
                            onClick={createMarket} 
                            disabled={loading || !priceTarget} 
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg font-semibold"
                          >
                            Create Stock Market
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-12 text-center text-slate-400">
                <BarChart2 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{account ? 'Select a stock market from the left to view details.' : 'Please connect your wallet to begin.'}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}