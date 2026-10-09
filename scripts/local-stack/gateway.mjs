// Pasarela local que imita la API de Supabase para tests de extremo a extremo:
//  - /rest/v1/*  → PostgREST
//  - /auth/v1/*  → autenticación mínima (registro, login, refresco, usuario, logout)
// No usar en producción.
import { createHmac, randomUUID, scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import pg from "pg";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const POSTGREST = process.env.POSTGREST_URL ?? "http://127.0.0.1:54330";
const SECRET = process.env.JWT_SECRET;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const refreshTokens = new Map();

const b64url = (buf) => Buffer.from(buf).toString("base64url");
function signJwt(payload) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [head, body, sig] = (token ?? "").split(".");
  if (!sig) return null;
  const expected = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  return claims.exp * 1000 > Date.now() ? claims : null;
}
const hash = (pw, salt = randomBytes(16).toString("hex")) => `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
const checkHash = (pw, stored) => hash(pw, stored.split(":")[0]) === stored;

function userJson(row) {
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    email_confirmed_at: row.created_at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}
function session(row) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({
    sub: row.id,
    email: row.email,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + 3600,
    session_id: randomUUID(),
  });
  const refresh_token = randomUUID();
  refreshTokens.set(refresh_token, row.id);
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user: userJson(row) };
}

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });

async function auth(req, res, path, query) {
  if (req.method === "POST" && path === "/signup") {
    const { email, password } = await readBody(req);
    const exists = await db.query("select 1 from auth.users where email = $1", [email]);
    if (exists.rowCount) return send(res, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
    const { rows } = await db.query(
      "insert into auth.users (id, email, encrypted_password) values ($1, $2, $3) returning *",
      [randomUUID(), email, hash(password)],
    );
    return send(res, 200, session(rows[0]));
  }
  if (req.method === "POST" && path === "/token") {
    const body = await readBody(req);
    if (query.get("grant_type") === "password") {
      const { rows } = await db.query("select * from auth.users where email = $1", [body.email]);
      if (!rows[0] || !checkHash(body.password, rows[0].encrypted_password)) {
        return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      return send(res, 200, session(rows[0]));
    }
    if (query.get("grant_type") === "refresh_token") {
      const id = refreshTokens.get(body.refresh_token);
      const { rows } = id ? await db.query("select * from auth.users where id = $1", [id]) : { rows: [] };
      if (!rows[0]) return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      return send(res, 200, session(rows[0]));
    }
  }
  if (req.method === "GET" && path === "/user") {
    const claims = verifyJwt(req.headers.authorization?.replace(/^Bearer /i, ""));
    if (!claims) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    const { rows } = await db.query("select * from auth.users where id = $1", [claims.sub]);
    return rows[0] ? send(res, 200, userJson(rows[0])) : send(res, 404, { msg: "User not found" });
  }
  if (req.method === "POST" && path === "/logout") return send(res, 204);
  return send(res, 404, { msg: `No implementado en la pasarela local: ${req.method} ${path}` });
}

function proxyRest(req, res, path, search) {
  const target = new URL(path + search, POSTGREST);
  const headers = { ...req.headers, host: target.host };
  // PostgREST valida el JWT; la clave publicable no lo es, así que se trata como anónimo.
  if (!verifyJwt(headers.authorization?.replace(/^Bearer /i, ""))) delete headers.authorization;
  const upstream = httpRequest(target, { method: req.method, headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", (e) => send(res, 502, { msg: e.message }));
  req.pipe(upstream);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url.pathname.slice(8), url.searchParams);
    if (url.pathname.startsWith("/rest/v1")) return proxyRest(req, res, url.pathname.slice(8) || "/", url.search);
    send(res, 404, { msg: "not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { msg: String(e) });
  }
}).listen(PORT, () => console.log(`Pasarela Supabase local en http://127.0.0.1:${PORT}`));
