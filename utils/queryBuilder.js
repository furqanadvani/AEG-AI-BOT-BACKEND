/**
 * List endpoints ke liye ek hi query builder:
 *   ?page=1&limit=20&search=dubai&sort=-createdAt&isActive=true&country=UAE&from=2026-01-01&to=2026-12-31
 */
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const castValue = (v) => {
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
};

const buildListQuery = (query = {}, options = {}) => {
  const {
    searchFields = [],
    filterFields = [],
    defaultSort = "-createdAt",
    maxLimit = 200,
    dateField = "createdAt",
    baseFilter = {},
  } = options;

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || 20));
  const filter = { ...baseFilter };

  if (query.search && searchFields.length) {
    const rx = new RegExp(escapeRegex(String(query.search).trim().slice(0, 100)), "i");
    filter.$or = searchFields.map((f) => ({ [f]: rx }));
  }

  for (const f of ["isActive", ...filterFields]) {
    if (query[f] === undefined || query[f] === "") continue;
    const raw = query[f];
    // ?status=New,In review  -> $in
    if (typeof raw === "string" && raw.includes(",")) filter[f] = { $in: raw.split(",").map((x) => castValue(x.trim())) };
    else filter[f] = castValue(raw);
  }

  if (query.from || query.to) {
    filter[dateField] = {};
    if (query.from) filter[dateField].$gte = new Date(query.from);
    if (query.to) filter[dateField].$lte = new Date(query.to);
  }

  // sort sirf safe characters
  const sortStr = String(query.sort || defaultSort).replace(/[^\w\s,.-]/g, "");
  const sort = {};
  for (const part of sortStr.split(/[\s,]+/).filter(Boolean)) {
    if (part.startsWith("-")) sort[part.slice(1)] = -1;
    else sort[part] = 1;
  }

  return { filter, sort, page, limit, skip: (page - 1) * limit };
};

const paginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  pages: Math.max(1, Math.ceil(total / limit)),
});

module.exports = { buildListQuery, paginationMeta, escapeRegex };
