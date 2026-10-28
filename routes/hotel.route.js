const express = require("express");

const {
    createHotelController,
    getHotelsController,
    getHotelByIdController,
    updateHotelController,
    deleteHotelController,
    toggleHotelStatusController,
} = require("../controllers/hotel.controller");
const authMiddleware = require("../middlewares/auth");
const { roleAccessMiddleware } = require("../middlewares/acl");
const { ACL_MODULES, ACL_PERMISSIONS } = require("../utils/aclConstants");

const router = express.Router();

router.post("/", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.HOTEL,
        ACL_PERMISSIONS.CREATE
    ), createHotelController);

router.get("/", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.HOTEL,
        ACL_PERMISSIONS.VIEW
    ), getHotelsController);

router.patch("/:id/status", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.HOTEL,
        ACL_PERMISSIONS.DISABLE
    ), toggleHotelStatusController);

router.get("/:id", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.HOTEL,
        ACL_PERMISSIONS.VIEW
    ), getHotelByIdController);

router.put("/:id", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.HOTEL,
        ACL_PERMISSIONS.UPDATE
    ), updateHotelController);

router.delete("/:id", authMiddleware,
    roleAccessMiddleware(
        ACL_MODULES.HOTEL,
        ACL_PERMISSIONS.DELETE
    ), deleteHotelController);

module.exports = router;