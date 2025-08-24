FROM denoland/deno:1.42.4

# Create app directory
WORKDIR /app

# Copy dependency files
COPY deno.json deno.lock* ./

# Cache dependencies
RUN deno cache --node-modules-dir main-cppi.ts

# Copy source code
COPY . .

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