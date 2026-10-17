const dashboardService = require("../services/dashboard.service");
const { successResponse } = require("../utils/apiResponse");

module.exports = {
  stats: async (req, res) => successResponse(res, "Dashboard stats fetched successfully", await dashboardService.stats(req.query)),
};
