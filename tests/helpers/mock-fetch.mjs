/**
 * Mock factory for globalThis.fetch.
 *
 * Usage:
 *   const { fetch, calls } = createMockFetch({
 *     "POST https://api.anthropic.com/v1/messages": {
 *       status: 200,
 *       json: { content: [{ type: "text", text: "[]" }], stop_reason: "end_turn" },
 *     },
 *     "GET https://api.github.com/": {
 *       status: 200,
 *       headers: { "x-oauth-scopes": "repo,workflow" },
 *     },
 *   });
 *
 * Routes are matched by "METHOD url_prefix" — the URL only needs to START with the prefix.
 * `calls` captures { url, options, body } for assertion.
 */
export function createMockFetch(routes = {}) {
  const calls = [];

  async function fetch(url, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    let body = null;
    if (options.body) {
      try {
        body = JSON.parse(options.body);
      } catch {
        body = options.body;
      }
    }
    calls.push({ url, method, options, body });

    // Find matching route
    for (const [pattern, response] of Object.entries(routes)) {
      const [routeMethod, ...urlParts] = pattern.split(" ");
      const routeUrl = urlParts.join(" ");
      if (method === routeMethod.toUpperCase() && url.toString().includes(routeUrl)) {
        return createResponse(response);
      }
    }

    // Unmatched — return 404
    return createResponse({ status: 404, json: { error: "Mock fetch: no matching route" } });
  }

  return { fetch, calls };
}

function createResponse({ status = 200, json, text, headers = {} }) {
  const responseHeaders = new Map(Object.entries(headers));

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return responseHeaders.get(name) ?? responseHeaders.get(name.toLowerCase()) ?? null;
      },
    },
    async json() {
      return json;
    },
    async text() {
      if (text != null) return text;
      if (json != null) return JSON.stringify(json);
      return "";
    },
  };
}
