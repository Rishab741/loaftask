import { useState } from 'react';
import { ethers } from 'ethers';
import { Wallet, TrendingUp, Award, Settings, AlertCircle, CheckCircle } from 'lucide-react';

// ABIs - You'll need to replace these with actual ABIs from your compiled contracts
const MARKET_ABI = [
  "function placeBet(uint256 outcome, uint256 amount) external",
  "function claimWinnings() external",
  "function resolve(uint256 _winningOutcome) external",
  "function cancelMarket() external",
  "function state() view returns (uint8)",
  "function totalPool() view returns (uint256)",
  "function winningOutcome() view returns (uint256)",
  "function outcomesCount() view returns (uint256)",
  "function totalBetsPerOutcome(uint256) view returns (uint256)",
  "function bets(address, uint256) view returns (uint256)",
  "function metadata() view returns (string)",
  "function feeBps() view returns (uint256)",
  "event BetPlaced(address indexed user, uint256 indexed outcome, uint256 amount)",
  "event MarketResolved(uint256 indexed winningOutcome)",
  "event WinningsClaimed(address indexed user, uint256 amount)"
];

const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const FACTORY_ABI = [
  "function createMarket(address settlementToken, string calldata metadata, uint256 outcomesCount, uint256 feeBps) external returns (address)",
  "function getMarkets() external view returns (address[] memory)",
  "event MarketCreated(address indexed market, address creator)"
];

export default function LoafPredictionApp() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState(null);
  
  // Contract addresses
  const [factoryAddress, setFactoryAddress] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [marketAddress, setMarketAddress] = useState('');
  
  // Market data
  const [markets, setMarkets] = useState([]);
  const [marketData, setMarketData] = useState(null);
  const [userBets, setUserBets] = useState({});
  
  // Form inputs
  const [betAmount, setBetAmount] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [newMarketMetadata, setNewMarketMetadata] = useState('');
  const [newMarketOutcomes, setNewMarketOutcomes] = useState('2');
  const [resolveOutcome, setResolveOutcome] = useState('0');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('bet');

  // Connect wallet
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
      const network = await prov.getNetwork();
      
      setProvider(prov);
      setSigner(s);
      setAccount(addr);
      setChainId(network.chainId);
      setMessage({ type: 'success', text: `Connected: ${addr.slice(0, 6)}...${addr.slice(-4)}` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  }

  // Load markets from factory
  async function loadMarkets() {
    if (!provider || !factoryAddress) return;
    
    try {
      setLoading(true);
      const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
      const marketAddresses = await factory.getMarkets();
      setMarkets(marketAddresses);
      setMessage({ type: 'success', text: `Loaded ${marketAddresses.length} markets` });
    } catch (error) {
      setMessage({ type: 'error', text: `Error loading markets: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  // Load market data
  async function loadMarketData() {
    if (!provider || !marketAddress) return;
    
    try {
      setLoading(true);
      const market = new ethers.Contract(marketAddress, MARKET_ABI, provider);
      
      const [state, totalPool, outcomesCount, metadata, feeBps] = await Promise.all([
        market.state(),
        market.totalPool(),
        market.outcomesCount(),
        market.metadata(),
        market.feeBps()
      ]);
      
      const outcomeData = [];
      for (let i = 0; i < Number(outcomesCount); i++) {
        const total = await market.totalBetsPerOutcome(i);
        outcomeData.push(total);
      }
      
      let winningOutcome = null;
      if (state === 1n) {
        winningOutcome = await market.winningOutcome();
      }
      
      setMarketData({
        state: ['Active', 'Resolved', 'Cancelled'][Number(state)],
        totalPool: ethers.formatEther(totalPool),
        outcomesCount: Number(outcomesCount),
        outcomeData,
        metadata,
        feeBps: Number(feeBps),
        winningOutcome: winningOutcome ? Number(winningOutcome) : null
      });
      
      if (account) {
        const bets = {};
        for (let i = 0; i < Number(outcomesCount); i++) {
          const bet = await market.bets(account, i);
          bets[i] = ethers.formatEther(bet);
        }
        setUserBets(bets);
      }
      
      setMessage({ type: 'success', text: 'Market data loaded' });
    } catch (error) {
      setMessage({ type: 'error', text: `Error loading market: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  // Approve tokens
  async function approveTokens() {
    if (!signer || !tokenAddress || !marketAddress || !betAmount) return;
    
    try {
      setLoading(true);
      const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
      const amount = ethers.parseEther(betAmount);
      const tx = await token.approve(marketAddress, amount);
      setMessage({ type: 'info', text: 'Approving tokens...' });
      await tx.wait();
      setMessage({ type: 'success', text: 'Tokens approved!' });
    } catch (error) {
      setMessage({ type: 'error', text: `Approval failed: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  // Place bet
  async function placeBet() {
    if (!signer || !marketAddress || !betAmount) return;
    
    try {
      setLoading(true);
      const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);
      const amount = ethers.parseEther(betAmount);
      const tx = await market.placeBet(selectedOutcome, amount);
      setMessage({ type: 'info', text: 'Placing bet...' });
      await tx.wait();
      setMessage({ type: 'success', text: 'Bet placed successfully!' });
      await loadMarketData();
    } catch (error) {
      setMessage({ type: 'error', text: `Bet failed: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  // Claim winnings
  async function claimWinnings() {
    if (!signer || !marketAddress) return;
    
    try {
      setLoading(true);
      const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);
      const tx = await market.claimWinnings();
      setMessage({ type: 'info', text: 'Claiming winnings...' });
      await tx.wait();
      setMessage({ type: 'success', text: 'Winnings claimed!' });
      await loadMarketData();
    } catch (error) {
      setMessage({ type: 'error', text: `Claim failed: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  // Resolve market (owner only)
  async function resolveMarket() {
    if (!signer || !marketAddress) return;
    
    try {
      setLoading(true);
      const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);
      const tx = await market.resolve(parseInt(resolveOutcome));
      setMessage({ type: 'info', text: 'Resolving market...' });
      await tx.wait();
      setMessage({ type: 'success', text: 'Market resolved!' });
      await loadMarketData();
    } catch (error) {
      setMessage({ type: 'error', text: `Resolve failed: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  // Create new market
  async function createMarket() {
    if (!signer || !factoryAddress || !tokenAddress || !newMarketMetadata) return;
    
    try {
      setLoading(true);
      const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
      const tx = await factory.createMarket(
        tokenAddress,
        newMarketMetadata,
        parseInt(newMarketOutcomes),
        200 // 2% fee
      );
      setMessage({ type: 'info', text: 'Creating market...' });
      const receipt = await tx.wait();
      
      // Find the MarketCreated event
      const event = receipt.logs.find(log => {
        try {
          const parsedLog = factory.interface.parseLog(log);
          return parsedLog && parsedLog.name === 'MarketCreated';
        } catch {
          return false;
        }
      });
      
      if (event) {
        const parsedEvent = factory.interface.parseLog(event);
        const newMarketAddr = parsedEvent.args.market;
        setMarketAddress(newMarketAddr);
        setMessage({ type: 'success', text: `Market created: ${newMarketAddr}` });
      }
      
      await loadMarkets();
    } catch (error) {
      setMessage({ type: 'error', text: `Create failed: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  // The rest of your JSX remains the same...
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-10 h-10" />
              <h1 className="text-4xl font-bold">Loaf Prediction Market</h1>
            </div>
            <button
              onClick={connectWallet}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg hover:from-pink-600 hover:to-purple-700 transition-all font-semibold"
            >
              <Wallet className="w-5 h-5" />
              {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
            </button>
          </div>
          
          {message.text && (
            <div className={`flex items-center gap-2 p-4 rounded-lg ${
              message.type === 'error' ? 'bg-red-500/20 border border-red-500' :
              message.type === 'success' ? 'bg-green-500/20 border border-green-500' :
              'bg-blue-500/20 border border-blue-500'
            }`}>
              {message.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
              <span>{message.text}</span>
            </div>
          )}
        </div>

        {/* Configuration */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Contract Configuration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Factory Address</label>
              <input
                type="text"
                value={factoryAddress}
                onChange={(e) => setFactoryAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:border-purple-400"
              />
              <button
                onClick={loadMarkets}
                className="mt-2 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm font-semibold"
              >
                Load Markets
              </button>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Token Address</label>
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Market Address</label>
              <input
                type="text"
                value={marketAddress}
                onChange={(e) => setMarketAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:border-purple-400"
              />
              <button
                onClick={loadMarketData}
                className="mt-2 w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-sm font-semibold"
              >
                Load Market Data
              </button>
            </div>
          </div>
        </div>

        {/* Market Info */}
        {marketData && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Market Information</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-white/5 p-4 rounded-lg">
                <div className="text-sm opacity-70">Status</div>
                <div className="text-xl font-bold">{marketData.state}</div>
              </div>
              <div className="bg-white/5 p-4 rounded-lg">
                <div className="text-sm opacity-70">Total Pool</div>
                <div className="text-xl font-bold">{parseFloat(marketData.totalPool).toFixed(2)}</div>
              </div>
              <div className="bg-white/5 p-4 rounded-lg">
                <div className="text-sm opacity-70">Outcomes</div>
                <div className="text-xl font-bold">{marketData.outcomesCount}</div>
              </div>
              <div className="bg-white/5 p-4 rounded-lg">
                <div className="text-sm opacity-70">Fee</div>
                <div className="text-xl font-bold">{marketData.feeBps / 100}%</div>
              </div>
            </div>
            
            <div className="bg-white/5 p-4 rounded-lg mb-4">
              <div className="text-sm opacity-70 mb-1">Question</div>
              <div className="font-semibold">{marketData.metadata}</div>
            </div>

            {marketData.winningOutcome !== null && (
              <div className="bg-green-500/20 border border-green-500 p-4 rounded-lg">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  <span className="font-bold">Winning Outcome: {marketData.winningOutcome}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {['bet', 'claim', 'admin', 'create'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-gradient-to-r from-pink-500 to-purple-600'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Bet Tab */}
        {activeTab === 'bet' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-6">Place Your Bet</h2>
            
            {marketData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {Array.from({ length: marketData.outcomesCount }).map((_, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedOutcome === i
                        ? 'bg-purple-600/30 border-purple-400'
                        : 'bg-white/5 border-white/20 hover:border-white/40'
                    }`}
                    onClick={() => setSelectedOutcome(i)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-lg">Outcome {i}</span>
                      <span className="text-sm opacity-70">
                        {marketData.outcomeData[i] ? ethers.formatEther(marketData.outcomeData[i]) : '0'} tokens
                      </span>
                    </div>
                    {userBets[i] && parseFloat(userBets[i]) > 0 && (
                      <div className="mt-2 text-sm text-green-400">
                        Your bet: {parseFloat(userBets[i]).toFixed(2)} tokens
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Bet Amount (tokens)</label>
                <input
                  type="text"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="10.0"
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:border-purple-400 text-lg"
                />
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={approveTokens}
                  disabled={loading || !betAmount}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-semibold"
                >
                  {loading ? 'Processing...' : 'Approve Tokens'}
                </button>
                <button
                  onClick={placeBet}
                  disabled={loading || !betAmount}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all font-semibold"
                >
                  {loading ? 'Processing...' : 'Place Bet'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Claim Tab */}
        {activeTab === 'claim' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Award className="w-8 h-8" />
              Claim Winnings
            </h2>
            
            {marketData && marketData.state === 'Resolved' && (
              <div className="space-y-4">
                <div className="bg-white/5 p-6 rounded-lg">
                  <p className="text-lg mb-4">
                    Winning outcome: <span className="font-bold text-green-400">Outcome {marketData.winningOutcome}</span>
                  </p>
                  {userBets[marketData.winningOutcome] && parseFloat(userBets[marketData.winningOutcome]) > 0 ? (
                    <p className="text-lg mb-4">
                      Your winning bet: <span className="font-bold text-green-400">{parseFloat(userBets[marketData.winningOutcome]).toFixed(2)} tokens</span>
                    </p>
                  ) : (
                    <p className="text-lg mb-4 opacity-70">You don't have a winning bet in this market.</p>
                  )}
                </div>
                
                <button
                  onClick={claimWinnings}
                  disabled={loading}
                  className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all font-semibold text-lg"
                >
                  {loading ? 'Processing...' : 'Claim Winnings'}
                </button>
              </div>
            )}
            
            {marketData && marketData.state !== 'Resolved' && (
              <div className="bg-yellow-500/20 border border-yellow-500 p-6 rounded-lg">
                <p className="text-lg">This market has not been resolved yet. Winnings can only be claimed after resolution.</p>
              </div>
            )}
          </div>
        )}

        {/* Admin Tab */}
        {activeTab === 'admin' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-6">Market Administration</h2>
            <p className="text-sm opacity-70 mb-6">Owner-only functions</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Resolve Market (Winning Outcome)</label>
                <div className="flex gap-4">
                  <input
                    type="number"
                    value={resolveOutcome}
                    onChange={(e) => setResolveOutcome(e.target.value)}
                    min="0"
                    placeholder="0"
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:border-purple-400"
                  />
                  <button
                    onClick={resolveMarket}
                    disabled={loading}
                    className="px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-semibold"
                  >
                    {loading ? 'Processing...' : 'Resolve Market'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Tab */}
        {activeTab === 'create' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-6">Create New Market</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Market Question</label>
                <input
                  type="text"
                  value={newMarketMetadata}
                  onChange={(e) => setNewMarketMetadata(e.target.value)}
                  placeholder="Will X happen?"
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:border-purple-400"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2">Number of Outcomes</label>
                <input
                  type="number"
                  value={newMarketOutcomes}
                  onChange={(e) => setNewMarketOutcomes(e.target.value)}
                  min="2"
                  placeholder="2"
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:border-purple-400"
                />
              </div>
              
              <button
                onClick={createMarket}
                disabled={loading || !newMarketMetadata}
                className="w-full px-6 py-4 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all font-semibold text-lg"
              >
                {loading ? 'Creating...' : 'Create Market'}
              </button>
            </div>
          </div>
        )}

        {/* Markets List */}
        {markets.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mt-6">
            <h2 className="text-2xl font-bold mb-4">Available Markets</h2>
            <div className="space-y-2">
              {markets.map((addr, idx) => (
                <div
                  key={idx}
                  onClick={() => setMarketAddress(addr)}
                  className="p-4 bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer transition-colors flex justify-between items-center"
                >
                  <span className="font-mono text-sm">{addr}</span>
                  <span className="text-xs opacity-70">Market #{idx}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}