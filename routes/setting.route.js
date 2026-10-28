const controller = require("../controllers/setting.controller");
const { buildCrudRouter } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

module.exports = buildCrudRouter({
  controller,
  module: ACL_MODULES.SETTINGS,
  bulkKey: ["key"],
  extend: (router, guard) => {
    router.get("/map", ...guard(P.VIEW), controller.getMap);
    router.put("/", ...guard(P.UPDATE), controller.bulkSetValues);
    router.post("/seed-defaults", ...guard(P.CREATE), controller.seedDefaults);
  },
});
