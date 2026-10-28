/** Chhota fetch wrapper: timeout + JSON + saaf error (Node 18+ ka built-in fetch) */
const request = async (url, { method = "GET", headers = {}, body, timeoutMs = 20000 } = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || text?.slice(0, 300) || res.statusText;
      const err = new Error(`HTTP ${res.status}: ${msg}`);
      err.status = res.status;
      err.response = json;
      err.retryAfter = Number(res.headers.get("retry-after")) || 0; // seconds (429 par provider batata hai)
      throw err;
    }
    return json;
  } catch (e) {
    if (e.name === "AbortError") { const t = new Error(`Request timed out after ${timeoutMs}ms`); t.code = "timeout"; throw t; }
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { request };
