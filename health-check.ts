/**
 * Simple health check endpoint for Docker containers
 */

import { serve } from "std/http/server.ts";
import { existsSync } from "std/fs/mod.ts";

const port = 8080;

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  if (url.pathname === "/health") {
    // Basic health checks
    const checks = {
      timestamp: new Date().toISOString(),
      status: "healthy",
      checks: {
        data_dir: existsSync("./data"),
        log_file: existsSync("./data/trading.log"),
      },
    };
    
    return new Response(JSON.stringify(checks, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  if (url.pathname === "/trades") {
    // Return recent trade data
    try {
      const today = new Date().toISOString().split("T")[0];
      const tradeFile = `./data/trades_${today}.json`;
      
      if (existsSync(tradeFile)) {
        const trades = await Deno.readTextFile(tradeFile);
        return new Response(trades, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } else {
        return new Response(JSON.stringify({ trades: [], message: "No trades today" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  
  return new Response("Not Found", { status: 404 });
}

if (import.meta.main) {
  console.log(`Health check server running on http://localhost:${port}`);
  await serve(handler, { port });
}