/**
 * Engine runtime: n8n ke `$('Node')`, `$input` aur `$getWorkflowStaticData` ka backend replacement.
 * Har chat message ke liye ek naya runtime banta hai; har step ka output isi mein save hota hai,
 * taake ported steps bilkul n8n ki tarah pichle steps ka data parh sakein.
 */
class NodeNotExecutedError extends Error {}

const createRuntime = ({ cfg, staticData = {} }) => {
  const outputs = {};
  const sd = { ...staticData, cfg };
  let current = [];

  const accessor = (items) => ({
    first: () => {
      if (!items || !items.length) throw new NodeNotExecutedError("Node has no output");
      return items[0];
    },
    all: () => items || [],
  });

  const rt = {
    cfg,
    $: (name) => {
      if (!(name in outputs)) throw new NodeNotExecutedError(`Node "${name}" did not run`);
      return accessor(outputs[name]);
    },
    get $input() {
      return accessor(current);
    },
    $getWorkflowStaticData: () => sd,
  };

  /** Ek data step (DB / AI) ka output record karna */
  const set = (name, jsonOrList) => {
    const list = Array.isArray(jsonOrList) ? jsonOrList : [jsonOrList];
    outputs[name] = list.filter((x) => x !== undefined && x !== null).map((json) => ({ json }));
    current = outputs[name];
  };

  /** Ported code step chalana. `input` = jo node is step ko feed karta tha */
  const run = (name, fn, inputName) => {
    if (inputName) current = outputs[inputName] || [];
    const result = fn(rt);
    const json = Array.isArray(result) && result[0] ? result[0].json : result;
    set(name, json);
    return json;
  };

  return { rt, set, run, outputs, staticData: sd };
};

module.exports = { createRuntime, NodeNotExecutedError };
