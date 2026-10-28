const express = require("express");
const controller = require("../controllers/apiKey.controller");
const authMiddleware = require("../middlewares/auth");
const { guard } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

const router = express.Router();
const M = ACL_MODULES.API_KEYS;

router.get("/me", authMiddleware, controller.me);
router.get("/", ...guard(M, P.VIEW), controller.list);
router.get("/:id", ...guard(M, P.VIEW), controller.getById);
router.post("/", ...guard(M, P.CREATE), controller.create);
router.put("/:id", ...guard(M, P.UPDATE), controller.update);
router.patch("/:id/status", ...guard(M, P.DISABLE), controller.setStatus);
router.post("/:id/regenerate", ...guard(M, P.UPDATE), controller.regenerate);
router.delete("/:id", ...guard(M, P.DELETE), controller.remove);

module.exports = router;
