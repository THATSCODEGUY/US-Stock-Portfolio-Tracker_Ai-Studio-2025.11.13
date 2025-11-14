import React, { useRef } from 'react';
import { type Transaction } from '../types';
import { PencilIcon, TrashIcon, ArrowUpCircleIcon, ArrowDownCircleIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from './icons';

interface TransactionHistoryTableProps {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onImport: (file: File) => void;
  onExport: (format: 'json' | 'csv') => void;
}

export const TransactionHistoryTable: React.FC<TransactionHistoryTableProps> = ({ transactions, onEdit, onDelete, onImport, onExport }) => {
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
      // Reset input value to allow importing the same file again
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  };
  
  return (
    <div>
      <div className="flex flex-wrap gap-4 justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-white">Transaction History</h2>
        <div className="flex items-center space-x-2">
           <button 
              onClick={handleImportClick} 
              className="flex items-center justify-center py-2 px-3 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors"
           >
             <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
             Import
           </button>
           <input type="file" ref={importInputRef} onChange={handleFileChange} accept=".json,.csv" className="hidden" />

           <button 
             onClick={() => onExport('json')} 
             className="flex items-center justify-center py-2 px-3 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors"
           >
             <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
             Export JSON
           </button>
           <button 
             onClick={() => onExport('csv')} 
             className="flex items-center justify-center py-2 px-3 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors"
           >
             <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
             Export CSV
           </button>
        </div>
      </div>
      
      {transactions.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400 shadow-lg">
          <h3 className="text-xl font-semibold mb-2">No Transaction History</h3>
          <p>All your transactions will be listed here. You can import data from a backup file.</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                <tr>
                  <th scope="col" className="p-4">Date</th>
                  <th scope="col" className="p-4">Ticker</th>
                  <th scope="col" className="p-4">Type</th>
                  <th scope="col" className="p-4">Shares</th>
                  <th scope="col" className="p-4">Price</th>
                  <th scope="col" className="p-4">Amount</th>
                  <th scope="col" className="p-4">Notes</th>
                  <th scope="col" className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tx => (
                  <tr key={tx.id} className="border-b border-gray-700 hover:bg-gray-700/50 transition-colors duration-150">
                    <td className="p-4">{tx.date}</td>
                    <td className="p-4 font-bold text-white">{tx.ticker}</td>
                    <td className={`p-4 font-semibold ${tx.type === 'BUY' ? 'text-green-accent' : 'text-red-accent'}`}>
                      <div className="flex items-center">
                        {tx.type === 'BUY' ? 
                          <ArrowUpCircleIcon className="w-5 h-5 mr-2" /> : 
                          <ArrowDownCircleIcon className="w-5 h-5 mr-2" />
                        }
                        {tx.type}
                      </div>
                    </td>
                    <td className="p-4">{tx.shares}</td>
                    <td className="p-4">{tx.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                    <td className="p-4">{(tx.shares * tx.price).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                    <td className="p-4 text-gray-400 max-w-xs truncate">{tx.notes || '-'}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center space-x-2">
                        <button onClick={() => onEdit(tx)} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-600 transition-colors" aria-label="Edit">
                            <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => onDelete(tx)} className="text-gray-400 hover:text-red-accent p-2 rounded-full hover:bg-gray-600 transition-colors" aria-label="Delete">
                            <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};