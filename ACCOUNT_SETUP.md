# Account Configuration Guide

This guide explains how to configure the bot for single or multiple trading accounts.

## Two Operating Modes

### 🎯 Single Account Mode (Default)
All 5 strategies execute on one account - simpler setup, good for testing or smaller capital.

### 🎯 Multi-Account Mode  
Each strategy uses its own dedicated account - better risk isolation, ideal for larger operations.

## Single Account Setup

1. **Set mode in `.env`:**
   ```bash
   MULTI_ACCOUNT_MODE=false
   ACC_ID=12345      # Your account ID (preferred)
   # OR
   ACC_INDEX=0       # Account index (fallback)
   ```

2. **All strategies will execute on this account:**
   - Strategy 1: Barbell Convex
   - Strategy 2: Balanced Income  
   - Strategy 3: Volatility Bet
   - Strategy 4: Wheel Strategy
   - Strategy 5: Mixed Bets

## Multi-Account Setup

### Method 1: Interactive Setup
```bash
make setup-multi-accounts
```

This will prompt you to:
- Enable multi-account mode
- Enter account IDs for each strategy
- Configure automatically

### Method 2: Manual Configuration

1. **Enable multi-account mode in `.env`:**
   ```bash
   MULTI_ACCOUNT_MODE=true
   ```

2. **Configure individual accounts:**
   ```bash
   # Strategy 1: Barbell Convex (Debit call vertical + Crash hedge)
   ACC_ID_1=12345
   ACC_INDEX_1=0
   
   # Strategy 2: Balanced Income (Credit put spread)
   ACC_ID_2=12346
   ACC_INDEX_2=1
   
   # Strategy 3: Volatility Bet (ATM straddle)
   ACC_ID_3=12347
   ACC_INDEX_3=2
   
   # Strategy 4: Wheel Strategy (Cash-secured puts)
   ACC_ID_4=12348
   ACC_INDEX_4=3
   
   # Strategy 5: Mixed Small Bets (Alternating strategies)
   ACC_ID_5=12349
   ACC_INDEX_5=4
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

### Recommended Account Types by Strategy

| Strategy | Account Type | Capital Requirements | Risk Level |
|----------|-------------|---------------------|------------|
| **Barbell Convex** | Margin | Medium-High | Medium |
| **Balanced Income** | Cash/Margin | Medium | Low |
| **Volatility Bet** | Margin | High | High |
| **Wheel Strategy** | Cash | High | Low-Medium |
| **Mixed Bets** | Margin | Low-Medium | Medium |

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
MULTI_ACCOUNT_MODE=false
ACC_ID=12345
TRD_ENV=SIMULATE
DRY_RUN=true
WEEKLY_SPEND_USD=100
CONTRACTS=1
```

### Example 2: Multi-Account Production
```bash
MULTI_ACCOUNT_MODE=true
TRD_ENV=REAL
DRY_RUN=false

# High-risk strategies on margin accounts
ACC_ID_1=12345  # Margin account for barbell
ACC_ID_3=12347  # Margin account for volatility

# Conservative strategies on cash accounts  
ACC_ID_2=12346  # Cash account for income
ACC_ID_4=12348  # Cash account for wheel
ACC_ID_5=12349  # Small margin account for mixed

WEEKLY_SPEND_USD=500
CONTRACTS=2
```

### Example 3: Paper Trading All Strategies
```bash
MULTI_ACCOUNT_MODE=true
TRD_ENV=SIMULATE
DRY_RUN=true

# All using same simulated account but different indexes
ACC_INDEX_1=0
ACC_INDEX_2=0  
ACC_INDEX_3=0
ACC_INDEX_4=0
ACC_INDEX_5=0
```

## Validation & Testing

### Check Your Configuration
```bash
# Validate environment
make check-env

# Test with simulation
make simulate

# View which accounts are being used
make logs | grep "Using account"
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
# Check environment variables
make check-env

# View account configuration
grep ACC_ .env

# Test connection and accounts
make simulate | grep account
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

1. **Test Configuration**: `make simulate`
2. **Monitor Logs**: `make logs`
3. **View Dashboard**: `make docker-run` then visit http://localhost:8080
4. **Gradual Rollout**: Start with paper trading, then small positions