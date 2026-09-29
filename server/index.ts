import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { randomInt } from "node:crypto";
import { Game } from "./game.ts";
import { initPhysics } from "../shared/physics.ts";
import { DT } from "../shared/protocol.ts";
await initPhysics();
const port = Number(process.env.PORT) || 3001,
  teamSize = Math.max(1, Math.min(8, Number(process.env.TEAM_SIZE) || 2));
const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".png": "image/png",
};
const http = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  try {
    const pathname = decodeURIComponent(
        new URL(req.url ?? "/", "http://localhost").pathname,
      ),
      file = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + sep)) throw new Error();
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": file.endsWith(".html")
        ? "no-cache"
        : "public, max-age=3600",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      "Сначала выполните npm run build. Для разработки откройте порт 5173.",
    );
  }
});
const wss = new WebSocketServer({
  server: http,
  path: "/ws",
  maxPayload: 4096,
});
interface Client {
  socket: WebSocket;
  game?: Game;
  id?: string;
  code?: string;
  known: Set<string>;
  tokens: number;
  alive: boolean;
}
const clients = new Set<Client>(),
  rooms = new Map<string, Game>();
function send(c: Client, data: unknown) {
  if (
    c.socket.readyState === WebSocket.OPEN &&
    c.socket.bufferedAmount < 1_000_000
  )
    c.socket.send(JSON.stringify(data));
}
wss.on("connection", (socket) => {
  const c: Client = { socket, known: new Set(), tokens: 120, alive: true };
  clients.add(c);
  socket.on("pong", () => (c.alive = true));
  socket.on("message", (raw) => {
    if (--c.tokens < 0) {
      socket.close(1008, "Rate limit");
      return;
    }
    try {
      const m = JSON.parse(raw.toString());
      if (m.type === "join" && !c.id) {
        const code = String(m.room ?? "").toUpperCase();
        if (!/^[A-Z0-9]{3,12}$/.test(code))
          throw new Error("Код комнаты: 3–12 латинских букв или цифр");
        if (m.team !== "ALPHA" && m.team !== "BRAVO")
          throw new Error("Выберите команду");
        let game = rooms.get(code);
        if (!game) {
          if (rooms.size >= 64) throw new Error("Сервер заполнен");
          game = new Game(randomInt(1, 2147483647), teamSize);
          rooms.set(code, game);
        }
        const p = game.join(String(m.name ?? ""), m.team, m.skin);
        Object.assign(c, { game, id: p.id, code });
        send(c, { type: "joined", id: p.id, room: code });
      } else if (c.game && c.id) {
        if (m.type === "input") c.game.input(c.id, m.input);
        else if (m.type === "ready") c.game.ready(c.id);
        else if (
          m.type === "training" &&
          c.game.phase !== "playing" &&
          [...c.game.players.values()].every((p) => p.id === c.id)
        ) {
          const me = c.game.players.get(c.id)!;
          c.game.join(
            "NIGHT WATCH",
            me.team === "ALPHA" ? "BRAVO" : "ALPHA",
            1,
            true,
          );
        }
      }
    } catch (e) {
      send(c, {
        type: "error",
        message: e instanceof Error ? e.message : "Некорректное сообщение",
      });
    }
  });
  socket.on("close", () => {
    clients.delete(c);
    if (c.game && c.id) {
      c.game.leave(c.id);
      if (![...c.game.players.values()].some((p) => !p.bot)) {
        c.game.dispose();
        rooms.delete(c.code!);
      }
    }
  });
  socket.on("error", () => {});
});
const timer = setInterval(() => {
  for (const c of clients) c.tokens = Math.min(120, c.tokens + 3);
  for (const game of rooms.values()) game.step();
  for (const c of clients)
    if (
      c.game &&
      c.id &&
      c.socket.readyState === WebSocket.OPEN &&
      c.socket.bufferedAmount < 1_000_000
    )
      send(c, c.game.snapshot(c.id, c.known));
  for (const game of rooms.values()) game.events = [];
}, DT * 1000);
const heartbeat = setInterval(() => {
  for (const c of clients) {
    if (!c.alive) c.socket.terminate();
    else {
      c.alive = false;
      c.socket.ping();
    }
  }
}, 15000);
http.listen(port, "0.0.0.0", () =>
  console.log(
    `Office Horror: http://localhost:${port} · teams ${teamSize}v${teamSize}`,
  ),
);
function shutdown() {
  clearInterval(timer);
  clearInterval(heartbeat);
  for (const c of clients) c.socket.terminate();
  for (const g of rooms.values()) g.dispose();
  wss.close();
  http.close();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
