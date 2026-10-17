const express = require("express");

const {
  create,
  getAll,
  getById,
  update,
  toggleStatus,
} = require("../controllers/currency.controller");
const { guard } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

const router = express.Router();
const M = ACL_MODULES.CURRENCY;

// FIX: pehle in routes par koi auth/ACL nahi tha
router.post("/", ...guard(M, P.CREATE), create);
router.get("/", ...guard(M, P.VIEW), getAll);
router.get("/:id", ...guard(M, P.VIEW), getById);
router.patch("/:id", ...guard(M, P.UPDATE), update);
router.patch("/:id/status", ...guard(M, P.DISABLE), toggleStatus);

module.exports = router;
