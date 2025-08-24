# Strategy Specification — 5-Sleeve CPPI Options Portfolio

## 0. Objective & Constraints

**Objective**: 50% probability of reaching NZ$500k in 5 years from NZ$10k start with NZ$50/week contributions.

**Primary Risk Controls**:
- CPPI floor: 85% of invested-to-date
- CPPI multiplier (M): 4.0
- Monthly drift-band rebalance: trigger at ±10 percentage points deviation from target weights
- Contributions-only allocation: weekly deposits aim sleeves toward targets (no selling) unless drift trigger fires

**Sleeves (accounts)**:
1. **Debit Spreads** (convex)
2. **Credit Spreads** (income, capped risk)
3. **Event Straddles** (convex, monthly cadence)
4. **Collar Equity** (ballast + small income)
5. **Crash Hedge** (tail insurance)

**Currency & fees**: Operate in USD at broker, track NZD goal; fee/contract configurable (default: broker median).

## 1. Portfolio Policy (CPPI + Target Weights)

### 1.1 Weekly CPPI
- Let `Invested(t) = 10,000 + 50 * weeks_elapsed`
- Floor: `Floor(t) = 0.85 * Invested(t)`
- Cushion: `Cushion(t) = max(Equity(t) – Floor(t), 0)`
- Risky weight: `w_risky = min(M * Cushion / Equity(t), 1.0)` with `M = 4.0`

### 1.2 Sleeve Weights
Inside the risky bucket:
- **Debit**: 60% of w_risky
- **Credit**: 15% of w_risky  
- **Straddle**: 25% of w_risky
- **Hedge**: fixed 2% absolute (outside w_risky)
- **Collar**: residual to sum to 100%

Normalize if needed to ensure all weights sum to 1.0.

### 1.3 Contributions-Only Allocation
Each week add NZ$50 and push cash only into under-weight sleeves so that post-deposit sleeve dollars move toward `target_weight * (Equity + 50)`.

If total "need" < 50, distribute the remainder pro-rata by target weights.

### 1.4 Drift-Band Rebalance (Monthly)
Once every 4 weeks, compute current sleeve weights `w_curr`.

If any `|w_curr[k] – w_target[k]| > 0.10`, move cash/trim to restore to `w_target`.

Otherwise, do nothing.

## 2. Sleeve Playbooks (Entries, Sizing, Exits)

All sizing uses risk budgets derived from sleeve equity and a RiskScale = 1.25× (applied to options sleeves only).

### 2.1 Debit Spreads (Defined-Risk Convex)
- **Universe**: Liquid ETFs/megacaps (SPY/QQQ/DIA/AAPL/MSFT/NVDA, etc.)
- **When**: Weekly
- **Structure**: Long call or put vertical, 30–45 DTE, long ≈ 0.30Δ, width $5–$10
- **Sizing**: Risk per trade = minTicket_debit or 6% of sleeve equity × RiskScale (use `contracts = floor(budget / (net_debit + fees))`)
- **Exits**:
  - TP: +100% of net debit
  - Time stop: 21 DTE
  - SL: −60% of net debit
- **Notes**: Bias long/short by simple trend/regime filter; skip illiquid chains

### 2.2 Credit Spreads (High Win-Rate, Capped Tail)
- **When**: Weekly
- **Structure**: Bull put spread, 30–45 DTE, short ≈ 0.20–0.25Δ, width $5
- **Sizing**: Budget = 2% of sleeve equity × RiskScale, measured by max loss (width − credit)
- **Exits**:
  - TP: 50% credit captured
  - SL: 2× credit
  - Roll: If short strike threatened (spot ≤ short put), roll down/out before expiry

### 2.3 Event Straddles (Convex Monthly)
- **When**: Every 4th week (monthly cadence) or around known events (earnings, CPI, FOMC) with 7–15 DTE
- **Structure**: ATM long straddle
- **Sizing**: 4% of sleeve equity × RiskScale per month (ticket ≥ $50/straddle)
- **Exits**: Scale out into ±move; cut before second weekend; kill immediately after IV crush if decay dominates

### 2.4 Collar Equity (Ballast)
- **Core**: Hold a liquid ETF (e.g., SPY)
- **Overlay**: Monthly collar: sell OTM call ~0.16–0.25Δ, buy OTM put ~0.10–0.20Δ, aim near-zero net cost
- **Roll**: 21→10 DTE; keep exposure near target sleeve weight
- **Goal**: Dampen drawdowns and generate small carry

### 2.5 Crash Hedge (Tail Insurance)
- **When**: Weekly spend
- **Structure**: Buy far-OTM puts (SPY/QQQ) 30–60 DTE, ~5–8Δ
- **Budget**: 1% of hedge sleeve equity per week (lot size floor)
- **Exits**: Allow convex pop in panics; otherwise harvest occasional doubles; avoid over-buying in calm regimes

## 3. Sizing, Fees, and Tickets

**RiskScale (options sleeves)**: 1.25× multiplier on per-trade base risk

**Base per-trade risk fractions**:
- Debit: 6%/wk
- Credit: 2%/wk  
- Straddle: 4%/mo
- Hedge: 1%/wk spend
- Collar: 0% (weight-based)

**Minimum tickets**:
- Debit: $30
- Credit max-loss: $100
- Straddle: $50
- Hedge lot: $5

**Fees**: Use broker median fee/contract (estimate from last N orders) and include legs: 2 legs for spreads/straddles

## 4. Orchestration & Scheduling

### 4.1 Weekly Tick (End of Week)
1. Mark-to-market all five sleeves → Equity(t)
2. Compute CPPI target weights
3. Allocate NZ$50 via contributions-only toward targets
4. Rebalance if drift-band breach (monthly)
5. Run playbooks:
   - **Debit**: screen & place
   - **Credit**: screen & place
   - **Straddle**: place only if monthly cadence tick
   - **Collar**: maintain/roll if 21→10 DTE
   - **Hedge**: buy tail puts per budget

### 4.2 Daily Monitor (Business Days)
Enforce TP/SL/time-stops; roll threatened credit spreads; manage assignments; roll collars; clean up stale straddles.

## 5. Risk & Kill-Switches

- **Per-sleeve max drawdown alert**: −25% sleeve → halve new risk until recovered
- **Portfolio kill**: If Equity(t) ≤ Floor(t), set w_risky = 0 (all in Collar + Hedge) for one week
- **Per-underlying cap**: No sleeve > 40% of its equity in one underlying
- **Order hygiene**: No market orders; limit with tick adjust; skip chains with low OI/volume

## 6. Metrics & Acceptance

**Primary**: Hit-rate to NZ$500k at Year 5 (simulate & track live probability)

**Risk**: Median max DD, P5 terminal wealth, weekly VaR proxy

**Ops**: Slippage vs fee model, assignment rate, rule compliance events

**Acceptance test (paper)**: Over rolling 6–12 months of live paper logs, CPPI weights behave as specified, exits trigger correctly, and contribution + drift rules produce the intended sleeve balances.

## 7. Mapping to Your Repo (What to Change)

### Add/Adjust Strategies
**Split Barbell** → two strategies:
- `debit_spreads` (keep your current vertical builder)
- `crash_hedge` (already present; make it its own account)

**Keep `balanced_income`** → credit put spreads (already matches)

**Keep `volatility_bet`** → ATM straddles, but gate to monthly cadence

**Add `collar_equity`**:
- Hold SPY; add/roll monthly short call (0.16–0.25Δ) and long put (0.10–0.20Δ)
- Maintain target sleeve weight using rebalance step

### Core Engine
- Implement CPPI + contributions-only + drift-band rebalancing (see orchestration above)
- Replace `maxWeeklySpend` as the primary sizing control with risk-budget per sleeve + ticket floors; keep spend limit as a guardrail

### Backtester
- Add sleeves + CPPI + contributions + drift logic
- Simulate multi-leg payoffs (verticals, straddles, short spreads) and fees; monthly cadence for straddles; roll rules for credits/collars

## 8. Configuration Knobs (Recommended Defaults)

```json
{
  "floorPct": 0.85,
  "cppiM": 4.0,
  "riskScaleOptions": 1.25,
  "riskySplit": {
    "debit": 0.60,
    "credit": 0.15,
    "straddle": 0.25,
    "hedgeFixed": 0.02
  },
  "driftBandAbs": 0.10,
  "rebalanceEveryWeeks": 4,
  "weeklyDeposit": 50,
  "baseRiskPct": {
    "debit": 0.06,
    "credit": 0.02,
    "straddle": 0.04,
    "hedge": 0.01
  },
  "minTickets": {
    "debit": 30,
    "creditMaxLoss": 100,
    "straddle": 50,
    "hedge": 5
  }
}
```

## 9. Pseudocode Checkpoint

```
computeTargets() → CPPI weights → sleeve targets
allocateDeposit() → push $50 to underweights only
rebalanceIfDrift() → monthly, only on ±10% breaches
runSleeves() → debit/credit weekly; straddle monthly; collar maintain; hedge spend
dailyMonitor() → exits/rolls/assignments
```

## 10. Implementation Priority

1. **Core CPPI Engine** - Weekly target weight computation and contributions-only allocation
2. **Drift-Band Rebalancing** - Monthly rebalance trigger and execution
3. **Sleeve Strategy Separation** - Split existing strategies into the five sleeves
4. **Risk Budget Sizing** - Replace spend limits with risk-fraction based sizing
5. **Monthly Cadence Gates** - Ensure straddles only execute monthly
6. **Collar Equity Strategy** - New sleeve for ballast with monthly collar overlay
7. **Enhanced Backtester** - Multi-leg payoffs and CPPI simulation

This specification provides a complete blueprint for transforming your current implementation into the designed 5-sleeve CPPI strategy while maintaining compatibility with your existing infrastructure.