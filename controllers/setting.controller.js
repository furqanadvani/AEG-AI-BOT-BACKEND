const settingService = require("../services/setting.service");
const { createCrudController } = require("../utils/crudFactory");
const { successResponse } = require("../utils/apiResponse");

const base = createCrudController(settingService.crud, { entity: "Setting" });

/** GET /api/settings/map: { Key: Value } (frontend forms ke liye) */
const getMap = async (req, res) => successResponse(res, "Settings fetched successfully", await settingService.getMap());

/** PUT /api/settings  { values: { Key: Value } } */
const bulkSetValues = async (req, res) =>
  successResponse(res, "Settings updated successfully", await settingService.bulkSetValues((req.body || {}).values, req.user));

const seedDefaults = async (req, res) => successResponse(res, "Default settings seeded", await settingService.seedDefaults());

module.exports = { ...base, getMap, bulkSetValues, seedDefaults };
