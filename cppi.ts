/**
 * CPPI (Constant Proportion Portfolio Insurance) Engine
 * Implements the 5-sleeve CPPI strategy with contributions-only allocation and drift-band rebalancing
 */

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

export interface SleeveWeights {
  debit: number;
  credit: number;
  straddle: number;
  collar: number;
  hedge: number;
}

export interface SleeveEquities {
  debit: number;
  credit: number;
  straddle: number;
  collar: number;
  hedge: number;
  total: number;
}

export interface CPPIMetrics {
  investedToDate: number;
  floor: number;
  cushion: number;
  riskyWeight: number;
  targetWeights: SleeveWeights;
  currentWeights: SleeveWeights;
  needsRebalance: boolean;
  weeksSinceStart: number;
}

export class CPPIEngine {
  private config: CPPIConfig;
  private startDate: Date;
  private lastRebalanceWeek: number = 0;

  constructor(config: CPPIConfig, startDate = new Date()) {
    this.config = config;
    this.startDate = startDate;
  }

  getWeeksSinceStart(currentDate = new Date()): number {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.floor((currentDate.getTime() - this.startDate.getTime()) / msPerWeek);
  }

  computeInvestedToDate(currentDate = new Date()): number {
    const weeksSinceStart = this.getWeeksSinceStart(currentDate);
    return 10000 + this.config.weeklyDeposit * weeksSinceStart;
  }

  computeCPPIMetrics(sleeveEquities: SleeveEquities, currentDate = new Date()): CPPIMetrics {
    const weeksSinceStart = this.getWeeksSinceStart(currentDate);
    const investedToDate = this.computeInvestedToDate(currentDate);
    const floor = this.config.floorPct * investedToDate;
    const cushion = Math.max(sleeveEquities.total - floor, 0);
    const riskyWeight = Math.min(this.config.cppiM * cushion / sleeveEquities.total, 1.0);

    const targetWeights = this.computeTargetWeights(riskyWeight);
    const currentWeights = this.computeCurrentWeights(sleeveEquities);
    const needsRebalance = this.shouldRebalance(targetWeights, currentWeights, weeksSinceStart);

    return {
      investedToDate,
      floor,
      cushion,
      riskyWeight,
      targetWeights,
      currentWeights,
      needsRebalance,
      weeksSinceStart
    };
  }

  private computeTargetWeights(riskyWeight: number): SleeveWeights {
    const riskyDebit = riskyWeight * this.config.riskySplit.debit;
    const riskyCredit = riskyWeight * this.config.riskySplit.credit;
    const riskyStraddle = riskyWeight * this.config.riskySplit.straddle;
    const fixedHedge = this.config.riskySplit.hedgeFixed;
    const collar = Math.max(0, 1.0 - riskyDebit - riskyCredit - riskyStraddle - fixedHedge);

    return {
      debit: riskyDebit,
      credit: riskyCredit,
      straddle: riskyStraddle,
      collar: collar,
      hedge: fixedHedge
    };
  }

  private computeCurrentWeights(sleeveEquities: SleeveEquities): SleeveWeights {
    if (sleeveEquities.total <= 0) {
      return { debit: 0, credit: 0, straddle: 0, collar: 0, hedge: 0 };
    }

    return {
      debit: sleeveEquities.debit / sleeveEquities.total,
      credit: sleeveEquities.credit / sleeveEquities.total,
      straddle: sleeveEquities.straddle / sleeveEquities.total,
      collar: sleeveEquities.collar / sleeveEquities.total,
      hedge: sleeveEquities.hedge / sleeveEquities.total
    };
  }

  private shouldRebalance(targetWeights: SleeveWeights, currentWeights: SleeveWeights, weeksSinceStart: number): boolean {
    if (weeksSinceStart < this.lastRebalanceWeek + this.config.rebalanceEveryWeeks) {
      return false;
    }

    const sleeves: (keyof SleeveWeights)[] = ['debit', 'credit', 'straddle', 'collar', 'hedge'];
    for (const sleeve of sleeves) {
      if (Math.abs(currentWeights[sleeve] - targetWeights[sleeve]) > this.config.driftBandAbs) {
        return true;
      }
    }

    return false;
  }

  computeContributionsAllocation(targetWeights: SleeveWeights, currentEquities: SleeveEquities, weeklyDeposit: number): SleeveWeights {
    const targetTotalAfterDeposit = currentEquities.total + weeklyDeposit;
    const targetDollars = {
      debit: targetWeights.debit * targetTotalAfterDeposit,
      credit: targetWeights.credit * targetTotalAfterDeposit,
      straddle: targetWeights.straddle * targetTotalAfterDeposit,
      collar: targetWeights.collar * targetTotalAfterDeposit,
      hedge: targetWeights.hedge * targetTotalAfterDeposit
    };

    const shortfalls = {
      debit: Math.max(0, targetDollars.debit - currentEquities.debit),
      credit: Math.max(0, targetDollars.credit - currentEquities.credit),
      straddle: Math.max(0, targetDollars.straddle - currentEquities.straddle),
      collar: Math.max(0, targetDollars.collar - currentEquities.collar),
      hedge: Math.max(0, targetDollars.hedge - currentEquities.hedge)
    };

    const totalShortfall = shortfalls.debit + shortfalls.credit + shortfalls.straddle + shortfalls.collar + shortfalls.hedge;

    let allocation = { debit: 0, credit: 0, straddle: 0, collar: 0, hedge: 0 };

    if (totalShortfall <= weeklyDeposit) {
      allocation = shortfalls;
      const remaining = weeklyDeposit - totalShortfall;
      
      if (remaining > 0) {
        const totalTarget = targetWeights.debit + targetWeights.credit + targetWeights.straddle + targetWeights.collar + targetWeights.hedge;
        allocation.debit += remaining * (targetWeights.debit / totalTarget);
        allocation.credit += remaining * (targetWeights.credit / totalTarget);
        allocation.straddle += remaining * (targetWeights.straddle / totalTarget);
        allocation.collar += remaining * (targetWeights.collar / totalTarget);
        allocation.hedge += remaining * (targetWeights.hedge / totalTarget);
      }
    } else {
      const scaleFactor = weeklyDeposit / totalShortfall;
      allocation.debit = shortfalls.debit * scaleFactor;
      allocation.credit = shortfalls.credit * scaleFactor;
      allocation.straddle = shortfalls.straddle * scaleFactor;
      allocation.collar = shortfalls.collar * scaleFactor;
      allocation.hedge = shortfalls.hedge * scaleFactor;
    }

    return allocation;
  }

  computeRiskBudget(sleeveType: keyof SleeveWeights, sleeveEquity: number, cadence: 'weekly' | 'monthly' = 'weekly'): number {
    const baseRiskPct = this.config.baseRiskPct[sleeveType as keyof typeof this.config.baseRiskPct] || 0;
    const riskScale = sleeveType === 'collar' ? 1.0 : this.config.riskScaleOptions;
    
    let budget = sleeveEquity * baseRiskPct * riskScale;
    
    if (cadence === 'monthly') {
      budget *= 4;
    }
    
    return Math.max(budget, this.getMinTicket(sleeveType));
  }

  private getMinTicket(sleeveType: keyof SleeveWeights): number {
    switch (sleeveType) {
      case 'debit': return this.config.minTickets.debit;
      case 'credit': return this.config.minTickets.creditMaxLoss;
      case 'straddle': return this.config.minTickets.straddle;
      case 'hedge': return this.config.minTickets.hedge;
      case 'collar': return 0;
      default: return 0;
    }
  }

  executeRebalance(weeksSinceStart: number): void {
    this.lastRebalanceWeek = weeksSinceStart;
  }

  shouldPlaceStraddleThisWeek(weeksSinceStart: number): boolean {
    return weeksSinceStart % 4 === 0;
  }
}

export function createDefaultCPPIConfig(): CPPIConfig {
  return {
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
  };
}