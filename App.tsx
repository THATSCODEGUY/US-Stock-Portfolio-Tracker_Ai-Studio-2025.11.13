import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { type Position, type Transaction, type HistoricalDataPoint } from './types';
import { Header } from './components/Header';
import { AddPositionForm } from './components/AddPositionForm';
import { PortfolioTable } from './components/PortfolioTable';
import { PortfolioSummary } from './components/PortfolioSummary';
import { sampleTransactions } from './constants';
import { fetchQuote, fetchHistoricalData } from './services/marketApi';
import { EditTransactionModal } from './components/EditTransactionModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { TransactionHistoryTable } from './components/TransactionHistoryTable';
import { PortfolioPieChart } from './components/PortfolioPieChart';
import { ChatBot } from './components/ChatBot';
import { PortfolioPerformanceChart } from './components/PortfolioPerformanceChart';

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('stockPortfolioTransactions');
      return saved ? JSON.parse(saved) : sampleTransactions;
    } catch (error) {
      console.error("Could not parse transactions from localStorage", error);
      return sampleTransactions;
    }
  });

  const [marketData, setMarketData] = useState<{[key: string]: Omit<Position, 'shares' | 'averageCost' | 'ticker' | 'companyName'>}>({});
  const [isLoading, setIsLoading] = useState(true);
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  useEffect(() => {
    localStorage.setItem('stockPortfolioTransactions', JSON.stringify(transactions));
  }, [transactions]);

  const positions = useMemo<Position[]>(() => {
    const portfolio: { [key: string]: { shares: number; totalCost: number; companyName: string } } = {};

    transactions.forEach(tx => {
      if (!portfolio[tx.ticker]) {
        portfolio[tx.ticker] = { shares: 0, totalCost: 0, companyName: tx.companyName };
      }
      const existing = portfolio[tx.ticker];
      if (tx.type === 'BUY') {
        existing.shares += tx.shares;
        existing.totalCost += tx.shares * tx.price;
      } else { // SELL
        const avgCost = existing.shares > 0 ? existing.totalCost / existing.shares : 0;
        existing.totalCost -= tx.shares * avgCost; // Reduce cost basis proportionally
        existing.shares -= tx.shares;
      }
    });

    return Object.entries(portfolio)
      .filter(([, data]) => data.shares > 0.00001) // Filter out sold-off positions, allowing for float inaccuracies
      .map(([ticker, data]) => ({
        ticker,
        companyName: data.companyName,
        shares: data.shares,
        averageCost: data.shares > 0 ? data.totalCost / data.shares : 0,
        currentPrice: marketData[ticker]?.currentPrice ?? 0,
        ...marketData[ticker],
      }));
  }, [transactions, marketData]);
  
  const fetchAllMarketData = useCallback(async () => {
    const tickers = [...new Set(transactions.map(t => t.ticker))];
    if (tickers.length === 0) {
      setIsLoading(false);
      return;
    }
    
    try {
      const quotes = await Promise.all(tickers.map(ticker => fetchQuote(ticker)));
      setMarketData(prevData => {
        const newData = { ...prevData };
        quotes.forEach(q => {
          newData[q.ticker] = {
            currentPrice: q.price,
            volume: q.volume,
            dayHigh: q.dayHigh,
            dayLow: q.dayLow,
            previousClose: q.previousClose,
          };
        });
        return newData;
      });
    } catch (error) {
      console.error("Failed to fetch market data", error);
    } finally {
        if (isLoading) setIsLoading(false);
    }
  }, [transactions, isLoading]);

  useEffect(() => {
    fetchAllMarketData();
    const interval = setInterval(fetchAllMarketData, 30000);
    return () => clearInterval(interval);
  }, [transactions]);

  const historicalData = useMemo(() => {
    const data: HistoricalDataPoint[] = [];
    if (transactions.length === 0) return data;
  
    const tickers = [...new Set(transactions.map(t => t.ticker))];
    const historicalPrices: { [key: string]: { [key: string]: number } } = {};
  
    // This is a simplified mock. In a real app, you'd fetch this properly.
    tickers.forEach(ticker => {
        const prices = fetchHistoricalData(ticker, 30);
        historicalPrices[ticker] = Object.fromEntries(prices.map(p => [p.date, p.price]));
    });

    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];

        let dailyValue = 0;
        const dailyPositions: { [key: string]: number } = {};

        // Determine holdings on this specific day
        transactions.forEach(tx => {
            if (new Date(tx.date) <= date) {
                if (!dailyPositions[tx.ticker]) {
                    dailyPositions[tx.ticker] = 0;
                }
                if (tx.type === 'BUY') {
                    dailyPositions[tx.ticker] += tx.shares;
                } else {
                    dailyPositions[tx.ticker] -= tx.shares;
                }
            }
        });

        // Calculate market value for that day
        Object.entries(dailyPositions).forEach(([ticker, shares]) => {
            if (shares > 0 && historicalPrices[ticker]?.[dateString]) {
                dailyValue += shares * historicalPrices[ticker][dateString];
            }
        });
        
        data.push({ date: dateString, value: dailyValue });
    }
    return data;
  }, [transactions]);

  const addTransaction = useCallback(async (newTransaction: Omit<Transaction, 'id'>) => {
    setTransactions(prev => [...prev, { ...newTransaction, id: Date.now().toString() }].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }, []);
  
  const updateTransaction = useCallback((updatedTx: Transaction) => {
     setTransactions(prev => prev.map(tx => tx.id === updatedTx.id ? updatedTx : tx));
     setEditingTransaction(null);
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions(prev => prev.filter(p => p.id !== id));
    setTransactionToDelete(null);
  }, []);

  const summaryData = useMemo(() => {
    const totalCostBasis = positions.reduce((acc, pos) => acc + pos.shares * pos.averageCost, 0);
    const totalMarketValue = positions.reduce((acc, pos) => acc + pos.shares * pos.currentPrice, 0);
    const totalGainLoss = totalMarketValue - totalCostBasis;
    const totalGainLossPercent = totalCostBasis === 0 ? 0 : (totalGainLoss / totalCostBasis) * 100;
    
    return {
      totalMarketValue,
      totalGainLoss,
      totalGainLossPercent,
    };
  }, [positions]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <Header />
      <main className="container mx-auto p-4 md:p-8">
        <div className="mb-8">
          <PortfolioSummary data={summaryData} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
             <div>
                <h2 className="text-2xl font-bold mb-4 text-white">Portfolio Performance (30 Days)</h2>
                <PortfolioPerformanceChart data={historicalData} />
            </div>
             <div>
              <h2 className="text-2xl font-bold mb-4 text-white">Portfolio Distribution</h2>
              <PortfolioPieChart positions={positions} />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-4 text-white">Current Holdings</h2>
              <PortfolioTable positions={positions} isLoading={isLoading} />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-4 text-white">Transaction History</h2>
               <TransactionHistoryTable 
                  transactions={transactions} 
                  onEdit={setEditingTransaction} 
                  onDelete={setTransactionToDelete} 
               />
            </div>
          </div>
          <div className="lg:col-span-1">
            <AddPositionForm onAddTransaction={addTransaction} />
          </div>
        </div>
      </main>
      
      {editingTransaction && (
        <EditTransactionModal
          isOpen={!!editingTransaction}
          onClose={() => setEditingTransaction(null)}
          transaction={editingTransaction}
          onSave={updateTransaction}
        />
      )}
      
      {transactionToDelete && (
        <ConfirmationModal
          isOpen={!!transactionToDelete}
          onClose={() => setTransactionToDelete(null)}
          onConfirm={() => deleteTransaction(transactionToDelete.id)}
          title="Delete Transaction"
          message={`Are you sure you want to delete this ${transactionToDelete.type} transaction for ${transactionToDelete.ticker}? This action cannot be undone.`}
        />
      )}
       <ChatBot positions={positions} summaryData={summaryData} />
    </div>
  );
};

export default App;