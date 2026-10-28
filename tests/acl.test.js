const test = require("node:test");
const assert = require("node:assert");
const { hasPermission } = require("../middlewares/acl");
const { isPermissionSubsetOrEqual, normalizePermissions } = require("../utils/permissions");

const role = { permissions: [{ key: "LEADS", access: ["VIEW", "UPDATE"] }, { key: "COUNTRIES", access: ["ALL"] }] };

test("hasPermission: module access", () => {
  assert.equal(hasPermission({}, role, "LEADS", "VIEW"), true);
  assert.equal(hasPermission({}, role, "LEADS", "DELETE"), false);
  assert.equal(hasPermission({}, role, "COUNTRIES", "DELETE"), true);
  assert.equal(hasPermission({}, role, "SETTINGS", "VIEW"), false);
  assert.equal(hasPermission({ isSuperAdmin: true }, null, "ANY", "DELETE"), true);
  assert.equal(hasPermission({}, { permissions: [{ key: "ALL", access: ["ALL"] }] }, "X", "DELETE"), true);
});

test("cannot grant more than own permissions", () => {
  assert.equal(isPermissionSubsetOrEqual([{ key: "LEADS", access: ["VIEW"] }], role.permissions), true);
  assert.equal(isPermissionSubsetOrEqual([{ key: "LEADS", access: ["DELETE"] }], role.permissions), false);
  assert.equal(isPermissionSubsetOrEqual([{ key: "SETTINGS", access: ["VIEW"] }], role.permissions), false);
});

test("normalizePermissions validates and merges", () => {
  assert.deepEqual(normalizePermissions([{ key: "leads", access: ["view"] }, { key: "LEADS", access: ["UPDATE"] }]), [{ key: "LEADS", access: ["VIEW", "UPDATE"] }]);
  assert.throws(() => normalizePermissions([{ key: "NOPE", access: ["VIEW"] }]), /Invalid permission module/);
  assert.throws(() => normalizePermissions([{ key: "LEADS", access: ["FLY"] }]), /Invalid access/);
});
