#!/usr/bin/env node

/**
 * TaskCatch API Load Testing Tool
 * Measures throughput (req/sec), p50, p90, p95, p99 latencies under concurrent load.
 */

const API_BASE = process.env.TASKCATCH_API_URL || "http://localhost:3000";
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "10", 10);
const TOTAL_REQUESTS = parseInt(process.env.REQUESTS || "200", 10);

async function testEndpoint(name, path) {
  process.stdout.write(`Benchmarking ${name} (${path}) with concurrency=${CONCURRENCY}... `);
  const latencies = [];
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  let nextReq = 0;

  async function worker() {
    while (nextReq < TOTAL_REQUESTS) {
      nextReq++;
      const t0 = performance.now();
      try {
        const res = await fetch(`${API_BASE}${path}`);
        const t1 = performance.now();
        if (res.ok) {
          latencies.push(t1 - t0);
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const durationSec = (Date.now() - startTime) / 1000;
  latencies.sort((a, b) => a - b);

  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p90 = latencies[Math.floor(latencies.length * 0.9)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const rps = (successCount / durationSec).toFixed(1);

  console.log("Done!");
  console.log(`  Requests: ${TOTAL_REQUESTS} | Success: ${successCount} | Failed: ${failCount}`);
  console.log(`  Throughput: ${rps} req/sec | Total Time: ${durationSec.toFixed(2)}s`);
  console.log(`  p50: ${p50.toFixed(2)}ms | p90: ${p90.toFixed(2)}ms | p95: ${p95.toFixed(2)}ms | p99: ${p99.toFixed(2)}ms`);
  console.log("");

  return { name, path, rps, p50, p95, p99, failCount };
}

async function run() {
  console.log("==================================================");
  console.log("         TaskCatch Production Load Test           ");
  console.log(`Target: ${API_BASE}`);
  console.log(`Requests: ${TOTAL_REQUESTS} | Concurrency: ${CONCURRENCY}`);
  console.log("==================================================\n");

  // Check if server is running
  try {
    await fetch(`${API_BASE}/health`);
  } catch (err) {
    console.error(`❌ Cannot reach API at ${API_BASE}. Make sure the server is running (npm run dev or node dist/index.js)`);
    process.exit(1);
  }

  const results = [];
  results.push(await testEndpoint("Health Check", "/health"));
  results.push(await testEndpoint("Today Tasks Query", "/api/tasks/today"));
  results.push(await testEndpoint("GIN Full-Text Search", "/api/tasks/search?q=report"));

  console.log("==================================================");
  console.log("Summary Table for docs/PERFORMANCE.md:");
  console.log("| Endpoint | Throughput (req/s) | p50 Latency | p95 Latency | p99 Latency |");
  console.log("| :--- | :--- | :--- | :--- | :--- |");
  for (const r of results) {
    console.log(`| \`${r.path}\` | ${r.rps} req/s | ${r.p50.toFixed(1)} ms | ${r.p95.toFixed(1)} ms | ${r.p99.toFixed(1)} ms |`);
  }
  console.log("==================================================");
}

run();
