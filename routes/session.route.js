const controller = require("../controllers/session.controller");
const { buildCrudRouter } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

module.exports = buildCrudRouter({
  controller,
  module: ACL_MODULES.SESSIONS,
  only: ["list", "getById", "remove"],
  extend: (router, guard) => {
    router.get("/:id/transcript", ...guard(P.VIEW), controller.transcript);
    router.post("/:id/reset", ...guard(P.UPDATE), controller.reset);
    router.patch("/:id/takeover", ...guard(P.UPDATE), controller.takeover);
  },
});
