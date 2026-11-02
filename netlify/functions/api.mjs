// UE Campus Finder API (Netlify Function, path /api/*).
// - Data lives in Netlify Blobs (store "uecf").
// - Users sign in with a Microsoft account in the browser (MSAL); the browser sends the ID token,
//   which is verified here against Microsoft's public keys.
// - Notification emails are sent over SMTP (e.g. a Gmail account with an app password).
// - Phone notifications use Web Push (VAPID keys in env); subscriptions are stored per user.
import { getStore } from "@netlify/blobs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import nodemailer from "nodemailer";
import webpush from "web-push";
import Shared from "../../shared.js";

const env = k => (globalThis.Netlify?.env?.get(k) ?? process.env[k] ?? "").trim();
const list = k => env(k).toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
const JWKS = createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"));
const MAX_TRIES = 5;

export let storeFactory = () => getStore({ name: "uecf", consistency: "strong" });
export let mailer = null; // tests can replace this
export let pusher = null; // tests can replace this
export const setTestHooks = h => { if (h.store) storeFactory = h.store; if (h.mailer) mailer = h.mailer; if (h.pusher) pusher = h.pusher; if (h.verify) verifyToken = h.verify; };

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const err = (status, message) => json({ error: message }, status);

async function load(store, key, fallback) {
  const v = await store.get(key, { type: "json" });
  return v ?? fallback;
}
async function items(store) {
  let v = await store.get("items", { type: "json" });
  if (!v) { v = Shared.seed(); await store.setJSON("items", v); }
  return v;
}

let verifyToken = async token => {
  const clientId = env("MS_CLIENT_ID");
  const { payload } = await jwtVerify(token, JWKS, { audience: clientId });
  if (payload.iss !== `https://login.microsoftonline.com/${payload.tid}/v2.0`) throw new Error("bad issuer");
  return payload;
};

async function getUser(req) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  let p;
  try { p = await verifyToken(h.slice(7)); } catch { return null; }
  const email = String(p.email || p.preferred_username || "").toLowerCase();
  if (!email.includes("@")) return null;
  const domains = list("ALLOWED_EMAIL_DOMAINS");
  if (domains.length && !domains.some(d => email.endsWith("@" + d))) return { blocked: true, email };
  return { id: p.oid || p.sub, email, name: p.name || email, admin: list("ADMIN_EMAILS").includes(email) };
}

// What the public sees: never the ownership answer or who handed it in.
const publicItem = (i, u) => {
  const { a, finderId, finderEmail, tries, ...rest } = i;
  return { ...rest, canEdit: !!u && (u.admin || u.id === finderId) };
};

function appUrl(req) { return env("APP_URL") || env("URL") || (req ? new URL(req.url).origin : ""); }

async function sendMail(to, subject, text) {
  if (mailer) return mailer({ to, subject, text });
  if (!env("SMTP_HOST")) { console.log("[mail skipped: SMTP not configured]", to, subject); return; }
  const t = nodemailer.createTransport({
    host: env("SMTP_HOST"), port: Number(env("SMTP_PORT") || 465), secure: Number(env("SMTP_PORT") || 465) === 465,
    auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") }
  });
  await t.sendMail({ from: env("MAIL_FROM") || `UE Campus Finder <${env("SMTP_USER")}>`, to, subject, text });
}

// Phone notifications to every device the user turned them on for. Dead subscriptions are removed.
async function push(store, userId, payload) {
  if (!userId) return;
  const subs = await load(store, "subs", {});
  const mine = subs[userId] || [];
  if (!mine.length) return;
  if (!pusher && !env("VAPID_PRIVATE_KEY")) return;
  const send = pusher || ((sub, body) => webpush.sendNotification(sub, body, {
    TTL: 86400, vapidDetails: { subject: env("VAPID_SUBJECT") || "mailto:" + (env("SMTP_USER") || "admin@example.com"), publicKey: env("VAPID_PUBLIC_KEY"), privateKey: env("VAPID_PRIVATE_KEY") }
  }));
  const keep = [];
  for (const sub of mine) {
    try { await send(sub, JSON.stringify(payload)); keep.push(sub); }
    catch (e) { if (![404, 410].includes(e.statusCode)) { keep.push(sub); console.error("push failed", e.statusCode || e); } }
  }
  if (keep.length !== mine.length) { subs[userId] = keep; await store.setJSON("subs", subs); }
}

async function notifyMatch(req, alert, item) {
  const left = Shared.daysLeft(item.expires);
  await sendMail(alert.email, `Possible match for your ${alert.name}`,
`Hi ${alert.ownerName || ""},

Something similar to the item you reported ("${alert.name}") has been handed in:

  ${item.name}${item.colors?.length ? " (" + item.colors.join(", ") + ")" : ""}
  Found at: ${item.zone}
  Stored at: ${item.keep}${Shared.PLACES[item.keep] ? "\n  Where: " + Shared.PLACES[item.keep].where + "\n  Opening hours: " + Shared.hoursText(item.keep) : ""}
  Kept for: ${left} more day(s)

Open the app to check it and answer the ownership question:
${appUrl(req)}/#item=${item.id}

UE Campus Finder`);
}

// Check every open lost report against one item (or one report against all items) and email new matches once.
async function runMatching(req, store, alerts, allItems, only) {
  let changed = false;
  for (const al of alerts) {
    if (only?.alertId && al.id !== only.alertId) continue;
    const m = Shared.bestMatch(al, only?.item ? [only.item] : allItems);
    if (!m) continue;
    al.notified = al.notified || [];
    if (al.notified.includes(m.item.id)) continue;
    al.notified.push(m.item.id); changed = true;
    try { await notifyMatch(req, al, m.item); } catch (e) { console.error("mail failed", e); }
    try { await push(store, al.userId, { title: "🔔 Possible match: " + m.item.name, body: `Now at ${m.item.keep}. Tap to check it.`, url: "./#item=" + m.item.id, tag: "match-" + al.id }); } catch (e) { console.error("push failed", e); }
  }
  if (changed) await store.setJSON("alerts", alerts);
}

// Daily: remind owners of a matched, unclaimed item when its storage period ends within 3 days.
export async function runReminders(store = storeFactory()) {
  const alerts = await load(store, "alerts", []);
  const all = await items(store);
  let sent = 0;
  for (const al of alerts) {
    const m = Shared.bestMatch(al, all);
    if (!m) continue;
    const left = Shared.daysLeft(m.item.expires);
    al.reminded = al.reminded || [];
    if (left < 1 || left > 3 || al.reminded.includes(m.item.id)) continue;
    al.reminded.push(m.item.id); sent++;
    const when = new Date(m.item.expires).toDateString();
    try {
      await sendMail(al.email, `Only ${left} day(s) left to pick up "${m.item.name}"`,
`Hi ${al.ownerName || ""},

The item that matches your report "${al.name}" is only kept until ${when}:

  ${m.item.name} – ${m.item.keep}${Shared.PLACES[m.item.keep] ? "\n  Opening hours: " + Shared.hoursText(m.item.keep) : ""}

After that it moves to the central office or is discarded.
If it is yours, open the app and answer the ownership question:
${appUrl()}/#item=${m.item.id}

If you already found your item, open Alerts and tap "I found it".

UE Campus Finder`);
    } catch (e) { console.error("mail failed", e); }
    await push(store, al.userId, { title: `⏳ ${left} day${left > 1 ? "s" : ""} left: ${m.item.name}`, body: `Pick it up at ${m.item.keep} before ${when}.`, url: "./#item=" + m.item.id, tag: "remind-" + al.id }).catch(() => {});
  }
  if (sent) await store.setJSON("alerts", alerts);
  return sent;
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)/, "").replace(/\/$/, "") || "/";
  const method = req.method;
  const parts = path.split("/").filter(Boolean); // e.g. ["items","123","claim"]

  if (path === "/config") {
    const clientId = env("MS_CLIENT_ID");
    return json({ clientId, authority: `https://login.microsoftonline.com/${env("MS_TENANT") || "common"}`, mail: !!env("SMTP_HOST"), vapidPublicKey: env("VAPID_PUBLIC_KEY") });
  }

  const store = storeFactory();
  const user = await getUser(req);
  if (user?.blocked) return err(403, `Please sign in with your university account (${list("ALLOWED_EMAIL_DOMAINS").join(", ")}).`);
  const needUser = () => (user ? null : err(401, "Please sign in with your Microsoft account."));
  let body = {};
  if (method !== "GET" && method !== "DELETE") { try { body = await req.json(); } catch { body = {}; } }

  if (path === "/me") return user ? json(user) : err(401, "Not signed in");

  // ---- items ----
  if (parts[0] === "items" && parts.length === 1 && method === "GET") {
    const all = await items(store);
    return json(all.filter(i => !i.claimed || (user && (user.admin || user.id === i.finderId))).map(i => publicItem(i, user)));
  }

  if (parts[0] === "items" && parts.length === 1 && method === "POST") {
    const no = needUser(); if (no) return no;
    const name = String(body.name || "").trim().slice(0, 80);
    const ZN = Shared.ZONES.map(z => z[0]);
    if (!name || !Shared.CATS.some(c => c[0] === body.cat) || !ZN.includes(body.zone) || !String(body.a || "").trim())
      return err(400, "Name, category, place found and the private answer are required.");
    const days = Math.min(Math.max(Number(body.days) || 14, 1), 365);
    const it = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, cat: body.cat, zone: body.zone,
      colors: (Array.isArray(body.colors) ? body.colors : []).filter(c => Shared.COLORS.some(x => x[0] === c)).slice(0, 2),
      brand: String(body.brand || "").slice(0, 60), keep: String(body.keep || "").slice(0, 60) || body.zone,
      photo: String(body.photo || "").startsWith("data:image/") && body.photo.length < 400000 ? body.photo : "",
      q: String(body.q || "Describe a detail of the item.").slice(0, 140), a: String(body.a).slice(0, 80),
      createdAt: new Date().toISOString(), expires: Shared.addDays(Date.now(), days),
      finderId: user.id, finderEmail: user.email
    };
    const all = await items(store); all.unshift(it); await store.setJSON("items", all);
    const alerts = await load(store, "alerts", []);
    await runMatching(req, store, alerts.filter(a => a.userId !== user.id), all, { item: it });
    const notified = alerts.some(a => a.notified?.includes(it.id));
    return json({ item: publicItem(it, user), notified }, 201);
  }

  if (parts[0] === "items" && parts.length === 2 && method === "PATCH") {
    const no = needUser(); if (no) return no;
    const all = await items(store); const it = all.find(i => i.id === parts[1]);
    if (!it) return err(404, "Item not found");
    if (!(user.admin || user.id === it.finderId)) return err(403, "Only the finder or lost & found staff can change the storage period.");
    let exp = body.expires ? new Date(body.expires) : null;
    if (body.days !== undefined) exp = new Date(Shared.addDays(Date.now(), Number(body.days)));
    if (!exp || isNaN(exp)) return err(400, "Invalid date");
    const max = Date.now() + 365 * Shared.DAY;
    if (exp.getTime() > max) return err(400, "Storage period can be at most 1 year.");
    it.expires = exp.toISOString();
    if (body.keep) it.keep = String(body.keep).slice(0, 60);
    await store.setJSON("items", all);
    return json(publicItem(it, user));
  }

  if (parts[0] === "items" && parts[2] === "claim" && method === "POST") {
    const no = needUser(); if (no) return no;
    const all = await items(store); const it = all.find(i => i.id === parts[1]);
    if (!it || it.claimed) return err(404, "Item not available");
    it.tries = it.tries || {};
    if ((it.tries[user.id] || 0) >= MAX_TRIES) return json({ ok: false, locked: true });
    const ok = Shared.sameAnswer(body.answer, it.a);
    if (!ok) { it.tries[user.id] = (it.tries[user.id] || 0) + 1; await store.setJSON("items", all); return json({ ok: false, left: MAX_TRIES - it.tries[user.id] }); }
    it.claimed = { by: user.email, at: new Date().toISOString() };
    await store.setJSON("items", all);
    const alerts = await load(store, "alerts", []);
    let solved = false;
    for (const al of alerts) if (al.userId === user.id && !al.resolved && (al.notified?.includes(it.id) || Shared.match(al, it).score > 0)) { al.resolved = true; solved = true; }
    if (solved) await store.setJSON("alerts", alerts);
    try {
      await sendMail(user.email, `Pick up your ${it.name}`,
        `Your answer was verified.\n\nCollect "${it.name}" at ${it.keep} with your student ID.\nIt is kept until ${new Date(it.expires).toDateString()}.\n\nUE Campus Finder`);
      if (it.finderEmail && it.finderEmail !== user.email)
        await sendMail(it.finderEmail, `The owner of "${it.name}" was found`, `Thanks for handing it in! The owner verified ownership and will collect it at ${it.keep}.\n\nUE Campus Finder`);
    } catch (e) { console.error("mail failed", e); }
    if (it.finderId !== user.id) await push(store, it.finderId, { title: "🙌 The owner was found", body: `"${it.name}" will be collected at ${it.keep}. Thank you!`, url: "./", tag: "claim-" + it.id }).catch(() => {});
    return json({ ok: true, keep: it.keep, solved });
  }

  // ---- phone notifications ----
  if (parts[0] === "push" && method === "POST") {
    const no = needUser(); if (no) return no;
    const sub = body.subscription || {};
    const endpoint = String(sub.endpoint || body.endpoint || "");
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) return err(400, "Invalid subscription");
    const subs = await load(store, "subs", {});
    const mine = (subs[user.id] || []).filter(s => s.endpoint !== endpoint);
    if (parts[1] === "subscribe") {
      if (!sub.keys?.p256dh || !sub.keys?.auth) return err(400, "Invalid subscription");
      mine.push({ endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } });
    } else if (parts[1] !== "unsubscribe") return err(404, "Unknown endpoint");
    subs[user.id] = mine.slice(-5); await store.setJSON("subs", subs);
    return json({ ok: true, devices: subs[user.id].length });
  }

  // ---- alerts (my lost reports) ----
  if (parts[0] === "alerts") {
    const no = needUser(); if (no) return no;
    const alerts = await load(store, "alerts", []);
    if (method === "GET") {
      const all = await items(store);
      return json(alerts.filter(a => a.userId === user.id).map(a => {
        const m = Shared.bestMatch(a, all);
        return { ...a, match: m ? { item: publicItem(m.item, user), why: m.why } : null };
      }));
    }
    if (method === "POST") {
      const name = String(body.name || "").trim().slice(0, 80);
      if (!name) return err(400, "Item name is required.");
      const al = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), userId: user.id, email: user.email, ownerName: user.name,
        name, brand: String(body.brand || "").slice(0, 60),
        cat: Shared.CATS.some(c => c[0] === body.cat) ? body.cat : "",
        zone: String(body.zone || "").slice(0, 40),
        colors: (Array.isArray(body.colors) ? body.colors : []).filter(c => Shared.COLORS.some(x => x[0] === c)).slice(0, 2),
        photo: String(body.photo || "").startsWith("data:image/") && body.photo.length < 400000 ? body.photo : "",
        createdAt: new Date().toISOString(), notified: []
      };
      alerts.unshift(al); await store.setJSON("alerts", alerts);
      const all = await items(store);
      await runMatching(req, store, alerts, all, { alertId: al.id });
      const m = Shared.bestMatch(al, all);
      return json({ ...al, match: m ? { item: publicItem(m.item, user), why: m.why } : null }, 201);
    }
    if (method === "PATCH" && parts[1]) {
      const al = alerts.find(a => a.id === parts[1] && a.userId === user.id);
      if (!al) return err(404, "Not found");
      al.resolved = !!body.resolved; await store.setJSON("alerts", alerts);
      return json(al);
    }
    if (method === "DELETE" && parts[1]) {
      const k = alerts.findIndex(a => a.id === parts[1] && a.userId === user.id);
      if (k < 0) return err(404, "Not found");
      alerts.splice(k, 1); await store.setJSON("alerts", alerts);
      return json({ ok: true });
    }
  }

  return err(404, "Unknown endpoint");
};

export const config = { path: "/api/*" };
