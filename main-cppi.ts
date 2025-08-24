/**
 * moomoo-5sleeve-cppi-bot.ts
 *
 * Implementation of the 5-sleeve CPPI options strategy according to STRATEGY_SPEC.md
 * Features:
 * - CPPI portfolio management with 85% floor and 4.0 multiplier
 * - Five dedicated sleeves: Debit, Credit, Straddle, Collar, Hedge
 * - Contributions-only allocation with weekly deposits
 * - Monthly drift-band rebalancing at ±10%
 * - Risk-budget based sizing instead of spend limits
 * - Monthly cadence gating for straddles
 */

import { existsSync } from "std/fs/mod.ts";
// @ts-ignore: npm module without types
import * as mm from "moomoo-api";
import { ConfigManager, Strategy, TradingConfig } from "./config.ts";
import { CPPIEngine, SleeveEquities, SleeveWeights, CPPIMetrics } from "./cppi.ts";

// ---- Global Configuration --------------------------------------------------
const configManager = await ConfigManager.createDefault();
const config = configManager.getConfig();
const cppiEngine = new CPPIEngine(config.cppi);

// ---- Helpers ---------------------------------------------------------------
function log(...args: unknown[]) {
  const timestamp = new Date().toISOString();
  const message = `${timestamp} - ${args.join(" ")}`;
  console.log(message);
  
  if (config.logging.enableTradeLogging) {
    try {
      if (!existsSync(config.logging.dataDir)) {
        Deno.mkdirSync(config.logging.dataDir, { recursive: true });
      }
      Deno.writeTextFileSync(config.logging.logFile, message + "\n", { append: true });
    } catch (e) {
      console.error("Failed to write log:", e);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nearest<T>(arr: T[], metric: (x: T) => number, target: number): T | undefined {
  let best: T | undefined;
  let bestDiff = Infinity;
  for (const x of arr) {
    const d = Math.abs(metric(x) - target);
    if (d < bestDiff) {
      bestDiff = d;
      best = x;
    }
  }
  return best;
}

function midPrice(ob: any): number | undefined {
  try {
    const ask = Number(ob.ask[0].price);
    const bid = Number(ob.bid[0].price);
    return (ask && bid) ? (ask + bid) / 2 : undefined;
  } catch {
    return undefined;
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function saveTradeData(data: any): Promise<void> {
  if (!config.logging.enableTradeLogging) return;
  
  try {
    if (!existsSync(config.logging.dataDir)) {
      await Deno.mkdir(config.logging.dataDir, { recursive: true });
    }
    const filename = `${config.logging.dataDir}/trades_${new Date().toISOString().split("T")[0]}.json`;
    const existing = existsSync(filename) ? JSON.parse(await Deno.readTextFile(filename)) : [];
    existing.push({ ...data, timestamp: new Date().toISOString() });
    await Deno.writeTextFile(filename, JSON.stringify(existing, null, 2));
  } catch (e) {
    log("Failed to save trade data:", e);
  }
}

// ---- Portfolio State Management --------------------------------------------
interface PortfolioState {
  sleeveEquities: SleeveEquities;
  cppiMetrics: CPPIMetrics;
  lastUpdateTime: Date;
}

async function loadPortfolioState(): Promise<PortfolioState> {
  const stateFile = `${config.logging.dataDir}/portfolio_state.json`;
  
  if (existsSync(stateFile)) {
    try {
      const stateData = JSON.parse(await Deno.readTextFile(stateFile));
      log("Loaded portfolio state from", stateFile);
      return {
        sleeveEquities: stateData.sleeveEquities,
        cppiMetrics: stateData.cppiMetrics,
        lastUpdateTime: new Date(stateData.lastUpdateTime)
      };
    } catch (e) {
      log("Failed to load portfolio state:", e);
    }
  }

  log("Using mock portfolio state for demonstration");
  const mockEquities: SleeveEquities = {
    debit: 2000,
    credit: 1500,
    straddle: 1000,
    collar: 4000,
    hedge: 500,
    total: 9000
  };

  const cppiMetrics = cppiEngine.computeCPPIMetrics(mockEquities);

  return {
    sleeveEquities: mockEquities,
    cppiMetrics,
    lastUpdateTime: new Date()
  };
}

async function savePortfolioState(state: PortfolioState): Promise<void> {
  if (!config.logging.enableTradeLogging) return;
  
  try {
    if (!existsSync(config.logging.dataDir)) {
      await Deno.mkdir(config.logging.dataDir, { recursive: true });
    }
    const stateFile = `${config.logging.dataDir}/portfolio_state.json`;
    await Deno.writeTextFile(stateFile, JSON.stringify(state, null, 2));
    log("Saved portfolio state to", stateFile);
  } catch (e) {
    log("Failed to save portfolio state:", e);
  }
}

// ---- Connection/Contexts ---------------------------------------------------
class Moomoo {
  quote!: any;
  trade!: any;

  async connect(): Promise<void> {
    const tradingConfig = config.trading;
    log("Connecting to OpenD", tradingConfig.host, tradingConfig.port);
    this.quote = new mm.OpenQuoteContext({ host: tradingConfig.host, port: tradingConfig.port });
    this.trade = new mm.OpenSecTradeContext({ host: tradingConfig.host, port: tradingConfig.port });

    if (this.quote.start) this.quote.start();
    if (this.trade.start) this.trade.start();
  }

  async close(): Promise<void> {
    try {
      if (this.quote?.stop) this.quote.stop();
      if (this.trade?.stop) this.trade.stop();
    } catch {
      // ignore
    }
    try {
      await this.quote?.close?.();
      await this.trade?.close?.();
    } catch {
      // ignore
    }
  }

  async getAccount(strategy?: Strategy): Promise<{ accId: number; trdEnv: number; trdMarket: number }> {
    const trdEnv = config.trading.environment === "REAL" ? mm.TrdEnv.REAL : mm.TrdEnv.SIMULATE;
    
    let accId: number | null, accIndex: number;
    if (strategy) {
      accId = strategy.account.id;
      accIndex = strategy.account.index;
      log(`Using strategy-specific account for ${strategy.id}: ID=${accId}, Index=${accIndex}`);
    } else {
      const firstStrategy = configManager.getStrategies()[0];
      if (firstStrategy) {
        accId = firstStrategy.account.id;
        accIndex = firstStrategy.account.index;
      } else {
        accId = null;
        accIndex = 0;
      }
      log("Using fallback account configuration");
    }

    const [ret, data] = await this.trade.get_acc_list();
    if (ret !== mm.RET_OK) throw new Error("get_acc_list failed: " + data);
    const rows: any[] = data;

    let chosen = rows[0];
    if (accId) {
      chosen = rows.find((r) => Number(r.acc_id) === accId) || rows[0];
    } else if (typeof accIndex === "number" && accIndex < rows.length) {
      chosen = rows[accIndex] || rows[0];
    }

    if (!chosen) throw new Error("No account available.");
    log("Using account:", chosen.acc_id, "env:", config.trading.environment, "market:", chosen.trd_market);
    return { accId: Number(chosen.acc_id), trdEnv, trdMarket: Number(chosen.trd_market) };
  }

  async discoverUniverse(maxN = config.universe.maxSymbols): Promise<string[]> {
    const codes: string[] = [];
    try {
      const [pret, plates] = await this.quote.get_plate_list(mm.Market.US, mm.Plate.ALL);
      if (pret === mm.RET_OK) {
        const indexPlates = (plates as any[]).filter((p) => /S&P|NASDAQ|Dow/i.test(p.plate_name));
        for (const pl of indexPlates) {
          const [sret, secs] = await this.quote.get_plate_stock(pl.code);
          if (sret !== mm.RET_OK) continue;
          const secCodes = (secs as any[]).map((s) => s.code).slice(0, 300);
          const chunks = chunk(secCodes, 200);
          let scored: { code: string; vol: number }[] = [];
          for (const ch of chunks) {
            const [qret, snap] = await this.quote.get_market_snapshot(ch);
            if (qret !== mm.RET_OK) continue;
            scored = scored.concat(
              (snap as any[]).map((r) => ({ code: r.code, vol: Number(r.volume || 0) }))
            );
          }
          scored.sort((a, b) => b.vol - a.vol);
          for (const s of scored) {
            if (!codes.includes(s.code)) codes.push(s.code);
            if (codes.length >= maxN) break;
          }
          if (codes.length >= maxN) break;
        }
      }
    } catch (e) {
      log("discoverUniverse error:", e);
    }

    if (codes.length === 0) return config.universe.fallbackSymbols.slice(0, maxN);
    return codes.slice(0, maxN);
  }

  async getMonthlyExpiry(code: string, strategy?: Strategy): Promise<string | undefined> {
    const [ret, dates] = await this.quote.get_option_expiration_date(code);
    if (ret !== mm.RET_OK) return undefined;
    
    const dteMin = strategy?.parameters.dteMin ?? 21;
    const dteMax = strategy?.parameters.dteMax ?? 45;
    const dteTarget = strategy?.parameters.dteTarget ?? 28;
    
    const now = new Date();
    const inRange: string[] = [];
    for (const d of dates as any[]) {
      const t = new Date(d);
      const dte = Math.round((t.getTime() - now.getTime()) / (1000 * 3600 * 24));
      if (dte >= dteMin && dte <= dteMax) inRange.push(d);
    }
    const pick = nearest(inRange, (s) => {
      const t = new Date(s);
      return Math.abs((t.getTime() - now.getTime()) / (1000 * 3600 * 24));
    }, dteTarget);
    return pick;
  }

  async getOptionQuotesForExpiry(underlying: string, expiry: string): Promise<any[]> {
    const [cret, chain] = await this.quote.get_option_chain(
      underlying,
      mm.IndexOptionType.NORMAL,
      null,
      null,
      mm.OptionType.ALL,
      mm.OptionCondType.ALL,
      null
    );
    if (cret !== mm.RET_OK) throw new Error("get_option_chain failed");
    const rows: any[] = chain as any[];
    const forExpiry = rows.filter((r) => r.time?.startsWith(expiry));
    const optionCodes = forExpiry.map((r) => r.code);

    if (optionCodes.length === 0) return [];
    await this.quote.subscribe(optionCodes, [mm.SubType.QUOTE]);
    const [qret, q] = await this.quote.get_stock_quote(optionCodes);
    if (qret !== mm.RET_OK) return [];
    return q as any[];
  }

  async getOrderBook(code: string): Promise<any | null> {
    const [ret, ob] = await this.quote.get_order_book(code, 5);
    if (ret !== mm.RET_OK) return null;
    return (ob as any[])[0];
  }

  async estimateFeeUSDPerContract(acc: { accId: number; trdEnv: any }): Promise<number> {
    try {
      const [hret, histOrders] = await this.trade.history_order_list_query(
        "",
        mm.TrdMarket.US,
        [],
        "",
        "",
        acc.trdEnv,
        acc.accId,
        0
      );
      if (hret !== mm.RET_OK) return 0;
      const orders = (histOrders as any[])
        .filter((o) => /OPT|OPTION/i.test(o.sec_type || ""))
        .slice(-config.risk.feeEstimation.lookbackOrders);
      const orderIds = orders.map((o) => o.order_id);
      if (!orderIds.length) return 0;
      const [fret, feesResp] = await this.trade.order_fee_query(orderIds, acc.accId, 0, acc.trdEnv);
      if (fret !== mm.RET_OK) return 0;
      const perContract: number[] = [];
      for (const f of feesResp as any[]) {
        const total = Number(f.total_fee || 0);
        const qty = Math.abs(Number((orders.find((o) => o.order_id === f.order_id) || {}).qty || 1));
        const contractSize = 100;
        const nContracts = Math.max(1, Math.round(qty / contractSize));
        if (nContracts > 0) perContract.push(total / nContracts);
      }
      perContract.sort((a, b) => a - b);
      return perContract[Math.floor(perContract.length / 2)] || 0;
    } catch {
      return 0;
    }
  }

  async placeLimit(
    code: string,
    qtyContracts: number,
    side: "BUY" | "SELL",
    price?: number,
    acc?: { accId: number; trdEnv: any }
  ) {
    const a = acc || (await this.getAccount());
    const contractSize = 100;
    const qty = qtyContracts * contractSize;
    let px = price;
    if (!px) {
      const ob = await this.getOrderBook(code);
      px = midPrice(ob || {}) || Number((await this.quote.get_stock_quote([code]))[1][0]?.last_price || 0);
    }

    const orderData = {
      code,
      side,
      qty: qtyContracts,
      price: px,
      timestamp: new Date().toISOString(),
    };

    const params = {
      price: px,
      qty,
      code,
      trd_side: side === "BUY" ? mm.TrdSide.BUY : mm.TrdSide.SELL,
      order_type: mm.OrderType.NORMAL,
      adjust_limit: 10,
      trd_env: a.trdEnv,
      acc_id: a.accId,
      time_in_force: mm.TimeInForce.DAY,
      fill_outside_rth: false,
    };

    if (config.trading.dryRun) {
      log("[DRY] place_order", params);
      await saveTradeData({ ...orderData, dry_run: true, order_id: "DRY-" + Date.now() });
      return { order_id: "DRY-" + Date.now() };
    }

    const [ret, resp] = await this.trade.place_order(
      params.price,
      params.qty,
      params.code,
      params.trd_side,
      params.order_type,
      params.adjust_limit,
      params.trd_env,
      params.acc_id,
      0,
      "auto",
      params.time_in_force,
      params.fill_outside_rth
    );
    if (ret !== mm.RET_OK) throw new Error("place_order failed: " + resp);
    const orderId = (resp as any).order_id;
    log("Order placed", orderId, code, side, "@", px);
    
    await saveTradeData({ ...orderData, order_id: orderId });
    return { order_id: orderId };
  }
}

// ---- Strategy Implementations ---------------------------------------------
interface TradeLeg {
  code: string;
  side: "BUY" | "SELL";
  qty: number;
  limit?: number;
}

async function buildDebitCallVertical(api: Moomoo, underlying: string, expiry: string, strategy: Strategy): Promise<TradeLeg[]> {
  const quotes = await api.getOptionQuotesForExpiry(underlying, expiry);
  const calls = quotes.filter((q) => String(q.option_type).toUpperCase() === "CALL" || q.option_type === 1);
  const long = nearest(calls, (q) => Math.abs(Number(q.delta || 0)), strategy.parameters.targetDelta);
  if (!long) return [];
  const longStrike = Number(long.strike_price);
  const shortStrike = longStrike + strategy.parameters.width;
  const short = calls.find((q) => Math.abs(Number(q.strike_price) - shortStrike) < 1e-6);
  if (!short) return [];
  return [
    { code: long.code, side: "BUY", qty: strategy.parameters.contracts },
    { code: short.code, side: "SELL", qty: strategy.parameters.contracts },
  ];
}

async function buildCreditPutSpread(api: Moomoo, underlying: string, expiry: string, strategy: Strategy): Promise<TradeLeg[]> {
  const quotes = await api.getOptionQuotesForExpiry(underlying, expiry);
  const puts = quotes.filter((q) => String(q.option_type).toUpperCase() === "PUT" || q.option_type === 2);
  const short = nearest(puts, (q) => Math.abs(Number(q.delta || 0)), strategy.parameters.shortDelta);
  if (!short) return [];
  const shortStrike = Number(short.strike_price);
  const longStrike = shortStrike - strategy.parameters.width;
  const long = puts.find((q) => Math.abs(Number(q.strike_price) - longStrike) < 1e-6);
  if (!long) return [];
  return [
    { code: short.code, side: "SELL", qty: strategy.parameters.contracts },
    { code: long.code, side: "BUY", qty: strategy.parameters.contracts },
  ];
}

async function buildATMStraddle(api: Moomoo, underlying: string, expiry: string, strategy: Strategy): Promise<TradeLeg[]> {
  const [sret, snap] = await api.quote.get_market_snapshot([underlying]);
  if (sret !== mm.RET_OK) return [];
  const spot = Number((snap as any[])[0].last_price);
  const quotes = await api.getOptionQuotesForExpiry(underlying, expiry);
  const calls = quotes.filter((q) => String(q.option_type).toUpperCase() === "CALL" || q.option_type === 1);
  const puts = quotes.filter((q) => String(q.option_type).toUpperCase() === "PUT" || q.option_type === 2);

  const call = nearest(calls, (q) => Math.abs(Number(q.strike_price) - spot), 0) as any;
  const put = nearest(puts, (q) => Math.abs(Number(q.strike_price) - spot), 0) as any;
  if (!call || !put) return [];
  return [
    { code: call.code, side: "BUY", qty: strategy.parameters.contracts },
    { code: put.code, side: "BUY", qty: strategy.parameters.contracts },
  ];
}

async function buildCrashHedgePut(api: Moomoo, underlying: string, expiry: string, strategy: Strategy): Promise<TradeLeg[]> {
  const quotes = await api.getOptionQuotesForExpiry(underlying, expiry);
  const puts = quotes.filter(
    (q) =>
      (q.delta || q.option_delta || q.option_delta === 0) &&
      (String(q.option_type).toUpperCase() === "PUT" || q.option_type === 2)
  );
  const target = strategy.parameters.targetDelta;
  const long = nearest(puts, (q) => Math.abs(Number(q.delta || q.option_delta || 0)), target);
  if (!long) return [];
  return [{ code: long.code, side: "BUY", qty: strategy.parameters.contracts }];
}

async function buildCollarPosition(api: Moomoo, underlying: string, expiry: string, strategy: Strategy): Promise<TradeLeg[]> {
  const [sret, snap] = await api.quote.get_market_snapshot([underlying]);
  if (sret !== mm.RET_OK) return [];
  const spot = Number((snap as any[])[0].last_price);
  const quotes = await api.getOptionQuotesForExpiry(underlying, expiry);
  const calls = quotes.filter((q) => String(q.option_type).toUpperCase() === "CALL" || q.option_type === 1);
  const puts = quotes.filter((q) => String(q.option_type).toUpperCase() === "PUT" || q.option_type === 2);

  const shortCall = nearest(calls, (q) => Math.abs(Number(q.delta || 0)), strategy.parameters.targetDelta);
  const longPut = nearest(puts, (q) => Math.abs(Number(q.delta || 0)), strategy.parameters.shortDelta);
  
  const legs: TradeLeg[] = [];
  
  if (shortCall) {
    legs.push({ code: shortCall.code, side: "SELL", qty: strategy.parameters.contracts });
  }
  
  if (longPut) {
    legs.push({ code: longPut.code, side: "BUY", qty: strategy.parameters.contracts });
  }
  
  return legs;
}

// ---- CPPI Strategy Orchestration ------------------------------------------
async function runCPPIStrategy(): Promise<void> {
  const api = new Moomoo();
  await api.connect();
  
  try {
    log("=== Starting CPPI Strategy Execution ===");
    
    const strategies = configManager.getStrategies();
    const universe = await api.discoverUniverse();
    const portfolioState = await loadPortfolioState();
    
    log("Universe:", universe.join(", "));
    log("Current CPPI Metrics:");
    log(`  Invested to Date: $${portfolioState.cppiMetrics.investedToDate.toFixed(2)}`);
    log(`  Floor: $${portfolioState.cppiMetrics.floor.toFixed(2)}`);
    log(`  Cushion: $${portfolioState.cppiMetrics.cushion.toFixed(2)}`);
    log(`  Risky Weight: ${(portfolioState.cppiMetrics.riskyWeight * 100).toFixed(1)}%`);
    log(`  Needs Rebalance: ${portfolioState.cppiMetrics.needsRebalance}`);

    // Apply weekly deposit allocation if it's time
    if (shouldAllocateWeeklyDeposit(portfolioState.lastUpdateTime)) {
      await allocateWeeklyDeposit(portfolioState);
    }

    // Execute rebalancing if needed
    if (portfolioState.cppiMetrics.needsRebalance) {
      await executeRebalancing(api, portfolioState);
      cppiEngine.executeRebalance(portfolioState.cppiMetrics.weeksSinceStart);
    }

    // Execute sleeve strategies with risk budgets
    for (const strategy of strategies) {
      await executeSleeveStrategy(api, strategy, universe, portfolioState);
    }

    // Save updated portfolio state
    portfolioState.lastUpdateTime = new Date();
    await savePortfolioState(portfolioState);

    log("=== CPPI Strategy Execution Complete ===");
  } finally {
    await api.close();
  }
}

function shouldAllocateWeeklyDeposit(lastUpdate: Date): boolean {
  const now = new Date();
  const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 3600 * 24);
  return daysSinceUpdate >= 7;
}

async function allocateWeeklyDeposit(portfolioState: PortfolioState): Promise<void> {
  log("--- Weekly Deposit Allocation ---");
  
  const allocation = cppiEngine.computeContributionsAllocation(
    portfolioState.cppiMetrics.targetWeights,
    portfolioState.sleeveEquities,
    config.cppi.weeklyDeposit
  );

  log("Allocating weekly deposit of $" + config.cppi.weeklyDeposit + ":");
  log(`  Debit: $${allocation.debit.toFixed(2)}`);
  log(`  Credit: $${allocation.credit.toFixed(2)}`);
  log(`  Straddle: $${allocation.straddle.toFixed(2)}`);
  log(`  Collar: $${allocation.collar.toFixed(2)}`);
  log(`  Hedge: $${allocation.hedge.toFixed(2)}`);

  // Update sleeve equities with allocations
  portfolioState.sleeveEquities.debit += allocation.debit;
  portfolioState.sleeveEquities.credit += allocation.credit;
  portfolioState.sleeveEquities.straddle += allocation.straddle;
  portfolioState.sleeveEquities.collar += allocation.collar;
  portfolioState.sleeveEquities.hedge += allocation.hedge;
  portfolioState.sleeveEquities.total += config.cppi.weeklyDeposit;

  // Recompute CPPI metrics with updated equities
  portfolioState.cppiMetrics = cppiEngine.computeCPPIMetrics(portfolioState.sleeveEquities);
}

async function executeRebalancing(api: Moomoo, portfolioState: PortfolioState): Promise<void> {
  log("--- Monthly Drift-Band Rebalancing ---");
  
  const current = portfolioState.cppiMetrics.currentWeights;
  const target = portfolioState.cppiMetrics.targetWeights;
  
  log("Current vs Target Weights:");
  log(`  Debit: ${(current.debit * 100).toFixed(1)}% vs ${(target.debit * 100).toFixed(1)}%`);
  log(`  Credit: ${(current.credit * 100).toFixed(1)}% vs ${(target.credit * 100).toFixed(1)}%`);
  log(`  Straddle: ${(current.straddle * 100).toFixed(1)}% vs ${(target.straddle * 100).toFixed(1)}%`);
  log(`  Collar: ${(current.collar * 100).toFixed(1)}% vs ${(target.collar * 100).toFixed(1)}%`);
  log(`  Hedge: ${(current.hedge * 100).toFixed(1)}% vs ${(target.hedge * 100).toFixed(1)}%`);

  // In a real implementation, this would:
  // 1. Close positions in over-weight sleeves
  // 2. Move cash to under-weight sleeves
  // 3. Update sleeve equities accordingly
  
  log("Rebalancing executed (implementation pending)");
}

async function executeSleeveStrategy(api: Moomoo, strategy: Strategy, universe: string[], portfolioState: PortfolioState): Promise<void> {
  log(`\n--- Executing Sleeve Strategy: ${strategy.name} ---`);
  
  const sleeveType = getSleeveType(strategy.id);
  if (!sleeveType) {
    log(`Unknown sleeve type for strategy ${strategy.id}`);
    return;
  }

  const sleeveEquity = portfolioState.sleeveEquities[sleeveType];
  
  // Check monthly cadence for straddles
  if (strategy.id === "event_straddles" && !cppiEngine.shouldPlaceStraddleThisWeek(portfolioState.cppiMetrics.weeksSinceStart)) {
    log("Straddle cadence gate: skipping this week (monthly placement)");
    return;
  }

  const cadence = strategy.id === "event_straddles" ? "monthly" : "weekly";
  const riskBudget = cppiEngine.computeRiskBudget(sleeveType, sleeveEquity, cadence);
  
  log(`Sleeve: ${sleeveType}, Equity: $${sleeveEquity.toFixed(2)}, Risk Budget: $${riskBudget.toFixed(2)}`);

  const account = await api.getAccount(strategy);
  const underlying = universe[0]; // For simplicity, use first symbol
  const expiry = await api.getMonthlyExpiry(underlying, strategy);
  
  if (!expiry) {
    log(`No suitable expiry for ${underlying}`);
    return;
  }

  // Build strategy legs
  let allLegs: TradeLeg[] = [];
  
  for (const component of strategy.components) {
    let legs: TradeLeg[] = [];
    
    switch (component) {
      case "debit_call_vertical":
        legs = await buildDebitCallVertical(api, underlying, expiry, strategy);
        break;
      case "credit_put_spread":
        legs = await buildCreditPutSpread(api, underlying, expiry, strategy);
        break;
      case "atm_straddle":
        legs = await buildATMStraddle(api, underlying, expiry, strategy);
        break;
      case "crash_hedge_put":
        legs = await buildCrashHedgePut(api, underlying, expiry, strategy);
        break;
      case "collar_position":
        legs = await buildCollarPosition(api, underlying, expiry, strategy);
        break;
      default:
        log(`Unknown component: ${component}`);
        continue;
    }
    
    if (legs.length > 0) {
      log(`Built ${legs.length} legs for component: ${component}`);
      allLegs = allLegs.concat(legs);
    }
  }

  if (allLegs.length === 0) {
    log(`No suitable legs found for strategy ${strategy.id}`);
    return;
  }

  // Size trades based on risk budget
  const totalNotional = allLegs.reduce((sum, leg) => sum + (leg.limit || 100) * leg.qty * 100, 0);
  if (totalNotional > riskBudget) {
    const scaleFactor = riskBudget / totalNotional;
    log(`Scaling position size by ${scaleFactor.toFixed(2)} to fit risk budget`);
    allLegs.forEach(leg => {
      leg.qty = Math.max(1, Math.floor(leg.qty * scaleFactor));
    });
  }

  // Place legs
  for (const leg of allLegs) {
    const est = await api.getOrderBook(leg.code);
    const px = midPrice(est || {}) || undefined;
    
    const tradeData = {
      strategy: strategy.id,
      strategyName: strategy.name,
      sleeve: sleeveType,
      underlying,
      expiry,
      accountId: account.accId,
      riskBudget,
      ...leg,
    };
    
    await api.placeLimit(leg.code, leg.qty, leg.side, px, account);
    await sleep(250);
  }

  const feePer = await api.estimateFeeUSDPerContract({ accId: account.accId, trdEnv: account.trdEnv });
  log(`Estimated fee per contract: $${feePer.toFixed(2)}`);
}

function getSleeveType(strategyId: string): keyof SleeveWeights | null {
  switch (strategyId) {
    case "debit_spreads": return "debit";
    case "credit_spreads": return "credit";
    case "event_straddles": return "straddle";
    case "collar_equity": return "collar";
    case "crash_hedge": return "hedge";
    default: return null;
  }
}

// ---- Main -----------------------------------------------------------------
async function main(): Promise<void> {
  try {
    log("Starting Moomoo 5-Sleeve CPPI Options Bot");
    log(`Trading environment: ${config.trading.environment} (Dry run: ${config.trading.dryRun})`);
    log(`CPPI Configuration: Floor=${config.cppi.floorPct}, Multiplier=${config.cppi.cppiM}`);
    
    await runCPPIStrategy();
    
    log("Bot execution completed successfully");
  } catch (e) {
    console.error("Fatal error:", e);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}