const test = require("node:test");
const assert = require("node:assert");
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-key-123456789012345678901234";
const { encrypt, decrypt, mask } = require("../utils/crypto");
const { buildListQuery } = require("../utils/queryBuilder");
const { MAPPERS } = require("../utils/excelMappers");
const { normalizePhone } = require("../utils/phone");

test("secrets encrypt/decrypt roundtrip + mask", () => {
  const e = encrypt("gsk_secret_value");
  assert.notEqual(e, "gsk_secret_value");
  assert.equal(decrypt(e), "gsk_secret_value");
  assert.equal(mask("gsk_secret_value"), "gsk_••••alue");
});

test("list query builder: paging, search, filters, sort", () => {
  const q = buildListQuery({ page: "2", limit: "500", search: "dub(ai", status: "New,In review", isActive: "true", sort: "-createdAt name" }, { searchFields: ["name"], filterFields: ["status"] });
  assert.equal(q.page, 2);
  assert.equal(q.limit, 200);
  assert.equal(q.skip, 200);
  assert.deepEqual(q.filter.status, { $in: ["New", "In review"] });
  assert.equal(q.filter.isActive, true);
  assert.ok(q.filter.$or[0].name instanceof RegExp);
  assert.deepEqual(q.sort, { createdAt: -1, name: 1 });
});

test("excel mappers keep n8n column semantics", () => {
  assert.deepEqual(MAPPERS.Countries.map({ Country: "UAE", Aliases: "Dubai, Emirates", Cities: "Dubai|Abu Dhabi", Active: "Yes", Notes: "" }),
    { name: "UAE", aliases: ["Dubai", "Emirates"], cities: ["Dubai", "Abu Dhabi"], isActive: true, notes: "" });
  assert.equal(MAPPERS.VisaTypes.map({ VisaType: "Work", Action: "refuse" }).action, "Refuse");
  assert.equal(MAPPERS.VisaTypes.map({ VisaType: "Work" }).country, "ALL");
  const q = MAPPERS.Questions.map({ Field: "travellers", Type: "Number", Required: "yes", Order: "3", Active: "" });
  assert.equal(q.type, "number"); assert.equal(q.required, true); assert.equal(q.order, 3); assert.equal(q.isActive, true);
  assert.equal(MAPPERS.Countries.map({ Country: "" }), null);
  assert.deepEqual(MAPPERS.Sessions.map({ SessionID: "x", State: '{"a":1}', History: "bad" }).state, { a: 1 });
});

test("phone normalisation (customer identity)", () => {
  assert.equal(normalizePhone("0300 1234567"), "+923001234567");
  assert.equal(normalizePhone("+92 300 1234567"), "+923001234567");
  assert.equal(normalizePhone("۰۳۰۰۱۲۳۴۵۶۷"), "+923001234567");
  assert.equal(normalizePhone("12"), null);
});
