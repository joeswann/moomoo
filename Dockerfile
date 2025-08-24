FROM denoland/deno:1.42.4
WORKDIR /app
COPY . .
# Cache once sources are present
RUN deno cache --node-modules-dir main-cppi.ts dashboard.ts health-check.ts config-cli.ts backtest.ts

# Create data directory for persistence
RUN mkdir -p ./data

# Expose port for health checks (if needed)
EXPOSE 8080

# Set default environment variables
ENV TRD_ENV=SIMULATE
ENV DRY_RUN=true
ENV DATA_DIR=/app/data

# Health check endpoint (optional)
COPY health-check.ts .
RUN deno cache --node-modules-dir health-check.ts

# Default command
CMD ["deno", "task", "start"]