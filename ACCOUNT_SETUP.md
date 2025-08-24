# Account Configuration Guide

This guide explains how to configure the bot for the 5-sleeve CPPI options strategy.

## Account Setup

### Single account (default)
All 5 sleeves run on one account.

```bash
# choose a single account by id or index
DEBIT_SPREADS_ACC_ID=12345
CREDIT_SPREADS_ACC_ID=12345
EVENT_STRADDLES_ACC_ID=12345
COLLAR_EQUITY_ACC_ID=12345
CRASH_HEDGE_ACC_ID=12345
# or use indexes if ids are unknown
DEBIT_SPREADS_ACC_INDEX=0
CREDIT_SPREADS_ACC_INDEX=0
EVENT_STRADDLES_ACC_INDEX=0
COLLAR_EQUITY_ACC_INDEX=0
CRASH_HEDGE_ACC_INDEX=0
```

### Multi-account (per-sleeve)
```bash
DEBIT_SPREADS_ACC_ID=12345
CREDIT_SPREADS_ACC_ID=12346
EVENT_STRADDLES_ACC_ID=12347
COLLAR_EQUITY_ACC_ID=12348
CRASH_HEDGE_ACC_ID=12349
```

### Run commands

```bash
deno task config list
deno task start       # main.ts (CPPI)
deno task backtest    # synthetic backtest
deno task dashboard   # http://localhost:8080
```

## Finding Your Account IDs

### Via Moomoo Desktop App
1. Open Moomoo Desktop
2. Go to "Account" → "Account Summary"
3. Note the account numbers for each account you want to use
4. Use these as ACC_ID_1, ACC_ID_2, etc.

### Via OpenD API (Advanced)
```typescript
// Connect to OpenD and get account list
const [ret, accounts] = await trade.get_acc_list();
console.log("Available accounts:", accounts);
// Each account object contains acc_id field
```

### Via Bot Logs
1. Run the bot in single account mode
2. Check logs for "Available accounts" messages
3. Note the account IDs shown

## Account Types & Strategy Matching

### Recommended Account Types by Sleeve

| Sleeve | Typical Account | Risk | Notes |
|--------|----------------|------|-------|
| Debit Spreads | Margin | Medium | Defined risk; uses ~0.30Δ long, $5–$10 width |
| Credit Spreads | Cash/Margin | Low–Med | 0.20–0.25Δ short put, $5 width, roll on threat |
| Event Straddles | Margin | High | ATM, 7–21 DTE around events, monthly cadence |
| Collar Equity | Cash/Margin | Low | ETF + short call + long put, near-zero net cost |
| Crash Hedge | Cash/Margin | Medium | 5–8Δ puts, continuous weekly budget |

### Capital Allocation Example

For a $50,000 total allocation:
- Strategy 1 (Barbell): $12,000 (24%)
- Strategy 2 (Income): $10,000 (20%)  
- Strategy 3 (Volatility): $8,000 (16%)
- Strategy 4 (Wheel): $15,000 (30%)
- Strategy 5 (Mixed): $5,000 (10%)

## Configuration Examples

### Example 1: Conservative Single Account
```bash
DEBIT_SPREADS_ACC_ID=12345
CREDIT_SPREADS_ACC_ID=12345
EVENT_STRADDLES_ACC_ID=12345
COLLAR_EQUITY_ACC_ID=12345
CRASH_HEDGE_ACC_ID=12345
TRD_ENV=SIMULATE
DRY_RUN=true
```

### Example 2: Multi-Account Production
```bash
TRD_ENV=REAL
DRY_RUN=false

# High-risk sleeves on margin accounts
DEBIT_SPREADS_ACC_ID=12345  # Margin account
EVENT_STRADDLES_ACC_ID=12347  # Margin account

# Conservative sleeves on cash accounts  
CREDIT_SPREADS_ACC_ID=12346  # Cash account
COLLAR_EQUITY_ACC_ID=12348  # Cash account
CRASH_HEDGE_ACC_ID=12349  # Small margin account
```

### Example 3: Paper Trading All Sleeves
```bash
TRD_ENV=SIMULATE
DRY_RUN=true

# All using same simulated account
DEBIT_SPREADS_ACC_INDEX=0
CREDIT_SPREADS_ACC_INDEX=0
EVENT_STRADDLES_ACC_INDEX=0
COLLAR_EQUITY_ACC_INDEX=0
CRASH_HEDGE_ACC_INDEX=0
```

## Validation & Testing

### Check Your Configuration
```bash
# Validate environment
deno task config validate

# Test with simulation
deno task start

# View which accounts are being used
deno task start | grep "Using account"
```

### Account Verification Script
The bot will log which account each strategy uses:
```
2024-01-15 10:30:00 - Using multi-account mode: Account 1 for barbell_convex
2024-01-15 10:30:00 - Using account: 12345 env: SIMULATE market: 1
2024-01-15 10:30:15 - Using multi-account mode: Account 2 for balanced_income  
2024-01-15 10:30:15 - Using account: 12346 env: SIMULATE market: 1
```

## Troubleshooting

### Common Issues

1. **"No account available"**
   - Check account IDs are correct
   - Ensure accounts exist in OpenD
   - Verify account permissions

2. **"get_acc_list failed"**
   - Check OpenD connection
   - Verify authentication
   - Ensure accounts are properly funded

3. **Wrong account being used**
   - Check MULTI_ACCOUNT_MODE setting
   - Verify ACC_ID_X values
   - Check for typos in environment variables

### Debug Commands
```bash
# Check configuration
deno task config list

# View account configuration
grep ACC_ .env

# Test connection and accounts
deno task start | grep account
```

## Security Considerations

### Environment File Security
- Never commit `.env` to version control
- Restrict file permissions: `chmod 600 .env`
- Use different `.env` files for different environments

### Account Isolation
- Use separate accounts to limit blast radius
- Consider different account types (cash vs margin)
- Monitor each account independently

### Access Controls
- Limit OpenD access to necessary accounts only
- Use minimal required permissions
- Regularly audit account access

## Next Steps

1. **Test Configuration**: `deno task start`
2. **Monitor Logs**: Check data/logs/
3. **View Dashboard**: `deno task dashboard` then visit http://localhost:8080
4. **Gradual Rollout**: Start with paper trading, then small positions