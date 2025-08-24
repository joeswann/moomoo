/**
 * Simple web dashboard for monitoring the moomoo bot
 */

import { serve } from "std/http/server.ts";
import { existsSync } from "std/fs/mod.ts";

interface DashboardData {
  status: string;
  trades: any[];
  logs: string[];
  backtest_results: any[];
}

async function getDashboardData(): Promise<DashboardData> {
  const data: DashboardData = {
    status: "running",
    trades: [],
    logs: [],
    backtest_results: []
  };

  try {
    // Get recent trades
    const today = new Date().toISOString().split("T")[0];
    const tradeFile = `./data/trades_${today}.json`;
    
    if (existsSync(tradeFile)) {
      const trades = JSON.parse(await Deno.readTextFile(tradeFile));
      data.trades = trades.slice(-20); // Last 20 trades
    }

    // Get recent logs
    if (existsSync("./data/trading.log")) {
      const logs = await Deno.readTextFile("./data/trading.log");
      data.logs = logs.split("\n").slice(-50); // Last 50 log lines
    }

    // Get backtest results
    if (existsSync("./data")) {
      for await (const entry of Deno.readDir("./data")) {
        if (entry.name.startsWith("backtest_") && entry.name.endsWith(".json")) {
          try {
            const result = JSON.parse(await Deno.readTextFile(`./data/${entry.name}`));
            data.backtest_results.push({
              filename: entry.name,
              metrics: result.metrics,
              config: result.config
            });
          } catch {
            // Skip invalid JSON files
          }
        }
      }
    }

    // Sort backtest results by date
    data.backtest_results.sort((a, b) => b.filename.localeCompare(a.filename));
    data.backtest_results = data.backtest_results.slice(0, 10); // Last 10 backtests

  } catch (error) {
    console.error("Error getting dashboard data:", error);
  }

  return data;
}

function generateHTML(data: DashboardData): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Moomoo Options Bot Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: #2563eb;
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
        }
        .card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            background: #10b981;
            color: white;
        }
        .metric {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .logs {
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            background: #1f2937;
            color: #f9fafb;
            padding: 15px;
            border-radius: 4px;
            max-height: 300px;
            overflow-y: auto;
        }
        .trades-table {
            width: 100%;
            border-collapse: collapse;
        }
        .trades-table th,
        .trades-table td {
            padding: 8px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
            font-size: 12px;
        }
        .trades-table th {
            background: #f9fafb;
            font-weight: 600;
        }
        .buy { color: #059669; }
        .sell { color: #dc2626; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Moomoo Options Bot Dashboard</h1>
            <p>Status: <span class="status">${data.status}</span> | Last Updated: ${new Date().toISOString()}</p>
        </div>

        <div class="grid">
            <div class="card">
                <h2>📊 Recent Trades (${data.trades.length})</h2>
                ${data.trades.length > 0 ? `
                <table class="trades-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Symbol</th>
                            <th>Side</th>
                            <th>Qty</th>
                            <th>Price</th>
                            <th>Strategy</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.trades.slice(-10).reverse().map(trade => `
                        <tr>
                            <td>${trade.timestamp ? new Date(trade.timestamp).toLocaleDateString() : trade.date}</td>
                            <td>${trade.symbol}</td>
                            <td class="${trade.side.toLowerCase()}">${trade.side}</td>
                            <td>${trade.quantity || trade.qty}</td>
                            <td>$${trade.price}</td>
                            <td>${trade.strategy || 'N/A'}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : '<p>No trades recorded today</p>'}
            </div>

            <div class="card">
                <h2>📈 Latest Backtest Results</h2>
                ${data.backtest_results.length > 0 ? `
                ${data.backtest_results.slice(0, 3).map(result => `
                    <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e5e7eb;">
                        <strong>${result.filename}</strong>
                        <div class="metric">
                            <span>Total Return:</span>
                            <span>${(result.metrics.totalReturn * 100).toFixed(2)}%</span>
                        </div>
                        <div class="metric">
                            <span>Sharpe Ratio:</span>
                            <span>${result.metrics.sharpeRatio.toFixed(2)}</span>
                        </div>
                        <div class="metric">
                            <span>Max Drawdown:</span>
                            <span>${(result.metrics.maxDrawdown * 100).toFixed(2)}%</span>
                        </div>
                        <div class="metric">
                            <span>Total Trades:</span>
                            <span>${result.metrics.totalTrades}</span>
                        </div>
                    </div>
                `).join('')}
                ` : '<p>No backtest results available</p>'}
            </div>

            <div class="card">
                <h2>📋 Recent Logs</h2>
                <div class="logs">
                    ${data.logs.slice(-20).join('\n')}
                </div>
            </div>
        </div>
    </div>

    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => window.location.reload(), 30000);
    </script>
</body>
</html>
  `;
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  if (url.pathname === "/") {
    const data = await getDashboardData();
    const html = generateHTML(data);
    
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }
  
  if (url.pathname === "/api/data") {
    const data = await getDashboardData();
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }
  
  return new Response("Not Found", { status: 404 });
}

if (import.meta.main) {
  const port = 8080;
  console.log(`Dashboard running on http://localhost:${port}`);
  await serve(handler, { port });
}