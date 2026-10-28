const express = require("express");

const {
    createVisaController,
    getVisasController,
    getVisaByIdController,
    updateVisaController,
    deleteVisaController,
    toggleVisaStatusController,
} = require("../controllers/visa.controller");
const { roleAccessMiddleware } = require("../middlewares/acl");
const { ACL_MODULES, ACL_PERMISSIONS } = require("../utils/aclConstants");
const authMiddleware = require("../middlewares/auth");

const router = express.Router();

router.post("/", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.VISA,
        ACL_PERMISSIONS.CREATE
    ), createVisaController);

router.get("/", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.VISA,
        ACL_PERMISSIONS.VIEW
    ), getVisasController);

router.get("/:id", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.VISA,
        ACL_PERMISSIONS.VIEW
    ), getVisaByIdController);

router.put("/:id", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.VISA,
        ACL_PERMISSIONS.UPDATE
    ), updateVisaController);

router.patch("/:id/status", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.VISA,
        ACL_PERMISSIONS.DISABLE
    ), toggleVisaStatusController);

router.delete("/:id", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.VISA,
        ACL_PERMISSIONS.DELETE
    ), deleteVisaController);

module.exports = router;