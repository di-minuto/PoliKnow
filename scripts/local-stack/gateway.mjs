// Pasarela local que imita la API de Supabase para tests de extremo a extremo:
//  - /rest/v1/*  → PostgREST
//  - /auth/v1/*  → autenticación mínima (registro, login, refresco, usuario, logout)
//  - /storage/v1/* → almacenamiento en disco (subir, descargar, enlaces firmados, borrar);
//                    como las políticas de Supabase, solo deja tocar <user_id>/...
// No usar en producción.
import { createHmac, randomUUID, scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { dirname, join, normalize } from "node:path";
import pg from "pg";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const POSTGREST = process.env.POSTGREST_URL ?? "http://127.0.0.1:54330";
const SECRET = process.env.JWT_SECRET;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const refreshTokens = new Map();
const STORAGE_DIR = process.env.STORAGE_DIR ?? "/tmp/poliknow-local-stack/storage";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
  "access-control-expose-headers": "content-range, content-type, content-disposition",
};

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
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readRaw = (req) =>
  new Promise((resolve, reject) => {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
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
    res.writeHead(up.statusCode ?? 502, { ...up.headers, ...CORS });
    up.pipe(res);
  });
  upstream.on("error", (e) => send(res, 502, { msg: e.message }));
  req.pipe(upstream);
}

// ------------------------------------------------------------------ storage

function objectFile(bucket, path) {
  const file = normalize(join(STORAGE_DIR, bucket, path));
  if (!file.startsWith(normalize(join(STORAGE_DIR, bucket)) + "/")) throw new Error("ruta no válida");
  return file;
}
const ownPath = (claims, path) => claims && path.split("/")[0] === claims.sub;
const storageError = (res, status, error, message) =>
  send(res, status, { statusCode: String(status), error, message });

function serveObject(res, file, download) {
  if (!existsSync(file)) return storageError(res, 404, "not_found", "Object not found");
  const meta = JSON.parse(readFileSync(`${file}.meta.json`, "utf8"));
  const headers = { "content-type": meta.contentType, ...CORS };
  if (download !== null) {
    headers["content-disposition"] = `attachment; filename="${encodeURIComponent(download || file.split("/").pop())}"`;
  }
  res.writeHead(200, headers);
  res.end(readFileSync(file));
}

async function storage(req, res, path, query) {
  const claims = verifyJwt(req.headers.authorization?.replace(/^Bearer /i, ""));

  // Enlace firmado: GET /object/sign/<bucket>/<ruta>?token=...
  const signed = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(path);
  if (signed && req.method === "GET") {
    const token = verifyJwt(query.get("token"));
    const key = `${signed[1]}/${decodeURIComponent(signed[2])}`;
    if (!token || token.url !== key) return storageError(res, 400, "InvalidJWT", "invalid signature");
    return serveObject(res, objectFile(signed[1], decodeURIComponent(signed[2])), query.get("download"));
  }
  if (signed && req.method === "POST") {
    const objectPath = decodeURIComponent(signed[2]);
    if (!ownPath(claims, objectPath)) return storageError(res, 400, "not_found", "Object not found");
    if (!existsSync(objectFile(signed[1], objectPath))) return storageError(res, 400, "not_found", "Object not found");
    const { expiresIn } = await readBody(req);
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ url: `${signed[1]}/${objectPath}`, iat: now, exp: now + Number(expiresIn) });
    return send(res, 200, { signedURL: `/object/sign/${signed[1]}/${objectPath}?token=${token}` });
  }

  // Borrar: DELETE /object/<bucket> { prefixes }
  const bucketOnly = /^\/object\/([^/]+)$/.exec(path);
  if (bucketOnly && req.method === "DELETE") {
    const { prefixes = [] } = await readBody(req);
    const removed = [];
    for (const p of prefixes) {
      if (!ownPath(claims, p)) continue;
      const file = objectFile(bucketOnly[1], p);
      if (existsSync(file)) {
        rmSync(file);
        rmSync(`${file}.meta.json`, { force: true });
        removed.push({ name: p, bucket_id: bucketOnly[1] });
      }
    }
    return send(res, 200, removed);
  }

  // Subir / descargar: /object/[authenticated/]<bucket>/<ruta>
  const object = /^\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(path);
  if (object) {
    const [, bucket, rawPath] = object;
    const objectPath = decodeURIComponent(rawPath);
    if (!claims) return storageError(res, 400, "Unauthorized", "Invalid JWT");
    if (!ownPath(claims, objectPath)) {
      return storageError(res, 400, "Unauthorized", "new row violates row-level security policy");
    }
    const file = objectFile(bucket, objectPath);
    if (req.method === "GET") return serveObject(res, file, null);
    if (req.method === "POST" || req.method === "PUT") {
      if (req.method === "POST" && req.headers["x-upsert"] !== "true" && existsSync(file)) {
        return storageError(res, 409, "Duplicate", "The resource already exists");
      }
      if (!String(req.headers["content-type"] ?? "").startsWith("multipart/")) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, await readRaw(req));
        writeFileSync(`${file}.meta.json`, JSON.stringify({ contentType: req.headers["content-type"] }));
        return send(res, 200, { Id: randomUUID(), Key: `${bucket}/${objectPath}` });
      }
      return storageError(res, 400, "unsupported", "La pasarela local solo admite cuerpos sin multipart");
    }
  }
  return send(res, 404, { msg: `No implementado en la pasarela local: ${req.method} ${path}` });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (url.pathname.startsWith("/storage/v1")) return await storage(req, res, url.pathname.slice(11), url.searchParams);
    if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url.pathname.slice(8), url.searchParams);
    if (url.pathname.startsWith("/rest/v1")) return proxyRest(req, res, url.pathname.slice(8) || "/", url.search);
    send(res, 404, { msg: "not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { msg: String(e) });
  }
}).listen(PORT, () => console.log(`Pasarela Supabase local en http://127.0.0.1:${PORT}`));
