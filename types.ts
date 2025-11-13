export type TransactionType = 'BUY' | 'SELL';

export interface Transaction {
  id: string;
  ticker: string;
  companyName: string;
  type: TransactionType;
  shares: number;
  price: number;
  date: string;
  notes?: string;
}

export interface Position {
  ticker: string;
  companyName: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
  // Optional fields from market data API
  volume?: number;
  dayHigh?: number;
  dayLow?: number;
  previousClose?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
