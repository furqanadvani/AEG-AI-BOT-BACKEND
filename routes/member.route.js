const express = require("express");

const router = express.Router();

const authMiddleware = require("../middlewares/auth");
const {
  roleAccessMiddleware,
} = require("../middlewares/acl");

const memberController = require("../controllers/member.controller");

const {
  ACL_MODULES,
  ACL_PERMISSIONS,
} = require("../utils/aclConstants");

router.post(
  "/",
  authMiddleware,
  roleAccessMiddleware(
    ACL_MODULES.MEMBERS,
    ACL_PERMISSIONS.CREATE
  ),
  memberController.addMember
);

router.get(
  "/",
  authMiddleware,
  roleAccessMiddleware(
    ACL_MODULES.MEMBERS,
    ACL_PERMISSIONS.VIEW
  ),
  memberController.getMembers
);

router.get(
  "/:id",
  authMiddleware,
  roleAccessMiddleware(
    ACL_MODULES.MEMBERS,
    ACL_PERMISSIONS.VIEW
  ),
  memberController.getMemberById
);

router.put(
  "/:id",
  authMiddleware,
  roleAccessMiddleware(
    ACL_MODULES.MEMBERS,
    ACL_PERMISSIONS.UPDATE
  ),
  memberController.updateMember
);

router.patch(
  "/:id/status",
  authMiddleware,
  roleAccessMiddleware(
    ACL_MODULES.MEMBERS,
    ACL_PERMISSIONS.DISABLE
  ),
  memberController.updateMemberStatus
);

module.exports = router;