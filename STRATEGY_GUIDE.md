# Strategy Guide - Original 5 Strategies

This guide explains each of the original 5 strategies included in the default configuration.

## 📊 Strategy Overview

| Strategy | Purpose | Risk Level | Capital Allocation | Components |
|----------|---------|------------|-------------------|------------|
| **Barbell Convex** | Asymmetric upside with tail hedge | Medium-High | 13% ($200/week) | Call vertical + Crash hedge |
| **Balanced Income** | Steady income generation | Low-Medium | 20% ($300/week) | Credit put spreads |
| **Volatility Bet** | Capture vol expansion | High | 27% ($400/week) | ATM straddles |
| **Wheel Strategy** | Income + stock accumulation | Low | 33% ($500/week) | Cash-secured puts |
| **Mixed Opportunistic** | Tactical allocation | Medium | 10% ($150/week) | Alternating strategies |

**Total Weekly Budget: $1,550**

## 🎯 Strategy Details

### 1. Barbell Convex (`barbell_convex`)

**Purpose**: Create convex payoff profile with limited downside and unlimited upside potential

**Components**:
- **Debit Call Vertical**: Long ~30Δ call, short higher strike (+$5 width)
- **Crash Hedge**: Long far OTM put (~8Δ) for tail protection

**Parameters**:
- Target Delta: 0.30 (long call), 0.08 (crash hedge)
- DTE: 21-45 days (target 28)
- Contracts: 1 per trade
- Max Weekly Spend: $200

**Best Market Conditions**: Rising or stable markets with potential volatility

---

### 2. Balanced Income (`balanced_income`)

**Purpose**: Generate consistent income through credit collection with defined risk

**Components**:
- **Credit Put Spread**: Short ~20Δ put, long lower strike (-$5 width)

**Parameters**:
- Target Delta: 0.25 (short put)
- DTE: 21-45 days (target 30)
- Contracts: 2 per trade
- Max Weekly Spend: $300

**Best Market Conditions**: Stable to slowly rising markets

---

### 3. Volatility Bet (`volatility_bet`)

**Purpose**: Profit from volatility expansion and large market moves in either direction

**Components**:
- **ATM Straddle**: Long call + long put at same strike (ATM)

**Parameters**:
- Target Delta: 0.50 (ATM)
- DTE: 14-35 days (target 28)
- Contracts: 1 per trade
- Max Weekly Spend: $400

**Best Market Conditions**: Periods of low implied volatility with potential for expansion

---

### 4. Wheel Strategy (`wheel_strategy`)

**Purpose**: Generate income while potentially accumulating quality stocks at desired prices

**Components**:
- **Cash-Secured Put**: Short put with cash reserved for potential assignment

**Parameters**:
- Target Delta: 0.25 (short put)
- DTE: 28-45 days (target 35)
- Contracts: 3 per trade
- Max Weekly Spend: $500

**Best Market Conditions**: Stocks you want to own at lower prices

---

### 5. Mixed Opportunistic (`mixed_opportunistic`)

**Purpose**: Tactical allocation between bullish and income strategies based on market conditions

**Components** (alternates daily):
- **Day 1, 3, 5...**: Debit Call Vertical
- **Day 2, 4, 6...**: Credit Put Spread

**Parameters**:
- Target Delta: 0.30 (calls), 0.20 (puts)
- DTE: 21-45 days (target 28)
- Contracts: 1 per trade
- Max Weekly Spend: $150

**Best Market Conditions**: Flexible allocation for various market conditions

## 🏗️ Account Setup Examples

### Single Account Setup
All strategies use one account - good for smaller capital or testing:

```bash
# List current strategies
make config-list

# All strategies use account index 0 by default
# No additional setup needed for single account
```

### Multi-Account Setup
Each strategy uses dedicated account - ideal for larger operations:

```bash
# Set specific account IDs for each strategy
STRATEGY=barbell_convex ACC_ID=12345 make config-account
STRATEGY=balanced_income ACC_ID=12346 make config-account  
STRATEGY=volatility_bet ACC_ID=12347 make config-account
STRATEGY=wheel_strategy ACC_ID=12348 make config-account
STRATEGY=mixed_opportunistic ACC_ID=12349 make config-account

# Verify configuration
make config-validate
```

### Mixed Setup
Some strategies with specific accounts, others using indexes:

```bash
# High-touch strategies get dedicated accounts
STRATEGY=volatility_bet ACC_ID=12345 make config-account
STRATEGY=wheel_strategy ACC_ID=12346 make config-account

# Others use account indexes (accounts 0, 1, 2)
# No additional setup needed - uses default indexes
```

## 🎛️ Parameter Customization

### Adjust Risk Levels
```bash
# Reduce volatility bet risk
STRATEGY=volatility_bet CONTRACTS=1 make config-params

# Increase wheel strategy allocation
STRATEGY=wheel_strategy CONTRACTS=5 make config-params

# Tighten DTE range for income strategy
STRATEGY=balanced_income DTE=25 make config-params
```

### Modify Delta Targets
```bash
# More conservative barbell (lower delta)
STRATEGY=barbell_convex DELTA=0.25 make config-params

# More aggressive wheel (higher delta)  
STRATEGY=wheel_strategy DELTA=0.30 make config-params
```

### Update Risk Limits
```bash
# Increase weekly spend for volatility strategy
deno task config set-params --strategy volatility_bet --maxSpend 600

# Reduce position size for barbell
deno task config set-params --strategy barbell_convex --maxSize 5
```

## 🚀 Quick Start Commands

```bash
# Initial setup
make setup
make config-wizard

# Enable all original strategies (they're enabled by default)
make config-validate

# Run in simulation mode
make simulate

# View strategy status
make config-list

# Monitor execution
make logs
```

## 📈 Performance Expectations

### Expected Characteristics

**Barbell Convex**:
- Win Rate: ~65%
- Avg Win: $50-80
- Avg Loss: $30-50  
- Max Loss: Limited by spread width + hedge cost

**Balanced Income**:
- Win Rate: ~75-80%
- Avg Win: $25-40
- Avg Loss: $100-150
- Max Loss: Limited by spread width

**Volatility Bet**:
- Win Rate: ~45-55%
- Avg Win: $100-200
- Avg Loss: $80-120
- Max Loss: Premium paid

**Wheel Strategy**:
- Win Rate: ~70-80%
- Avg Win: $30-60
- Assignment Rate: ~15-25%
- Max Loss: Stock decline (if assigned)

**Mixed Opportunistic**:
- Win Rate: ~60-70%
- Avg Win: $25-45
- Avg Loss: $35-55
- Max Loss: Varies by component

## ⚠️ Risk Management

### Built-in Controls
- **Weekly spend limits** prevent over-allocation
- **Position size limits** control single trade risk  
- **DTE ranges** avoid assignment risk
- **Daily trade limits** prevent over-trading

### Monitoring
```bash
# Check current positions
make trades

# Monitor risk limits
make config-list

# View performance
make dashboard  # Open http://localhost:8080
```

### Emergency Controls
```bash
# Disable high-risk strategy quickly
STRATEGY=volatility_bet make config-disable

# Reduce all position sizes
for strategy in barbell_convex balanced_income volatility_bet wheel_strategy mixed_opportunistic; do
  STRATEGY=$strategy CONTRACTS=1 make config-params
done
```

This configuration provides a balanced approach across multiple market conditions and risk profiles while maintaining proper risk controls.