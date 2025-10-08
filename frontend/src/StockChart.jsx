import { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend,
  Filler
} from 'chart.js';
import { TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';

// Register Chart.js components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend,
  Filler
);

// Polygon.io API Key - Free tier: 5 requests/minute, 1 year historical data
const POLYGON_API_KEY = 'E7Lk7CoaFg9PezHndWLujdmo3KpvRppT'; // Replace with your actual key

export default function StockChart({ stockSymbol }) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stockInfo, setStockInfo] = useState(null);

  useEffect(() => {
    if (!stockSymbol) {
      setError('No stock symbol provided');
      setLoading(false);
      return;
    }

    fetchStockData();
  }, [stockSymbol]);

  async function fetchStockData() {
    setLoading(true);
    setError(null);
    
    try {
      // Convert symbol for Polygon.io (ASX stocks use prefix 'XASX:')
      const formattedSymbol = stockSymbol.includes('.AX') 
        ? `XASX:${stockSymbol.replace('.AX', '')}`
        : stockSymbol;
      
      // Calculate date range (90 days back)
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(toDate.getDate() - 90);
      
      // Format dates for Polygon API (YYYY-MM-DD)
      const fromDateStr = fromDate.toISOString().split('T')[0];
      const toDateStr = toDate.toISOString().split('T')[0];
      
      // Fetch aggregated bars data from Polygon
      const url = `https://api.polygon.io/v2/aggs/ticker/${formattedSymbol}/range/1/day/${fromDateStr}/${toDateStr}?adjusted=true&sort=asc&limit=120&apiKey=${POLYGON_API_KEY}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API request failed (HTTP ${response.status})`);
      }
      
      const data = await response.json();

      // Check for errors
      if (data.status === 'ERROR') {
        throw new Error(data.error || `API error for ${stockSymbol}`);
      }

      if (!data.results || data.results.length === 0) {
        throw new Error(`No data available for ${stockSymbol}. This stock may not be supported.`);
      }

      // Extract data from Polygon response
      const results = data.results;
      const closePrices = results.map(item => item.c); // Closing price
      const timestamps = results.map(item => item.t); // Timestamp in milliseconds
      const volumes = results.map(item => item.v); // Volume

      // Convert timestamps to dates
      const dates = timestamps.map(ts => 
        new Date(ts).toLocaleDateString('en-AU', { 
          month: 'short', 
          day: 'numeric'
        })
      );

      // Calculate price change
      const firstPrice = closePrices[0];
      const lastPrice = closePrices[closePrices.length - 1];
      const priceChange = lastPrice - firstPrice;
      const priceChangePercent = ((priceChange / firstPrice) * 100).toFixed(2);

      setStockInfo({
        symbol: stockSymbol,
        lastPrice: lastPrice.toFixed(2),
        priceChange: priceChange.toFixed(2),
        priceChangePercent,
        currency: 'AUD',
        lastUpdate: dates[dates.length - 1],
        dataPoints: closePrices.length
      });

      setChartData({
        labels: dates,
        datasets: [
          {
            label: `${stockSymbol} Price (AUD)`,
            data: closePrices,
            borderColor: priceChange >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
            backgroundColor: priceChange >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: priceChange >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
          }
        ]
      });

      setError(null);
    } catch (err) {
      console.error('Stock chart error:', err);
      setError(err.message || 'Failed to load stock data');
      setChartData(null);
      setStockInfo(null);
    } finally {
      setLoading(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 mt-6">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
          <p className="text-slate-400">Loading {stockSymbol} chart data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-xl p-6 mt-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-200 mb-1">Chart Load Failed</p>
            <p className="text-sm text-red-300 mb-3">{error}</p>
            <div className="flex gap-2">
              <button
                onClick={fetchStockData}
                className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500 rounded-lg text-sm font-semibold transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
              <a
                href={`https://www.google.com/finance/quote/${stockSymbol.replace('.AX', ':ASX')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm font-semibold transition-colors"
              >
                View on Google Finance
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (!chartData) {
    return (
      <div className="bg-yellow-900/20 border border-yellow-600 rounded-xl p-6 mt-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-yellow-200 mb-1">No Chart Data</p>
            <p className="text-sm text-yellow-300">Unable to load data for {stockSymbol}</p>
          </div>
        </div>
      </div>
    );
  }

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: 'rgb(203, 213, 225)',
          font: {
            size: 12,
            weight: '600'
          },
          padding: 15
        }
      },
      title: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgb(71, 85, 105)',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function(context) {
            return `Price: $${context.parsed.y.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false,
          color: 'rgba(71, 85, 105, 0.3)'
        },
        ticks: {
          color: 'rgb(148, 163, 184)',
          maxTicksLimit: 10,
          font: {
            size: 10
          }
        }
      },
      y: {
        display: true,
        position: 'right',
        grid: {
          color: 'rgba(71, 85, 105, 0.3)',
          drawBorder: false
        },
        ticks: {
          color: 'rgb(148, 163, 184)',
          font: {
            size: 11
          },
          callback: function(value) {
            return '$' + value.toFixed(2);
          }
        }
      }
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mt-6">
      {/* Stock Info Header */}
      {stockInfo && (
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-bold">{stockInfo.symbol}</h3>
            </div>
            <p className="text-xs text-slate-400">90-Day Performance</p>
            <p className="text-xs text-slate-500 mt-1">{stockInfo.dataPoints} days of data</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">${stockInfo.lastPrice}</div>
            <div className={`text-sm font-semibold flex items-center justify-end gap-1 ${
              parseFloat(stockInfo.priceChange) >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {parseFloat(stockInfo.priceChange) >= 0 ? '↑' : '↓'}
              ${Math.abs(parseFloat(stockInfo.priceChange)).toFixed(2)} 
              ({stockInfo.priceChangePercent}%)
            </div>
            <p className="text-xs text-slate-400 mt-1">{stockInfo.currency}</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-80">
        <Line data={chartData} options={chartOptions} />
      </div>

      {/* Footer */}
      {stockInfo && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-500">
            Data from Polygon.io • Last: {stockInfo.lastUpdate}
          </p>
          <button
            onClick={fetchStockData}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}