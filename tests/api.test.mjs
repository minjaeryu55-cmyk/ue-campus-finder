// Runs the API function in memory: fake Microsoft tokens, fake mailbox, in-memory blob store.
import test from "node:test";
import assert from "node:assert/strict";
import api, { setTestHooks } from "../netlify/functions/api.mjs";

const data = new Map(), mails = [], pushes = [];
process.env.MS_CLIENT_ID = "test-client";
process.env.ADMIN_EMAILS = "staff@ue.de";
setTestHooks({
  store: () => ({ get: async k => (data.has(k) ? JSON.parse(data.get(k)) : null), setJSON: async (k, v) => data.set(k, JSON.stringify(v)) }),
  mailer: async m => mails.push(m),
  pusher: async (sub, body) => { if (sub.endpoint.includes("gone")) { const e = new Error("gone"); e.statusCode = 410; throw e; } pushes.push({ to: sub.endpoint, ...JSON.parse(body) }); },
  verify: async t => { const [oid, email] = t.split("|"); if (!email) throw new Error("bad"); return { oid, email, name: oid }; }
});
const call = async (method, path, user, body) => {
  const headers = user ? { authorization: "Bearer " + user } : {};
  const r = await api(new Request("https://x.test/api/" + path, { method, headers, body: body && JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const OWNER = "u1|owner@ue.de", FINDER = "u2|finder@ue.de", STAFF = "u3|staff@ue.de", OTHER = "u4|other@ue.de";

test("public list hides answers and finder", async () => {
  const r = await call("GET", "items");
  assert.equal(r.status, 200); assert.equal(r.body.length, 5);
  assert.ok(r.body.every(i => i.a === undefined && i.finderEmail === undefined));
});

test("writing needs sign-in; bad tokens rejected", async () => {
  assert.equal((await call("POST", "alerts", null, { name: "x" })).status, 401);
  assert.equal((await call("POST", "alerts", "garbage", { name: "x" })).status, 401);
});

test("phone notification subscription", async () => {
  const sub = { endpoint: "https://push.example/owner", keys: { p256dh: "k", auth: "a" } };
  assert.equal((await call("POST", "push/subscribe", null, { subscription: sub })).status, 401);
  assert.equal((await call("POST", "push/subscribe", OWNER, { subscription: { endpoint: "http://x" } })).status, 400);
  assert.equal((await call("POST", "push/subscribe", OWNER, { subscription: sub })).body.devices, 1);
  assert.equal((await call("POST", "push/subscribe", OWNER, { subscription: { ...sub, endpoint: "https://push.example/gone" } })).body.devices, 2);
});

test("lost report + later found item -> one email to the owner", async () => {
  const a = await call("POST", "alerts", OWNER, { name: "Navy umbrella", cat: "Bags/Clothing", colors: ["Blue"], zone: "Dorm" });
  assert.equal(a.status, 201); assert.equal(a.body.match, null);
  const f = await call("POST", "items", FINDER, { name: "umbrella", cat: "Bags/Clothing", colors: ["Blue"], zone: "Dorm", keep: "Dorm Reception", a: "red handle", q: "Handle colour?" });
  assert.equal(f.status, 201); assert.equal(f.body.notified, true);
  assert.equal(mails.length, 1); assert.equal(mails[0].to, "owner@ue.de"); assert.match(mails[0].text, /Dorm Reception/);
  assert.equal(pushes.length, 1); assert.equal(pushes[0].to, "https://push.example/owner"); assert.match(pushes[0].url, /#item=/);
  assert.equal(JSON.parse(data.get("subs"))["u1"].length, 1, "expired device removed");
  const again = await call("GET", "alerts", OWNER);
  assert.equal(again.body[0].match.item.name, "umbrella");
  // a different-colour item must NOT trigger another mail
  await call("POST", "items", FINDER, { name: "umbrella", cat: "Bags/Clothing", colors: ["Red"], zone: "Dorm", a: "x" });
  assert.equal(mails.length, 1);
  assert.equal((await call("GET", "alerts", OTHER)).body.length, 0, "alerts are private");
});

test("lost report matching an existing item emails immediately", async () => {
  const before = mails.length;
  const r = await call("POST", "alerts", OTHER, { name: "grey flask", cat: "Bottles/Other", colors: ["Grey"], zone: "Library" });
  assert.equal(r.body.match.item.id, "4"); assert.equal(mails.length, before + 1);
});

test("storage period: finder and staff can edit, others cannot", async () => {
  const items = (await call("GET", "items", FINDER)).body;
  const mine = items.find(i => i.canEdit);
  assert.ok(mine, "finder sees canEdit");
  const exp = new Date(Date.now() + 30 * 864e5).toISOString();
  assert.equal((await call("PATCH", "items/" + mine.id, OTHER, { expires: exp })).status, 403);
  const ok = await call("PATCH", "items/" + mine.id, FINDER, { expires: exp, keep: "UE Central Lost & Found" });
  assert.equal(ok.status, 200); assert.equal(ok.body.keep, "UE Central Lost & Found");
  assert.equal((await call("PATCH", "items/1", STAFF, { days: 3 })).status, 200);
  assert.equal((await call("PATCH", "items/1", STAFF, { days: 900 })).status, 400);
});

test("claim: synonyms accepted, wrong answers limited, claimed item hidden", async () => {
  const bad = await call("POST", "items/2/claim", OTHER, { answer: "red" });
  assert.deepEqual(bad.body, { ok: false, left: 4 });
  const ok = await call("POST", "items/2/claim", OWNER, { answer: "  Navy! " }); // correct answer is "blue"
  assert.equal(ok.body.ok, true);
  assert.ok(mails.some(m => m.to === "owner@ue.de" && /Pick up/.test(m.subject)));
  assert.ok(!(await call("GET", "items")).body.some(i => i.id === "2"));
  for (let k = 0; k < 5; k++) await call("POST", "items/3/claim", OTHER, { answer: "cat" });
  assert.equal((await call("POST", "items/3/claim", OTHER, { answer: "bear" })).body.locked, true);
});

test("allowed email domain", async () => {
  process.env.ALLOWED_EMAIL_DOMAINS = "ue-germany.de";
  assert.equal((await call("GET", "alerts", OWNER)).status, 403);
  delete process.env.ALLOWED_EMAIL_DOMAINS;
});

test("found it myself + claim resolve alerts and stop matching", async () => {
  const a = await call("POST", "alerts", OTHER, { name: "black boot", cat: "Bags/Clothing", colors: ["Black"], zone: "Sports Hall" });
  assert.ok(a.body.match);
  const r = await call("PATCH", "alerts/" + a.body.id, OTHER, { resolved: true });
  assert.equal(r.body.resolved, true);
  const list = (await call("GET", "alerts", OTHER)).body.find(x => x.id === a.body.id);
  assert.equal(list.match, null, "resolved alert has no match");
  assert.equal((await call("PATCH", "alerts/" + a.body.id, OWNER, { resolved: true })).status, 404, "not your alert");
});

test("daily reminder: once, only when 1-3 days left", async () => {
  const { runReminders } = await import("../netlify/functions/api.mjs");
  const a = await call("POST", "alerts", OWNER, { name: "bear keys", cat: "Keys", colors: ["Silver"], zone: "Cafeteria" });
  assert.equal(a.body.match.item.id, "3");
  await call("PATCH", "items/3", STAFF, { days: 10 });
  const n0 = mails.length, p0 = pushes.length;
  assert.equal(await runReminders(), 0);
  await call("PATCH", "items/3", STAFF, { days: 2 });
  assert.equal(await runReminders(), 1);
  assert.match(mails.at(-1).subject, /left to pick up/); assert.match(mails.at(-1).text, /Opening hours/);
  assert.equal(pushes.length, p0 + 1);
  assert.equal(await runReminders(), 0, "only once");
  assert.equal(mails.length, n0 + 1);
});
