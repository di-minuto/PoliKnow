// Proxy delante del build de producción para simular «sin conexión» de verdad:
// Playwright no corta la red del service worker con setOffline, así que aquí
// se cortan las conexiones. GET :3202/down y :3202/up lo controlan.
import { createServer, request } from "node:http";

const target = { host: "127.0.0.1", port: Number(process.env.TARGET_PORT ?? 3200) };
let down = false;

createServer((req, res) => {
  if (down) return req.socket.destroy();
  const upstream = request({ ...target, method: req.method, path: req.url, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  upstream.on("error", () => res.destroy());
  req.pipe(upstream);
}).listen(3201, "127.0.0.1");

createServer((req, res) => {
  if (req.url === "/down") down = true;
  if (req.url === "/up") down = false;
  res.end(down ? "down" : "up");
}).listen(3202, "127.0.0.1");
