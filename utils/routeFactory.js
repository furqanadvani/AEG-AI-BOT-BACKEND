/**
 * Standard ACL router: har route par auth + roleAccessMiddleware(module, action).
 * Same pattern jo aapke visa/hotel routes mein tha, bas ab har jagah dobara likhna nahi parta.
 *
 *   buildCrudRouter({ controller, module: ACL_MODULES.COUNTRIES, bulkKey: ["name"] })
 */
const express = require("express");
const authMiddleware = require("../middlewares/auth");
const { roleAccessMiddleware } = require("../middlewares/acl");
const { ACL_PERMISSIONS } = require("./aclConstants");

const guard = (module, action) => [authMiddleware, roleAccessMiddleware(module, action)];

const buildCrudRouter = ({
  controller,
  module,
  only = ["list", "getById", "create", "update", "setStatus", "remove"],
  bulkKey = null,
  extend = null, // (router, guard) => custom routes (ye CRUD se PEHLE lagte hain)
}) => {
  const router = express.Router();
  const P = ACL_PERMISSIONS;

  if (extend) extend(router, (action) => guard(module, action));

  if (bulkKey) router.post("/bulk", ...guard(module, P.CREATE), controller.bulkUpsert(bulkKey));
  if (only.includes("list")) router.get("/", ...guard(module, P.VIEW), controller.list);
  if (only.includes("getById")) router.get("/:id", ...guard(module, P.VIEW), controller.getById);
  if (only.includes("create")) router.post("/", ...guard(module, P.CREATE), controller.create);
  if (only.includes("update")) router.put("/:id", ...guard(module, P.UPDATE), controller.update);
  if (only.includes("setStatus")) router.patch("/:id/status", ...guard(module, P.DISABLE), controller.setStatus);
  if (only.includes("remove")) router.delete("/:id", ...guard(module, P.DELETE), controller.remove);

  return router;
};

module.exports = { buildCrudRouter, guard };
