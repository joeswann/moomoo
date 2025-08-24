/**
 * Configuration CLI for the Moomoo Options Bot
 * Allows users to manage strategies and settings via command line
 */

import { parse } from "std/flags/mod.ts";
import { ConfigManager } from "./config.ts";

interface CLICommand {
  name: string;
  description: string;
  handler: (args: any) => Promise<void>;
}

const commands: CLICommand[] = [
  {
    name: "list",
    description: "List all strategies and their status",
    handler: async (args) => {
      const config = await ConfigManager.createDefault();
      const strategies = config.getConfig().strategies;
      
      console.log("\n📋 Strategy Configuration:");
      console.log("=".repeat(60));
      
      strategies.forEach((strategy, index) => {
        const status = strategy.enabled ? "✅ ENABLED" : "❌ DISABLED";
        console.log(`${index + 1}. ${strategy.name} (${strategy.id})`);
        console.log(`   Status: ${status}`);
        console.log(`   Account: ID=${strategy.account.id || 'auto'}, Index=${strategy.account.index}`);
        console.log(`   Components: ${strategy.components.join(", ")}`);
        console.log(`   Risk Limits: $${strategy.riskLimits.maxWeeklySpend}/week, ${strategy.riskLimits.maxPositionSize} contracts max`);
        console.log("");
      });
      
      console.log(`Total enabled strategies: ${config.getEnabledStrategyCount()}`);
      console.log(`Total weekly spend limit: $${config.getTotalWeeklySpendLimit()}`);
    }
  },
  
  {
    name: "enable",
    description: "Enable a strategy by ID",
    handler: async (args) => {
      if (!args.strategy) {
        console.error("❌ Please specify strategy ID with --strategy");
        return;
      }
      
      const config = await ConfigManager.createDefault();
      config.enableStrategy(args.strategy);
      await config.saveConfig();
      console.log(`✅ Enabled strategy: ${args.strategy}`);
    }
  },
  
  {
    name: "disable",
    description: "Disable a strategy by ID",
    handler: async (args) => {
      if (!args.strategy) {
        console.error("❌ Please specify strategy ID with --strategy");
        return;
      }
      
      const config = await ConfigManager.createDefault();
      config.disableStrategy(args.strategy);
      await config.saveConfig();
      console.log(`❌ Disabled strategy: ${args.strategy}`);
    }
  },
  
  {
    name: "set-account",
    description: "Set account for a strategy",
    handler: async (args) => {
      if (!args.strategy) {
        console.error("❌ Please specify strategy ID with --strategy");
        return;
      }
      
      const config = await ConfigManager.createDefault();
      const accountId = args.id ? Number(args.id) : null;
      const accountIndex = args.index !== undefined ? Number(args.index) : undefined;
      
      config.updateStrategyAccount(args.strategy, accountId, accountIndex);
      await config.saveConfig();
      
      console.log(`✅ Updated account for ${args.strategy}: ID=${accountId}, Index=${accountIndex}`);
    }
  },
  
  {
    name: "set-params",
    description: "Update strategy parameters",
    handler: async (args) => {
      if (!args.strategy) {
        console.error("❌ Please specify strategy ID with --strategy");
        return;
      }
      
      const config = await ConfigManager.createDefault();
      const params: any = {};
      
      if (args.delta !== undefined) params.targetDelta = Number(args.delta);
      if (args.contracts !== undefined) params.contracts = Number(args.contracts);
      if (args.dte !== undefined) params.dteTarget = Number(args.dte);
      if (args.width !== undefined) params.width = Number(args.width);
      
      config.updateStrategyParameters(args.strategy, params);
      await config.saveConfig();
      
      console.log(`✅ Updated parameters for ${args.strategy}:`, params);
    }
  },
  
  {
    name: "create",
    description: "Create a new strategy",
    handler: async (args) => {
      if (!args.id || !args.name) {
        console.error("❌ Please specify strategy --id and --name");
        return;
      }
      
      const config = await ConfigManager.createDefault();
      const strategies = config.getConfig().strategies;
      
      if (strategies.some(s => s.id === args.id)) {
        console.error("❌ ID already exists");
        return;
      }
      
      const newStrategy = {
        id: args.id,
        name: args.name,
        description: args.description || "Custom strategy",
        enabled: args.enabled !== false,
        account: {
          id: args.accountId ? Number(args.accountId) : null,
          index: args.accountIndex ? Number(args.accountIndex) : 0
        },
        parameters: {
          targetDelta: Number(args.delta || 0.30),
          shortDelta: Number(args.shortDelta || 0.20),
          width: Number(args.width || 5),
          contracts: Number(args.contracts || 1),
          dteTarget: Number(args.dte || 28),
          dteMin: Number(args.dteMin || 21),
          dteMax: Number(args.dteMax || 45)
        },
        riskLimits: {
          maxWeeklySpend: Number(args.maxSpend || 200),
          maxPositionSize: Number(args.maxSize || 10),
          maxDailyTrades: Number(args.maxTrades || 5)
        },
        components: args.components ? args.components.split(',') : ["debit_call_vertical"]
      };
      
      strategies.push(newStrategy);
      await config.saveConfig();
      
      console.log(`✅ Created new strategy: ${args.id}`);
    }
  },
  
  {
    name: "validate",
    description: "Validate current configuration",
    handler: async (args) => {
      try {
        const config = await ConfigManager.createDefault();
        console.log("✅ Configuration is valid");
        console.log(`📊 Summary:`);
        console.log(`   - ${config.getEnabledStrategyCount()} enabled strategies`);
        console.log(`   - ${config.getUniqueAccounts().length} unique accounts`);
        console.log(`   - $${config.getTotalWeeklySpendLimit()} total weekly limit`);
      } catch (error) {
        console.error("❌ Configuration validation failed:");
        console.error(error.message);
      }
    }
  },
  
  {
    name: "backup",
    description: "Create a backup of current configuration",
    handler: async (args) => {
      const config = await ConfigManager.createDefault();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = args.path || `./config-backup-${timestamp}.json`;
      
      const configData = JSON.stringify(config.getConfig(), null, 2);
      await Deno.writeTextFile(backupPath, configData);
      
      console.log(`✅ Configuration backed up to: ${backupPath}`);
    }
  },
  
  {
    name: "preset",
    description: "Switch to a preset configuration (conservative|aggressive|turbo)",
    handler: async (args) => {
      if (!args.mode) {
        console.error("❌ Please specify preset mode: conservative, aggressive, or turbo");
        console.log("Examples:");
        console.log("  deno run --allow-read --allow-write config-cli.ts preset --mode aggressive");
        console.log("  deno run --allow-read --allow-write config-cli.ts preset --mode turbo");
        return;
      }
      
      const mode = args.mode.toLowerCase();
      let configFile: string;
      
      switch (mode) {
        case "conservative":
          configFile = "./config.json";
          break;
        case "aggressive":
          configFile = "./config-aggressive.json";
          break;
        case "turbo":
          configFile = "./config-turbo.json";
          break;
        default:
          console.error(`❌ Unknown preset mode: ${mode}`);
          console.error("Available presets: conservative, aggressive, turbo");
          return;
      }
      
      try {
        // Backup current config
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupPath = `./config-backup-${timestamp}.json`;
        const currentConfig = await Deno.readTextFile("./config.json");
        await Deno.writeTextFile(backupPath, currentConfig);
        
        // Copy preset to main config
        const presetConfig = await Deno.readTextFile(configFile);
        await Deno.writeTextFile("./config.json", presetConfig);
        
        console.log(`✅ Switched to ${mode} preset`);
        console.log(`📦 Previous config backed up to: ${backupPath}`);
        console.log(`⚠️  Review settings before going live!`);
        
        if (mode === "turbo") {
          console.log(`🚨 TURBO MODE WARNING:`);
          console.log(`   - Expects 75% floor (25% max drawdown)`);
          console.log(`   - Requires $500/week deposits for target returns`);
          console.log(`   - Credit spreads DISABLED for pure convexity`);
          console.log(`   - Test thoroughly in simulation first!`);
        } else if (mode === "aggressive") {
          console.log(`⚡ AGGRESSIVE MODE:`);
          console.log(`   - 80% floor (20% max drawdown)`);
          console.log(`   - $250/week deposits recommended`);
          console.log(`   - Wide spreads for more upside capture`);
          console.log(`   - IV/trend filters enabled`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to switch preset: ${error.message}`);
      }
    }
  }
];

function showHelp(): void {
  console.log(`
🤖 Moomoo Options Bot Configuration CLI

Usage: deno run --allow-read --allow-write config-cli.ts <command> [options]

Commands:
${commands.map(cmd => `  ${cmd.name.padEnd(15)} ${cmd.description}`).join('\n')}

Examples:
  # List all strategies
  deno run --allow-read --allow-write config-cli.ts list

  # Enable a strategy
  deno run --allow-read --allow-write config-cli.ts enable --strategy barbell_convex

  # Set account for strategy
  deno run --allow-read --allow-write config-cli.ts set-account --strategy wheel_strategy --id 12345

  # Update strategy parameters
  deno run --allow-read --allow-write config-cli.ts set-params --strategy volatility_bet --delta 0.4 --contracts 2

  # Create new strategy
  deno run --allow-read --allow-write config-cli.ts create \\
    --id my_strategy --name "My Custom Strategy" \\
    --components debit_call_vertical,crash_hedge --maxSpend 300

  # Validate configuration
  deno run --allow-read --allow-write config-cli.ts validate

Common Options:
  --strategy <id>        Strategy ID to operate on
  --id <number>          Account ID
  --index <number>       Account index
  --delta <number>       Target delta (0.0-1.0)
  --contracts <number>   Number of contracts
  --maxSpend <number>    Max weekly spend
`);
}

async function main(): Promise<void> {
  const args = parse(Deno.args, {
    string: ["strategy", "id", "index", "name", "description", "components", "path", "mode"],
    number: ["delta", "shortDelta", "contracts", "dte", "dteMin", "dteMax", "width", "maxSpend", "maxSize", "maxTrades", "accountId", "accountIndex"],
    boolean: ["help", "enabled"],
    alias: {
      h: "help",
      s: "strategy",
      m: "mode"
    }
  });

  if (args.help || args._.length === 0) {
    showHelp();
    return;
  }

  const commandName = args._[0] as string;
  const command = commands.find(cmd => cmd.name === commandName);

  if (!command) {
    console.error(`❌ Unknown command: ${commandName}`);
    console.error("Run with --help to see available commands");
    return;
  }

  try {
    await command.handler(args);
  } catch (error) {
    console.error(`❌ Error executing command: ${error.message}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}