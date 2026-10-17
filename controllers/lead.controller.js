const leadService = require("../services/lead.service");
const { createCrudController } = require("../utils/crudFactory");
const { successResponse } = require("../utils/apiResponse");

const base = createCrudController(leadService, { entity: "Lead" });

module.exports = {
  ...base,
  updateStatus: async (req, res) => successResponse(res, "Lead status updated successfully", await leadService.updateStatus(req.params.id, (req.body || {}).status, req.user)),
  assign: async (req, res) => successResponse(res, "Lead assigned successfully", await leadService.assign(req.params.id, (req.body || {}).agentId, req.user)),
  addNote: async (req, res) => successResponse(res, "Note added successfully", await leadService.addNote(req.params.id, (req.body || {}).text, req.user)),
  getByLeadId: async (req, res) => successResponse(res, "Lead fetched successfully", await leadService.getByLeadId(req.params.leadId)),
  resyncCrm: async (req, res) => successResponse(res, "CRM sync attempted", await leadService.resyncCrm(req.params.id)),
  statuses: async (req, res) => successResponse(res, "Lead statuses fetched successfully", await leadService.statuses()),
};
