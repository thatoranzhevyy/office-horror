import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
// Opt-in: run against the packaged server, not a mocked transport.
const enabled = process.env.NETWORK_TEST === "1";
test(
  "two real WebSocket clients join, ready, move, use light and disconnect",
  { skip: !enabled, timeout: 15000 },
  async () => {
    const url = process.env.TEST_URL ?? "ws://127.0.0.1:3001/ws",
      room = "T" + Date.now().toString(36).toUpperCase();
    const sockets: WebSocket[] = [];
    const states: any[] = [null, null];
    const wait = async (fn: () => boolean) => {
      const until = Date.now() + 10000;
      while (!fn()) {
        if (Date.now() > until) throw new Error("Timed out waiting for state");
        await new Promise((r) => setTimeout(r, 40));
      }
    };
    try {
      for (let n = 0; n < 2; n++) {
        const s = new WebSocket(url);
        sockets.push(s);
        s.on("message", (raw) => {
          const m = JSON.parse(raw.toString());
          if (m.type === "state") states[n] = m;
        });
        await new Promise<void>((res, rej) => {
          s.once("open", () => res());
          s.once("error", rej);
        });
        s.send(
          JSON.stringify({
            type: "join",
            room,
            team: n ? "BRAVO" : "ALPHA",
            name: "Test " + n,
            skin: n,
          }),
        );
      }
      await wait(() => states.every((s) => s?.roster.length === 2));
      sockets.forEach((s) => s.send(JSON.stringify({ type: "ready" })));
      await wait(() => states.every((s) => s?.phase === "playing"));
      assert.equal(states[0].seed, states[1].seed);
      assert.notEqual(states[0].self.id, states[1].self.id);
      const start = states[0].self;
      for (let seq = 1; seq <= 15; seq++) {
        sockets[0].send(
          JSON.stringify({
            type: "input",
            input: {
              seq,
              mx: 0,
              mz: 1,
              angle: 0,
              run: false,
              fire: false,
              action: seq === 1 ? 1 : 0,
            },
          }),
        );
        await new Promise((r) => setTimeout(r, 34));
      }
      await wait(() => states[0].self.ack >= 15);
      assert.ok(states[0].self.z > start.z);
      assert.ok(states[0].self.lightCd > 0);
      assert.ok(states[0].lights.length > 0);
      sockets[1].close();
      await wait(() => states[0].phase === "ended");
      assert.equal(states[0].winner, "ALPHA");
    } finally {
      sockets.forEach((s) => s.close());
    }
  },
);
