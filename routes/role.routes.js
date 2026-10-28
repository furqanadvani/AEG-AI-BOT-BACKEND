const express = require("express");

const router = express.Router();

const authMiddleware = require("../middlewares/auth");
const {
  roleAccessMiddleware,
} = require("../middlewares/acl");

const roleController = require("../controllers/role.controller");

const {
  ACL_MODULES,
  ACL_PERMISSIONS,
} = require("../utils/aclConstants");

// ACL modules list (role editor ke liye): login hona kafi hai
router.get("/modules", authMiddleware, roleController.getModules);

router.post(
  "/",
  authMiddleware,
  roleAccessMiddleware(
    ACL_MODULES.MANAGE_ROLES,
    ACL_PERMISSIONS.CREATE
  ),
  roleController.createRole
);

router.get(
  "/",
  authMiddleware,
  roleAccessMiddleware(
    ACL_MODULES.MANAGE_ROLES,
    ACL_PERMISSIONS.VIEW
  ),
  roleController.getRoles
);

router.get(
  "/:id",
  authMiddleware,
  roleAccessMiddleware(
    ACL_MODULES.MANAGE_ROLES,
    ACL_PERMISSIONS.VIEW
  ),
  roleController.getRoleById
);

router.put(
  "/:id",
  authMiddleware,
  roleAccessMiddleware(
    ACL_MODULES.MANAGE_ROLES,
    ACL_PERMISSIONS.UPDATE
  ),
  roleController.updateRole
);

router.patch(
  "/:id/status",
  authMiddleware,
  roleAccessMiddleware(
    ACL_MODULES.MANAGE_ROLES,
    ACL_PERMISSIONS.DISABLE
  ),
  roleController.updateRoleStatus
);

module.exports = router;