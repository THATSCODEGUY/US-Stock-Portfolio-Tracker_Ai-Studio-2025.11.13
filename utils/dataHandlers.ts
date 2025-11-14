import { type Transaction } from '../types';

// Function to trigger file download in the browser
const downloadFile = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};

// --- EXPORT LOGIC ---

export const exportTransactions = (transactions: Transaction[], format: 'json' | 'csv') => {
    if (format === 'json') {
        const jsonString = JSON.stringify(transactions, null, 2);
        downloadFile(jsonString, 'portfolio_backup.json', 'application/json');
    } else if (format === 'csv') {
        const headers = ['id', 'ticker', 'companyName', 'type', 'shares', 'price', 'date', 'notes'];
        const csvRows = [
            headers.join(','),
            ...transactions.map(tx => {
                // Handle notes that might contain commas or quotes
                const notes = tx.notes ? `"${tx.notes.replace(/"/g, '""')}"` : '';
                return [tx.id, tx.ticker, `"${tx.companyName}"`, tx.type, tx.shares, tx.price, tx.date, notes].join(',');
            })
        ];
        const csvString = csvRows.join('\n');
        downloadFile(csvString, 'portfolio_backup.csv', 'text/csv;charset=utf-8;');
    }
};

// --- IMPORT LOGIC ---

// A simple CSV parser that handles quoted fields
const parseCsv = (csvText: string): Transaction[] => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const transactions: Transaction[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
        
        const txObject: { [key: string]: any } = {};
        headers.forEach((header, index) => {
            let value = values[index] || '';
            // Remove quotes from start and end
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1).replace(/""/g, '"');
            }
            txObject[header] = value;
        });
        
        // Type conversion and validation
        if (txObject.id && txObject.ticker) {
            transactions.push({
                id: txObject.id,
                ticker: txObject.ticker,
                companyName: txObject.companyName,
                type: txObject.type === 'BUY' || txObject.type === 'SELL' ? txObject.type : 'BUY',
                shares: parseFloat(txObject.shares) || 0,
                price: parseFloat(txObject.price) || 0,
                date: txObject.date,
                notes: txObject.notes || undefined,
            });
        }
    }
    return transactions;
};


export const parseImportedFile = (file: File): Promise<Transaction[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                if (file.type === 'application/json' || file.name.endsWith('.json')) {
                    const parsed = JSON.parse(content);
                    // Basic validation to check if it's an array of transaction-like objects
                    if (Array.isArray(parsed) && (parsed.length === 0 || (parsed[0].id && parsed[0].ticker))) {
                        resolve(parsed);
                    } else {
                        reject(new Error('Invalid JSON format. Expected an array of transactions.'));
                    }
                } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                    resolve(parseCsv(content));
                } else {
                    reject(new Error('Unsupported file type. Please upload a .json or .csv file.'));
                }
            } catch (e) {
                reject(new Error('Failed to read or parse the file. Please ensure it is correctly formatted.'));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
};