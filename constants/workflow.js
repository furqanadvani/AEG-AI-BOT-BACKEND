/** Workflow / domain constants (n8n sheets ke columns aur enums) */
module.exports = {
  VISA_ACTIONS: ["Apply", "Refuse", "Forward"],
  QUESTION_TYPES: ["text", "country", "visatype", "name", "phone", "number", "choice", "date", "duration"],
  // V19: VISA_TYPE (Forward), UPDATE_AFTER_SUBMIT aur REFUSED engine pehle se bhejta tha lekin enum mein nahi the -> Query save fail -> "technical issue"
  QUERY_TYPES: ["UNANSWERED", "HUMAN", "LOST", "GENERAL", "COMPLAINT", "VISA_TYPE", "UPDATE_AFTER_SUBMIT", "REFUSED"],
  QUERY_STATUSES: ["Open", "In progress", "Answered", "Closed", "Lost"], // V19: cancel wala record "Lost" status ke saath aata hai
  DEFAULT_LEAD_STATUSES: ["New", "In review", "Documents pending", "Submitted", "Approved", "Rejected", "Closed", "Cancelled", "Not processed"],
  // V19: jo country / visa type hum process nahi karte, us ki demand bhi lead banti hai (is status ke saath)
  REFUSED_LEAD_STATUS: "Not processed",
  CHANNELS: ["web", "whatsapp", "api", "test"],
  CUSTOMER_SOURCES: ["chatbot", "whatsapp", "walk-in", "facebook", "instagram", "website", "referral", "crm", "other"],
  INTEGRATION_TYPES: ["ai", "crm", "whatsapp", "email"],
  SETTING_TYPES: ["string", "number", "boolean", "json", "list"],
};
