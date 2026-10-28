/**
 * Default Settings: pehli dafa seed hoti hain (scripts/seedDefaults.js). Phir sab frontend se editable.
 * Purani Excel "Settings" tab ki saari keys + backend control ki nayi keys.
 */
module.exports = [
  // ---- Business / bot identity (Excel Settings tab) ----
  { key: "BusinessName", value: "AEG Visa Consultancy", group: "business", label: "Business name" },
  { key: "AssistantName", value: "Ayesha", group: "business", label: "Assistant name" },
  { key: "AssistantGender", value: "female", group: "business", label: "Assistant gender (female/male)" },
  { key: "SupportPhone", value: "", group: "business", label: "Support phone" },
  { key: "OfficeHours", value: "", group: "business", label: "Office hours" },
  { key: "OfficeAddress", value: "", group: "business", label: "Office address" },
  { key: "FallbackAgentEmail", value: "", group: "business", label: "Fallback agent email (when no agent matches)" },
  { key: "BotTone", value: "", group: "bot", label: "Bot tone (empty = default)" },
  { key: "AskFeedback", value: "yes", type: "boolean", group: "bot", label: "Ask for a rating after a lead" },
  { key: "MaxMsgsPerMinute", value: "10", type: "number", group: "bot", label: "Max messages per customer per minute" },
  { key: "SkippedFieldValue", value: "Not shared (team will discuss)", group: "bot", label: "Value saved for a skipped question" },
  { key: "UnknownVisaTypeAction", value: "Apply", group: "bot", label: "Action for an unknown visa type (Apply / Refuse / Forward)" },
  { key: "MaxTravelMonthsAhead", value: "24", type: "number", group: "bot", label: "Latest travel date (months ahead)" },
  { key: "MinTravelDaysAhead", value: "0", type: "number", group: "bot", label: "Earliest travel date (days ahead)" },
  { key: "KnowledgeBudgetChars", value: "4500", type: "number", group: "bot", label: "Max knowledge characters sent to AI" },
  { key: "BotEnabled", value: "yes", type: "boolean", group: "bot", label: "Bot on (off = forward everything to the team)" },
  { key: "LeadStatuses", value: "New|In review|Documents pending|Submitted|Approved|Rejected|Closed|Cancelled|Not processed", type: "list", group: "bot", label: "Lead statuses" },
  { key: "NewLeadEmailEnabled", value: "yes", type: "boolean", group: "bot", label: "Email the agent on a new lead" },
  // ---- V19: conversation + refused demand ----
  { key: "AskNameFirst", value: "yes", type: "boolean", group: "bot", label: "Ask the customer's name first, then use it in the conversation" },
  { key: "RequireFullName", value: "no", type: "boolean", group: "bot", label: "Ask once for a surname when the customer gives only a first name" },
  { key: "WelcomeMessage", value: "", group: "bot", label: "Custom welcome message (empty = professional default). Placeholders: {assistant} {business}" },
  { key: "CaptureRefusedLeads", value: "yes", type: "boolean", group: "bot", label: "Refused country / visa type: take name + WhatsApp and save it as a lead" },
  { key: "RefusedLeadStatus", value: "Not processed", group: "bot", label: "Lead status for refused (not processed) demand" },
  { key: "ConfigCacheSeconds", value: "60", type: "number", group: "system", label: "Config cache in seconds (cleared instantly on edit)" },

  // ---- AI models (Excel Settings tab) ----
  { key: "UnderstandModel", value: "openai/gpt-oss-120b", group: "ai", label: "AI #1 (Understand) model" },
  { key: "ReplyModel", value: "openai/gpt-oss-120b", group: "ai", label: "AI #2 (Reply) model" },
  { key: "ReplyTemperature", value: "0.5", type: "number", group: "ai", label: "Reply temperature" },

  // ---- AI control & limits (naya) ----
  { key: "AiEnabled", value: "yes", type: "boolean", group: "ai", label: "AI master switch" },
  { key: "AiUnderstandEnabled", value: "yes", type: "boolean", group: "ai", label: "AI #1 Understand on" },
  { key: "AiReplyEnabled", value: "yes", type: "boolean", group: "ai", label: "AI #2 Reply on" },
  { key: "AiDailyTokenLimit", value: "0", type: "number", group: "ai_limits", label: "Daily token limit (0 = unlimited)" },
  { key: "AiMonthlyTokenLimit", value: "0", type: "number", group: "ai_limits", label: "Monthly token limit (0 = unlimited)" },
  { key: "AiDailyRequestLimit", value: "0", type: "number", group: "ai_limits", label: "Daily AI requests limit (0 = unlimited)" },
  { key: "AiMaxCallsPerSession", value: "0", type: "number", group: "ai_limits", label: "Max AI calls per conversation (0 = unlimited)" },
  { key: "AiWarnAtPercent", value: "80", type: "number", group: "ai_limits", label: "Warning notification at (%)" },
  { key: "AiLimitNotifyEmails", value: "", type: "list", group: "ai_limits", label: "Emails to notify on limits (comma separated)" },
  { key: "FallbackModel", value: "openai/gpt-oss-20b", group: "ai", label: "Fallback model if the main model fails (empty = no fallback)" },
  { key: "AiMaxRetries", value: "1", type: "number", group: "ai", label: "Retries on the same model on 429 / timeout / 5xx (0-3)" },
  { key: "AiTimeoutMs", value: "15000", type: "number", group: "ai", label: "AI request timeout (ms)" },
  { key: "AiUnderstandMaxTokens", value: "800", type: "number", group: "ai", label: "AI #1 max output tokens" },
  { key: "AiReplyMaxTokens", value: "900", type: "number", group: "ai", label: "AI #2 max output tokens" },
  { key: "AiMaxConcurrent", value: "40", type: "number", group: "ai", label: "Max AI requests in flight at once per server (queue protects from 429)" },
  { key: "AiQueueTimeoutMs", value: "8000", type: "number", group: "ai", label: "Max wait in the AI queue before rule-based reply (ms)" },
  { key: "AiTotalBudgetMs", value: "22000", type: "number", group: "ai", label: "Max total time for one AI step incl. retries (ms)" },
  { key: "UnderstandPromptAppend", value: "", group: "ai", label: "Extra instructions for AI #1 (Understand)" },
  { key: "ReplyPromptAppend", value: "", group: "ai", label: "Extra instructions for AI #2 (Reply)" },
];
