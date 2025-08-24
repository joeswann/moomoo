# 🚀 Aggressive CPPI Modes - Path to Millions

## Overview

The standard CPPI configuration ($10k start, $50/week, 85% floor, 4× multiplier) targets conservative growth. To achieve the "millions in ~5 years" trajectories from advanced simulations, you need higher risk appetite and more aggressive capital deployment.

## Quick Start

```bash
# Switch to aggressive mode
deno task config preset --mode aggressive

# Or go full moonshot (test thoroughly first!)
deno task config preset --mode turbo

# Test in simulation first
deno task start
```

## Configuration Comparison

| Parameter | Conservative | Aggressive | Turbo |
|-----------|-------------|------------|-------|
| **Weekly Deposit** | $50 | $250 | $500 |
| **Floor %** | 85% | 80% | 75% |
| **CPPI Multiplier** | 4.0× | 6.0× | 8.0× |
| **Max Drawdown** | 15% | 20% | 25% |
| **Debit Weight** | 60% | 75% | 80% |
| **Credit Weight** | 15% | 5% | 0% (disabled) |
| **Risk Scale** | 1.25× | 1.75× | 2.0× |

## Expected Performance

### Math Behind the Targets

To reach $1M from $10k in 5 years:
- With $50/week: Needs ~139% CAGR 😤
- With $250/week: Needs ~54% CAGR 🎯  
- With $500/week: Needs ~17% CAGR ✅

### Mode Characteristics

**Conservative (Base config.json)**
- Target: 15-25% CAGR
- Drawdowns: 10-15%
- Best for: Learning, small accounts

**Aggressive (config-aggressive.json)**
- Target: 25-50% CAGR  
- Drawdowns: 15-20%
- Features: Wide spreads (15Δ), IV/trend filters, growth stocks
- Best for: Experienced traders, $25k+ accounts

**Turbo (config-turbo.json)**
- Target: 50%+ CAGR (moonshot territory)
- Drawdowns: 20-25%
- Features: Credit spreads disabled, long calls, 8× leverage
- Best for: Risk-tolerant with significant capital

## Key Improvements

### 1. **Uncapped Convexity**
- Wide spreads (15-25Δ width vs 5Δ) 
- Added `long_call` component for unlimited upside
- Disabled credit spreads in Turbo mode (pure convex)

### 2. **Market-Aware Filtering**
- **IV Rank**: Only buy straddles when IV < 25th percentile
- **Trend Filter**: Debit spreads gated on bull trends
- **Growth Universe**: NVDA, TSLA, AMD, META vs SPY/QQQ

### 3. **Intelligent Execution**
- Smart limit orders with retry logic
- Spread width checks (skip if > 5%)
- Price improvement bias ($0.01 inside mid)

### 4. **True Rebalancing**
- Monthly drift-band enforcement
- Floor protection (moves to safe assets near floor)
- Automatic sleeve weight reset to targets

## Usage Examples

### Switch Presets
```bash
# Conservative → Aggressive
deno task config preset --mode aggressive

# Review the changes
deno task config list

# Test with backtest
deno task backtest --start-date 2023-01-01 --capital 25000
```

### Custom Tuning
```bash
# Increase weekly deposit
deno task config set-cppi --weeklyDeposit 400

# Make CPPI more aggressive
deno task config set-cppi --cppiM 7.0 --floorPct 0.78
```

## Risk Management

### Turbo Mode Warnings ⚠️
- **25% max drawdown expected** - can lose $25k on $100k account
- **High volatility** - monthly swings of ±30% normal
- **Credit spreads disabled** - no income, pure convexity bet
- **Requires discipline** - don't panic-sell during drawdowns

### Safe Practices
1. **Start in simulation** - Test for 2-4 weeks minimum
2. **Size appropriately** - Never risk money you can't afford to lose
3. **Monitor cushion** - If near floor, the system auto-protects
4. **Regular reviews** - Check sleeve weights monthly

## Technical Details

### Filter Logic
```typescript
// IV Rank calculation (90-day lookback)
const ivRank = historicalIVs.filter(iv => iv <= currentIV).length / historicalIVs.length;

// Trend filter (price vs 50-day MA)
const trend = currentPrice > ma50 * 1.02 ? "bull" : "bear";

// Straddle gate: only when IV rank < 20%
if (ivRank > 0.20) skipStraddle();
```

### Universe Selection
```typescript
// Static mode: hand-picked growth
["US.NVDA", "US.TSLA", "US.AMD", "US.META", "US.QQQ", "US.IWM"]

// Dynamic mode: volume + volatility scoring
score = (volume / 1M) + (ATR * 10)  // Bias toward high-beta
```

### Risk Budget Scaling
```typescript
// Per-sleeve weekly risk budgets (Turbo mode)
debit: 12% * sleeveEquity * 2.0× = up to 24% of sleeve per week
straddle: 8% * sleeveEquity * 2.0× = up to 16% of sleeve per week  
```

## Monitoring

### Key Metrics to Watch
- **Cushion %**: Distance above floor (should stay > 5%)
- **Sleeve Drift**: How far from target weights (>10% triggers rebalance)
- **Win Rate by Strategy**: Debit (60%+), Straddle (40%+), Credit (75%+)
- **IV Rank**: Current vs historical (for entry timing)

### Warning Signs
- Cushion < 2% → Floor protection activating
- Multiple weeks of losses → Consider reducing size
- High correlation across sleeves → Diversification not working

## Conclusion

The aggressive modes transform the conservative CPPI strategy into a high-octane growth engine. The combination of higher leverage, wider spreads, growth stocks, and market-aware filters provides a realistic path to exceptional returns.

**Remember**: Exceptional returns require exceptional risk tolerance. These modes can generate life-changing wealth, but also life-changing drawdowns. Size accordingly and never risk more than you can afford to lose.

---

*Test everything in simulation first. Past performance doesn't guarantee future results. Options trading involves substantial risk of loss.*