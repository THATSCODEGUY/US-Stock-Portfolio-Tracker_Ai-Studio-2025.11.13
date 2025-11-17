import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { Header } from './components/Header';
import { PortfolioSummary } from './components/PortfolioSummary';
import { PortfolioTable } from './components/PortfolioTable';
import { AddPositionForm } from './components/AddPositionForm';
import { TransactionHistoryTable } from './components/TransactionHistoryTable';
import { PortfolioPieChart } from './components/PortfolioPieChart';
import { EditTransactionModal } from './components/EditTransactionModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { ManageAccountsModal } from './components/ManageAccountsModal';
import { ChatBot } from './components/ChatBot';
import { PortfolioPerformanceChart } from './components/PortfolioPerformanceChart';
import { ChangelogModal } from './components/ChangelogModal';
import { ApiErrorBanner } from './components/ApiErrorBanner';

import { fetchQuote, fetchHistoricalData } from './services/marketApi';
import { exportTransactions, exportAllData, parseImportedFile } from './utils/dataHandlers';
import { sampleTransactions, LATEST_CHANGELOG_VERSION } from './constants';

import { type PortfolioData, type Transaction, type Account, type Position, type HistoricalDataPoint } from './types';

const App: React.FC = () => {
    const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
    const [positions, setPositions] = useState<Position[]>([]);
    const [historicalPortfolioValue, setHistoricalPortfolioValue] = useState<HistoricalDataPoint[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isMarketDataLoading, setIsMarketDataLoading] = useState(true);
    const [isApiError, setIsApiError] = useState(false);
    
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
    const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
    const [isManageAccountsOpen, setIsManageAccountsOpen] = useState(false);
    const [isChangelogOpen, setIsChangelogOpen] = useState(false);
    const [importConfirmation, setImportConfirmation] = useState<{ message: string; data: any } | null>(null);

    const [seenChangelogVersion, setSeenChangelogVersion] = useState(() => {
       return parseInt(localStorage.getItem('seenChangelogVersion') || '0', 10);
    });

    // Load data from localStorage on initial render
    useEffect(() => {
        try {
            const savedData = localStorage.getItem('portfolioManagerData');
            if (savedData) {
                setPortfolioData(JSON.parse(savedData));
            } else {
                // One-time migration for old data structure
                const oldTransactions = localStorage.getItem('stockPortfolioTransactions');
                if (oldTransactions) {
                    const defaultAccount: Account = { id: uuidv4(), name: 'My Portfolio', cash: 0 };
                    const newPortfolioData: PortfolioData = {
                        accounts: [defaultAccount],
                        transactions: { [defaultAccount.id]: JSON.parse(oldTransactions) },
                        activeAccountId: defaultAccount.id
                    };
                    setPortfolioData(newPortfolioData);
                    localStorage.removeItem('stockPortfolioTransactions');
                } else {
                    // Create a fresh default state
                    const defaultAccount: Account = { id: uuidv4(), name: 'My First Account', cash: 10000 };
                    const newPortfolioData: PortfolioData = {
                        accounts: [defaultAccount],
                        transactions: { [defaultAccount.id]: sampleTransactions.map(t => ({...t, id: uuidv4()})) },
                        activeAccountId: defaultAccount.id
                    };
                    setPortfolioData(newPortfolioData);
                }
            }
        } catch (error) {
            console.error("Failed to load or migrate data:", error);
            // Handle corrupted data by resetting
            localStorage.clear();
        }
        setIsLoading(false);
    }, []);

    // Save data to localStorage whenever it changes
    useEffect(() => {
        if (portfolioData) {
            localStorage.setItem('portfolioManagerData', JSON.stringify(portfolioData));
        }
    }, [portfolioData]);

    const activeAccount = useMemo(() => {
        if (!portfolioData) return null;
        return portfolioData.accounts.find(a => a.id === portfolioData.activeAccountId) || null;
    }, [portfolioData]);

    const activeTransactions = useMemo(() => {
        if (!activeAccount || !portfolioData) return [];
        return portfolioData.transactions[activeAccount.id] || [];
    }, [activeAccount, portfolioData]);


    const calculatePositions = (transactions: Transaction[]): { [key: string]: { shares: number, cost: number, companyName: string } } => {
        const pos: { [key: string]: { shares: number, cost: number, companyName: string } } = {};
        transactions.forEach(tx => {
            if (!pos[tx.ticker]) {
                pos[tx.ticker] = { shares: 0, cost: 0, companyName: tx.companyName };
            }
            if (tx.type === 'BUY') {
                pos[tx.ticker].shares += tx.shares;
                pos[tx.ticker].cost += tx.shares * tx.price;
            } else {
                const prevShares = pos[tx.ticker].shares + tx.shares;
                const costPerShare = prevShares > 0 ? pos[tx.ticker].cost / prevShares : 0;
                pos[tx.ticker].shares -= tx.shares;
                pos[tx.ticker].cost -= tx.shares * costPerShare;
            }
            pos[tx.ticker].companyName = tx.companyName;
        });
        return pos;
    };

    useEffect(() => {
        const posMap = calculatePositions(activeTransactions);
        const uniqueTickers = Object.keys(posMap).filter(ticker => posMap[ticker].shares > 0.00001);

        if (uniqueTickers.length === 0) {
            setPositions([]);
            setIsMarketDataLoading(false);
            return;
        }

        setIsMarketDataLoading(true);
        const fetchMarketData = async () => {
            const quotePromises = uniqueTickers.map(ticker => fetchQuote(ticker));
            const quotes = await Promise.all(quotePromises);

            let hasMockData = false;
            
            const newPositions: Position[] = quotes.map(quote => {
                if (quote.isMock) hasMockData = true;

                const pos = posMap[quote.ticker];
                return {
                    ticker: quote.ticker,
                    companyName: pos.companyName,
                    shares: pos.shares,
                    averageCost: pos.shares > 0 ? pos.cost / pos.shares : 0,
                    currentPrice: quote.price,
                };
            });
            setPositions(newPositions);
            setIsApiError(hasMockData);
            setIsMarketDataLoading(false);
        };
        fetchMarketData();
    }, [activeTransactions]);

    useEffect(() => {
        const calculateHistory = async () => {
            const posMap = calculatePositions(activeTransactions);
            const uniqueTickers = Object.keys(posMap).filter(ticker => posMap[ticker].shares > 0);
            if (uniqueTickers.length === 0) {
                setHistoricalPortfolioValue([]);
                return;
            }

            const historyPromises = uniqueTickers.map(ticker => fetchHistoricalData(ticker, 30));
            const histories = await Promise.all(historyPromises);

            const portfolioHistory: { [date: string]: number } = {};

            histories.forEach((history, index) => {
                const ticker = uniqueTickers[index];
                const shares = posMap[ticker].shares;
                history.data.forEach(day => {
                    if (!portfolioHistory[day.date]) {
                        portfolioHistory[day.date] = 0;
                    }
                    portfolioHistory[day.date] += day.price * shares;
                });
            });

            const sortedHistory: HistoricalDataPoint[] = Object.entries(portfolioHistory)
                .map(([date, value]) => ({ date, value }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            setHistoricalPortfolioValue(sortedHistory);
        };
        if (!isMarketDataLoading) {
            calculateHistory();
        }
    }, [activeTransactions, isMarketDataLoading]);


    const summaryData = useMemo(() => {
        const totalMarketValue = positions.reduce((acc, pos) => acc + pos.shares * pos.currentPrice, 0);
        const totalCostBasis = positions.reduce((acc, pos) => acc + pos.shares * pos.averageCost, 0);
        const totalGainLoss = totalMarketValue - totalCostBasis;
        const totalGainLossPercent = totalCostBasis === 0 ? 0 : (totalGainLoss / totalCostBasis) * 100;

        return {
            totalMarketValue,
            totalGainLoss,
            totalGainLossPercent,
            tradingCash: activeAccount?.cash ?? 0
        };
    }, [positions, activeAccount]);


    const handleAddTransaction = async (newTransaction: Omit<Transaction, 'id'>) => {
        if (!activeAccount || !portfolioData) return;
        
        const addedTx = { ...newTransaction, id: uuidv4() };
        const updatedTransactions = [...activeTransactions, addedTx];
        
        let newCash = activeAccount.cash;
        if (addedTx.type === 'BUY') {
            newCash -= addedTx.shares * addedTx.price;
        } else {
            newCash += addedTx.shares * addedTx.price;
        }

        const updatedAccount = { ...activeAccount, cash: newCash };

        setPortfolioData(prev => ({
            ...prev!,
            accounts: prev!.accounts.map(acc => acc.id === updatedAccount.id ? updatedAccount : acc),
            transactions: {
                ...prev!.transactions,
                [activeAccount.id]: updatedTransactions
            }
        }));
    };

    const handleUpdateTransaction = async (updatedTx: Transaction) => {
        if (!activeAccount || !portfolioData) return;
        
        const updatedTransactions = activeTransactions.map(tx => tx.id === updatedTx.id ? updatedTx : tx);
        
        setPortfolioData(prev => ({
            ...prev!,
            transactions: {
                ...prev!.transactions,
                [activeAccount.id]: updatedTransactions
            }
        }));
        setEditingTransaction(null);
    };

    const handleDeleteTransaction = async () => {
        if (!deletingTransaction || !activeAccount || !portfolioData) return;
        
        const updatedTransactions = activeTransactions.filter(tx => tx.id !== deletingTransaction.id);
        
        let newCash = activeAccount.cash;
        // Revert cash adjustment on delete
        if (deletingTransaction.type === 'BUY') {
            newCash += deletingTransaction.shares * deletingTransaction.price;
        } else {
            newCash -= deletingTransaction.shares * deletingTransaction.price;
        }

        const updatedAccount = { ...activeAccount, cash: newCash };

        setPortfolioData(prev => ({
            ...prev!,
            accounts: prev!.accounts.map(acc => acc.id === updatedAccount.id ? updatedAccount : acc),
            transactions: {
                ...prev!.transactions,
                [activeAccount.id]: updatedTransactions
            }
        }));
        setDeletingTransaction(null);
    };
    
    const handleUpdateCash = async (newCash: number) => {
        if (!activeAccount || !portfolioData) return;
        const updatedAccount = { ...activeAccount, cash: newCash };
        setPortfolioData(prev => ({ 
            ...prev!, 
            accounts: prev!.accounts.map(acc => acc.id === updatedAccount.id ? updatedAccount : acc)
        }));
    };

    const handleSwitchAccount = (accountId: string) => {
        setPortfolioData(prev => ({ ...prev!, activeAccountId: accountId }));
    };

    const handleAddAccount = async (name: string) => {
        const newAccount = { id: uuidv4(), name, cash: 0 };
        setPortfolioData(prev => ({
            accounts: [...prev!.accounts, newAccount],
            transactions: { ...prev!.transactions, [newAccount.id]: [] },
            activeAccountId: newAccount.id
        }));
    };
    
    const handleUpdateAccount = async (id: string, name: string) => {
        const currentAccount = portfolioData?.accounts.find(a => a.id === id);
        if (!currentAccount) return;
        const updatedAccount = { ...currentAccount, name };
        setPortfolioData(prev => ({ 
            ...prev!, 
            accounts: prev!.accounts.map(acc => acc.id === updatedAccount.id ? updatedAccount : acc)
        }));
    };

    const handleDeleteAccount = async () => {
        if (!deletingAccount || !portfolioData || portfolioData.accounts.length <= 1) return;
        
        const newAccounts = portfolioData.accounts.filter(acc => acc.id !== deletingAccount.id);
        const newTransactions = { ...portfolioData.transactions };
        delete newTransactions[deletingAccount.id];
        const newActiveId = deletingAccount.id === portfolioData.activeAccountId ? newAccounts[0].id : portfolioData.activeAccountId;
        
        setPortfolioData({
            accounts: newAccounts,
            transactions: newTransactions,
            activeAccountId: newActiveId
        });
        setDeletingAccount(null);
    };

    const getImportMessage = (data: any) => {
        if (data && data.accounts && data.transactions) {
            return "This will replace ALL your data with the contents of this full backup file. Are you sure?";
        }
        if (data && data.account && data.transactions) {
            return `This will replace all transactions and set the cash balance for the active account "${activeAccount?.name}" with the data from this file. Are you sure?`;
        }
        return `This will add the transactions from this file to the active account "${activeAccount?.name}". Are you sure?`;
    };
    
    const handleImport = async (file: File) => {
        try {
            const data = await parseImportedFile(file);
            setImportConfirmation({ message: getImportMessage(data), data });
        } catch (error: any) {
            alert(`Import failed: ${error.message}`);
        }
    };
    
    const confirmImport = async () => {
        if (!importConfirmation) return;
        
        const data = importConfirmation.data;
        
        if (data && data.accounts && data.transactions) { // Full restore
            setPortfolioData(data);
        } else if (data && data.account && data.transactions) { // Single account restore
            if (activeAccount) {
                 const updatedAccount = { ...activeAccount, cash: data.account.cash };
                 setPortfolioData(prev => ({
                    ...prev!,
                    accounts: prev!.accounts.map(acc => acc.id === activeAccount.id ? updatedAccount : acc),
                    transactions: { ...prev!.transactions, [activeAccount.id]: data.transactions }
                 }));
            }
        } else if (Array.isArray(data)) { // Add transactions
            if (activeAccount) {
                 const newTransactions = [...activeTransactions, ...data];
                 setPortfolioData(prev => ({
                    ...prev!,
                    transactions: { ...prev!.transactions, [activeAccount.id]: newTransactions }
                 }));
            }
        }
        setImportConfirmation(null);
    }
    
    const handleExport = (format: 'json' | 'csv') => {
        exportTransactions(activeTransactions, activeAccount, format);
    };
    
    const handleExportAll = (format: 'json' | 'csv') => {
        if (portfolioData) {
            exportAllData(portfolioData, format);
        }
    };

    const handleOpenChangelog = () => {
        setIsChangelogOpen(true);
        setSeenChangelogVersion(LATEST_CHANGELOG_VERSION);
        localStorage.setItem('seenChangelogVersion', LATEST_CHANGELOG_VERSION.toString());
    };

    if (isLoading || !portfolioData) {
        return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading your portfolio...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200">
            <Header 
                accounts={portfolioData.accounts}
                activeAccount={activeAccount}
                onSwitchAccount={handleSwitchAccount}
                onManageAccounts={() => setIsManageAccountsOpen(true)}
                onOpenChangelog={handleOpenChangelog}
                showUpdateBadge={seenChangelogVersion < LATEST_CHANGELOG_VERSION}
            />
            {isApiError && <ApiErrorBanner onDismiss={() => setIsApiError(false)} />}
            <main className="container mx-auto p-4 md:p-8 space-y-8">
                <PortfolioSummary data={summaryData} onUpdateCash={handleUpdateCash} />
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                       <PortfolioTable positions={positions} isLoading={isMarketDataLoading} />
                       <div className="mt-8">
                            <h2 className="text-2xl font-bold text-white mb-4">Portfolio Analysis</h2>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <PortfolioPerformanceChart key={activeAccount?.id} data={historicalPortfolioValue} />
                                <PortfolioPieChart positions={positions} />
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-1">
                        <AddPositionForm onAddTransaction={handleAddTransaction} disabled={!activeAccount} />
                    </div>
                </div>

                <TransactionHistoryTable 
                   transactions={activeTransactions}
                   onEdit={(tx) => setEditingTransaction(tx)}
                   onDelete={(tx) => setDeletingTransaction(tx)}
                   onImport={handleImport}
                   onExport={handleExport}
                   onExportAll={handleExportAll}
               />

            </main>
            
            <ChatBot positions={positions} summaryData={summaryData} />

            {editingTransaction && (
                <EditTransactionModal 
                    isOpen={!!editingTransaction}
                    onClose={() => setEditingTransaction(null)}
                    transaction={editingTransaction}
                    onSave={handleUpdateTransaction}
                />
            )}
            
            {deletingTransaction && (
                <ConfirmationModal
                    isOpen={!!deletingTransaction}
                    onClose={() => setDeletingTransaction(null)}
                    onConfirm={handleDeleteTransaction}
                    title="Delete Transaction"
                    message={`Are you sure you want to delete this transaction for ${deletingTransaction.ticker}? This will adjust your cash balance and cannot be undone.`}
                />
            )}
            
            {deletingAccount && (
                <ConfirmationModal
                    isOpen={!!deletingAccount}
                    onClose={() => setDeletingAccount(null)}
                    onConfirm={handleDeleteAccount}
                    title="Delete Account"
                    message={`Are you sure you want to delete the account "${deletingAccount.name}"? All associated transactions will be lost. This action cannot be undone.`}
                />
            )}
            
            {importConfirmation && (
                 <ConfirmationModal
                    isOpen={!!importConfirmation}
                    onClose={() => setImportConfirmation(null)}
                    onConfirm={confirmImport}
                    title="Confirm Data Import"
                    message={importConfirmation.message}
                />
            )}

            <ManageAccountsModal 
                isOpen={isManageAccountsOpen}
                onClose={() => setIsManageAccountsOpen(false)}
                accounts={portfolioData.accounts}
                onAdd={handleAddAccount}
                onUpdate={handleUpdateAccount}
                onDelete={(acc) => setDeletingAccount(acc)}
            />

            <ChangelogModal isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
        </div>
    );
};

export default App;