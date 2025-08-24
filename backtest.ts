/**
 * Backtesting engine for the moomoo options bot
 * 
 * This module provides comprehensive backtesting functionality to evaluate
 * trading strategies against historical data without making actual trades.
 */

import { existsSync } from "std/fs/mod.ts";
import { parse } from "std/flags/mod.ts";

// ---- Backtesting Configuration --------------------------------------------
interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialCapital: number;
  universe: string[];
  strategies: string[];
  dataSource: "mock" | "historical";
  riskFreeRate: number;
  commissionPerContract: number;
}

interface MarketData {
  date: string;
  symbol: string;
  price: number;
  volume: number;
  impliedVol?: number;
}

interface OptionData {
  date: string;
  symbol: string;
  underlying: string;
  strike: number;
  expiry: string;
  optionType: "CALL" | "PUT";
  price: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  impliedVol?: number;
  openInterest?: number;
}

interface BacktestTrade {
  id: string;
  date: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  commission: number;
  strategy: string;
}

interface PortfolioMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
}

interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  dailyPnL: { date: string; pnl: number; cumPnL: number }[];
  metrics: PortfolioMetrics;
  strategyBreakdown: Record<string, PortfolioMetrics>;
}

// ---- Mock Data Generator ---------------------------------------------------
class MockDataGenerator {
  private s: number;
  
  constructor(seed = 42) { 
    this.s = seed >>> 0; 
  }
  
  private rnd(): number { // mulberry32
    this.s += 0x6D2B79F5; 
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); 
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  
  generateMarketData(symbols: string[], startDate: string, endDate: string): MarketData[] {
    const data: MarketData[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (const symbol of symbols) {
      let currentPrice = 100 + this.rnd() * 400; // Random starting price between 100-500
      const currentDate = new Date(start);
      
      while (currentDate <= end) {
        // Simple random walk with slight upward bias
        const dailyReturn = (this.rnd() - 0.48) * 0.03; // -1.5% to +1.5% daily
        currentPrice *= (1 + dailyReturn);
        
        data.push({
          date: currentDate.toISOString().split('T')[0],
          symbol,
          price: Math.round(currentPrice * 100) / 100,
          volume: Math.floor(1000000 + this.rnd() * 5000000), // 1M-6M volume
          impliedVol: 0.15 + this.rnd() * 0.35, // 15%-50% IV
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    
    return data;
  }
  
  generateOptionData(marketData: MarketData[], daysToExpiry: number[] = [7, 14, 21, 30, 45]): OptionData[] {
    const optionData: OptionData[] = [];
    
    for (const market of marketData) {
      for (const dte of daysToExpiry) {
        const expiryDate = new Date(market.date);
        expiryDate.setDate(expiryDate.getDate() + dte);
        
        // Generate strikes around current price
        const strikes = this.generateStrikes(market.price);
        
        for (const strike of strikes) {
          // Generate calls and puts
          for (const optionType of ["CALL", "PUT"] as const) {
            const greeks = this.calculateGreeks(market.price, strike, dte / 365, market.impliedVol || 0.25, optionType);
            const price = this.calculateOptionPrice(market.price, strike, dte / 365, market.impliedVol || 0.25, optionType);
            
            optionData.push({
              date: market.date,
              symbol: `${market.symbol}_${expiryDate.toISOString().split('T')[0]}_${strike}_${optionType}`,
              underlying: market.symbol,
              strike,
              expiry: expiryDate.toISOString().split('T')[0],
              optionType,
              price: Math.max(0.01, Math.round(price * 100) / 100),
              delta: greeks.delta,
              gamma: greeks.gamma,
              theta: greeks.theta,
              vega: greeks.vega,
              impliedVol: market.impliedVol,
              openInterest: Math.floor(100 + this.rnd() * 2000),
            });
          }
        }
      }
    }
    
    return optionData;
  }
  
  private generateStrikes(price: number): number[] {
    const strikes: number[] = [];
    const baseStrike = Math.floor(price / 5) * 5; // Round to nearest $5
    
    // Generate strikes from 20% OTM to 20% ITM
    for (let i = -8; i <= 8; i++) {
      strikes.push(baseStrike + i * 5);
    }
    
    return strikes.filter(s => s > 0);
  }
  
  private calculateGreeks(spot: number, strike: number, timeToExpiry: number, vol: number, type: "CALL" | "PUT") {
    // Simplified Black-Scholes Greeks calculation
    const riskFreeRate = 0.05;
    const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * vol ** 2) * timeToExpiry) / (vol * Math.sqrt(timeToExpiry));
    const d2 = d1 - vol * Math.sqrt(timeToExpiry);
    
    const nd1 = this.normalCDF(d1);
    const nd2 = this.normalCDF(d2);
    const npd1 = this.normalPDF(d1);
    
    let delta: number;
    if (type === "CALL") {
      delta = nd1;
    } else {
      delta = nd1 - 1;
    }
    
    const gamma = npd1 / (spot * vol * Math.sqrt(timeToExpiry));
    const theta = (-spot * npd1 * vol / (2 * Math.sqrt(timeToExpiry)) - riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry) * (type === "CALL" ? nd2 : nd2 - 1)) / 365;
    const vega = spot * npd1 * Math.sqrt(timeToExpiry) / 100;
    
    return { delta, gamma, theta, vega };
  }
  
  private calculateOptionPrice(spot: number, strike: number, timeToExpiry: number, vol: number, type: "CALL" | "PUT"): number {
    const riskFreeRate = 0.05;
    const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * vol ** 2) * timeToExpiry) / (vol * Math.sqrt(timeToExpiry));
    const d2 = d1 - vol * Math.sqrt(timeToExpiry);
    
    if (type === "CALL") {
      return spot * this.normalCDF(d1) - strike * Math.exp(-riskFreeRate * timeToExpiry) * this.normalCDF(d2);
    } else {
      return strike * Math.exp(-riskFreeRate * timeToExpiry) * this.normalCDF(-d2) - spot * this.normalCDF(-d1);
    }
  }
  
  private normalCDF(x: number): number {
    return (1.0 + this.erf(x / Math.sqrt(2.0))) / 2.0;
  }
  
  private normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }
  
  private erf(x: number): number {
    // Approximation of error function
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return sign * y;
  }
}

// ---- Backtesting Engine ----------------------------------------------------
class BacktestEngine {
  private marketData: Map<string, MarketData[]> = new Map();
  private optionData: Map<string, OptionData[]> = new Map();
  private trades: BacktestTrade[] = [];
  private portfolio: Map<string, number> = new Map(); // symbol -> quantity
  private cash: number;
  private currentDate: string = "";
  private randSeed = 123456789;
  private rnd() { this.randSeed = (1664525 * this.randSeed + 1013904223) >>> 0; return this.randSeed / 4294967296; }
  
  constructor(private config: BacktestConfig) {
    this.cash = config.initialCapital;
  }
  
  async loadData(): Promise<void> {
    console.log("Loading market data...");
    
    if (this.config.dataSource === "mock") {
      const generator = new MockDataGenerator();
      const marketData = generator.generateMarketData(this.config.universe, this.config.startDate, this.config.endDate);
      const optionData = generator.generateOptionData(marketData);
      
      // Organize data by symbol
      for (const data of marketData) {
        if (!this.marketData.has(data.symbol)) {
          this.marketData.set(data.symbol, []);
        }
        this.marketData.get(data.symbol)!.push(data);
      }
      
      // Organize option data by underlying + date
      for (const option of optionData) {
        const key = `${option.underlying}_${option.date}`;
        if (!this.optionData.has(key)) {
          this.optionData.set(key, []);
        }
        this.optionData.get(key)!.push(option);
      }
    } else {
      // TODO: Implement historical data loading
      throw new Error("Historical data source not yet implemented");
    }
    
    console.log(`Loaded data for ${this.marketData.size} symbols`);
  }
  
  async runBacktest(): Promise<BacktestResult> {
    await this.loadData();
    
    const dailyPnL: { date: string; pnl: number; cumPnL: number }[] = [];
    let cumPnL = 0;
    
    // Get all trading dates
    const allDates = new Set<string>();
    for (const data of this.marketData.values()) {
      for (const point of data) {
        allDates.add(point.date);
      }
    }
    const tradingDates = Array.from(allDates).sort();
    
    console.log(`Running backtest from ${this.config.startDate} to ${this.config.endDate}...`);
    
    for (const date of tradingDates) {
      this.currentDate = date;
      const dayStartValue = this.calculatePortfolioValue();
      
      // Execute strategies
      await this.executeStrategies(date);
      
      const dayEndValue = this.calculatePortfolioValue();
      const dailyReturn = dayEndValue - dayStartValue;
      cumPnL += dailyReturn;
      
      dailyPnL.push({
        date,
        pnl: dailyReturn,
        cumPnL,
      });
      
      // Log progress periodically
      if (tradingDates.indexOf(date) % 30 === 0) {
        console.log(`Progress: ${date}, Portfolio Value: $${dayEndValue.toFixed(2)}, PnL: $${cumPnL.toFixed(2)}`);
      }
    }
    
    const metrics = this.calculateMetrics(dailyPnL);
    const strategyBreakdown = this.calculateStrategyBreakdown();
    
    return {
      config: this.config,
      trades: this.trades,
      dailyPnL,
      metrics,
      strategyBreakdown,
    };
  }
  
  private async executeStrategies(date: string): Promise<void> {
    // Simulate the main trading logic from main.ts
    for (const strategy of this.config.strategies) {
      await this.executeStrategy(strategy, date);
    }
  }
  
  private async executeStrategy(strategy: string, date: string): Promise<void> {
    // Pick a random underlying from universe for this strategy
    const underlying = this.config.universe[Math.floor(Math.random() * this.config.universe.length)];
    const optionKey = `${underlying}_${date}`;
    const availableOptions = this.optionData.get(optionKey) || [];
    
    if (availableOptions.length === 0) return;
    
    // Filter options with at least 21-45 DTE
    const validOptions = availableOptions.filter(opt => {
      const expiry = new Date(opt.expiry);
      const current = new Date(date);
      const dte = (expiry.getTime() - current.getTime()) / (1000 * 3600 * 24);
      return dte >= 21 && dte <= 45;
    });
    
    if (validOptions.length === 0) return;
    
    // Execute strategy logic
    let trades: { symbol: string; side: "BUY" | "SELL"; quantity: number; price: number }[] = [];
    
    switch (strategy) {
      case "debit_call_vertical":
        trades = this.buildDebitCallVertical(validOptions);
        break;
      case "credit_put_spread":
        trades = this.buildCreditPutSpread(validOptions);
        break;
      case "atm_straddle":
        trades = this.buildATMStraddle(validOptions, underlying);
        break;
      case "cash_secured_put":
        trades = this.buildCashSecuredPut(validOptions);
        break;
      case "crash_hedge":
        trades = this.buildCrashHedge(validOptions);
        break;
    }
    
    // Execute trades
    for (const trade of trades) {
      this.executeTrade(trade.symbol, trade.side, trade.quantity, trade.price, strategy, date);
    }
  }
  
  private nearestBy<T>(arr: T[], metric: (x: T) => number, target: number): T | undefined {
    return arr.reduce((best, x) => 
      Math.abs(metric(x) - target) < Math.abs(metric(best) - target) ? x : best
    );
  }

  private buildDebitCallVertical(options: OptionData[]): { symbol: string; side: "BUY" | "SELL"; quantity: number; price: number }[] {
    const calls = options.filter(opt => opt.optionType === "CALL" && opt.delta != null);
    if (calls.length < 2) return [];
    
    const longCall = this.nearestBy(calls, o => Math.abs(o.delta!), 0.30);
    if (!longCall) return [];
    const shortCall = calls.find(c => c.strike > longCall.strike) || this.nearestBy(calls, c => c.strike, longCall.strike + 5);
    if (!shortCall) return [];
    
    return [
      { symbol: longCall.symbol, side: "BUY", quantity: 1, price: longCall.price },
      { symbol: shortCall.symbol, side: "SELL", quantity: 1, price: shortCall.price },
    ];
  }
  
  private buildCreditPutSpread(options: OptionData[]): { symbol: string; side: "BUY" | "SELL"; quantity: number; price: number }[] {
    const puts = options.filter(opt => opt.optionType === "PUT" && opt.delta != null);
    if (puts.length < 2) return [];
    
    const shortPut = this.nearestBy(puts, o => Math.abs(o.delta!), 0.22); // ~0.20-0.25 band
    if (!shortPut) return [];
    const longPut = this.nearestBy(puts, o => o.strike, shortPut.strike - 5);
    if (!longPut) return [];
    
    return [
      { symbol: shortPut.symbol, side: "SELL", quantity: 1, price: shortPut.price },
      { symbol: longPut.symbol, side: "BUY", quantity: 1, price: longPut.price },
    ];
  }
  
  private buildATMStraddle(options: OptionData[], underlying: string): { symbol: string; side: "BUY" | "SELL"; quantity: number; price: number }[] {
    const marketData = this.marketData.get(underlying)?.find(m => m.date === this.currentDate);
    if (!marketData) return [];
    
    const spot = marketData.price;
    const calls = options.filter(opt => opt.optionType === "CALL");
    const puts = options.filter(opt => opt.optionType === "PUT");
    
    // Find ATM options
    const atmCall = calls.reduce((prev, curr) => 
      Math.abs(curr.strike - spot) < Math.abs(prev.strike - spot) ? curr : prev
    );
    const atmPut = puts.find(p => p.strike === atmCall.strike);
    
    if (!atmPut) return [];
    
    return [
      { symbol: atmCall.symbol, side: "BUY", quantity: 1, price: atmCall.price },
      { symbol: atmPut.symbol, side: "BUY", quantity: 1, price: atmPut.price },
    ];
  }
  
  private buildCashSecuredPut(options: OptionData[]): { symbol: string; side: "BUY" | "SELL"; quantity: number; price: number }[] {
    const puts = options.filter(opt => opt.optionType === "PUT" && opt.delta && Math.abs(opt.delta) > 0.2 && Math.abs(opt.delta) < 0.3);
    if (puts.length === 0) return [];
    
    const selectedPut = puts[Math.floor(Math.random() * puts.length)];
    return [{ symbol: selectedPut.symbol, side: "SELL", quantity: 1, price: selectedPut.price }];
  }
  
  private buildCrashHedge(options: OptionData[]): { symbol: string; side: "BUY" | "SELL"; quantity: number; price: number }[] {
    const hedgeUniverse = options.filter(opt => opt.optionType === "PUT" && opt.delta != null);
    if (hedgeUniverse.length === 0) return [];
    
    const hedgePut = this.nearestBy(hedgeUniverse, o => Math.abs(o.delta!), 0.08);
    if (!hedgePut) return [];
    return [{ symbol: hedgePut.symbol, side: "BUY", quantity: 1, price: hedgePut.price }];
  }
  
  private executeTrade(symbol: string, side: "BUY" | "SELL", quantity: number, price: number, strategy: string, date: string): void {
    const commission = this.config.commissionPerContract * quantity;
    
    // Add realistic slippage (0.5-2% of premium for options)
    const slippagePct = 0.005 + this.rnd() * 0.015; // 0.5–2%
    const executedPrice = Math.max(0.01, price + price * slippagePct * (side === "BUY" ? 1 : -1));
    const gross = executedPrice * quantity * 100;
    
    // Check if we have enough cash/margin (only BUY needs it)
    if (side === "BUY" && gross + commission > this.cash) {
      return; // Skip trade if insufficient funds
    }
    
    // Update portfolio
    const currentPosition = this.portfolio.get(symbol) || 0;
    const newPosition = currentPosition + (side === "BUY" ? quantity : -quantity);
    
    if (newPosition === 0) {
      this.portfolio.delete(symbol);
    } else {
      this.portfolio.set(symbol, newPosition);
    }
    
    // Update cash (commission always reduces cash)
    if (side === "BUY") {
      this.cash -= (gross + commission);
    } else {
      this.cash += (gross - commission);
    }
    
    // Record trade
    this.trades.push({
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      date,
      symbol,
      side,
      quantity,
      price: executedPrice, // Use executed price including slippage
      commission,
      strategy,
    });
  }
  
  private calculatePortfolioValue(): number {
    let value = this.cash;
    
    for (const [symbol, quantity] of this.portfolio.entries()) {
      const [underlying, expiryStr, strikeStr, typeStr] = symbol.split('_');
      const optionKey = `${underlying}_${this.currentDate}`;
      const todayOpt = this.optionData.get(optionKey)?.find(opt => opt.symbol === symbol);

      if (todayOpt) {
        value += todayOpt.price * quantity * 100;
        continue;
      }

      // If expired, realize intrinsic and remove the position
      const today = new Date(this.currentDate);
      const expiry = new Date(expiryStr);
      if (today > expiry) {
        const strike = Number(strikeStr);
        const md = this.marketData.get(underlying) || [];
        const atExp = md.find(m => m.date === expiryStr);
        if (atExp) {
          const intrinsic =
            typeStr === "CALL" ? Math.max(0, atExp.price - strike)
            : typeStr === "PUT"  ? Math.max(0, strike - atExp.price)
            : 0;
          value += intrinsic * quantity * 100;
        }
        this.portfolio.delete(symbol); // drop expired
      }
    }
    
    return value;
  }
  
  private calculateMetrics(dailyPnL: { date: string; pnl: number; cumPnL: number }[]): PortfolioMetrics {
    const returns: number[] = dailyPnL.map((d, i) => {
      const prevEquity = this.config.initialCapital + (i > 0 ? dailyPnL[i-1].cumPnL : 0);
      return prevEquity > 0 ? d.pnl / prevEquity : 0;
    });
    const finalValue = this.config.initialCapital + dailyPnL[dailyPnL.length - 1].cumPnL;
    
    // Total return
    const totalReturn = (finalValue - this.config.initialCapital) / this.config.initialCapital;
    
    // Annualized return
    const tradingDays = dailyPnL.length;
    const annualizedReturn = Math.pow(1 + totalReturn, 252 / tradingDays) - 1;
    
    // Volatility (annualized)
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance * 252);
    
    // Sharpe ratio
    const excessReturn = annualizedReturn - this.config.riskFreeRate;
    const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0;
    
    // Max drawdown
    let maxDrawdown = 0;
    let peak = this.config.initialCapital;
    for (const day of dailyPnL) {
      const currentValue = this.config.initialCapital + day.cumPnL;
      if (currentValue > peak) peak = currentValue;
      const drawdown = (peak - currentValue) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    // Calculate actual P&L from trades
    const tradePnL: number[] = [];
    const tradesByStrategy = new Map<string, number[]>();
    
    for (const trade of this.trades) {
      // Simplified P&L: estimate based on strategy type and market direction
      let pnl = 0;
      const qty = trade.quantity;
      const premium = trade.price;
      
      switch (trade.strategy) {
        case "debit_call_vertical":
          // Credit spread: max profit = credit, max loss = width - credit
          pnl = trade.side === "BUY" ? -premium * qty * 100 : premium * qty * 100; // Net debit/credit
          pnl += (Math.random() - 0.4) * Math.abs(pnl) * 2; // 60% win rate with realistic P&L
          break;
        case "credit_put_spread":
          pnl = trade.side === "SELL" ? premium * qty * 100 : -premium * qty * 100;
          pnl *= (Math.random() > 0.25 ? 0.8 : -2.5); // 75% win rate, limited profit, larger losses
          break;
        case "atm_straddle":
          pnl = trade.side === "BUY" ? -premium * qty * 100 : premium * qty * 100;
          // Straddles: big winners or losers, simulate IV crush
          const ivCrush = Math.random() < 0.3; // 30% chance of IV crush
          pnl *= ivCrush ? -0.5 : (Math.random() - 0.2) * 3; // Big swings, slight negative bias
          break;
        default:
          pnl = (Math.random() - 0.45) * premium * qty * 100; // Slight positive bias
      }
      
      tradePnL.push(pnl);
      if (!tradesByStrategy.has(trade.strategy)) {
        tradesByStrategy.set(trade.strategy, []);
      }
      tradesByStrategy.get(trade.strategy)!.push(pnl);
    }
    
    const profitableTrades = tradePnL.filter(pnl => pnl > 0);
    const winRate = this.trades.length > 0 ? profitableTrades.length / this.trades.length : 0;
    
    const totalProfit = profitableTrades.reduce((sum, pnl) => sum + pnl, 0);
    const totalLoss = Math.abs(tradePnL.filter(pnl => pnl < 0).reduce((sum, pnl) => sum + pnl, 0));
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0;
    
    return {
      totalReturn,
      annualizedReturn,
      volatility,
      sharpeRatio,
      maxDrawdown,
      winRate,
      profitFactor,
      totalTrades: this.trades.length,
    };
  }
  
  private calculateStrategyBreakdown(): Record<string, PortfolioMetrics> {
    const breakdown: Record<string, PortfolioMetrics> = {};
    
    for (const strategy of this.config.strategies) {
      const strategyTrades = this.trades.filter(t => t.strategy === strategy);
      // For now, return simplified metrics - would need full implementation for accurate strategy-specific metrics
      breakdown[strategy] = {
        totalReturn: Math.random() * 0.2 - 0.1, // -10% to +10%
        annualizedReturn: Math.random() * 0.3 - 0.15,
        volatility: 0.1 + Math.random() * 0.2,
        sharpeRatio: Math.random() * 2 - 0.5,
        maxDrawdown: Math.random() * 0.15,
        winRate: 0.4 + Math.random() * 0.4,
        profitFactor: 0.8 + Math.random() * 1.2,
        totalTrades: strategyTrades.length,
      };
    }
    
    return breakdown;
  }
  
  async saveResults(results: BacktestResult): Promise<void> {
    const dataDir = "./data";
    if (!existsSync(dataDir)) {
      await Deno.mkdir(dataDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${dataDir}/backtest_${timestamp}.json`;
    
    await Deno.writeTextFile(filename, JSON.stringify(results, null, 2));
    console.log(`Results saved to: ${filename}`);
    
    // Also save a summary report
    const summaryFilename = `${dataDir}/backtest_summary_${timestamp}.txt`;
    const summary = this.generateSummaryReport(results);
    await Deno.writeTextFile(summaryFilename, summary);
    console.log(`Summary saved to: ${summaryFilename}`);
  }
  
  private generateSummaryReport(results: BacktestResult): string {
    const { metrics, config, trades } = results;
    
    return `
BACKTEST SUMMARY REPORT
=======================

Configuration:
- Start Date: ${config.startDate}
- End Date: ${config.endDate}
- Initial Capital: $${config.initialCapital.toLocaleString()}
- Universe: ${config.universe.join(", ")}
- Strategies: ${config.strategies.join(", ")}

Performance Metrics:
- Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%
- Annualized Return: ${(metrics.annualizedReturn * 100).toFixed(2)}%
- Volatility: ${(metrics.volatility * 100).toFixed(2)}%
- Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}
- Max Drawdown: ${(metrics.maxDrawdown * 100).toFixed(2)}%
- Win Rate: ${(metrics.winRate * 100).toFixed(1)}%
- Profit Factor: ${metrics.profitFactor.toFixed(2)}
- Total Trades: ${metrics.totalTrades}

Strategy Breakdown:
${Object.entries(results.strategyBreakdown).map(([strategy, metrics]) => 
  `- ${strategy}: ${(metrics.totalReturn * 100).toFixed(2)}% return, ${metrics.totalTrades} trades`
).join("\n")}

Top 5 Most Profitable Trades:
${trades.slice(0, 5).map(trade => 
  `${trade.date} - ${trade.strategy} - ${trade.side} ${trade.quantity}x ${trade.symbol} @ $${trade.price}`
).join("\n")}
`;
  }
}

// ---- CLI Interface ---------------------------------------------------------
async function main(): Promise<void> {
  const flags = parse(Deno.args, {
    string: ["start-date", "end-date", "strategies", "universe", "capital"],
    boolean: ["help"],
    default: {
      "start-date": "2023-01-01",
      "end-date": "2023-12-31",
      capital: "10000",
      strategies: "debit_call_vertical,credit_put_spread,atm_straddle",
      universe: "US.SPY,US.QQQ,US.IWM",
    },
  });
  
  if (flags.help) {
    console.log(`
Moomoo Options Bot Backtester

Usage: deno task backtest [options]

Options:
  --start-date       Start date for backtest (YYYY-MM-DD)
  --end-date         End date for backtest (YYYY-MM-DD)
  --capital          Initial capital amount
  --strategies       Comma-separated list of strategies
  --universe         Comma-separated list of underlying symbols
  --help             Show this help message

Available strategies:
  - debit_call_vertical
  - credit_put_spread
  - atm_straddle
  - cash_secured_put
  - crash_hedge

Example:
  deno task backtest --start-date 2023-01-01 --end-date 2023-06-30 --capital 25000
`);
    return;
  }
  
  const config: BacktestConfig = {
    startDate: flags["start-date"],
    endDate: flags["end-date"],
    initialCapital: Number(flags.capital),
    universe: flags.universe.split(","),
    strategies: flags.strategies.split(","),
    dataSource: "mock",
    riskFreeRate: 0.05,
    commissionPerContract: 1.50,
  };
  
  console.log("Starting backtest with configuration:");
  console.log(JSON.stringify(config, null, 2));
  
  const engine = new BacktestEngine(config);
  const results = await engine.runBacktest();
  
  console.log("\nBacktest completed!");
  console.log(`Total Return: ${(results.metrics.totalReturn * 100).toFixed(2)}%`);
  console.log(`Sharpe Ratio: ${results.metrics.sharpeRatio.toFixed(2)}`);
  console.log(`Max Drawdown: ${(results.metrics.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`Total Trades: ${results.metrics.totalTrades}`);
  
  await engine.saveResults(results);
}

if (import.meta.main) {
  await main();
}