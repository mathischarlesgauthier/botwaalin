// Superviseur Railway : lance le bot (3000) + le dashboard (3001) dans le même
// conteneur (SQLite partagée sur le volume) et route le port public :
//   /webhook, /health  → bot (Meta Cloud API)
//   tout le reste      → dashboard (admin)
import { spawn } from "node:child_process";
import http from "node:http";

const BOT_PORT = 3000;
const DASH_PORT = 3001;
const PUBLIC_PORT = Number(process.env.PORT || 8080);

function launch(name, args, port) {
  const child = spawn("node", args, {
    stdio: "inherit",
    env: { ...process.env, PORT: String(port), HOSTNAME: "0.0.0.0" },
  });
  child.on("exit", (code, signal) => {
    console.error(`[${name}] terminé (code=${code} signal=${signal}) — arrêt du conteneur`);
    process.exit(code ?? 1);
  });
  return child;
}

const children = [
  launch("bot", ["apps/bot/dist/index.js"], BOT_PORT),
  launch("dashboard", ["dashboard/apps/dashboard/server.js"], DASH_PORT),
];

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";
  const isBot = url === "/health" || url === "/webhook" || url.startsWith("/webhook?");
  const port = isBot ? BOT_PORT : DASH_PORT;
  const proxyReq = http.request(
    { host: "127.0.0.1", port, path: url, method: req.method, headers: req.headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", () => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("upstream indisponible");
  });
  req.pipe(proxyReq); // corps brut préservé (indispensable pour la signature HMAC)
});

server.listen(PUBLIC_PORT, "0.0.0.0", () => {
  console.log(
    `[proxy] :${PUBLIC_PORT} → bot:${BOT_PORT} (/webhook, /health) · dashboard:${DASH_PORT} (reste)`,
  );
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    for (const child of children) child.kill("SIGTERM");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
