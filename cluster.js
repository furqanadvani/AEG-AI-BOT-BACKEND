/**
 * V19: Production mein saare CPU cores use karna (1000+ customers ek saath).
 *   npm run start:cluster          (WEB_CONCURRENCY = workers, default = CPU cores)
 * Har worker wahi server.js chalata hai. Ek session ke messages phir bhi line se process hote hain
 * (Mongo session lock, services/workflow.repository.js -> acquireLock). Worker gire to naya khud ban jata hai.
 */
require("dotenv").config();
const cluster = require("node:cluster");
const os = require("node:os");

const count = Math.max(1, Number(process.env.WEB_CONCURRENCY) || (os.availableParallelism ? os.availableParallelism() : os.cpus().length));

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid}: starting ${count} workers`);
  for (let i = 0; i < count; i++) cluster.fork({ CLUSTER_WORKER: "true" });
  let stopping = false;
  cluster.on("exit", (worker, code) => {
    if (stopping) return;
    console.error(`Worker ${worker.process.pid} exited (${code}); starting a new one`);
    cluster.fork({ CLUSTER_WORKER: "true" });
  });
  const stop = (sig) => { stopping = true; for (const w of Object.values(cluster.workers || {})) w.process.kill(sig); setTimeout(() => process.exit(0), 16000).unref(); };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
} else {
  require("./server").startServer();
}
