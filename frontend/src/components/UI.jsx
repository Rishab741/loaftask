import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import { CATEGORY_COLORS } from '../config.js';

export const Notification = ({ message, onClose }) => {
  if (!message?.text) return null;
  const styles = {
    error:   'bg-red-900/50 border-red-500 text-red-200',
    success: 'bg-green-900/50 border-green-500 text-green-200',
    info:    'bg-blue-900/50 border-blue-500 text-blue-200',
  };
  const icons = {
    error:   <AlertCircle className="w-5 h-5 flex-shrink-0" />,
    success: <CheckCircle className="w-5 h-5 flex-shrink-0" />,
    info:    <Info className="w-5 h-5 flex-shrink-0" />,
  };
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${styles[message.type] || styles.info}`}>
      {icons[message.type] || icons.info}
      <span className="flex-1">{message.text}</span>
      {onClose && (
        <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100 text-lg leading-none">&times;</button>
      )}
    </div>
  );
};

export const StatCard = ({ title, value, icon, sub }) => (
  <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700">
    <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
      {icon && <span className="opacity-70">{icon}</span>}
      <span className="uppercase tracking-wider">{title}</span>
    </div>
    <div className="text-xl font-bold text-slate-100">{value}</div>
    {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
  </div>
);

export const CategoryBadge = ({ category }) => {
  const cls = CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
  const labels = {
    stocks: '📈 Stocks', crypto: '₿ Crypto', sports: '⚽ Sports',
    politics: '🗳️ Politics', custom: '✨ Custom',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {labels[category] || category}
    </span>
  );
};

export const StatusBadge = ({ status }) => {
  const styles = {
    Active:    'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    Resolved:  'bg-blue-500/20 text-blue-300 border-blue-500/40',
    Cancelled: 'bg-red-500/20 text-red-300 border-red-500/40',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${styles[status] || styles.Active}`}>
      {status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />}
      {status}
    </span>
  );
};

export const Button = ({ variant = 'primary', loading, disabled, onClick, children, className = '', size = 'md' }) => {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5',
    lg: 'px-7 py-3 text-lg',
  };
  const variants = {
    primary:   'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600',
    success:   'bg-emerald-600 hover:bg-emerald-500 text-white',
    danger:    'bg-red-600 hover:bg-red-500 text-white',
    warning:   'bg-orange-600 hover:bg-orange-500 text-white',
    ghost:     'hover:bg-slate-700 text-slate-400 hover:text-slate-200',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {loading && (
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  );
};

export const Input = ({ label, error, className = '', ...props }) => (
  <div className="space-y-1">
    {label && <label className="block text-sm font-medium text-slate-300">{label}</label>}
    <input
      className={`w-full px-4 py-2.5 bg-slate-900 border ${error ? 'border-red-500' : 'border-slate-600'} rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${className}`}
      {...props}
    />
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
);

export const Select = ({ label, className = '', children, ...props }) => (
  <div className="space-y-1">
    {label && <label className="block text-sm font-medium text-slate-300">{label}</label>}
    <select
      className={`w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${className}`}
      {...props}
    >
      {children}
    </select>
  </div>
);

export const Card = ({ children, className = '' }) => (
  <div className={`bg-slate-800/50 border border-slate-700 rounded-2xl p-6 ${className}`}>
    {children}
  </div>
);

export const SectionHeader = ({ title, sub, action }) => (
  <div className="flex items-center justify-between mb-6">
    <div>
      <h2 className="text-xl font-bold text-slate-100">{title}</h2>
      {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
    </div>
    {action}
  </div>
);
