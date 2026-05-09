const HASH_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SLUG_RE = /^[a-z0-9_]{1,64}$/;
const MAX_BODY_BYTES = 256 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const m = url.pathname.match(/^\/sync\/([^/]+)\/([^/]+)\/?$/);
    if (!m) return json(404, { error: "not_found" });

    const [, hash, slug] = m;
    if (!HASH_RE.test(hash)) return json(400, { error: "invalid_hash" });
    if (!SLUG_RE.test(slug)) return json(400, { error: "invalid_slug" });

    const key = `${hash}:${slug}`;

    if (request.method === "GET") {
      const value = await env.FLASHCARD_SYNC.get(key);
      if (value === null) return json(404, { error: "not_found" });
      return new Response(value, {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    if (request.method === "PUT") {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return json(400, { error: "invalid_json" });
      }
      if (
        !parsed ||
        typeof parsed !== "object" ||
        parsed.version !== 1 ||
        typeof parsed.question_set !== "string" ||
        typeof parsed.date !== "string" ||
        typeof parsed.correct !== "string" ||
        typeof parsed.incorrect !== "string" ||
        typeof parsed.bookmarked !== "string"
      ) {
        return json(400, { error: "invalid_shape" });
      }
      await env.FLASHCARD_SYNC.put(key, text);
      return json(200, { ok: true });
    }

    return json(405, { error: "method_not_allowed" });
  },
};
