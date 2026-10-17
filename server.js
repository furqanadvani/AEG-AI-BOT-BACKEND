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

// Reverse proxy (nginx / render / railway) ke peeche sahi IP (rate limit + API key IP allowlist)
app.set("trust proxy", Number(process.env.TRUST_PROXY || 1));

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",").map((s) => s.trim()) : "*",
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "2mb",
    // WhatsApp webhook signature ke liye raw body chahiye
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith("/api/webhooks/")) req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/health", (req, res) => {
  res.status(200).json({
    error: false,
    message: "Server is running",
    data: {
      status: "OK",
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
    await connectToDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Application startup failed:", error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
