const controller = require("../controllers/lead.controller");
const { buildCrudRouter } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

// Lead ka PATCH /:id/status = pipeline status (New, In review...), isActive toggle nahi
module.exports = buildCrudRouter({
  controller,
  module: ACL_MODULES.LEADS,
  only: ["list", "getById", "create", "update", "remove"],
  extend: (router, guard) => {
    router.get("/statuses", ...guard(P.VIEW), controller.statuses);
    router.get("/ref/:leadId", ...guard(P.VIEW), controller.getByLeadId);
    router.patch("/:id/status", ...guard(P.UPDATE), controller.updateStatus);
    router.patch("/:id/assign", ...guard(P.UPDATE), controller.assign);
    router.post("/:id/notes", ...guard(P.UPDATE), controller.addNote);
    router.post("/:id/crm-sync", ...guard(P.UPDATE), controller.resyncCrm);
  },
});
