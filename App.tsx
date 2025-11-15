import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { type Position, type Transaction, type HistoricalDataPoint, type Account, type PortfolioData } from './types';
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
import { exportTransactions, parseImportedFile, exportAllData } from './utils/dataHandlers';
import { ManageAccountsModal } from './components/ManageAccountsModal';
import { v4 as uuidv4 } from 'uuid';


const App: React.FC = () => {
  const [portfolioData, setPortfolioData] = useState<PortfolioData>(() => {
    // Check for the new data structure first
    const savedData = localStorage.getItem('portfolioManagerData');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        // Data migration for adding cash property
        if (parsedData.accounts && parsedData.accounts.some((acc: Account) => acc.cash === undefined)) {
            parsedData.accounts = parsedData.accounts.map((acc: Account) => ({ ...acc, cash: acc.cash || 0 }));
        }
        return parsedData;
      } catch (e) {
        console.error("Failed to parse portfolioManagerData", e);
      }
    }
    
    // One-time migration from old structure
    const oldTransactionsData = localStorage.getItem('stockPortfolioTransactions');
    if (oldTransactionsData) {
      try {
        const oldTransactions = JSON.parse(oldTransactionsData);
        const defaultAccount: Account = { id: uuidv4(), name: 'Default Account', cash: 0 };
        const newData: PortfolioData = {
          accounts: [defaultAccount],
          transactions: { [defaultAccount.id]: oldTransactions },
          activeAccountId: defaultAccount.id,
        };
        localStorage.setItem('portfolioManagerData', JSON.stringify(newData));
        localStorage.removeItem('stockPortfolioTransactions'); // Clean up old data
        return newData;
      } catch (e) {
         console.error("Failed to migrate old transaction data", e);
      }
    }

    // Default state for new users
    const defaultAccount: Account = { id: uuidv4(), name: 'Personal Portfolio', cash: 0 };
    return {
      accounts: [defaultAccount],
      transactions: { [defaultAccount.id]: sampleTransactions },
      activeAccountId: defaultAccount.id,
    };
  });
  
  const { accounts, transactions: allTransactions, activeAccountId } = portfolioData;
  const activeAccount = useMemo(() => accounts.find(acc => acc.id === activeAccountId), [accounts, activeAccountId]);
  
  const transactions = useMemo(() => {
    return (activeAccountId && allTransactions[activeAccountId]) || [];
  }, [allTransactions, activeAccountId]);
  
  const [marketData, setMarketData] = useState<{[key: string]: Omit<Position, 'shares' | 'averageCost' | 'ticker' | 'companyName'>}>({});
  const [historicalPrices, setHistoricalPrices] = useState<{ [key: string]: { date: string, price: number }[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isManageAccountsOpen, setIsManageAccountsOpen] = useState(false);
  const [hasSeenLatestUpdate, setHasSeenLatestUpdate] = useState(() => {
    return localStorage.getItem('seenChangelogVersion') === LATEST_CHANGELOG_VERSION.toString();
  });

  const [apiError, setApiError] = useState<boolean>(false);
  const [pendingImport, setPendingImport] = useState<Transaction[] | PortfolioData | null>(null);

  const handleOpenChangelog = () => {
    setIsChangelogOpen(true);
    localStorage.setItem('seenChangelogVersion', LATEST_CHANGELOG_VERSION.toString());
    setHasSeenLatestUpdate(true);
  }

  useEffect(() => {
    localStorage.setItem('portfolioManagerData', JSON.stringify(portfolioData));
  }, [portfolioData]);

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
      .filter(([, data]) => data.shares > 0.00001)
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
      setMarketData({});
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
    setIsLoading(true);
    fetchAllMarketData();
    const interval = setInterval(fetchAllMarketData, 60000);
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
    if (!activeAccountId) return;
    setPortfolioData(prev => {
        const newTx = { ...newTransaction, id: uuidv4() };
        const updatedTransactions = [...(prev.transactions[activeAccountId] || []), newTx]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return {
            ...prev,
            transactions: {
                ...prev.transactions,
                [activeAccountId]: updatedTransactions
            }
        };
    });
  }, [activeAccountId]);
  
  const updateTransaction = useCallback((updatedTx: Transaction) => {
    if (!activeAccountId) return;
    setPortfolioData(prev => ({
        ...prev,
        transactions: {
            ...prev.transactions,
            [activeAccountId]: prev.transactions[activeAccountId].map(tx => tx.id === updatedTx.id ? updatedTx : tx)
        }
    }));
    setEditingTransaction(null);
  }, [activeAccountId]);

  const deleteTransaction = useCallback((id: string) => {
    if (!activeAccountId) return;
    setPortfolioData(prev => ({
        ...prev,
        transactions: {
            ...prev.transactions,
            [activeAccountId]: prev.transactions[activeAccountId].filter(p => p.id !== id)
        }
    }));
    setTransactionToDelete(null);
  }, [activeAccountId]);

  const summaryData = useMemo(() => {
    const totalCostBasis = positions.reduce((acc, pos) => acc + pos.shares * pos.averageCost, 0);
    const totalMarketValue = positions.reduce((acc, pos) => acc + pos.shares * pos.currentPrice, 0);
    const totalGainLoss = totalMarketValue - totalCostBasis;
    const totalGainLossPercent = totalCostBasis === 0 ? 0 : (totalGainLoss / totalCostBasis) * 100;
    
    return {
      totalMarketValue,
      totalGainLoss,
      totalGainLossPercent,
      tradingCash: activeAccount?.cash || 0,
    };
  }, [positions, activeAccount]);

  // --- Account Management Handlers ---
  const handleSwitchAccount = (id: string) => {
    setPortfolioData(prev => ({ ...prev, activeAccountId: id }));
  };

  const handleAddAccount = (name: string) => {
    const newAccount: Account = { id: uuidv4(), name, cash: 0 };
    setPortfolioData(prev => ({
      ...prev,
      accounts: [...prev.accounts, newAccount],
      transactions: {
        ...prev.transactions,
        [newAccount.id]: []
      },
      activeAccountId: newAccount.id, // Switch to new account
    }));
  };

  const handleUpdateAccount = (id: string, name: string) => {
    setPortfolioData(prev => ({
      ...prev,
      accounts: prev.accounts.map(acc => acc.id === id ? { ...acc, name } : acc)
    }));
  };

  const handleUpdateAccountCash = (id: string, cash: number) => {
    setPortfolioData(prev => ({
      ...prev,
      accounts: prev.accounts.map(acc => acc.id === id ? { ...acc, cash } : acc)
    }));
  };

  const handleDeleteAccount = (id: string) => {
    if (accounts.length <= 1) {
      alert("Cannot delete the last account.");
      return;
    }
    const { [id]: _, ...remainingTransactions } = allTransactions;
    const remainingAccounts = accounts.filter(acc => acc.id !== id);
    
    setPortfolioData({
      accounts: remainingAccounts,
      transactions: remainingTransactions,
      activeAccountId: remainingAccounts[0]?.id || null,
    });
    setAccountToDelete(null);
  };
  
  // --- Import/Export Handlers ---
  const handleExport = (format: 'json' | 'csv') => {
    exportTransactions(transactions, format, activeAccount?.name);
  };

  const handleExportAll = (format: 'json' | 'csv') => {
    exportAllData(portfolioData, format);
  };

  const handleImport = async (file: File) => {
    try {
        const importedData = await parseImportedFile(file);
        setPendingImport(importedData);
    } catch (error) {
        alert((error as Error).message);
    }
  };

  const confirmImport = () => {
    if (pendingImport && activeAccountId) {
        // Check if it's a full data import or just transactions
        if ('accounts' in pendingImport && 'transactions' in pendingImport) {
          setPortfolioData(pendingImport as PortfolioData);
        } else {
          setPortfolioData(prev => ({
            ...prev,
            transactions: {
              ...prev.transactions,
              [activeAccountId]: pendingImport as Transaction[]
            }
          }))
        }
        setPendingImport(null);
    }
  };
  
  const getImportMessage = () => {
    if (!pendingImport) return '';
    if ('accounts' in pendingImport) {
        return `This will replace ALL your data, including ${accounts.length} accounts and their transactions, with the data from the backup file. Are you sure?`;
    }
    return `This will replace all ${transactions.length} transactions in the '${activeAccount?.name}' account with the ${pendingImport.length} transactions from the imported file. Are you sure?`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <Header 
        accounts={accounts}
        activeAccount={activeAccount || null}
        onSwitchAccount={handleSwitchAccount}
        onManageAccounts={() => setIsManageAccountsOpen(true)}
        onOpenChangelog={handleOpenChangelog} 
        showUpdateBadge={!hasSeenLatestUpdate} 
      />
      {apiError && <ApiErrorBanner onDismiss={() => setApiError(false)} />}
      <main className="container mx-auto p-4 md:p-8">
        <div className="mb-8">
          <PortfolioSummary 
            data={summaryData} 
            onUpdateCash={(newCash) => activeAccount && handleUpdateAccountCash(activeAccount.id, newCash)}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
             <div>
                <h2 className="text-2xl font-bold mb-4 text-white">Portfolio Performance (30 Days)</h2>
                <PortfolioPerformanceChart key={activeAccountId} data={historicalData} />
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
                  onExportAll={handleExportAll}
               />
            </div>
          </div>
          <div className="lg:col-span-1">
            <AddPositionForm onAddTransaction={addTransaction} disabled={!activeAccount} />
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
      {accountToDelete && (
         <ConfirmationModal
          isOpen={!!accountToDelete}
          onClose={() => setAccountToDelete(null)}
          onConfirm={() => handleDeleteAccount(accountToDelete.id)}
          title="Delete Account"
          message={`Are you sure you want to permanently delete the account "${accountToDelete.name}" and all of its transactions? This action cannot be undone.`}
        />
      )}
      {pendingImport && (
        <ConfirmationModal
            isOpen={!!pendingImport}
            onClose={() => setPendingImport(null)}
            onConfirm={confirmImport}
            title="Confirm Import"
            message={getImportMessage()}
        />
      )}
      <ManageAccountsModal 
        isOpen={isManageAccountsOpen}
        onClose={() => setIsManageAccountsOpen(false)}
        accounts={accounts}
        onAdd={handleAddAccount}
        onUpdate={handleUpdateAccount}
        onDelete={setAccountToDelete}
      />
       <ChatBot positions={positions} summaryData={summaryData} />
       <ChangelogModal isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
    </div>
  );
};

export default App;