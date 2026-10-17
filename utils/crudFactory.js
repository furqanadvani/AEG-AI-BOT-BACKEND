/**
 * Reusable CRUD: ek model do, poora service + controller mil jata hai.
 * Countries, VisaTypes, Questions, Knowledge, Agents, Settings, Leads, Queries... sab isi se bane hain.
 *
 *   const service = createCrudService(Country, { searchFields: ["name"], onChange: invalidateConfig });
 *   const controller = createCrudController(service, { entity: "Country" });
 */
const mongoose = require("mongoose");
const AppError = require("./AppError");
const HTTP_STATUS = require("../constants/httpStatus");
const { successResponse } = require("./apiResponse");
const { buildListQuery, paginationMeta } = require("./queryBuilder");

const assertId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw AppError.badRequest("Invalid id");
};

const pick = (obj, fields) => {
  if (!fields) return { ...obj };
  const out = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
};

const createCrudService = (Model, opts = {}) => {
  const {
    entity = Model.modelName,
    searchFields = [],
    filterFields = [],
    defaultSort = "-createdAt",
    populate = null,
    select = null,
    writableFields = null, // whitelist (mass-assignment se bachao)
    statusField = "isActive",
    beforeCreate = null, // async (data, ctx) => data
    beforeUpdate = null, // async (data, doc, ctx) => data
    afterWrite = null, // async (doc, action, ctx)
    onChange = null, // config cache invalidate wagera
    baseFilter = {},
  } = opts;

  const withPopulate = (q) => {
    if (populate) q = q.populate(populate);
    if (select) q = q.select(select);
    return q;
  };

  const changed = async (doc, action, ctx) => {
    if (afterWrite) await afterWrite(doc, action, ctx);
    if (onChange) await onChange(entity, action, doc);
  };

  const service = {
    Model,
    entity,

    async list(query = {}, extraFilter = {}) {
      const { filter, sort, page, limit, skip } = buildListQuery(query, {
        searchFields, filterFields, defaultSort, baseFilter: { ...baseFilter, ...extraFilter },
      });
      const [items, total] = await Promise.all([
        withPopulate(Model.find(filter).sort(sort).skip(skip).limit(limit)).lean(),
        Model.countDocuments(filter),
      ]);
      return { items, pagination: paginationMeta(total, page, limit) };
    },

    async findAll(filter = {}) {
      return Model.find({ ...baseFilter, ...filter }).sort(defaultSort).lean();
    },

    async getById(id) {
      assertId(id);
      const doc = await withPopulate(Model.findOne({ _id: id, ...baseFilter })).lean();
      if (!doc) throw AppError.notFound(`${entity} not found`);
      return doc;
    },

    async create(payload, ctx = {}) {
      let data = pick(payload, writableFields);
      if (beforeCreate) data = await beforeCreate(data, ctx);
      if (ctx.user && Model.schema.path("createdBy")) data.createdBy = ctx.user.id || null;
      const doc = await Model.create(data);
      await changed(doc, "create", ctx);
      return service.getById(doc._id);
    },

    async update(id, payload, ctx = {}) {
      assertId(id);
      const doc = await Model.findOne({ _id: id, ...baseFilter });
      if (!doc) throw AppError.notFound(`${entity} not found`);
      let data = pick(payload, writableFields);
      delete data._id;
      delete data.createdAt;
      delete data.updatedAt;
      if (beforeUpdate) data = await beforeUpdate(data, doc, ctx);
      if (ctx.user && Model.schema.path("updatedBy")) data.updatedBy = ctx.user.id || null;
      doc.set(data);
      await doc.save();
      await changed(doc, "update", ctx);
      return service.getById(doc._id);
    },

    async setStatus(id, value, ctx = {}) {
      assertId(id);
      const doc = await Model.findOne({ _id: id, ...baseFilter });
      if (!doc) throw AppError.notFound(`${entity} not found`);
      // body mein value na ho to toggle
      doc[statusField] = typeof value === "boolean" ? value : !doc[statusField];
      await doc.save();
      await changed(doc, "status", ctx);
      return service.getById(doc._id);
    },

    async remove(id, ctx = {}) {
      assertId(id);
      const doc = await Model.findOneAndDelete({ _id: id, ...baseFilter });
      if (!doc) throw AppError.notFound(`${entity} not found`);
      await changed(doc, "delete", ctx);
      return { _id: doc._id };
    },

    /** Bulk upsert (Excel import / frontend bulk edit). `key` = unique fields */
    async bulkUpsert(rows = [], key = [], ctx = {}) {
      if (!Array.isArray(rows) || !rows.length) throw AppError.badRequest("rows array is required");
      if (rows.length > 2000) throw AppError.badRequest("Max 2000 rows per request");
      let created = 0, updated = 0;
      const errors = [];
      for (let i = 0; i < rows.length; i++) {
        try {
          let data = pick(rows[i], writableFields);
          if (beforeCreate) data = await beforeCreate(data, { ...ctx, bulk: true });
          const where = key.length ? Object.fromEntries(key.map((k) => [k, data[k]])) : null;
          const existing = where ? await Model.findOne(where) : null;
          if (existing) { existing.set(data); await existing.save(); updated++; }
          else { await Model.create(data); created++; }
        } catch (e) {
          errors.push({ row: i + 1, message: e.message });
        }
      }
      if (onChange) await onChange(entity, "bulk", null);
      return { created, updated, failed: errors.length, errors: errors.slice(0, 50) };
    },
  };

  return service;
};

const createCrudController = (service, { entity = service.entity } = {}) => {
  const ctxOf = (req) => ({ user: req.user, apiKey: req.apiKey, ip: req.ip });

  return {
    list: async (req, res) => {
      const { items, pagination } = await service.list(req.query);
      return successResponse(res, `${entity} list fetched successfully`, items, HTTP_STATUS.OK, { pagination });
    },
    getById: async (req, res) => {
      const doc = await service.getById(req.params.id);
      return successResponse(res, `${entity} fetched successfully`, doc);
    },
    create: async (req, res) => {
      const doc = await service.create(req.body || {}, ctxOf(req));
      return successResponse(res, `${entity} created successfully`, doc, HTTP_STATUS.CREATED);
    },
    update: async (req, res) => {
      const doc = await service.update(req.params.id, req.body || {}, ctxOf(req));
      return successResponse(res, `${entity} updated successfully`, doc);
    },
    setStatus: async (req, res) => {
      const body = req.body || {};
      const value = typeof body.isActive === "boolean" ? body.isActive : body.status;
      const doc = await service.setStatus(req.params.id, value, ctxOf(req));
      return successResponse(res, `${entity} status updated successfully`, doc);
    },
    remove: async (req, res) => {
      const result = await service.remove(req.params.id, ctxOf(req));
      return successResponse(res, `${entity} deleted successfully`, result);
    },
    bulkUpsert: (key) => async (req, res) => {
      const result = await service.bulkUpsert((req.body || {}).rows, key, ctxOf(req));
      return successResponse(res, `${entity} bulk import completed`, result);
    },
  };
};

module.exports = { createCrudService, createCrudController, assertId };
