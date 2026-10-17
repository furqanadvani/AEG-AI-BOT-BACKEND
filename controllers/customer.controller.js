const customerService = require("../services/customer.service");
const { createCrudController } = require("../utils/crudFactory");
const { successResponse } = require("../utils/apiResponse");

const base = createCrudController(customerService, { entity: "Customer" });

const getProfile = async (req, res) => successResponse(res, "Customer profile fetched successfully", await customerService.getProfile(req.params.id));

const findByPhone = async (req, res) => successResponse(res, "Customer fetched successfully", await customerService.findByPhone(req.params.phone));

module.exports = { ...base, getProfile, findByPhone };
