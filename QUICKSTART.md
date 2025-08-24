# 🚀 Quick Start Guide

## Initial Setup (One Time)

```bash
# 1. Setup everything
make setup

# 2. Edit your configuration
nano .env  # or vim .env

# 3. Test with simulation
make simulate
```

## Common Commands

### 📊 Running the Bot
```bash
make run          # Run in foreground (CTRL+C to stop)
make run-bg       # Run in background
make simulate     # Run in simulation mode
make stop         # Stop background bot
make status       # Check if bot is running
```

### 📈 Backtesting
```bash
make backtest           # Default backtest
make backtest-quick     # 3-month backtest
make backtest-year      # 1-year backtest

# Custom backtest
START_DATE=2023-01-01 END_DATE=2023-06-30 CAPITAL=25000 make backtest-custom
```

### 🐳 Docker
```bash
make docker-build      # Build images
make docker-run        # Start containers
make docker-stop       # Stop containers
make docker-logs       # View logs
```

### 📋 Monitoring
```bash
make logs              # View real-time logs
make logs-today        # Today's logs only
make trades            # View recent trades
make dashboard         # Start web dashboard
make health           # Health check
```

### 🔧 Development
```bash
make dev              # Development mode with auto-restart
make test             # Run tests
make fmt              # Format code
make lint             # Lint code
```

### 🧹 Maintenance
```bash
make clean            # Clean temp files
make update           # Update dependencies
make reset            # Reset to clean state
make teardown         # Complete teardown
```

## Safety First! 🛡️

Always start with:
1. `TRD_ENV=SIMULATE` in your `.env` file
2. `DRY_RUN=true` in your `.env` file
3. Test thoroughly with `make simulate`

## Web Dashboard 🌐

After running `make docker-run` or `make dashboard`:
- Open http://localhost:8080
- View trades, logs, and backtest results
- Auto-refreshes every 30 seconds

## Environment Variables

Key settings in `.env`:
- `TRD_ENV=SIMULATE` (SIMULATE or REAL)
- `DRY_RUN=true` (true for paper trading)
- `MOOMOO_HOST=127.0.0.1`
- `MOOMOO_PORT=11111`

## Need Help?

```bash
make help            # Show all commands
make examples        # Show usage examples
```