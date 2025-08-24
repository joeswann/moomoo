/**
 * Configuration management for the Moomoo Options Bot
 * Supports flexible strategy and account configuration via JSON files
 */

import { existsSync } from "std/fs/mod.ts";

// ---- Type Definitions ------------------------------------------------------
export interface TradingConfig {
  host: string;
  port: number;
  environment: "REAL" | "SIMULATE";
  dryRun: boolean;
}

export interface AccountConfig {
  id: number | null;
  index: number;
}

export interface StrategyParameters {
  targetDelta: number;
  shortDelta: number;
  width: number;
  contracts: number;
  dteTarget: number;
  dteMin: number;
  dteMax: number;
}

export interface RiskLimits {
  maxWeeklySpend: number;
  maxPositionSize: number;
  maxDailyTrades: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  account: AccountConfig;
  parameters: StrategyParameters;
  riskLimits: RiskLimits;
  components: string[];
}

export interface UniverseConfig {
  discoveryMode: "static" | "dynamic";
  maxSymbols: number;
  fallbackSymbols: string[];
  filters: {
    minVolume: number;
    minOpenInterest: number;
    minPrice: number;
    maxPrice: number;
  };
}

export interface RebalancingConfig {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  dayOfMonth?: number;
  dayOfWeek?: number;
  rollDTE: number;
}

export interface GlobalRiskLimits {
  maxTotalWeeklySpend: number;
  maxAccountAllocation: number;
  maxSinglePositionSize: number;
}

export interface RiskConfig {
  globalLimits: GlobalRiskLimits;
  feeEstimation: {
    lookbackOrders: number;
    defaultFeePerContract: number;
  };
}

export interface LoggingConfig {
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  dataDir: string;
  logFile: string;
  enableTradeLogging: boolean;
  enablePerformanceTracking: boolean;
}

export interface CPPIConfig {
  floorPct: number;
  cppiM: number;
  riskScaleOptions: number;
  riskySplit: {
    debit: number;
    credit: number;
    straddle: number;
    hedgeFixed: number;
  };
  driftBandAbs: number;
  rebalanceEveryWeeks: number;
  weeklyDeposit: number;
  baseRiskPct: {
    debit: number;
    credit: number;
    straddle: number;
    hedge: number;
  };
  minTickets: {
    debit: number;
    creditMaxLoss: number;
    straddle: number;
    hedge: number;
  };
}

export interface BotConfig {
  trading: TradingConfig;
  strategies: Strategy[];
  universe: UniverseConfig;
  rebalancing: RebalancingConfig;
  risk: RiskConfig;
  logging: LoggingConfig;
  cppi: CPPIConfig;
}

// ---- Configuration Manager -------------------------------------------------
export class ConfigManager {
  private config: BotConfig;
  private configPath: string;

  constructor(configPath = "./config.json") {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.applyEnvironmentOverrides();
    this.validateConfig();
  }

  private loadConfig(): BotConfig {
    try {
      if (!existsSync(this.configPath)) {
        throw new Error(`Config file not found: ${this.configPath}`);
      }
      
      const configText = Deno.readTextFileSync(this.configPath);
      const config = JSON.parse(configText) as BotConfig;
      
      console.log(`✓ Loaded configuration from ${this.configPath}`);
      return config;
    } catch (error) {
      console.error(`Failed to load config: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private applyEnvironmentOverrides(): void {
    // Trading environment overrides
    if (Deno.env.get("MOOMOO_HOST")) {
      this.config.trading.host = Deno.env.get("MOOMOO_HOST")!;
    }
    
    if (Deno.env.get("MOOMOO_PORT")) {
      this.config.trading.port = Number(Deno.env.get("MOOMOO_PORT"));
    }
    
    if (Deno.env.get("TRD_ENV")) {
      this.config.trading.environment = Deno.env.get("TRD_ENV") as "REAL" | "SIMULATE";
    }
    
    if (Deno.env.get("DRY_RUN")) {
      this.config.trading.dryRun = Deno.env.get("DRY_RUN")?.toLowerCase() === "true";
    }

    // Account ID overrides for strategies
    this.config.strategies.forEach((strategy, index) => {
      // Check for strategy-specific account ID
      const strategyAccId = Deno.env.get(`${strategy.id.toUpperCase()}_ACC_ID`);
      const strategyAccIndex = Deno.env.get(`${strategy.id.toUpperCase()}_ACC_INDEX`);
      
      // Check for generic numbered account IDs (backwards compatibility)
      const numberedAccId = Deno.env.get(`ACC_ID_${index + 1}`);
      const numberedAccIndex = Deno.env.get(`ACC_INDEX_${index + 1}`);
      
      if (strategyAccId) {
        strategy.account.id = Number(strategyAccId);
      } else if (numberedAccId) {
        strategy.account.id = Number(numberedAccId);
      }
      
      if (strategyAccIndex) {
        strategy.account.index = Number(strategyAccIndex);
      } else if (numberedAccIndex) {
        strategy.account.index = Number(numberedAccIndex);
      }
    });

    // Logging overrides
    if (Deno.env.get("DATA_DIR")) {
      this.config.logging.dataDir = Deno.env.get("DATA_DIR")!;
    }
    
    if (Deno.env.get("LOG_FILE")) {
      this.config.logging.logFile = Deno.env.get("LOG_FILE")!;
    }
    
    if (Deno.env.get("LOG_LEVEL")) {
      this.config.logging.level = Deno.env.get("LOG_LEVEL") as "DEBUG" | "INFO" | "WARN" | "ERROR";
    }

    // Universe overrides
    if (Deno.env.get("UNIVERSE_MAX")) {
      this.config.universe.maxSymbols = Number(Deno.env.get("UNIVERSE_MAX"));
    }

    console.log("✓ Applied environment variable overrides");
  }

  private validateConfig(): void {
    const errors: string[] = [];

    // Validate strategies
    if (!this.config.strategies || this.config.strategies.length === 0) {
      errors.push("At least one strategy must be configured");
    }

    // Check for duplicate strategy IDs
    const strategyIds = new Set();
    this.config.strategies.forEach(strategy => {
      if (strategyIds.has(strategy.id)) {
        errors.push(`Duplicate strategy ID: ${strategy.id}`);
      }
      strategyIds.add(strategy.id);

      // Validate strategy parameters
      if (strategy.parameters.contracts <= 0) {
        errors.push(`Strategy ${strategy.id}: contracts must be positive`);
      }
      
      if (strategy.parameters.dteMin >= strategy.parameters.dteMax) {
        errors.push(`Strategy ${strategy.id}: dteMin must be less than dteMax`);
      }
    });

    // Validate universe
    if (this.config.universe.maxSymbols <= 0) {
      errors.push("Universe maxSymbols must be positive");
    }

    // Validate risk limits
    if (this.config.risk.globalLimits.maxTotalWeeklySpend <= 0) {
      errors.push("Global maxTotalWeeklySpend must be positive");
    }

    if (errors.length > 0) {
      console.error("Configuration validation errors:");
      errors.forEach(error => console.error(`  - ${error}`));
      throw new Error(`Configuration validation failed: ${errors.length} errors`);
    }

    console.log("✓ Configuration validation passed");
  }

  // ---- Getters ----
  getConfig(): BotConfig {
    return this.config;
  }

  getTradingConfig(): TradingConfig {
    return this.config.trading;
  }

  getStrategies(): Strategy[] {
    return this.config.strategies.filter(s => s.enabled);
  }

  getStrategy(id: string): Strategy | undefined {
    return this.config.strategies.find(s => s.id === id && s.enabled);
  }

  getUniverseConfig(): UniverseConfig {
    return this.config.universe;
  }

  getRebalancingConfig(): RebalancingConfig {
    return this.config.rebalancing;
  }

  getRiskConfig(): RiskConfig {
    return this.config.risk;
  }

  getLoggingConfig(): LoggingConfig {
    return this.config.logging;
  }

  getCPPIConfig(): CPPIConfig {
    return this.config.cppi;
  }

  // ---- Dynamic Configuration Updates ----
  async saveConfig(): Promise<void> {
    try {
      const configText = JSON.stringify(this.config, null, 2);
      await Deno.writeTextFile(this.configPath, configText);
      console.log(`✓ Configuration saved to ${this.configPath}`);
    } catch (error) {
      console.error(`Failed to save config: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  enableStrategy(strategyId: string): void {
    const strategy = this.config.strategies.find(s => s.id === strategyId);
    if (strategy) {
      strategy.enabled = true;
      console.log(`✓ Enabled strategy: ${strategyId}`);
    }
  }

  disableStrategy(strategyId: string): void {
    const strategy = this.config.strategies.find(s => s.id === strategyId);
    if (strategy) {
      strategy.enabled = false;
      console.log(`✓ Disabled strategy: ${strategyId}`);
    }
  }

  updateStrategyAccount(strategyId: string, accountId: number | null, accountIndex?: number): void {
    const strategy = this.config.strategies.find(s => s.id === strategyId);
    if (strategy) {
      strategy.account.id = accountId;
      if (accountIndex !== undefined) {
        strategy.account.index = accountIndex;
      }
      console.log(`✓ Updated account for strategy ${strategyId}: ID=${accountId}, Index=${strategy.account.index}`);
    }
  }

  updateStrategyParameters(strategyId: string, parameters: Partial<StrategyParameters>): void {
    const strategy = this.config.strategies.find(s => s.id === strategyId);
    if (strategy) {
      Object.assign(strategy.parameters, parameters);
      console.log(`✓ Updated parameters for strategy ${strategyId}`);
    }
  }

  updateRiskLimits(strategyId: string, riskLimits: Partial<RiskLimits>): void {
    const strategy = this.config.strategies.find(s => s.id === strategyId);
    if (strategy) {
      Object.assign(strategy.riskLimits, riskLimits);
      console.log(`✓ Updated risk limits for strategy ${strategyId}`);
    }
  }

  // ---- Utility Methods ----
  getEnabledStrategyCount(): number {
    return this.config.strategies.filter(s => s.enabled).length;
  }

  getTotalWeeklySpendLimit(): number {
    return this.config.strategies
      .filter(s => s.enabled)
      .reduce((sum, s) => sum + s.riskLimits.maxWeeklySpend, 0);
  }

  getUniqueAccounts(): { id: number | null; index: number }[] {
    const accounts = new Map();
    
    this.config.strategies
      .filter(s => s.enabled)
      .forEach(s => {
        const key = `${s.account.id}_${s.account.index}`;
        if (!accounts.has(key)) {
          accounts.set(key, s.account);
        }
      });
    
    return Array.from(accounts.values());
  }

  // ---- Factory Methods ----
  static async createDefault(configPath = "./config.json"): Promise<ConfigManager> {
    if (!existsSync(configPath)) {
      console.log(`Creating default configuration at ${configPath}`);
      await ConfigManager.generateDefaultConfig(configPath);
    }
    return new ConfigManager(configPath);
  }

  static async generateDefaultConfig(outputPath = "./config.json"): Promise<void> {
    const defaultConfig: BotConfig = {
      trading: {
        host: "127.0.0.1",
        port: 11111,
        environment: "SIMULATE",
        dryRun: true
      },
      strategies: [
        {
          id: "example_strategy",
          name: "Example Strategy",
          description: "Template strategy for customization",
          enabled: false,
          account: { id: null, index: 0 },
          parameters: {
            targetDelta: 0.30,
            shortDelta: 0.20,
            width: 5,
            contracts: 1,
            dteTarget: 28,
            dteMin: 21,
            dteMax: 45
          },
          riskLimits: {
            maxWeeklySpend: 200,
            maxPositionSize: 10,
            maxDailyTrades: 5
          },
          components: ["debit_call_vertical"]
        }
      ],
      universe: {
        discoveryMode: "dynamic",
        maxSymbols: 6,
        fallbackSymbols: ["US.SPY", "US.QQQ", "US.IWM"],
        filters: {
          minVolume: 1000000,
          minOpenInterest: 500,
          minPrice: 20,
          maxPrice: 1000
        }
      },
      rebalancing: {
        enabled: true,
        frequency: "monthly",
        dayOfMonth: 1,
        rollDTE: 5
      },
      risk: {
        globalLimits: {
          maxTotalWeeklySpend: 1000,
          maxAccountAllocation: 0.25,
          maxSinglePositionSize: 0.05
        },
        feeEstimation: {
          lookbackOrders: 50,
          defaultFeePerContract: 1.50
        }
      },
      logging: {
        level: "INFO",
        dataDir: "./data",
        logFile: "./data/trading.log",
        enableTradeLogging: true,
        enablePerformanceTracking: true
      },
      cppi: {
        floorPct: 0.85,
        cppiM: 4.0,
        riskScaleOptions: 1.25,
        riskySplit: {
          debit: 0.60,
          credit: 0.15,
          straddle: 0.25,
          hedgeFixed: 0.02
        },
        driftBandAbs: 0.10,
        rebalanceEveryWeeks: 4,
        weeklyDeposit: 50,
        baseRiskPct: {
          debit: 0.06,
          credit: 0.02,
          straddle: 0.04,
          hedge: 0.01
        },
        minTickets: {
          debit: 30,
          creditMaxLoss: 100,
          straddle: 50,
          hedge: 5
        }
      }
    };

    await Deno.writeTextFile(outputPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`✓ Default configuration generated at ${outputPath}`);
  }
}