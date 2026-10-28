require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const { connectToDatabase } = require("./config/db.config");
const routes = require("./routes");
const { notFoundHandler, errorHandler } = require("./middlewares/errorHandler");

const app = express();

const PORT = process.env.PORT || 8080;

app.set("trust proxy", Number(process.env.TRUST_PROXY || 1));

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(
  express.json({
    limit: "2mb",
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith("/api/webhooks/")) req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.disable("x-powered-by");

app.get("/health", (req, res) => {
  res.status(200).json({
    error: false,
    message: "Server is running",
    data: {
      status: "OK",
      version: require("./package.json").version, // V19.3: kaun sa code chal raha hai (deploy check)
      engine: "V19.3",
    },
  });
});

app.use("/api", routes);

app.use(notFoundHandler);

app.use(errorHandler);

// const startServer = async () => {
//   try {
//     await connectToDatabase();

//     const server = app.listen(PORT, () => {
//       console.log(`Server is running on port ${PORT}`);
//     });

//     const shutdown = (signal) => {
//       console.log(`${signal} received, shutting down...`);
//       server.close(() => process.exit(0));
//       setTimeout(() => process.exit(1), 10000).unref();
//     };
//     process.on("SIGTERM", () => shutdown("SIGTERM"));
//     process.on("SIGINT", () => shutdown("SIGINT"));
//   } catch (error) {
//     console.error("Failed to start server:", error);
//     process.exit(1);
//   }
// };

// // Tests app ko import karte hain bina server start kiye
// if (require.main === module) startServer();



async function startServer() {
  try {

    console.log("Node version:", process.version);
    console.log("Global crypto:", typeof globalThis.crypto);
    console.log("Crypto module:", typeof require("node:crypto").createHash);
    console.log("Mongoose version:", require("mongoose/package.json").version);
    await connectToDatabase();

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}${process.env.CLUSTER_WORKER ? ` (worker ${process.pid})` : ""}`);
    });
    // V19: load balancer ke peeche keep-alive (ALB/Nginx ka timeout ~60s) taake connections beech mein na tootein
    server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS) || 65000;
    server.headersTimeout = server.keepAliveTimeout + 1000;

    // V19: graceful shutdown: chal rahe messages poore hon, AI usage counters DB mein likhe jayen
    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down...`);
      server.close(async () => {
        try { await require("./services/ai.service").flushUsage(); } catch (e) { /* ignore */ }
        try { await require("mongoose").connection.close(); } catch (e) { /* ignore */ }
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 15000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Application startup failed:", error);
    process.exit(1);
  }
}

if (require.main === module) startServer();

module.exports = app;
module.exports.startServer = startServer; // cluster.js workers
