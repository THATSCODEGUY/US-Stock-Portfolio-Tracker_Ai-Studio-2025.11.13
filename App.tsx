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
import { ChangelogModal } from './components/ChangelogModal';
import { changelog, LATEST_CHANGELOG_VERSION } from './constants';
import { ApiErrorBanner } from './components/ApiErrorBanner';
import { exportTransactions, parseImportedFile } from './utils/dataHandlers';

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
  const [historicalPrices, setHistoricalPrices] = useState<{ [key: string]: { date: string, price: number }[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [hasSeenLatestUpdate, setHasSeenLatestUpdate] = useState(() => {
    return localStorage.getItem('seenChangelogVersion') === LATEST_CHANGELOG_VERSION.toString();
  });

  const [apiError, setApiError] = useState<boolean>(false);
  const [pendingImport, setPendingImport] = useState<Transaction[] | null>(null);

  const handleOpenChangelog = () => {
    setIsChangelogOpen(true);
    localStorage.setItem('seenChangelogVersion', LATEST_CHANGELOG_VERSION.toString());
    setHasSeenLatestUpdate(true);
  }

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
      
      if (!apiError && quotes.some(q => q?.isMock)) {
        setApiError(true);
      }

      setMarketData(prevData => {
        const newData = { ...prevData };
        quotes.forEach(q => {
          if (q) {
            newData[q.ticker] = {
              currentPrice: q.price,
              volume: q.volume,
              dayHigh: q.dayHigh,
              dayLow: q.dayLow,
              previousClose: q.previousClose,
            };
          }
        });
        return newData;
      });
    } catch (error) {
      console.error("Failed to fetch market data", error);
      setApiError(true);
    } finally {
        if (isLoading) setIsLoading(false);
    }
  }, [transactions, isLoading, apiError]);

  useEffect(() => {
    fetchAllMarketData();
    const interval = setInterval(fetchAllMarketData, 60000); // Check for new prices every minute
    return () => clearInterval(interval);
  }, [transactions]);
  
  useEffect(() => {
    const fetchAllHistoricalData = async () => {
      const tickers = [...new Set(transactions.map(t => t.ticker))];
      if (tickers.length === 0) {
          setHistoricalPrices({});
          return;
      }

      try {
        const historicalDataPromises = tickers.map(ticker =>
          fetchHistoricalData(ticker, 30).then(result => ({ ticker, result }))
        );
        const results = await Promise.all(historicalDataPromises);

        if (!apiError && results.some(r => r.result.isMock)) {
            setApiError(true);
        }

        const newHistoricalPrices = results.reduce((acc, { ticker, result }) => {
          acc[ticker] = result.data;
          return acc;
        }, {} as { [key: string]: { date: string, price: number }[] });

        setHistoricalPrices(newHistoricalPrices);
      } catch (error) {
        console.error("Failed to fetch historical data for chart", error);
        setApiError(true);
      }
    };

    fetchAllHistoricalData();
  }, [transactions, apiError]);

  const historicalData = useMemo(() => {
    const data: HistoricalDataPoint[] = [];
    if (transactions.length === 0 || Object.keys(historicalPrices).length === 0) return data;
  
    const pricesLookup: { [key: string]: { [key: string]: number } } = {};
    Object.entries(historicalPrices).forEach(([ticker, priceData]) => {
        pricesLookup[ticker] = Object.fromEntries(priceData.map(p => [p.date, p.price]));
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
            if (shares > 0 && pricesLookup[ticker]?.[dateString]) {
                dailyValue += shares * pricesLookup[ticker][dateString];
            }
        });
        
        data.push({ date: dateString, value: dailyValue });
    }
    return data;
  }, [transactions, historicalPrices]);

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

  const handleExport = (format: 'json' | 'csv') => {
    exportTransactions(transactions, format);
  };

  const handleImport = async (file: File) => {
    try {
        const importedTransactions = await parseImportedFile(file);
        setPendingImport(importedTransactions);
    } catch (error) {
        alert((error as Error).message);
    }
  };

  const confirmImport = () => {
    if (pendingImport) {
        setTransactions(pendingImport);
        setPendingImport(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <Header onOpenChangelog={handleOpenChangelog} showUpdateBadge={!hasSeenLatestUpdate} />
      {apiError && <ApiErrorBanner onDismiss={() => setApiError(false)} />}
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
               <TransactionHistoryTable 
                  transactions={transactions} 
                  onEdit={setEditingTransaction} 
                  onDelete={setTransactionToDelete} 
                  onImport={handleImport}
                  onExport={handleExport}
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
      {pendingImport && (
        <ConfirmationModal
            isOpen={!!pendingImport}
            onClose={() => setPendingImport(null)}
            onConfirm={confirmImport}
            title="Confirm Import"
            message={`This will replace all ${transactions.length} current transactions with the ${pendingImport.length} transactions from the imported file. Are you sure you want to continue?`}
        />
      )}
       <ChatBot positions={positions} summaryData={summaryData} />
       <ChangelogModal isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
    </div>
  );
};

export default App;