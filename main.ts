/**
 * Main entrypoint for the 5-sleeve CPPI options bot
 * This imports the main implementation from main-cppi.ts
 */

if (import.meta.main) {
  // Import main-cppi.ts and run the module directly  
  await import("./main-cppi.ts");
}