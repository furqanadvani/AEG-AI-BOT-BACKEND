/**
 * Purana `authorize(module, permission)` helper (pehle ESM `export default` tha jo CommonJS
 * project mein crash karta). Ab yeh roleAccessMiddleware ka alias hai.
 */
const { roleAccessMiddleware } = require("./acl");

const authorize = (module, permission) => roleAccessMiddleware(module, permission);

module.exports = authorize;
