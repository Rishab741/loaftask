export const CATEGORIES = [
  { id: 'all',      label: 'All Markets', icon: '🌐', color: 'slate' },
  { id: 'stocks',   label: 'Stocks',      icon: '📈', color: 'blue' },
  { id: 'crypto',   label: 'Crypto',      icon: '₿',  color: 'orange' },
  { id: 'sports',   label: 'Sports',      icon: '⚽', color: 'green' },
  { id: 'politics', label: 'Politics',    icon: '🗳️', color: 'purple' },
  { id: 'custom',   label: 'Custom',      icon: '✨', color: 'pink' },
];

export const CATEGORY_COLORS = {
  stocks:   'bg-blue-500/20 text-blue-300 border-blue-500/40',
  crypto:   'bg-orange-500/20 text-orange-300 border-orange-500/40',
  sports:   'bg-green-500/20 text-green-300 border-green-500/40',
  politics: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  custom:   'bg-pink-500/20 text-pink-300 border-pink-500/40',
  default:  'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

export const POPULAR_STOCKS = [
  { symbol: 'AAPL',  name: 'Apple Inc.' },
  { symbol: 'MSFT',  name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN',  name: 'Amazon' },
  { symbol: 'TSLA',  name: 'Tesla' },
  { symbol: 'NVDA',  name: 'NVIDIA' },
  { symbol: 'META',  name: 'Meta' },
  { symbol: 'JPM',   name: 'JPMorgan' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway' },
  { symbol: 'V',     name: 'Visa' },
];

export const POPULAR_CRYPTOS = [
  { symbol: 'BTC',  name: 'Bitcoin' },
  { symbol: 'ETH',  name: 'Ethereum' },
  { symbol: 'SOL',  name: 'Solana' },
  { symbol: 'BNB',  name: 'BNB' },
  { symbol: 'XRP',  name: 'XRP' },
  { symbol: 'ADA',  name: 'Cardano' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'DOGE', name: 'Dogecoin' },
];

export const SPORTS = [
  'Football', 'Basketball', 'Cricket', 'Tennis', 'MMA', 'Boxing', 'Baseball', 'Hockey',
];

// Contract ABIs

export const MARKET_ABI = [
  "function placeBet(uint256 outcome, uint256 amount) external",
  "function claimWinnings() external",
  "function resolve(uint256 _winningOutcome) external",
  "function cancelMarket() external",
  "function withdrawFees(address to, uint256 amount) external",
  "function state() view returns (uint8)",
  "function totalPool() view returns (uint256)",
  "function winningOutcome() view returns (uint256)",
  "function outcomesCount() view returns (uint256)",
  "function totalBetsPerOutcome(uint256) view returns (uint256)",
  "function bets(address, uint256) view returns (uint256)",
  "function metadata() view returns (string)",
  "function feeBps() view returns (uint256)",
  "function owner() view returns (address)",
];

export const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function owner() view returns (address)",
  "function startSale(uint256,uint256,uint256,uint256,uint256,uint256,bool) external",
  "function buyTokens() external payable",
  "function buyTokensWithStablecoin(address stablecoin, uint256 amount) external",
  "function setStablecoinRate(address stablecoin, uint256 tokensPerUnit, uint8 stablecoinDecimals, bool enabled) external",
  "function endSale() external",
  "function addToWhitelist(address[]) external",
  "function removeFromWhitelist(address[]) external",
  "function withdrawRaisedETH() external",
  "function withdrawStablecoins(address stablecoin, address to) external",
  "function getSupportedStablecoins() external view returns (address[] memory)",
  "function calculateTokensForEth(uint256 ethAmount) external view returns (uint256)",
  "function calculateTokensForStablecoin(address stablecoin, uint256 amount) external view returns (uint256)",
  "function stablecoinConfigs(address) view returns (uint256 tokensPerUnit, uint8 stablecoinDecimals, bool enabled)",
  "function saleConfig() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)",
  "function saleActive() view returns (bool)",
  "function totalRaised() view returns (uint256)",
  "function tokensSold() view returns (uint256)",
];

export const FACTORY_ABI = [
  "function createMarket(address settlementToken, string calldata metadata, uint256 outcomesCount, uint256 feeBps, string calldata category, address tenant) external returns (address)",
  "function getMarkets() external view returns (address[] memory)",
  "function getMarketCount() external view returns (uint256)",
  "function getTenantMarkets(address tenant) external view returns (address[] memory)",
  "function getCategoryMarkets(string calldata category) external view returns (address[] memory)",
  "function getCreatorMarkets(address creator) external view returns (address[] memory)",
  "function getMarketInfo(address market) external view returns (address creator, address tenant, string memory category, uint256 createdAt)",
  "event MarketCreated(address indexed market, address indexed creator, address indexed tenant, string category)",
];

export const TENANT_ABI = [
  "function registerTenant(string calldata name, string calldata metadata, address feeRecipient) external payable",
  "function updateTenant(string calldata name, string calldata metadata, address feeRecipient) external",
  "function isTenant(address addr) external view returns (bool)",
  "function getTenants() external view returns (address[] memory)",
  "function getTenantCount() external view returns (uint256)",
  "function getTenantInfo(address addr) external view returns (string memory name, string memory metadata, address feeRecipient, bool active, uint256 registeredAt)",
  "function registrationFee() external view returns (uint256)",
  "function tenants(address) external view returns (string memory name, string memory metadata, address feeRecipient, bool active, uint256 registeredAt)",
];

// Parse market metadata — supports both JSON and legacy plain-text formats
export function parseMetadata(raw) {
  try {
    const parsed = JSON.parse(raw);
    return {
      question: parsed.question || raw,
      outcomes: parsed.outcomes || null,
      category: parsed.category || 'custom',
      stockSymbol: parsed.stockSymbol || null,
      cryptoSymbol: parsed.cryptoSymbol || null,
      sport: parsed.sport || null,
      resolutionDate: parsed.resolutionDate || null,
    };
  } catch {
    // Legacy plain-text metadata
    const stockMatch = raw.match(/\b([A-Z]{2,5})\b/);
    return {
      question: raw,
      outcomes: null,
      category: 'stocks',
      stockSymbol: stockMatch ? stockMatch[1] : null,
      cryptoSymbol: null,
      sport: null,
      resolutionDate: null,
    };
  }
}
