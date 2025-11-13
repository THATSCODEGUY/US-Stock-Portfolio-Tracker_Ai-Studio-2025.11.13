// This is a mock API service to simulate fetching real-time stock data.
// In a real-world application, you would replace this with a call to a financial data API
// like Alpha Vantage, IEX Cloud, or Financial Modeling Prep.

export interface Quote {
  ticker: string;
  companyName: string;
  price: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  previousClose: number;
}

// A simple in-memory cache to make price fluctuations feel more "real"
const tickerCache: { [key: string]: { basePrice: number, companyName: string } } = {
    'AAPL': { basePrice: 172.50, companyName: 'Apple Inc.' },
    'GOOGL': { basePrice: 135.80, companyName: 'Alphabet Inc.' },
    'TSLA': { basePrice: 225.40, companyName: 'Tesla, Inc.' },
    'NVDA': { basePrice: 488.30, companyName: 'NVIDIA Corporation' },
    'AMZN': { basePrice: 130.00, companyName: 'Amazon.com, Inc.' },
    'MSFT': { basePrice: 330.00, companyName: 'Microsoft Corporation' }
};


export const fetchQuote = (ticker: string): Promise<Quote> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const upperTicker = ticker.toUpperCase();

      if (upperTicker === 'FAIL') {
        return reject(new Error(`Invalid ticker symbol: ${ticker}`));
      }
      
      // If the ticker is new, dynamically add it to the cache.
      if (!tickerCache[upperTicker]) {
          console.log(`New ticker "${upperTicker}" detected. Generating mock data.`);
          tickerCache[upperTicker] = {
              basePrice: 50 + Math.random() * 450, // Assign a random base price between $50 and $500
              companyName: `${upperTicker} Company Inc.` // Generate a placeholder name
          };
      }

      const cacheEntry = tickerCache[upperTicker];
      const basePrice = cacheEntry.basePrice;

      // Simulate price fluctuation
      const changePercent = (Math.random() - 0.495) * 0.05; // -2.5% to +2.5% change
      const newPrice = basePrice * (1 + changePercent);
      const previousClose = basePrice / (1 + (Math.random() - 0.5) * 0.1);
      const dayHigh = Math.max(newPrice, previousClose) * (1 + Math.random() * 0.02);
      const dayLow = Math.min(newPrice, previousClose) * (1 - Math.random() * 0.02);
      
      resolve({
        ticker: upperTicker,
        companyName: cacheEntry.companyName,
        price: newPrice,
        volume: 1_000_000 + Math.random() * 10_000_000,
        dayHigh,
        dayLow,
        previousClose
      });
    }, 300 + Math.random() * 400); // Simulate network latency
  });
};
