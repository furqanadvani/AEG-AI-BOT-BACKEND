const controller = require("../controllers/customer.controller");
const { buildCrudRouter } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

module.exports = buildCrudRouter({
  controller,
  module: ACL_MODULES.CUSTOMERS,
  extend: (router, guard) => {
    router.get("/by-phone/:phone", ...guard(P.VIEW), controller.findByPhone);
    router.get("/:id/profile", ...guard(P.VIEW), controller.getProfile);
  },
});
