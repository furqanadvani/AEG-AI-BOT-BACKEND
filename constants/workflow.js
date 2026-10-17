/** Workflow / domain constants (n8n sheets ke columns aur enums) */
module.exports = {
  VISA_ACTIONS: ["Apply", "Refuse", "Forward"],
  QUESTION_TYPES: ["text", "country", "visatype", "name", "phone", "number", "choice", "date", "duration"],
  QUERY_TYPES: ["UNANSWERED", "HUMAN", "LOST", "GENERAL", "COMPLAINT"],
  QUERY_STATUSES: ["Open", "In progress", "Answered", "Closed"],
  DEFAULT_LEAD_STATUSES: ["New", "In review", "Documents pending", "Submitted", "Approved", "Rejected", "Closed", "Cancelled"],
  CHANNELS: ["web", "whatsapp", "api", "test"],
  CUSTOMER_SOURCES: ["chatbot", "whatsapp", "walk-in", "facebook", "instagram", "website", "referral", "crm", "other"],
  INTEGRATION_TYPES: ["ai", "crm", "whatsapp", "email"],
  SETTING_TYPES: ["string", "number", "boolean", "json", "list"],
};
