/**
 * CPPI Strategy Demo
 * Demonstrates the 5-sleeve CPPI implementation without requiring moomoo OpenD connection
 */

import { ConfigManager } from "./config.ts";
import { CPPIEngine, SleeveEquities, SleeveWeights } from "./cppi.ts";

async function main(): Promise<void> {
  console.log("=== 5-Sleeve CPPI Strategy Demo ===\n");
  
  const configManager = await ConfigManager.createDefault();
  const config = configManager.getConfig();
  const cppiEngine = new CPPIEngine(config.cppi);
  
  console.log("CPPI Configuration:");
  console.log(`  Floor Percentage: ${config.cppi.floorPct * 100}%`);
  console.log(`  CPPI Multiplier: ${config.cppi.cppiM}x`);
  console.log(`  Weekly Deposit: $${config.cppi.weeklyDeposit}`);
  console.log(`  Risky Split: Debit ${config.cppi.riskySplit.debit * 100}%, Credit ${config.cppi.riskySplit.credit * 100}%, Straddle ${config.cppi.riskySplit.straddle * 100}%, Hedge ${config.cppi.riskySplit.hedgeFixed * 100}%\n`);
  
  // Simulate portfolio progression over 10 weeks
  let mockEquities: SleeveEquities = {
    debit: 2000,
    credit: 1500,
    straddle: 1000,
    collar: 4000,
    hedge: 500,
    total: 9000
  };
  
  console.log("Simulating 10 weeks of CPPI strategy:\n");
  
  for (let week = 0; week < 10; week++) {
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + (week * 7));
    
    const metrics = cppiEngine.computeCPPIMetrics(mockEquities, currentDate);
    
    console.log(`Week ${week + 1}:`);
    console.log(`  Invested to Date: $${metrics.investedToDate.toFixed(2)}`);
    console.log(`  Total Portfolio: $${mockEquities.total.toFixed(2)}`);
    console.log(`  Floor: $${metrics.floor.toFixed(2)}`);
    console.log(`  Cushion: $${metrics.cushion.toFixed(2)}`);
    console.log(`  Risky Weight: ${(metrics.riskyWeight * 100).toFixed(1)}%`);
    
    console.log(`  Target Weights: D:${(metrics.targetWeights.debit * 100).toFixed(1)}% C:${(metrics.targetWeights.credit * 100).toFixed(1)}% S:${(metrics.targetWeights.straddle * 100).toFixed(1)}% Col:${(metrics.targetWeights.collar * 100).toFixed(1)}% H:${(metrics.targetWeights.hedge * 100).toFixed(1)}%`);
    console.log(`  Current Weights: D:${(metrics.currentWeights.debit * 100).toFixed(1)}% C:${(metrics.currentWeights.credit * 100).toFixed(1)}% S:${(metrics.currentWeights.straddle * 100).toFixed(1)}% Col:${(metrics.currentWeights.collar * 100).toFixed(1)}% H:${(metrics.currentWeights.hedge * 100).toFixed(1)}%`);
    
    // Apply weekly deposit allocation
    const allocation = cppiEngine.computeContributionsAllocation(
      metrics.targetWeights,
      mockEquities,
      config.cppi.weeklyDeposit
    );
    
    console.log(`  Weekly Allocation: D:$${allocation.debit.toFixed(0)} C:$${allocation.credit.toFixed(0)} S:$${allocation.straddle.toFixed(0)} Col:$${allocation.collar.toFixed(0)} H:$${allocation.hedge.toFixed(0)}`);
    
    // Show risk budgets
    const sleeveTypes: (keyof SleeveWeights)[] = ['debit', 'credit', 'straddle', 'collar', 'hedge'];
    const riskBudgets = sleeveTypes.map(sleeve => {
      const equity = mockEquities[sleeve];
      const cadence = sleeve === 'straddle' ? 'monthly' : 'weekly';
      return {
        sleeve,
        budget: cppiEngine.computeRiskBudget(sleeve, equity, cadence)
      };
    });
    
    console.log(`  Risk Budgets: ${riskBudgets.map(r => `${r.sleeve.substring(0,3).toUpperCase()}:$${r.budget.toFixed(0)}`).join(' ')}`);
    
    // Check if straddles should place this week
    const shouldPlaceStraddle = cppiEngine.shouldPlaceStraddleThisWeek(week);
    console.log(`  Straddle Cadence: ${shouldPlaceStraddle ? 'PLACE' : 'SKIP'} (monthly)`);
    
    if (metrics.needsRebalance) {
      console.log(`  ⚠️  REBALANCE NEEDED - Drift band exceeded!`);
    }
    
    console.log("");
    
    // Update mock equities with allocation and some mock performance
    mockEquities.debit += allocation.debit + (Math.random() - 0.4) * 50; // Volatile returns
    mockEquities.credit += allocation.credit + (Math.random() - 0.3) * 20; // Steady returns
    mockEquities.straddle += allocation.straddle + (Math.random() - 0.45) * 80; // Very volatile
    mockEquities.collar += allocation.collar + (Math.random() - 0.45) * 30; // Stable ballast
    mockEquities.hedge += allocation.hedge + (Math.random() - 0.8) * 30; // Usually loses, occasional big win
    mockEquities.total = mockEquities.debit + mockEquities.credit + mockEquities.straddle + mockEquities.collar + mockEquities.hedge;
    
    // Ensure no negative values
    Object.keys(mockEquities).forEach(key => {
      if (key !== 'total') {
        mockEquities[key as keyof SleeveEquities] = Math.max(0, mockEquities[key as keyof SleeveEquities]);
      }
    });
    mockEquities.total = mockEquities.debit + mockEquities.credit + mockEquities.straddle + mockEquities.collar + mockEquities.hedge;
  }
  
  console.log("=== Demo Complete ===");
  console.log(`Final portfolio value: $${mockEquities.total.toFixed(2)}`);
  console.log(`Total invested: $${(10000 + 10 * config.cppi.weeklyDeposit).toFixed(2)}`);
  console.log(`Net performance: ${(((mockEquities.total / (10000 + 10 * config.cppi.weeklyDeposit)) - 1) * 100).toFixed(1)}%`);
}

if (import.meta.main) {
  await main();
}