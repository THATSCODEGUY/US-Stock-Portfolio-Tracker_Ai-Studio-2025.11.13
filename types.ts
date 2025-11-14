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

export interface Account {
  id: string;
  name: string;
}

export interface PortfolioData {
  accounts: Account[];
  transactions: { [accountId: string]: Transaction[] };
  activeAccountId: string | null;
}

export interface Quote {
  ticker: string;
  companyName: string;
  price: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  previousClose: number;
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

export interface HistoricalDataPoint {
  date: string;
  value: number;
}
