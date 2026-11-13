"use strict";
/**
 * One Piece Explorer — servidor local + proxy para https://www.onepieceapi.com
 *
 * Por que existe: a One Piece API não envia o cabeçalho Access-Control-Allow-Origin,
 * então o navegador bloqueia chamadas feitas a partir de outra origem (CORS).
 * Este servidor entrega a interface e repassa apenas requisições GET permitidas
 * para a API, a partir da mesma origem.
 *
 * Sem dependências externas. Requer Node.js 18+ (fetch nativo).
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const HOST = process.env.HOST || "127.0.0.1"; // só na máquina local por padrão
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const UPSTREAM = "https://www.onepieceapi.com"; // fixo: evita SSRF via configuração
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 500;
const RATE_LIMIT = 120; // requisições por minuto por IP
const RATE_WINDOW_MS = 60_000;

// ---------- página e cabeçalhos de segurança ----------
const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
const sha = (t) => `'sha256-${crypto.createHash("sha256").update(t, "utf8").digest("base64")}'`;
const scriptHash = sha(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const styleHash = sha(html.match(/<style>([\s\S]*?)<\/style>/)[1]);

const CSP = [
  "default-src 'none'",
  `script-src ${scriptHash}`,
  `style-src ${styleHash}`,
  "connect-src 'self'",
  "img-src https: data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  // HSTS só tem efeito em HTTPS; incluído para quando houver TLS na frente (proxy reverso).
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

// ---------- validação estrita (lista branca) ----------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_ENDPOINTS = new Set(["characters", "devil-fruits", "bounties", "ships", "islands", "affiliations"]);
const intIn = (min, max) => (v) => (/^\d{1,4}$/.test(v) && +v >= min && +v <= max ? String(+v) : null);
const oneOf = (...opts) => (v) => (opts.includes(v) ? v : null);
const COMMON = { page: intIn(1, 1000), limit: intIn(1, 100) };
const PARAMS = {
  characters: {
    ...COMMON,
    q: (v) => (v.length <= 60 && !/[\u0000-\u001f]/.test(v) ? v : null),
    ageBand: oneOf("0-12", "13-17", "18-29", "30-59", "60+"),
  },
  bounties: { ...COMMON, sort: oneOf("high", "low"), isActive: oneOf("true", "false") },
  "devil-fruits": COMMON,
  ships: COMMON,
  islands: COMMON,
  affiliations: COMMON,
};

/** Retorna o caminho upstream validado (com query reconstruída) ou null. */
function buildUpstreamPath(reqUrl) {
  const u = new URL(reqUrl, "http://localhost");
  const parts = u.pathname.split("/").filter(Boolean); // ["api", "<endpoint>", "<id>?"]
  if (parts[0] !== "api" || parts.length < 2 || parts.length > 3) return null;
  const endpoint = parts[1];
  if (!LIST_ENDPOINTS.has(endpoint)) return null;

  if (parts.length === 3) {
    if (endpoint !== "characters" || !UUID_RE.test(parts[2])) return null;
    return `/api/characters/${parts[2].toLowerCase()}`;
  }

  const allowed = PARAMS[endpoint];
  const out = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (!Object.hasOwn(allowed, k)) return null; // parâmetro desconhecido → rejeita
    if (v === "") continue;
    const clean = allowed[k](v);
    if (clean === null) return null;
    out.set(k, clean);
  }
  const qs = out.toString();
  return `/api/${endpoint}${qs ? "?" + qs : ""}`;
}

// ---------- rate limit e cache em memória ----------
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now - e.start > RATE_WINDOW_MS) { hits.set(ip, { start: now, n: 1 }); return false; }
  return ++e.n > RATE_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of hits) if (now - e.start > RATE_WINDOW_MS) hits.delete(ip);
}, RATE_WINDOW_MS).unref();

const cache = new Map();
function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { cache.delete(key); return null; }
  return e;
}
function cacheSet(key, status, body) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { status, body, exp: Date.now() + CACHE_TTL_MS });
}

// ---------- respostas ----------
function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": type, "Cache-Control": "no-store", ...extra });
  res.end(body);
}
const sendError = (res, status, msg) => send(res, status, JSON.stringify({ error: msg }));

async function proxy(upstreamPath, res) {
  const cached = cacheGet(upstreamPath);
  if (cached) return send(res, cached.status, cached.body, undefined, { "X-Cache": "HIT" });

  let r;
  try {
    r = await fetch(UPSTREAM + upstreamPath, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "onepiece-explorer-local/1.0" },
      redirect: "error",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[upstream] falha:", err?.name || "erro"); // log interno, sem expor ao cliente
    return sendError(res, 502, "Falha ao consultar a API.");
  }

  const ct = r.headers.get("content-type") || "";
  if (r.status === 404) return sendError(res, 404, "Não encontrado.");
  if (!r.ok || !ct.includes("application/json")) {
    console.error("[upstream] status", r.status);
    return sendError(res, 502, "Falha ao consultar a API.");
  }

  const declared = Number(r.headers.get("content-length") || 0);
  if (declared > MAX_UPSTREAM_BYTES) return sendError(res, 502, "Resposta muito grande.");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_UPSTREAM_BYTES) return sendError(res, 502, "Resposta muito grande.");

  try { JSON.parse(buf.toString("utf8")); } // garante JSON válido antes de repassar
  catch { return sendError(res, 502, "Resposta inválida da API."); }

  cacheSet(upstreamPath, 200, buf);
  send(res, 200, buf, undefined, { "X-Cache": "MISS" });
}

// ---------- servidor ----------
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") return sendError(res, 405, "Método não permitido.");
    if ((req.url || "").length > 512) return sendError(res, 414, "URL muito longa.");

    const ip = req.socket.remoteAddress || "unknown";
    if (rateLimited(ip)) return sendError(res, 429, "Muitas requisições. Tente novamente em instantes.");

    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/" || pathname === "/index.html") return send(res, 200, html, "text/html; charset=utf-8");

    if (pathname.startsWith("/api/")) {
      const upstreamPath = buildUpstreamPath(req.url);
      if (!upstreamPath) return sendError(res, 400, "Requisição inválida.");
      return await proxy(upstreamPath, res);
    }
    sendError(res, 404, "Não encontrado.");
  } catch (err) {
    console.error("[server] erro inesperado:", err?.message);
    if (!res.headersSent) sendError(res, 500, "Erro interno.");
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.listen(PORT, HOST, () => console.log(`One Piece Explorer em http://${HOST}:${PORT}`));

module.exports = { buildUpstreamPath };
