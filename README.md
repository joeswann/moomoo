# Moomoo Multi-Account Options Bot

A comprehensive TypeScript application that runs on Deno for automated options trading using the Moomoo OpenAPI. The bot implements five different options strategies across multiple accounts with built-in backtesting capabilities and Docker support.

## Features

- **5 Options Strategies**: Debit call verticals, credit put spreads, ATM straddles, cash-secured puts, and crash hedges
- **Dynamic Universe Discovery**: Automatically discovers liquid trading opportunities
- **Monthly Rebalancing**: Automated portfolio management and position rolling
- **Backtesting Engine**: Comprehensive historical strategy testing with performance metrics
- **Docker Support**: Containerized deployment with data persistence
- **Risk Management**: Built-in position sizing and fee estimation
- **Data Persistence**: Trade logging and performance tracking

## Prerequisites

### Required Software
- [Deno](https://deno.land/) v1.42+ 
- [Docker](https://docker.com/) (optional, for containerized deployment)
- Moomoo OpenD client running and logged in

### Moomoo Setup
1. Install and configure Moomoo OpenD
2. Ensure your account has:
   - Market data subscriptions (Level 2 for options)
   - Options trading permissions (Level 2+ recommended)
   - Sufficient account balance for strategies

## Installation

### Option 1: Direct Deno Installation

```bash
# Clone the repository
git clone <repository-url>
cd moomoo

# Install dependencies (Deno will handle this automatically)
deno cache main.ts backtest.ts

# Make scripts executable
chmod +x scripts/*.sh
```

### Option 2: Docker Installation

```bash
# Clone the repository
git clone <repository-url>
cd moomoo

# Build the Docker image
docker build -t moomoo-bot .

# Or use docker-compose
docker-compose up --build
```

## Configuration

### Environment Variables

Create a `.env` file with your configuration:

```bash
# Moomoo Connection
MOOMOO_HOST=127.0.0.1
MOOMOO_PORT=11111

# Trading Environment
TRD_ENV=SIMULATE          # SIMULATE or REAL
DRY_RUN=true             # true for paper trading, false for live
ACC_ID=                  # Specific account ID (optional)
ACC_INDEX=0              # Account index fallback

# Strategy Parameters
UNIVERSE_MAX=6           # Max number of underlyings
TARGET_DELTA=0.30        # Target delta for long options
SHORT_DELTA=0.20         # Target delta for short options
WIDTH=5                  # Strike width for spreads ($)
CONTRACTS=1              # Contracts per trade
DTE_TARGET=28            # Target days to expiration
DTE_MIN=21               # Minimum DTE
DTE_MAX=45               # Maximum DTE

# Risk Management
WEEKLY_ADD_NZD=50        # Weekly capital addition (NZD)
STARTING_NZD=10000       # Starting capital (NZD)
WEEKLY_SPEND_USD=150     # Target weekly spend (USD)

# Rebalancing
REBALANCE_MONTHLY=true   # Enable monthly rebalancing
REBALANCE_DOM=1          # Day of month for rebalancing

# Data & Logging
DATA_DIR=./data          # Data directory
LOG_FILE=./data/trading.log  # Log file path
```

### Flexible Strategy Configuration

The bot uses a flexible JSON-based configuration system that supports unlimited strategies and accounts. Default strategies include:

1. **Barbell Convex**: Debit call vertical + Crash hedge for convex payoff
2. **Balanced Income**: Credit put spreads for steady income generation  
3. **Volatility Bet**: ATM straddles to capture volatility expansion
4. **Wheel Strategy**: Cash-secured puts for income and potential assignment
5. **Mixed Opportunistic**: Alternating strategies based on market conditions

### Configuration Management

#### JSON Configuration File (`config.json`)
The bot uses a comprehensive JSON configuration file instead of environment variables for strategy management:

```json
{
  "strategies": [
    {
      "id": "barbell_convex",
      "name": "Barbell Convex",
      "enabled": true,
      "account": { "id": 12345, "index": 0 },
      "parameters": {
        "targetDelta": 0.30,
        "contracts": 1,
        "dteTarget": 28
      },
      "riskLimits": {
        "maxWeeklySpend": 200,
        "maxPositionSize": 10
      },
      "components": ["debit_call_vertical", "crash_hedge"]
    }
  ]
}
```

#### Configuration CLI Commands
Manage strategies easily with built-in commands:

```bash
# List all strategies
make config-list

# Enable/disable strategies
STRATEGY=barbell_convex make config-enable
STRATEGY=volatility_bet make config-disable

# Set account for strategy
STRATEGY=wheel_strategy ACC_ID=12345 make config-account

# Update parameters
STRATEGY=balanced_income DELTA=0.25 CONTRACTS=2 make config-params

# Validate configuration
make config-validate

# Interactive setup wizard
make config-wizard
```

### Account Configuration

#### Per-Strategy Account Assignment
Each strategy can use its own account:
- **Account ID**: Specific account number from your broker
- **Account Index**: Fallback using account position in list
- **Mixed Mode**: Some strategies with specific accounts, others using indexes

#### Environment Variable Overrides
You can still override account assignments via environment variables:
```bash
# Strategy-specific overrides
BARBELL_CONVEX_ACC_ID=12345
WHEEL_STRATEGY_ACC_ID=12346

# Or use numbered system (backwards compatible)
ACC_ID_1=12345  
ACC_ID_2=12346
```

### Benefits of Flexible Configuration

- **Unlimited Strategies**: Add as many strategies as needed
- **Custom Parameters**: Each strategy has its own risk limits and parameters
- **Easy Management**: CLI tools for configuration changes
- **Environment Overrides**: Still supports environment variable customization
- **Validation**: Built-in configuration validation
- **Backup/Restore**: Easy configuration backup and versioning

## Usage

### Running the Bot

```bash
# Start the trading bot
deno task start

# Run with specific environment
TRD_ENV=SIMULATE deno task start

# Run in background with logging
nohup deno task start > trading.log 2>&1 &
```

### Docker Usage

```bash
# Run with docker-compose
docker-compose up -d

# Run single container
docker run --env-file .env -v $(pwd)/data:/app/data moomoo-bot

# View logs
docker-compose logs -f moomoo-bot
```

### Backtesting

```bash
# Run backtest with default settings
deno task backtest

# Custom backtest parameters
deno task backtest \
  --start-date 2023-01-01 \
  --end-date 2023-12-31 \
  --capital 25000 \
  --strategies "debit_call_vertical,credit_put_spread" \
  --universe "US.SPY,US.QQQ,US.IWM"

# View backtest help
deno task backtest --help
```

### Available Strategies for Backtesting

- `debit_call_vertical`: Bull call spreads
- `credit_put_spread`: Bull put spreads  
- `atm_straddle`: At-the-money long straddles
- `cash_secured_put`: Short puts with cash collateral
- `crash_hedge`: Far OTM protective puts

## Monitoring

### Health Checks

The application includes health check endpoints when running in Docker:

```bash
# Check application health
curl http://localhost:8080/health

# View recent trades
curl http://localhost:8080/trades
```

### Log Files

- `./data/trading.log`: Main application logs
- `./data/trades_YYYY-MM-DD.json`: Daily trade records
- `./data/backtest_*.json`: Backtest results

### Data Persistence

All trade data, logs, and backtest results are saved in the `./data` directory:

```
data/
├── trading.log              # Application logs
├── trades_2024-01-15.json   # Daily trade records
├── backtest_*.json          # Backtest results
└── backtest_summary_*.txt   # Human-readable summaries
```

## Development

### Project Structure

```
moomoo/
├── main.ts                 # Main trading application
├── backtest.ts             # Backtesting engine
├── health-check.ts         # Health monitoring
├── deno.json              # Deno configuration
├── docker-compose.yml     # Docker orchestration
├── Dockerfile            # Container definition
├── data/                 # Data persistence
└── README.md            # This file
```

### Adding New Strategies

1. Implement strategy logic in `main.ts`
2. Add strategy to the `executeStrategy()` function
3. Update backtesting engine in `backtest.ts`
4. Add strategy configuration options

### Testing

```bash
# Run with dry run enabled
DRY_RUN=true deno task start

# Test backtesting
deno task backtest --start-date 2024-01-01 --end-date 2024-01-31

# Validate Docker build
docker build -t moomoo-test . && docker run --rm moomoo-test deno --version
```

## Safety & Risk Management

### Important Safety Measures

1. **Always start with simulation**: Set `TRD_ENV=SIMULATE`
2. **Use dry run mode**: Set `DRY_RUN=true` for testing
3. **Start small**: Begin with minimal position sizes
4. **Monitor closely**: Check logs and performance regularly
5. **Understand the code**: Review and understand all strategies before live trading

### Risk Controls

- Position sizing limits via `CONTRACTS` and `WEEKLY_SPEND_USD`
- DTE limits to avoid assignment risk
- Built-in fee estimation and tracking
- Automatic rebalancing and position management

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Ensure Moomoo OpenD is running and logged in
   - Check `MOOMOO_HOST` and `MOOMOO_PORT` settings
   - Verify network connectivity

2. **Permission Denied**
   - Ensure your Moomoo account has options permissions
   - Check market data subscriptions
   - Verify account balance for margin requirements

3. **No Suitable Options**
   - Market may be closed or illiquid
   - Adjust DTE parameters (`DTE_MIN`, `DTE_MAX`)
   - Check universe selection

4. **Docker Issues**
   - Ensure Docker daemon is running
   - Check volume mounts for data persistence
   - Verify environment variable passing

### Debug Mode

Enable verbose logging:

```bash
# Debug mode with detailed logging
DEBUG=true deno task start

# View real-time logs
tail -f data/trading.log
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is for educational purposes. Use at your own risk. The authors are not responsible for any financial losses incurred through the use of this software.

## Disclaimer

This software is provided for educational and research purposes only. Options trading involves substantial risk and is not suitable for all investors. Past performance does not guarantee future results. Always consult with a qualified financial advisor before making trading decisions.

**Important**: Never run this bot with real money without thoroughly understanding the code, strategies, and risks involved. Start with paper trading and gradually increase exposure only after extensive testing and validation.