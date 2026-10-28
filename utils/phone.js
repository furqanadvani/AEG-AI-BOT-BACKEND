/** Phone ko ek hi format (+92XXXXXXXXXX) mein: Customer profile ki pehchaan isi se hoti hai */
const { normPhone } = require("../services/engine/helpers");

const normalizePhone = (v) => normPhone(v) || null;

module.exports = { normalizePhone };
