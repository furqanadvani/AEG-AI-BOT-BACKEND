const controller = require("../controllers/query.controller");
const { buildCrudRouter } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

module.exports = buildCrudRouter({
  controller,
  module: ACL_MODULES.QUERIES,
  only: ["list", "getById", "create", "update", "remove"],
  extend: (router, guard) => {
    // { answer, status, addToKnowledge, topic }
    router.patch("/:id/answer", ...guard(P.UPDATE), controller.answer);
  },
});
