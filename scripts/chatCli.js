/**
 * Terminal se bot test karna (server chalu ho):
 *   API_URL=http://localhost:8080 API_KEY=aeg_xxx npm run chat
 *   ya TOKEN=<jwt> npm run chat
 * "/new" = naya session, "/exit" = band
 */
require("dotenv").config();
const readline = require("readline");

const base = (process.env.API_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/+$/, "");
const headers = { "Content-Type": "application/json" };
if (process.env.API_KEY) headers["x-api-key"] = process.env.API_KEY;
else if (process.env.TOKEN) headers.Authorization = `Bearer ${process.env.TOKEN}`;
else { console.log("Set API_KEY or TOKEN in the environment"); process.exit(1); }

let sessionId = `cli-${Date.now()}`;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "You> " });
console.log(`Session: ${sessionId}`);
rl.prompt();
rl.on("line", async (line) => {
  const text = line.trim();
  if (text === "/exit") process.exit(0);
  if (text === "/new") { sessionId = `cli-${Date.now()}`; console.log(`New session: ${sessionId}`); return rl.prompt(); }
  if (!text) return rl.prompt();
  try {
    const r = await fetch(`${base}/api/chat/message?debug=true`, { method: "POST", headers, body: JSON.stringify({ sessionId, text }) });
    const j = await r.json();
    if (j.error) console.log("ERROR:", j.message);
    else {
      console.log(`\nBot> ${j.data.replyPlain}\n`);
      console.log(`   [next=${j.data.next} lang=${j.data.language} lead=${j.data.leadId || "-"} aiLimited=${j.data.aiLimited} ${JSON.stringify(j.data.debug || {})}]\n`);
    }
  } catch (e) {
    console.log("Request failed:", e.message);
  }
  rl.prompt();
});
