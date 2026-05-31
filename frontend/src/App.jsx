import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wallet, TrendingUp, LayoutGrid, PlusCircle, Coins, Users, BarChart2, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import MarketplacePage from './pages/MarketplacePage.jsx';
import MarketDetailView from './pages/MarketDetailView.jsx';
import CreateMarketPage from './pages/CreateMarketPage.jsx';
import BuyTokensPage from './pages/BuyTokensPage.jsx';
import TenantPortalPage from './pages/TenantPortalPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import { Notification } from './components/UI.jsx';

const PAGES = [
  { id: 'marketplace', label: 'Marketplace', icon: LayoutGrid },
  { id: 'create',      label: 'Create Market', icon: PlusCircle },
  { id: 'buy',         label: 'Buy Tokens', icon: Coins },
  { id: 'tenant',      label: 'My Betplace', icon: Users },
  { id: 'dashboard',   label: 'My Bets', icon: BarChart2 },
];

export default function App() {
  const [deployments, setDeployments] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [tokenBalance, setTokenBalance] = useState('0');
  const [page, setPage] = useState('marketplace');
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [globalMessage, setGlobalMessage] = useState({ type: '', text: '' });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Load deployments.json
  useEffect(() => {
    fetch('./deployments.json')
      .then(r => { if (!r.ok) throw new Error(`deployments.json: ${r.statusText}`); return r.json(); })
      .then(data => {
        if (!data.factory || !data.token) throw new Error("deployments.json missing 'factory' or 'token'");
        setDeployments(data);
      })
      .catch(err => setConfigError(err.message));
  }, []);

  // Auto-reconnect if wallet was previously connected
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
        if (accounts.length > 0) connectWallet(false);
      });
      window.ethereum.on('accountsChanged', accounts => {
        if (accounts.length === 0) { setAccount(''); setSigner(null); }
        else connectWallet(false);
      });
    }
  }, []);

  const connectWallet = async (request = true) => {
    try {
      if (!window.ethereum) throw new Error('Please install MetaMask');
      const prov = new ethers.BrowserProvider(window.ethereum);
      if (request) await prov.send('eth_requestAccounts', []);
      const s = await prov.getSigner();
      const addr = await s.getAddress();
      setProvider(prov);
      setSigner(s);
      setAccount(addr);
      if (request) setGlobalMessage({ type: 'success', text: 'Wallet connected!' });
    } catch (err) {
      if (request) setGlobalMessage({ type: 'error', text: err.message });
    }
  };

  const handleSelectMarket = (market) => {
    setSelectedMarket(market);
    setPage('detail');
  };

  const handleNavigation = (pageId) => {
    setPage(pageId);
    setSelectedMarket(null);
    setMobileMenuOpen(false);
  };

  if (!deployments && !configError) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
        <div className="text-center">
          <h2 className="text-lg font-semibold">Loading configuration...</h2>
          <p className="text-slate-500 text-sm mt-1">Make sure deployments.json is in the public folder.</p>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-red-900/30 border border-red-500/50 rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-4" />
          <h2 className="text-xl font-bold mb-2">Configuration Error</h2>
          <p className="font-mono text-sm bg-slate-900 rounded-lg p-3 text-red-300 mb-3">{configError}</p>
          <p className="text-slate-400 text-sm">Ensure a valid <code>deployments.json</code> is in the <code>public/</code> folder.</p>
        </div>
      </div>
    );
  }

  const currentPageLabel = page === 'detail'
    ? 'Market Detail'
    : PAGES.find(p => p.id === page)?.label || 'Marketplace';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <button onClick={() => handleNavigation('marketplace')} className="flex items-center gap-2.5 shrink-0">
            <div className="p-1.5 bg-indigo-600 rounded-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="font-bold text-lg leading-none">LoafBet</p>
              <p className="text-xs text-slate-500 leading-none">{deployments?.network || 'Testnet'}</p>
            </div>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {PAGES.map(p => {
              const Icon = p.icon;
              const active = page === p.id || (page === 'detail' && p.id === 'marketplace');
              return (
                <button key={p.id} onClick={() => handleNavigation(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
                  <Icon className="w-4 h-4" />
                  {p.label}
                </button>
              );
            })}
          </nav>

          {/* Right: balance + wallet */}
          <div className="flex items-center gap-3">
            {account && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm">
                <Coins className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-slate-300 font-medium">{parseFloat(tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            )}
            <button
              onClick={() => connectWallet(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-colors shadow-md shadow-indigo-600/20"
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">
                {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect'}
              </span>
            </button>

            {/* Mobile menu toggle */}
            <button onClick={() => setMobileMenuOpen(v => !v)} className="md:hidden p-2 text-slate-400 hover:text-slate-200">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-3 space-y-1">
            {PAGES.map(p => {
              const Icon = p.icon;
              return (
                <button key={p.id} onClick={() => handleNavigation(p.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                  <Icon className="w-4 h-4" /> {p.label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Breadcrumb for detail view */}
      {page === 'detail' && (
        <div className="bg-slate-900/50 border-b border-slate-800 px-4 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-xs text-slate-500">
            <button onClick={() => handleNavigation('marketplace')} className="hover:text-slate-300">Marketplace</button>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-300 truncate max-w-xs">{selectedMarket?.question || 'Market Detail'}</span>
          </div>
        </div>
      )}

      {/* Global notification */}
      {globalMessage?.text && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <Notification message={globalMessage} onClose={() => setGlobalMessage({ type: '', text: '' })} />
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {page === 'marketplace' && (
          <MarketplacePage
            provider={provider}
            deployments={deployments}
            account={account}
            onSelectMarket={handleSelectMarket}
          />
        )}

        {page === 'detail' && selectedMarket && (
          <MarketDetailView
            marketAddr={selectedMarket.address}
            factoryMeta={selectedMarket}
            provider={provider}
            signer={signer}
            account={account}
            deployments={deployments}
            onBack={() => { setPage('marketplace'); setSelectedMarket(null); }}
            setGlobalMessage={setGlobalMessage}
          />
        )}

        {page === 'create' && (
          <CreateMarketPage
            signer={signer}
            account={account}
            deployments={deployments}
            setGlobalMessage={setGlobalMessage}
            onMarketCreated={() => setGlobalMessage({ type: 'success', text: 'Market created! View it in the Marketplace.' })}
          />
        )}

        {page === 'buy' && (
          <BuyTokensPage
            provider={provider}
            signer={signer}
            account={account}
            deployments={deployments}
            onBalanceChange={setTokenBalance}
          />
        )}

        {page === 'tenant' && (
          <TenantPortalPage
            provider={provider}
            signer={signer}
            account={account}
            deployments={deployments}
            onSelectMarket={handleSelectMarket}
          />
        )}

        {page === 'dashboard' && (
          <DashboardPage
            provider={provider}
            signer={signer}
            account={account}
            deployments={deployments}
            onSelectMarket={handleSelectMarket}
          />
        )}
      </main>
    </div>
  );
}
