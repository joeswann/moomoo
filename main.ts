/**
 * moomoo-multiaccount-options-bot.ts
 *
 * End-to-end TypeScript app that connects to moomoo OpenAPI (via OpenD), discovers a liquid universe dynamically,
 * builds five options strategies, supports monthly rebalancing, and places orders with basic fee-estimation.
 *
 * IMPORTANT:
 * - Requires moomoo OpenD running & logged in (see API docs) and the JavaScript SDK installed: `npm i moomoo-api`.
 * - Many broker-side settings/permissions apply (market data, options level, etc.).
 * - You MUST run in SIM first. Set TRD_ENV=SIMULATE to paper trade.
 *
 * Quick start:
 *   export MOOMOO_HOST=127.0.0.1
 *   export MOOMOO_PORT=11111
 *   export TRD_ENV=SIMULATE   # or REAL
 *   export ACC_INDEX=0        # or set ACC_ID to a specific account id
 *   deno task start
 */

import { existsSync } from "std/fs/mod.ts";
// @ts-ignore: npm module without types
import * as mm from "moomoo-api";
import { ConfigManager, Strategy, TradingConfig } from "./config.ts";

// ---- Global Configuration --------------------------------------------------
const configManager = await ConfigManager.createDefault();
const config = configManager.getConfig();

// ---- Helpers ---------------------------------------------------------------
function log(...args: unknown[]) {
  const timestamp = new Date().toISOString();
  const message = `${timestamp} - ${args.join(" ")}`;
  console.log(message);
  
  // Persist logs to file
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

// Utility to pick nearest value in array
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

// Format mid price from order book
function midPrice(ob: any): number | undefined {
  try {
    const ask = Number(ob.ask[0].price);
    const bid = Number(ob.bid[0].price);
    return (ask && bid) ? (ask + bid) / 2 : undefined;
  } catch {
    return undefined;
  }
}

// Chunk util
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// Data persistence helpers
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

// ---- Connection/Contexts ---------------------------------------------------
class Moomoo {
  quote!: any; // OpenQuoteContext
  trade!: any; // OpenSecTradeContext

  async connect(): Promise<void> {
    const tradingConfig = config.trading;
    log("Connecting to OpenD", tradingConfig.host, tradingConfig.port);
    this.quote = new mm.OpenQuoteContext({ host: tradingConfig.host, port: tradingConfig.port });
    this.trade = new mm.OpenSecTradeContext({ host: tradingConfig.host, port: tradingConfig.port });

    // Start underlying sockets if required by your version
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

  // ---- Accounts ----
  async getAccount(strategy?: Strategy): Promise<{ accId: number; trdEnv: string; trdMarket: number }> {
    const trdEnv = config.trading.environment === "REAL" ? mm.TrdEnv.REAL : mm.TrdEnv.SIMULATE;
    
    // Determine which account config to use
    let accId: number | null, accIndex: number;
    if (strategy) {
      accId = strategy.account.id;
      accIndex = strategy.account.index;
      log(`Using strategy-specific account for ${strategy.id}: ID=${accId}, Index=${accIndex}`);
    } else {
      // Fallback to first enabled strategy's account or default
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
    const rows: any[] = data; // SDK returns array-like rows

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

  // ---- Universe discovery ----
  async discoverUniverse(maxN = config.universe.maxSymbols): Promise<string[]> {
    const codes: string[] = [];
    try {
      // 1) Get US plates
      const [pret, plates] = await this.quote.get_plate_list(mm.Market.US, mm.Plate.ALL);
      if (pret === mm.RET_OK) {
        const indexPlates = (plates as any[]).filter((p) => /S&P|NASDAQ|Dow/i.test(p.plate_name));
        for (const pl of indexPlates) {
          const [sret, secs] = await this.quote.get_plate_stock(pl.code);
          if (sret !== mm.RET_OK) continue;
          const secCodes = (secs as any[]).map((s) => s.code).slice(0, 300);
          // Snapshot to pick most active
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

    // Fallback to configured fallback symbols
    if (codes.length === 0) return config.universe.fallbackSymbols.slice(0, maxN);
    return codes.slice(0, maxN);
  }

  // ---- Options utilities ----
  async getMonthlyExpiry(code: string, strategy?: Strategy): Promise<string | undefined> {
    const [ret, dates] = await this.quote.get_option_expiration_date(code);
    if (ret !== mm.RET_OK) return undefined;
    
    // Use strategy-specific DTE parameters if provided, otherwise use defaults
    const dteMin = strategy?.parameters.dteMin ?? 21;
    const dteMax = strategy?.parameters.dteMax ?? 45;
    const dteTarget = strategy?.parameters.dteTarget ?? 28;
    
    const now = new Date();
    const inRange: string[] = [];
    for (const d of dates as any[]) {
      const t = new Date(d); // ISO date string
      const dte = Math.round((t.getTime() - now.getTime()) / (1000 * 3600 * 24));
      if (dte >= dteMin && dte <= dteMax) inRange.push(d);
    }
    // Prefer standard monthly (3rd Friday). If multiple, pick nearest to target DTE.
    const pick = nearest(inRange, (s) => {
      const t = new Date(s);
      return Math.abs((t.getTime() - now.getTime()) / (1000 * 3600 * 24));
    }, dteTarget);
    return pick;
  }

  async getOptionQuotesForExpiry(underlying: string, expiry: string): Promise<any[]> {
    // 1) get static chain
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

    // 2) subscribe + get quotes (with greeks, IV, OI, premium)
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

  // ---- Fee estimation (opportunistic) ----
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
        const contractSize = 100; // US equity options
        const nContracts = Math.max(1, Math.round(qty / contractSize));
        if (nContracts > 0) perContract.push(total / nContracts);
      }
      perContract.sort((a, b) => a - b);
      return perContract[Math.floor(perContract.length / 2)] || 0;
    } catch {
      return 0;
    }
  }

  // ---- Placing orders ------------------------------------------------------
  async placeLimit(
    code: string,
    qtyContracts: number,
    side: "BUY" | "SELL",
    price?: number,
    acc?: { accId: number; trdEnv: any }
  ) {
    const a = acc || (await this.getAccount());
    const contractSize = 100; // equity options
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

    // Auto-adjust price to a valid tick using adjust_limit (per docs)
    const params = {
      price: px,
      qty,
      code,
      trd_side: side === "BUY" ? mm.TrdSide.BUY : mm.TrdSide.SELL,
      order_type: mm.OrderType.NORMAL, // limit
      adjust_limit: 10, // allow small auto-adjustment to valid tick
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
  const target = 0.08; // ~8Δ
  const long = nearest(puts, (q) => Math.abs(Number(q.delta || q.option_delta || 0)), target);
  if (!long) return [];
  return [{ code: long.code, side: "BUY", qty: strategy.parameters.contracts }];
}

async function buildCashSecuredPut(api: Moomoo, underlying: string, expiry: string, strategy: Strategy): Promise<TradeLeg[]> {
  const quotes = await api.getOptionQuotesForExpiry(underlying, expiry);
  const puts = quotes.filter((q) => String(q.option_type).toUpperCase() === "PUT" || q.option_type === 2);
  const short = nearest(puts, (q) => Math.abs(Number(q.delta || 0)), strategy.parameters.shortDelta);
  if (!short) return [];
  return [{ code: short.code, side: "SELL", qty: strategy.parameters.contracts }];
}

// ---- Flexible Strategy Orchestration --------------------------------------
async function runStrategiesOnce(): Promise<void> {
  const api = new Moomoo();
  await api.connect();
  try {
    const strategies = configManager.getStrategies();
    const universe = await api.discoverUniverse();
    
    log("Universe:", universe.join(", "));
    log(`Executing ${strategies.length} enabled strategies`);

    // Execute each enabled strategy
    for (const [index, strategy] of strategies.entries()) {
      log(`\n--- Executing Strategy: ${strategy.name} (${strategy.id}) ---`);
      log(`Description: ${strategy.description}`);
      
      // Get account for this strategy
      const account = await api.getAccount(strategy);
      
      // Pick underlying for this strategy (round-robin through universe)
      const underlying = universe[index % universe.length];
      const expiry = await api.getMonthlyExpiry(underlying, strategy);
      
      if (!expiry) {
        log(`No suitable expiry for ${underlying} in strategy ${strategy.id}`);
        continue;
      }

      log(`Strategy ${strategy.id}: Trading ${underlying} with expiry ${expiry} on account ${account.accId}`);

      // Execute strategy components
      let allLegs: TradeLeg[] = [];
      
      // Special handling for mixed opportunistic strategy
      if (strategy.id === "mixed_opportunistic" && strategy.components.length > 1) {
        // Alternate between components based on date/time
        const componentIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % strategy.components.length;
        const selectedComponent = strategy.components[componentIndex];
        log(`Mixed strategy selecting component: ${selectedComponent} (index ${componentIndex})`);
        
        let legs: TradeLeg[] = [];
        switch (selectedComponent) {
          case "debit_call_vertical":
            legs = await buildDebitCallVertical(api, underlying, expiry, strategy);
            break;
          case "credit_put_spread":
            legs = await buildCreditPutSpread(api, underlying, expiry, strategy);
            break;
        }
        
        if (legs.length > 0) {
          log(`Built ${legs.length} legs for component: ${selectedComponent}`);
          allLegs = allLegs.concat(legs);
        }
      } else {
        // Execute all components for regular strategies
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
            case "cash_secured_put":
              legs = await buildCashSecuredPut(api, underlying, expiry, strategy);
              break;
            case "crash_hedge":
              legs = await buildCrashHedgePut(api, underlying, expiry, strategy);
              break;
            default:
              log(`Unknown strategy component: ${component}`);
              continue;
          }
          
          if (legs.length > 0) {
            log(`Built ${legs.length} legs for component: ${component}`);
            allLegs = allLegs.concat(legs);
          }
        }
      }

      if (allLegs.length === 0) {
        log(`No suitable legs found for strategy ${strategy.id}`);
        continue;
      }

      // Check risk limits
      const totalNotional = allLegs.reduce((sum, leg) => sum + (leg.limit || 0) * leg.qty * 100, 0);
      if (totalNotional > strategy.riskLimits.maxWeeklySpend) {
        log(`Strategy ${strategy.id}: Trade exceeds weekly spend limit ($${totalNotional} > $${strategy.riskLimits.maxWeeklySpend})`);
        continue;
      }

      // Place legs sequentially as individual orders
      for (const leg of allLegs) {
        const est = await api.getOrderBook(leg.code);
        const px = midPrice(est || {}) || undefined;
        
        // Save trade data with strategy information
        const tradeData = {
          strategy: strategy.id,
          strategyName: strategy.name,
          underlying,
          expiry,
          accountId: account.accId,
          ...leg,
        };
        
        await api.placeLimit(leg.code, leg.qty, leg.side, px, account);
        await sleep(250); // small spacing between orders
      }

      // Fee estimation for this account
      const feePer = await api.estimateFeeUSDPerContract({ accId: account.accId, trdEnv: account.trdEnv });
      log(`Strategy ${strategy.id} - Estimated fee per contract: $${feePer.toFixed(2)}`);
      
      // Small delay between strategies
      await sleep(1000);
    }

    log(`\n--- All ${strategies.length} strategies executed ---`);
  } finally {
    await api.close();
  }
}

// ---- Rebalancing scheduler (flexible) -------------------------------------
function isRebalanceDay(d = new Date()): boolean {
  const rebalanceConfig = config.rebalancing;
  if (!rebalanceConfig.enabled) return false;
  
  switch (rebalanceConfig.frequency) {
    case "daily":
      return true;
    case "weekly":
      return rebalanceConfig.dayOfWeek ? d.getDay() === rebalanceConfig.dayOfWeek : d.getDay() === 1; // Default Monday
    case "monthly":
      return d.getDate() === (rebalanceConfig.dayOfMonth || 1);
    default:
      return false;
  }
}

async function rebalance(): Promise<void> {
  log("Rebalancing: inspect positions, roll expiring options, resize per weekly budget…");
  // TODO: Implement actual rebalancing logic
}

// ---- Main -----------------------------------------------------------------
async function main(): Promise<void> {
  try {
    log("Starting Moomoo Options Bot with flexible configuration");
    log(`Loaded ${configManager.getEnabledStrategyCount()} enabled strategies`);
    log(`Trading environment: ${config.trading.environment} (Dry run: ${config.trading.dryRun})`);
    
    if (isRebalanceDay()) {
      log("Rebalance day detected, running rebalancing...");
      await rebalance();
    }
    
    await runStrategiesOnce();
    
    log("Bot execution completed successfully");
  } catch (e) {
    console.error("Fatal error:", e);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}