/**
 * Excel / Google Sheet rows -> Mongo documents. Column names bilkul wahi jo n8n workflow use karta tha.
 * scripts/importFromExcel.js aur tests dono isi ko use karte hain.
 */
const DEFAULTS = require("../constants/defaultSettings");
const s = (v) => String(v ?? "").trim();
// Google Sheets / Excel formula errors (e.g. +92 number ko formula samajh lena) DB mein nahi jane chahiye
const SHEET_ERROR = /^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)$/i;
const isSheetError = (v) => SHEET_ERROR.test(s(v));
const YES = /^(yes|y|true|1|haan|han|ji|jee|active|on)$/i;
const yes = (v) => YES.test(s(v));
const yesDefault = (v) => (s(v) === "" ? true : yes(v)); // khali = active (n8n jaisa)
const list = (v) => s(v).split(/[|,;\n]/).map((x) => x.trim()).filter(Boolean);
const action = (v) => { const a = s(v).toLowerCase(); return a.startsWith("ref") ? "Refuse" : a.startsWith("for") ? "Forward" : "Apply"; };
const json = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
const date = (v) => { const d = new Date(s(v)); return isNaN(d) ? undefined : d; };
const QTYPES = ["text", "country", "visatype", "name", "phone", "number", "choice", "date", "duration"];

const MAPPERS = {
  Settings: {
    model: "Setting",
    key: ["key"],
    map: (r) => {
      if (!s(r.Key)) return null;
      if (isSheetError(r.Value)) return { __skip: `Setting "${s(r.Key)}" has the value ${s(r.Value)} in the sheet and was skipped. Set the correct value in Settings.` };
      const def = DEFAULTS.find((d) => d.key === s(r.Key));
      return {
        key: s(r.Key),
        value: s(r.Value),
        ...(s(r.Meaning) && { description: s(r.Meaning) }),
        ...(def && { type: def.type || "string", group: def.group, label: def.label }),
      };
    },
  },

  Countries: {
    model: "Country", key: ["name"],
    map: (r) => (s(r.Country) ? { name: s(r.Country), aliases: list(r.Aliases), cities: list(r.Cities), isActive: yes(r.Active), notes: s(r.Notes) } : null),
  },

  VisaTypes: {
    model: "VisaType", key: ["country", "name"],
    map: (r) => (s(r.VisaType) ? { country: s(r.Country) || "ALL", name: s(r.VisaType), aliases: list(r.Aliases), action: action(r.Action), customerMessage: s(r.CustomerMessage), isActive: true } : null),
  },

  Questions: {
    model: "Question", key: ["country", "visaType", "field"],
    map: (r) => {
      if (!s(r.Field)) return null;
      const type = s(r.Type).toLowerCase() || "text";
      return {
        country: s(r.Country) || "ALL", visaType: s(r.VisaType) || "ALL", field: s(r.Field), label: s(r.Label) || s(r.Field),
        whatToAsk: s(r.WhatToAsk), whyWeAsk: s(r.WhyWeAsk), type: QTYPES.includes(type) ? type : "text", options: s(r.Options),
        required: yes(r.Required), askWhen: s(r.AskWhen), order: Number(r.Order) || 999, isActive: yesDefault(r.Active),
      };
    },
  },

  Knowledge: {
    model: "Knowledge", key: ["country", "visaType", "topic"],
    map: (r) => (s(r.Info) ? { country: s(r.Country) || "ALL", visaType: s(r.VisaType) || "ALL", topic: s(r.Topic) || "General", info: s(r.Info), isActive: yesDefault(r.Active) } : null),
  },

  Agents: {
    model: "Agent", key: ["country", "email"],
    map: (r) => (s(r.AgentEmail) ? { country: s(r.Country) || "ALL", name: s(r.AgentName) || s(r.AgentEmail), email: s(r.AgentEmail).toLowerCase(), isActive: yesDefault(r.Active) } : null),
  },

  Leads: {
    model: "Lead", key: ["leadId"],
    map: (r) => (s(r.LeadID) ? {
      leadId: s(r.LeadID).toUpperCase(), status: s(r.Status) || "New", assignedAgent: s(r.AssignedAgent) || "Unassigned", fullName: s(r.FullName),
      whatsapp: s(r.WhatsApp), country: s(r.Country), visaType: s(r.VisaType), travelDate: s(r.TravelDate), duration: s(r.Duration),
      travellers: s(r.Travellers), relationship: s(r.Relationship), bankStatement: s(r.BankStatement), cityToStay: s(r.CityToStay),
      otherDetails: s(r.OtherDetails), openQuestions: s(r.OpenQuestions), summary: s(r.Summary), language: s(r.Language), sessionId: s(r.SessionID),
      createdAt: date(r.CreatedAt), updatedAt: date(r.LastUpdated),
    } : null),
  },

  Queries: {
    model: "Query", key: ["queryId"],
    map: (r) => (s(r.QueryID) ? {
      queryId: s(r.QueryID), type: ["UNANSWERED", "HUMAN", "LOST", "GENERAL", "COMPLAINT"].includes(s(r.Type).toUpperCase()) ? s(r.Type).toUpperCase() : "GENERAL",
      question: s(r.Question), country: s(r.Country), visaType: s(r.VisaType), fullName: s(r.FullName), whatsapp: s(r.WhatsApp),
      assignedAgent: s(r.AssignedAgent), status: ["Open", "In progress", "Answered", "Closed"].includes(s(r.Status)) ? s(r.Status) : "Open",
      sessionId: s(r.SessionID), createdAt: date(r.CreatedAt),
    } : null),
  },

  Sessions: {
    model: "Session", key: ["sessionId"],
    map: (r) => (s(r.SessionID) ? {
      sessionId: s(r.SessionID), stage: s(r.Stage) || "collecting", language: s(r.Language), state: json(s(r.State), {}), history: json(s(r.History), []),
      createdAt: date(r.CreatedAt), updatedAt: date(r.UpdatedAt), lastMessageAt: date(r.UpdatedAt),
    } : null),
  },
};

// Import order: config pehle, phir data
const ORDER = ["Settings", "Countries", "VisaTypes", "Questions", "Knowledge", "Agents", "Leads", "Queries", "Sessions"];

module.exports = { MAPPERS, ORDER, isSheetError };
