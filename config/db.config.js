const dns = require("dns");
const mongoose = require("mongoose");

/**
 * mongodb+srv:// ko SRV DNS lookup chahiye. Kai ISPs / routers / purane macOS yeh lookup fail kar dete hain
 * ("querySrv ENOTFOUND"). DNS_SERVERS set ho to Node apne DNS (e.g. Google / Cloudflare) se poochta hai.
 *   DNS_SERVERS=8.8.8.8,1.1.1.1
 */
const applyDnsServers = () => {
  const servers = String(process.env.DNS_SERVERS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!servers.length) return;
  dns.setServers(servers);
  console.log(`Using DNS servers: ${servers.join(", ")}`);
};

const hintFor = (error) => {
  const msg = String(error?.message || "");
  if (/querySrv|ENOTFOUND|ESERVFAIL|ECONNREFUSED.*_mongodb/i.test(msg)) {
    return [
      "Could not resolve the cluster address. Try this:",
      "  1) Add DNS_SERVERS=8.8.8.8,1.1.1.1 to .env and restart",
      "  2) Copy a fresh connection string from Atlas > Connect > Drivers (check the cluster name)",
      "  3) Or use the standard (non-SRV) string: mongodb://host1:27017,host2:27017,...",
    ].join("\n");
  }
  if (/bad auth|Authentication failed/i.test(msg)) return "Wrong username or password (URL-encode special characters like @ # %).";
  if (/Server selection timed out|ETIMEDOUT|whitelist|IP/i.test(msg)) return "Add your IP in Atlas > Network Access (0.0.0.0/0 only for testing).";
  return null;
};

const connectToDatabase = async () => {
  if (!process.env.MONGO_DB_URL) {
    console.error("MONGO_DB_URL is not defined in .env");
    process.exit(1);
  }

  applyDnsServers();

  try {
    await mongoose.connect(process.env.MONGO_DB_URL, { serverSelectionTimeoutMS: 15000 });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    const hint = hintFor(error);
    if (hint) console.error(hint);
    process.exit(1);
  }
};

module.exports = {
  connectToDatabase,
  applyDnsServers,
};
