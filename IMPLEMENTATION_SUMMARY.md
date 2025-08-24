# 5-Sleeve CPPI Implementation Summary

## ✅ Completed Implementation

The strategy specification from `STRATEGY_SPEC.md` has been fully implemented with the following components:

### 1. Core CPPI Engine (`cppi.ts`)
- **CPPI Logic**: 85% floor with 4.0 multiplier
- **Target Weight Computation**: Dynamic sleeve weights based on cushion
- **Contributions-Only Allocation**: Weekly $50 deposits to underweight sleeves
- **Drift-Band Rebalancing**: Monthly rebalancing trigger at ±10% deviation
- **Risk Budget Calculation**: Per-sleeve risk fractions with RiskScale multiplier

### 2. Five-Sleeve Architecture (`config.json`)
**Sleeve Mapping**:
- **Debit Spreads** (60% of risky) - Defined-risk convex sleeve
- **Credit Spreads** (15% of risky) - High win-rate income sleeve  
- **Event Straddles** (25% of risky) - Monthly convex volatility sleeve
- **Collar Equity** (residual) - Ballast sleeve with ETF + collar overlay
- **Crash Hedge** (fixed 2%) - Tail insurance sleeve

### 3. Strategy Implementations (`main-cppi.ts`)
**Updated Components**:
- `buildDebitCallVertical()` - Long call/put verticals
- `buildCreditPutSpread()` - Bull put spreads with roll logic
- `buildATMStraddle()` - ATM long straddles
- `buildCollarPosition()` - Short call + long put overlay
- `buildCrashHedgePut()` - Far OTM put protection

### 4. Risk Management & Sizing
**Risk Budget System**:
- Debit: 6%/week of sleeve equity × 1.25 RiskScale
- Credit: 2%/week of sleeve equity × 1.25 RiskScale  
- Straddle: 4%/month of sleeve equity × 1.25 RiskScale
- Hedge: 1%/week of sleeve equity × 1.25 RiskScale
- Collar: Weight-managed (no risk scaling)

**Minimum Tickets**:
- Debit: $30, Credit: $100 max loss, Straddle: $50, Hedge: $5

### 5. Orchestration & Scheduling
**Weekly Execution**:
1. Mark-to-market all sleeves → compute CPPI metrics
2. Allocate weekly $50 deposit to underweight sleeves only
3. Check monthly drift-band (±10%) → rebalance if needed
4. Execute sleeve strategies with risk budgets:
   - Debit/Credit/Hedge: Weekly placement
   - Straddles: Monthly cadence (every 4th week)
   - Collar: Maintain/roll positions

### 6. Configuration Integration
**New Config Structure**:
```json
{
  "cppi": {
    "floorPct": 0.85,
    "cppiM": 4.0,
    "riskScaleOptions": 1.25,
    "riskySplit": { "debit": 0.60, "credit": 0.15, "straddle": 0.25, "hedgeFixed": 0.02 },
    "driftBandAbs": 0.10,
    "rebalanceEveryWeeks": 4,
    "weeklyDeposit": 50,
    "baseRiskPct": { "debit": 0.06, "credit": 0.02, "straddle": 0.04, "hedge": 0.01 },
    "minTickets": { "debit": 30, "creditMaxLoss": 100, "straddle": 50, "hedge": 5 }
  }
}
```

## 🎯 Key Features Implemented

### ✅ CPPI Portfolio Management
- **Floor Protection**: 85% of invested-to-date (starting $10k + $50/week)
- **Dynamic Risk**: 4.0× multiplier applied to cushion above floor  
- **Sleeve Weights**: Auto-computed based on risky weight and split ratios

### ✅ Contributions-Only Logic
- **No Selling**: Weekly deposits only add to underweight sleeves
- **Pro-rata Distribution**: Remaining deposit distributed by target weights
- **Preserves Positions**: Avoids unnecessary liquidation

### ✅ Monthly Rebalancing
- **Drift Detection**: Triggers only when sleeve deviates >10% from target
- **Cadence Control**: Only checks every 4 weeks (monthly)
- **Execution Tracking**: Prevents over-rebalancing

### ✅ Risk-Budget Sizing  
- **Sleeve-Specific**: Each sleeve has its own risk percentage
- **RiskScale Multiplier**: 1.25× applied to options sleeves
- **Minimum Tickets**: Floor limits prevent micro-positions

### ✅ Monthly Straddle Cadence
- **Gate Logic**: `shouldPlaceStraddleThisWeek()` enforces monthly timing
- **Skip Weeks**: Prevents over-trading straddles in low-vol periods

## 🧪 Demo Results

The `demo.ts` file shows a 10-week simulation demonstrating:

- **CPPI Mechanics**: Floor rises with deposits, cushion drives risk allocation
- **Weight Targeting**: Collar sleeve grows to absorb excess (ballast function)
- **Drift Detection**: Multiple weeks trigger rebalance warnings
- **Cadence Control**: Straddles only place every 4th week
- **Risk Budgets**: Per-sleeve budgets scale with equity and risk parameters

## 🔄 Migration from Original Code

### What Changed:
1. **Strategy Split**: Barbell → Debit Spreads + Crash Hedge (separate sleeves)
2. **New Strategy**: Added Collar Equity for ballast function
3. **Sizing Logic**: Replaced `maxWeeklySpend` with risk budget calculations  
4. **Orchestration**: New `runCPPIStrategy()` replaces `runStrategiesOnce()`
5. **State Management**: Portfolio state persistence for CPPI continuity

### What Stayed:
1. **API Integration**: All moomoo OpenD connectivity preserved
2. **Strategy Builders**: Core options construction logic maintained
3. **Configuration**: Multi-account strategy mapping intact
4. **Logging & Persistence**: Trade logging and data management unchanged

## 📁 File Structure

```
/Users/joeswann/personal/moomoo/
├── STRATEGY_SPEC.md           # Original specification document
├── IMPLEMENTATION_SUMMARY.md  # This summary
├── cppi.ts                    # Core CPPI engine implementation
├── main-cppi.ts               # Updated main orchestration (CPPI-enabled)
├── main-original.ts           # Backup of original implementation
├── config.ts                  # Updated with CPPI configuration types
├── config.json                # Updated with 5-sleeve strategies + CPPI params
├── demo.ts                    # CPPI demonstration without moomoo connection
└── [other files unchanged]    # backtest.ts, dashboard.ts, etc.
```

## 🚀 Usage

**Production Mode** (with moomoo OpenD):
```bash
deno run --allow-all main-cppi.ts
```

**Demo Mode** (simulation only):
```bash
deno run --allow-all demo.ts
```

**Configuration**:
- Edit `config.json` to adjust CPPI parameters, sleeve splits, or risk budgets
- Set environment variables for account mapping (`TRD_ENV`, account IDs, etc.)

The implementation fully matches the designed 5-sleeve CPPI strategy and is ready for live deployment with proper moomoo OpenD setup.