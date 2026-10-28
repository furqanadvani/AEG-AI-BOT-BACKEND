const aiService = require("../services/ai.service");
const settingService = require("../services/setting.service");
const { successResponse } = require("../utils/apiResponse");
const AppError = require("../utils/AppError");

const AI_KEYS = settingService.DEFAULTS.filter((d) => ["ai", "ai_limits"].includes(d.group)).map((d) => d.key);

module.exports = {
  status: async (req, res) => successResponse(res, "AI status fetched successfully", await aiService.status()),

  usage: async (req, res) => successResponse(res, "AI usage fetched successfully", await aiService.history(req.query)),

  /** GET: sirf AI wali settings */
  getSettings: async (req, res) => {
    const map = await settingService.getMap();
    return successResponse(res, "AI settings fetched successfully", Object.fromEntries(AI_KEYS.map((k) => [k, map[k] ?? ""])));
  },

  /** PUT { values: { AiDailyTokenLimit: "200000", AiEnabled: "no" } }: sirf AI keys allowed */
  updateSettings: async (req, res) => {
    const values = (req.body || {}).values || {};
    const bad = Object.keys(values).filter((k) => !AI_KEYS.includes(k));
    if (bad.length) throw AppError.badRequest(`Not an AI setting: ${bad.join(", ")}`);
    await settingService.bulkSetValues(values, req.user);
    return successResponse(res, "AI settings updated successfully", await aiService.status());
  },

  /** Ek chhoti test call (limit counter mein shamil) */
  test: async (req, res) => {
    const map = await settingService.getMap();
    const r = await aiService.run({
      purpose: "test",
      payload: { model: map.ReplyModel || "openai/gpt-oss-120b", temperature: 0, max_completion_tokens: 20, messages: [{ role: "user", content: "Reply with exactly: OK" }] },
    });
    return successResponse(res, r.ok ? "AI is working" : "AI test failed", {
      ok: r.ok, limited: !!r.limited, reason: r.reason || null, error: r.error || null,
      reply: r.json?.choices?.[0]?.message?.content || null, usage: r.usage || null,
    });
  },
};
