import React from 'react';
import { TrendingUpIcon, DollarSignIcon } from './icons';

interface SummaryData {
  totalMarketValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
}

interface PortfolioSummaryProps {
  data: SummaryData;
}

// FIX: Made the icon prop type more specific to allow cloning with a className prop, which resolves a TypeScript error.
const SummaryCard: React.FC<{ title: string; value: number; change?: number; changePercent?: number; icon: React.ReactElement<{ className?: string }>; isPositive?: boolean }> = ({ title, value, change, changePercent, icon, isPositive }) => {
    
    const iconBgColor = isPositive === true ? 'bg-green-900/50' : isPositive === false ? 'bg-red-900/50' : 'bg-blue-900/50';
    const iconTextColor = isPositive === true ? 'text-green-accent' : isPositive === false ? 'text-red-accent' : 'text-blue-400';
    
    return (
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg flex items-center space-x-4">
            <div className={`flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full ${iconBgColor}`}>
                {React.cloneElement(icon, { className: `h-6 w-6 ${iconTextColor}` })}
            </div>
            <div className="flex-grow">
                <p className="text-sm text-gray-400">{title}</p>
                <p className="text-3xl font-bold text-white tracking-tight">
                    {value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </p>
                {change !== undefined && changePercent !== undefined && (
                    <div className={`flex items-center text-sm mt-1 ${isPositive ? 'text-green-accent' : 'text-red-accent'}`}>
                        <TrendingUpIcon className={`h-4 w-4 mr-1 ${isPositive ? '' : 'transform rotate-180'}`} />
                        <span>
                            {change.toLocaleString('en-US', { style: 'currency', currency: 'USD', signDisplay: 'always' })} ({changePercent.toFixed(2)}%)
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

export const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({ data }) => {
  const { totalMarketValue, totalGainLoss, totalGainLossPercent } = data;
  const isPositive = totalGainLoss >= 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <SummaryCard 
        title="Portfolio Market Value"
        value={totalMarketValue}
        icon={<DollarSignIcon />}
      />
      <SummaryCard
        title="Total Gain / Loss"
        value={totalGainLoss}
        change={totalGainLoss}
        changePercent={totalGainLossPercent}
        icon={<TrendingUpIcon />}
        isPositive={isPositive}
      />
    </div>
  );
};