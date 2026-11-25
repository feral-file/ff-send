import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { displayDp1Playlist } from "../src/cast.js";
import type { DisplayGrantSession } from "../src/client.js";
import { FakeFF1, type Jwk } from "./control-device.js";
import { fakeRelay, type FakePeer } from "./fakeRelay.js";
import { fixtureDevice } from "./fixtures.js";
import { deviceOnRelay, resetIndexedDb, seedGrant } from "./grants.js";

/**
 * The relay keeps listing an FF1's old connection for up to 90 s after the
 * network dropped it (feral-file/feral-file#3644): the old connection takes
 * frames and never ACKs or answers. These cases hold the client to reaching
 * the FF1's live connection anyway.
 */
const testOrigin = "https://nft.example";
const playlist = { dpVersion: "1.0.0", title: "cast", items: [] };
const big = { ...playlist, items: Array.from({ length: 200 }, (_, index) => ({ id: String(index), source: `https://art.example/${"x".repeat(100)}` })) };
const dead: FakePeer = { id: "conn_ff1_dropped", acks: false };
const session: DisplayGrantSession = { kind: "displayGrant", deviceId: "FF1-FIXTURE1", ctl: "", persistent: true };

beforeEach(() => {
  resetIndexedDb();
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: testOrigin } });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
});

async function seeded(): Promise<Record<string, Jwk>> {
  const { record, sig } = await seedGrant(testOrigin);
  session.ctl = record.ctl;
  return { [record.ctl]: sig };
}

async function timed(run: Promise<unknown>): Promise<number> {
  const started = Date.now();
  await run;
  return Date.now() - started;
}

describe("an FF1 connection the relay still lists after it dropped", () => {
  it("does not hold up a request the live connection answers", async () => {
    const relay = deviceOnRelay(await seeded(), undefined, [dead]);
    const took = await timed(displayDp1Playlist({ session, playlist, socketFactory: relay.socketFactory }));
    expect(relay.ff1.seen).toHaveLength(1);
    expect(took).toBeLessThan(1000);
  });

  it("costs a chunked playlist the fan-out grace for each chunk, no more", async () => {
    const relay = deviceOnRelay(await seeded(), undefined, [dead]);
    const took = await timed(displayDp1Playlist({ session, playlist: big, socketFactory: relay.socketFactory }));
    const chunks = relay.frames.filter((frame) => frame.to === "peers").length;
    expect(chunks).toBe(2);
    expect(relay.ff1.seen).toHaveLength(1);
    // Every chunk but the last waits FANOUT_GRACE_MS (1 s) for the dropped connection's ACK.
    expect(took).toBeLessThan(chunks * 1000);
  });

  it("reaches the FF1 once it reconnects, when the request first went to the dropped connection alone", async () => {
    const ff1 = new FakeFF1(fixtureDevice(), await seeded());
    const peers: FakePeer[] = [dead];
    const relay = fakeRelay({ peers });
    setTimeout(() => {
      peers.push({ id: "conn_ff1", respond: (message) => ff1.handle(message) });
      relay.sockets[0]?.deliverText({ type: "peer_connected", connectionId: "conn_ff1" });
    }, 200);
    const took = await timed(displayDp1Playlist({ session, playlist, socketFactory: relay.socketFactory }));
    expect(ff1.seen).toHaveLength(1);
    expect(relay.frames.map((frame) => frame.to)).toEqual(["peers", "conn_ff1"]);
    // The first frame waits RECEIPT_TIMEOUT_MS (5 s) for the dropped connection before the newcomer gets its copy.
    expect(took).toBeGreaterThanOrEqual(4500);
    expect(took).toBeLessThan(7000);
  }, 10_000);
});
