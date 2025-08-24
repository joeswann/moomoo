# Moomoo Options Bot Makefile
# Provides convenient commands for setup, running, and teardown

.PHONY: help setup teardown clean run run-bg stop backtest docker-build docker-run docker-stop docker-clean logs status

# Default target
.DEFAULT_GOAL := help

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
PURPLE := \033[0;35m
CYAN := \033[0;36m
NC := \033[0m # No Color

# Variables
DENO_VERSION := 1.42.4
BOT_NAME := moomoo-options-bot
DOCKER_IMAGE := moomoo-bot
DATA_DIR := ./data
LOG_FILE := $(DATA_DIR)/trading.log
ENV_FILE := .env

##@ Help
help: ## Display this help screen
	@echo "$(CYAN)Moomoo Options Bot - Make Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make $(CYAN)<target>$(NC)\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  $(CYAN)%-15s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Setup & Installation
setup: ## Initial setup - install dependencies and create config files
	@echo "$(GREEN)Setting up Moomoo Options Bot...$(NC)"
	@$(MAKE) check-deno
	@$(MAKE) create-dirs
	@$(MAKE) create-env
	@$(MAKE) cache-deps
	@$(MAKE) create-config
	@echo "$(GREEN)✓ Setup complete!$(NC)"
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "  1. Configure strategies: make config-list"
	@echo "  2. Edit .env file with your Moomoo settings"
	@echo "  3. Ensure OpenD is running and logged in"
	@echo "  4. Run 'make run' to start the bot"

create-config: ## Create default configuration file
	@if [ ! -f config.json ]; then \
		echo "$(BLUE)Creating default config.json...$(NC)"; \
		deno task config validate 2>/dev/null || echo "$(GREEN)✓ Default configuration created$(NC)"; \
	else \
		echo "$(GREEN)✓ config.json already exists$(NC)"; \
	fi

check-deno: ## Check if Deno is installed
	@echo "$(BLUE)Checking Deno installation...$(NC)"
	@if ! command -v deno >/dev/null 2>&1; then \
		echo "$(RED)❌ Deno not found. Please install Deno first:$(NC)"; \
		echo "  curl -fsSL https://deno.land/install.sh | sh"; \
		exit 1; \
	fi
	@echo "$(GREEN)✓ Deno found: $$(deno --version | head -n1)$(NC)"

create-dirs: ## Create necessary directories
	@echo "$(BLUE)Creating directories...$(NC)"
	@mkdir -p $(DATA_DIR)
	@mkdir -p logs
	@echo "$(GREEN)✓ Directories created$(NC)"

create-env: ## Create environment file from example
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "$(BLUE)Creating .env file from template...$(NC)"; \
		cp .env.example $(ENV_FILE); \
		echo "$(YELLOW)⚠️  Please edit .env file with your settings$(NC)"; \
	else \
		echo "$(GREEN)✓ .env file already exists$(NC)"; \
	fi

cache-deps: ## Cache Deno dependencies
	@echo "$(BLUE)Caching dependencies...$(NC)"
	@deno cache --reload main.ts backtest.ts health-check.ts dashboard.ts
	@echo "$(GREEN)✓ Dependencies cached$(NC)"

##@ Configuration Management
config-list: ## List all strategies and their configuration
	@echo "$(GREEN)Strategy Configuration:$(NC)"
	@deno task config list

config-enable: ## Enable a strategy (usage: STRATEGY=strategy_id make config-enable)
	@if [ -z "$(STRATEGY)" ]; then \
		echo "$(RED)Please specify STRATEGY=strategy_id$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)Enabling strategy: $(STRATEGY)$(NC)"
	@deno task config enable --strategy $(STRATEGY)

config-disable: ## Disable a strategy (usage: STRATEGY=strategy_id make config-disable)
	@if [ -z "$(STRATEGY)" ]; then \
		echo "$(RED)Please specify STRATEGY=strategy_id$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Disabling strategy: $(STRATEGY)$(NC)"
	@deno task config disable --strategy $(STRATEGY)

config-account: ## Set account for strategy (usage: STRATEGY=id ACC_ID=12345 make config-account)
	@if [ -z "$(STRATEGY)" ]; then \
		echo "$(RED)Please specify STRATEGY=strategy_id$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)Setting account for strategy: $(STRATEGY)$(NC)"
	@deno task config set-account --strategy $(STRATEGY) $(if $(ACC_ID),--id $(ACC_ID)) $(if $(ACC_INDEX),--index $(ACC_INDEX))

config-params: ## Update strategy parameters (usage: STRATEGY=id DELTA=0.3 CONTRACTS=2 make config-params)
	@if [ -z "$(STRATEGY)" ]; then \
		echo "$(RED)Please specify STRATEGY=strategy_id$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)Updating parameters for strategy: $(STRATEGY)$(NC)"
	@deno task config set-params --strategy $(STRATEGY) $(if $(DELTA),--delta $(DELTA)) $(if $(CONTRACTS),--contracts $(CONTRACTS)) $(if $(DTE),--dte $(DTE)) $(if $(WIDTH),--width $(WIDTH))

config-validate: ## Validate current configuration
	@echo "$(GREEN)Validating configuration...$(NC)"
	@deno task config validate

config-backup: ## Create configuration backup
	@echo "$(GREEN)Creating configuration backup...$(NC)"
	@deno task config backup

config-wizard: ## Interactive configuration wizard
	@echo "$(CYAN)Configuration Wizard$(NC)"
	@echo ""
	@echo "$(YELLOW)This will help you set up your strategies and accounts.$(NC)"
	@echo ""
	@$(MAKE) config-list
	@echo ""
	@echo "$(BLUE)Common tasks:$(NC)"
	@echo "  Enable strategy:  STRATEGY=barbell_convex make config-enable"
	@echo "  Set account:      STRATEGY=wheel_strategy ACC_ID=12345 make config-account"
	@echo "  Update params:    STRATEGY=volatility_bet DELTA=0.4 CONTRACTS=2 make config-params"
	@echo ""
	@echo "Run 'make config-validate' when done to check your configuration."

##@ Running the Bot
run: ## Run the bot in foreground (CTRL+C to stop)
	@$(MAKE) check-env
	@echo "$(GREEN)Starting Moomoo Options Bot...$(NC)"
	@echo "$(YELLOW)Press CTRL+C to stop$(NC)"
	@deno task start

run-bg: ## Run the bot in background
	@$(MAKE) check-env
	@echo "$(GREEN)Starting Moomoo Options Bot in background...$(NC)"
	@nohup deno task start > $(LOG_FILE) 2>&1 & echo $$! > .bot_pid
	@echo "$(GREEN)✓ Bot started (PID: $$(cat .bot_pid))$(NC)"
	@echo "$(BLUE)View logs: make logs$(NC)"
	@echo "$(BLUE)Stop bot: make stop$(NC)"

run-sim: ## Run in simulation mode (override environment)
	@echo "$(YELLOW)Running in SIMULATION mode...$(NC)"
	@TRD_ENV=SIMULATE DRY_RUN=true deno task start

check-env: ## Check if environment is properly configured
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "$(RED)❌ .env file not found. Run 'make setup' first.$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✓ Environment configured$(NC)"

setup-multi-accounts: ## Interactive setup for multiple accounts
	@echo "$(CYAN)Setting up multi-account configuration...$(NC)"
	@echo ""
	@echo "$(YELLOW)This will help you configure 5 separate trading accounts.$(NC)"
	@echo "$(YELLOW)You'll need the account IDs from your Moomoo broker.$(NC)"
	@echo ""
	@read -p "Enable multi-account mode? (y/N): " enable && \
	if [ "$$enable" = "y" ] || [ "$$enable" = "Y" ]; then \
		echo "MULTI_ACCOUNT_MODE=true" >> $(ENV_FILE); \
		echo ""; \
		echo "$(BLUE)Enter account IDs for each strategy (press Enter to skip):$(NC)"; \
		echo ""; \
		read -p "Strategy 1 - Barbell Convex Account ID: " acc1 && \
		[ -n "$$acc1" ] && echo "ACC_ID_1=$$acc1" >> $(ENV_FILE); \
		read -p "Strategy 2 - Balanced Income Account ID: " acc2 && \
		[ -n "$$acc2" ] && echo "ACC_ID_2=$$acc2" >> $(ENV_FILE); \
		read -p "Strategy 3 - Volatility Bet Account ID: " acc3 && \
		[ -n "$$acc3" ] && echo "ACC_ID_3=$$acc3" >> $(ENV_FILE); \
		read -p "Strategy 4 - Wheel Strategy Account ID: " acc4 && \
		[ -n "$$acc4" ] && echo "ACC_ID_4=$$acc4" >> $(ENV_FILE); \
		read -p "Strategy 5 - Mixed Bets Account ID: " acc5 && \
		[ -n "$$acc5" ] && echo "ACC_ID_5=$$acc5" >> $(ENV_FILE); \
		echo ""; \
		echo "$(GREEN)✓ Multi-account mode configured!$(NC)"; \
	else \
		echo "MULTI_ACCOUNT_MODE=false" >> $(ENV_FILE); \
		echo "$(BLUE)Using single account mode$(NC)"; \
	fi

stop: ## Stop the background bot
	@if [ -f .bot_pid ]; then \
		echo "$(YELLOW)Stopping bot (PID: $$(cat .bot_pid))...$(NC)"; \
		kill $$(cat .bot_pid) 2>/dev/null || true; \
		rm -f .bot_pid; \
		echo "$(GREEN)✓ Bot stopped$(NC)"; \
	else \
		echo "$(YELLOW)No background bot found$(NC)"; \
	fi

status: ## Check if bot is running
	@if [ -f .bot_pid ]; then \
		if ps -p $$(cat .bot_pid) > /dev/null 2>&1; then \
			echo "$(GREEN)✓ Bot is running (PID: $$(cat .bot_pid))$(NC)"; \
		else \
			echo "$(RED)❌ Bot process not found$(NC)"; \
			rm -f .bot_pid; \
		fi \
	else \
		echo "$(YELLOW)Bot is not running$(NC)"; \
	fi

##@ Backtesting
backtest: ## Run backtest with default parameters
	@echo "$(GREEN)Running backtest...$(NC)"
	@deno task backtest

backtest-quick: ## Run quick backtest (3 months)
	@echo "$(GREEN)Running quick backtest (3 months)...$(NC)"
	@deno task backtest --start-date $$(date -d '3 months ago' +%Y-%m-%d) --end-date $$(date +%Y-%m-%d)

backtest-year: ## Run backtest for last year
	@echo "$(GREEN)Running yearly backtest...$(NC)"
	@deno task backtest --start-date $$(date -d '1 year ago' +%Y-%m-%d) --end-date $$(date +%Y-%m-%d)

backtest-custom: ## Run custom backtest (set START_DATE, END_DATE, CAPITAL)
	@echo "$(GREEN)Running custom backtest...$(NC)"
	@deno task backtest \
		--start-date $(or $(START_DATE),2023-01-01) \
		--end-date $(or $(END_DATE),2023-12-31) \
		--capital $(or $(CAPITAL),25000) \
		--strategies $(or $(STRATEGIES),"debit_call_vertical,credit_put_spread") \
		--universe $(or $(UNIVERSE),"US.SPY,US.QQQ,US.IWM")

##@ Docker Operations
docker-build: ## Build Docker images
	@echo "$(GREEN)Building Docker images...$(NC)"
	@docker build -t $(DOCKER_IMAGE) .
	@docker build -f Dockerfile.dashboard -t $(DOCKER_IMAGE)-dashboard .
	@echo "$(GREEN)✓ Docker images built$(NC)"

docker-run: ## Run with Docker Compose
	@echo "$(GREEN)Starting with Docker Compose...$(NC)"
	@docker-compose up -d
	@echo "$(GREEN)✓ Containers started$(NC)"
	@echo "$(BLUE)Dashboard: http://localhost:8080$(NC)"
	@echo "$(BLUE)View logs: make docker-logs$(NC)"

docker-stop: ## Stop Docker containers
	@echo "$(YELLOW)Stopping Docker containers...$(NC)"
	@docker-compose down
	@echo "$(GREEN)✓ Containers stopped$(NC)"

docker-restart: ## Restart Docker containers
	@$(MAKE) docker-stop
	@$(MAKE) docker-run

docker-logs: ## View Docker container logs
	@docker-compose logs -f

docker-shell: ## Open shell in running container
	@docker-compose exec $(BOT_NAME) sh

docker-clean: ## Clean Docker images and containers
	@echo "$(YELLOW)Cleaning Docker resources...$(NC)"
	@docker-compose down --volumes --remove-orphans 2>/dev/null || true
	@docker rmi $(DOCKER_IMAGE) $(DOCKER_IMAGE)-dashboard 2>/dev/null || true
	@docker system prune -f
	@echo "$(GREEN)✓ Docker resources cleaned$(NC)"

##@ Monitoring & Logs
logs: ## View bot logs (real-time)
	@if [ -f $(LOG_FILE) ]; then \
		echo "$(BLUE)Viewing logs (CTRL+C to exit)...$(NC)"; \
		tail -f $(LOG_FILE); \
	else \
		echo "$(YELLOW)No log file found at $(LOG_FILE)$(NC)"; \
	fi

logs-today: ## View today's logs only
	@if [ -f $(LOG_FILE) ]; then \
		echo "$(BLUE)Today's logs:$(NC)"; \
		grep "$$(date +%Y-%m-%d)" $(LOG_FILE) || echo "$(YELLOW)No logs for today$(NC)"; \
	else \
		echo "$(YELLOW)No log file found$(NC)"; \
	fi

trades: ## View recent trades
	@echo "$(BLUE)Recent trades:$(NC)"
	@find $(DATA_DIR) -name "trades_*.json" -exec echo "$(PURPLE){}:$(NC)" \; -exec cat {} \; 2>/dev/null || echo "$(YELLOW)No trade files found$(NC)"

dashboard: ## Start standalone dashboard
	@echo "$(GREEN)Starting dashboard on http://localhost:8080$(NC)"
	@deno run --allow-net --allow-read dashboard.ts

health: ## Check bot health
	@if curl -s http://localhost:8080/health > /dev/null 2>&1; then \
		echo "$(GREEN)✓ Bot is healthy$(NC)"; \
		curl -s http://localhost:8080/health | jq . 2>/dev/null || curl -s http://localhost:8080/health; \
	else \
		echo "$(YELLOW)❌ Bot health check failed or not running$(NC)"; \
	fi

##@ Development
dev: ## Run in development mode with auto-restart
	@echo "$(GREEN)Starting in development mode...$(NC)"
	@echo "$(YELLOW)Files will be watched for changes$(NC)"
	@deno run --allow-net --allow-read --allow-write --allow-env --watch main.ts

test: ## Run tests and validation
	@echo "$(GREEN)Running validation tests...$(NC)"
	@deno check main.ts backtest.ts dashboard.ts health-check.ts
	@echo "$(GREEN)✓ TypeScript validation passed$(NC)"
	@$(MAKE) backtest-quick

fmt: ## Format code
	@echo "$(GREEN)Formatting code...$(NC)"
	@deno fmt
	@echo "$(GREEN)✓ Code formatted$(NC)"

lint: ## Lint code
	@echo "$(GREEN)Linting code...$(NC)"
	@deno lint
	@echo "$(GREEN)✓ Code linted$(NC)"

##@ Maintenance
clean: ## Clean temporary files and logs
	@echo "$(YELLOW)Cleaning temporary files...$(NC)"
	@rm -f .bot_pid
	@rm -rf logs/*.log
	@find $(DATA_DIR) -name "*.tmp" -delete 2>/dev/null || true
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-all: ## Clean everything including data (DESTRUCTIVE)
	@echo "$(RED)⚠️  This will delete ALL data and logs!$(NC)"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ] || exit 1
	@$(MAKE) stop
	@$(MAKE) docker-clean
	@rm -rf $(DATA_DIR)
	@rm -rf logs
	@rm -f .bot_pid
	@echo "$(GREEN)✓ Complete cleanup finished$(NC)"

update: ## Update dependencies
	@echo "$(GREEN)Updating dependencies...$(NC)"
	@deno cache --reload main.ts backtest.ts dashboard.ts health-check.ts
	@echo "$(GREEN)✓ Dependencies updated$(NC)"

reset: ## Reset to clean state (keeps .env)
	@$(MAKE) stop
	@$(MAKE) clean
	@$(MAKE) cache-deps
	@echo "$(GREEN)✓ Reset complete$(NC)"

teardown: ## Complete teardown (keeps source code and .env)
	@echo "$(YELLOW)Tearing down Moomoo Options Bot...$(NC)"
	@$(MAKE) stop
	@$(MAKE) docker-stop
	@$(MAKE) clean
	@echo "$(GREEN)✓ Teardown complete$(NC)"
	@echo "$(BLUE)Source code and .env preserved$(NC)"

##@ Quick Commands
simulate: run-sim ## Alias for run-sim
bg: run-bg ## Alias for run-bg
bt: backtest ## Alias for backtest

# Example usage targets
examples: ## Show example usage
	@echo "$(CYAN)Example Usage:$(NC)"
	@echo ""
	@echo "$(YELLOW)Initial Setup:$(NC)"
	@echo "  make setup"
	@echo "  # Edit .env file"
	@echo "  make run-sim"
	@echo ""
	@echo "$(YELLOW)Production:$(NC)"
	@echo "  make run-bg"
	@echo "  make status"
	@echo "  make logs"
	@echo ""
	@echo "$(YELLOW)Docker:$(NC)"
	@echo "  make docker-build"
	@echo "  make docker-run"
	@echo "  # Dashboard at http://localhost:8080"
	@echo ""
	@echo "$(YELLOW)Backtesting:$(NC)"
	@echo "  make backtest-quick"
	@echo "  START_DATE=2023-01-01 END_DATE=2023-06-30 make backtest-custom"
	@echo ""
	@echo "$(YELLOW)Maintenance:$(NC)"
	@echo "  make stop"
	@echo "  make clean"
	@echo "  make teardown"