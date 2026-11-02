/* Shared rules used by both the app (index.html) and the server (netlify/functions/api.mjs).
   Goal: different people describe the same item differently ("gray" vs "grey", "AirPods" vs "earbuds"),
   so free text is normalised and colours are picked from a fixed palette instead of typed. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Shared = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const ZONES = [["Library", "📚"], ["Lecture Hall A", "🏫"], ["Cafeteria", "☕"], ["Sports Hall", "⚽"], ["Dorm", "🏠"], ["Central Office", "🏢"]];
  const CATS = [["Wallet/Cards", "👛"], ["Electronics", "🎧"], ["Keys", "🔑"], ["Bags/Clothing", "🎒"], ["Bottles/Other", "🧴"]];
  const NOMEM = "Don’t remember";
  // Fixed colour palette: people tap a swatch instead of typing a colour word.
  const COLORS = [
    ["Black", "#1b1b1b"], ["White", "#f7f7f7"], ["Grey", "#9a9a9a"], ["Silver", "#c9ced3"],
    ["Brown", "#7a4a26"], ["Beige", "#d9c7a3"], ["Red", "#d23b3b"], ["Pink", "#ec8fb8"],
    ["Orange", "#ef8a2a"], ["Yellow", "#f2d03b"], ["Green", "#3f9a54"], ["Blue", "#2f6fd6"],
    ["Purple", "#8a52c7"], ["Multi", "conic-gradient(#d23b3b,#f2d03b,#3f9a54,#2f6fd6,#d23b3b)"]
  ];
  // Words people use for the same thing -> one canonical word.
  const SYN = {
    gray: "grey", charcoal: "grey", graphite: "grey", "space grey": "grey", "space gray": "grey",
    navy: "blue", sky: "blue", teal: "blue", turquoise: "blue", cyan: "blue", indigo: "blue",
    gold: "yellow", golden: "yellow", cream: "beige", ivory: "white", tan: "beige", khaki: "beige",
    maroon: "red", burgundy: "red", crimson: "red", scarlet: "red", violet: "purple", lilac: "purple", lavender: "purple",
    olive: "green", mint: "green", lime: "green", rose: "pink", magenta: "pink", chrome: "silver", metal: "silver", steel: "silver",
    colour: "color", colorful: "multi", colourful: "multi", rainbow: "multi",
    airpods: "earbuds", earphones: "earbuds", earphone: "earbuds", headphones: "earbuds", buds: "earbuds",
    purse: "wallet", cardholder: "wallet", cardcase: "wallet", "card holder": "wallet",
    flask: "bottle", tumbler: "bottle", thermos: "bottle", "water bottle": "bottle",
    iphone: "phone", smartphone: "phone", mobile: "phone", cellphone: "phone", galaxy: "phone",
    macbook: "laptop", notebook: "laptop", ipad: "tablet",
    backpack: "bag", rucksack: "bag", tote: "bag", pouch: "bag",
    jacket: "coat", hoodie: "sweater", jumper: "sweater", sneaker: "shoe", sneakers: "shoe", trainers: "shoe", boot: "shoe", boots: "shoe",
    keyring: "keychain", "key ring": "keychain", "key chain": "keychain", keys: "key",
    "student id": "id", "id card": "id", "student card": "id"
  };
  const MULTI = Object.keys(SYN).filter(k => k.includes(" "));

  function norm(text) {
    let t = String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
    t = t.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    for (const m of MULTI) t = t.split(m).join(SYN[m]);
    return t.split(" ").filter(Boolean).map(w => SYN[w] || SYN[w.replace(/s$/, "")] || w.replace(/(?<=\w{3})s$/, "")).join(" ");
  }
  const words = t => new Set(norm(t).split(" ").filter(w => w.length > 1 && !STOP.has(w)));
  const STOP = new Set(["the", "a", "an", "my", "of", "with", "and", "in", "on", "it", "is", "color", "small", "big", "old", "new"]);

  // Ownership answers: "Navy!" and "blue" count as the same answer.
  function sameAnswer(given, correct) {
    const a = norm(given), b = norm(correct);
    if (!a || !b) return false;
    if (a === b) return true;
    const wa = words(a), wb = words(b);
    return wb.size > 0 && [...wb].every(w => wa.has(w));
  }

  // Text search: every searched word must appear in the item text (after normalisation).
  function textMatch(query, item) {
    const q = words(query);
    if (!q.size) return true;
    const hay = words([item.name, item.brand, item.cat, ...(item.colors || [])].join(" "));
    return [...q].every(w => hay.has(w) || [...hay].some(h => h.startsWith(w)));
  }

  // Lost report vs found item. Returns a score (0 = no match) and the reasons.
  function match(lost, found) {
    if (!lost.cat || lost.cat !== found.cat) return { score: 0, why: [] };
    const why = ["same category"];
    let score = 1;
    const lc = lost.colors || [], fc = found.colors || [];
    if (lc.length && fc.length && !lc.includes("Multi") && !fc.includes("Multi")) {
      if (!lc.some(c => fc.includes(c))) return { score: 0, why: [] };
      score += 2; why.push("same colour");
    }
    if (lost.zone && lost.zone !== NOMEM) {
      if (lost.zone === found.zone) { score += 2; why.push("same place"); }
      else score -= 1;
    }
    const lw = words(lost.name + " " + (lost.brand || "")), fw = words(found.name + " " + (found.brand || ""));
    const common = [...lw].filter(w => fw.has(w));
    if (common.length) { score += common.length; why.push("similar description"); }
    return { score: Math.max(score, 0), why };
  }
  const bestMatch = (lost, items) => lost.resolved ? null : items
    .filter(i => !i.claimed)
    .map(i => ({ item: i, ...match(lost, i) }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)[0] || null;

  // Where items are stored and when they can be picked up.
  // NOTE: example opening hours – replace them with the real ones from each office.
  const WK = [1, 2, 3, 4, 5];
  const PLACES = {
    "Library Desk": { where: "Library, ground floor – information desk", hours: [[WK, "09:00", "20:00"], [[6], "10:00", "16:00"]] },
    "Lecture Hall A Office": { where: "Lecture Hall A, room A0.12 (building office)", hours: [[WK, "09:00", "17:00"]] },
    "Cafeteria Counter": { where: "Cafeteria, cash desk", hours: [[WK, "08:00", "18:00"]] },
    "Sports Hall Equipment Room": { where: "Sports Hall, equipment room next to the entrance", hours: [[WK, "10:00", "21:00"], [[6], "10:00", "18:00"]] },
    "Dorm Reception": { where: "Student dorm, reception", hours: [[[0, 1, 2, 3, 4, 5, 6], "08:00", "22:00"]] },
    "UE Central Lost & Found": { where: "Main building, Student Service Centre (room 0.04)", hours: [[[1, 2, 3, 4], "09:00", "16:00"], [[5], "09:00", "14:00"]] }
  };
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const toMin = s => +s.slice(0, 2) * 60 + +s.slice(3);
  const dayRange = d => d.length === 7 ? "Daily" : d.length > 2 && d[d.length - 1] - d[0] === d.length - 1 ? `${DAYS[d[0]]}–${DAYS[d[d.length - 1]]}` : d.map(x => DAYS[x]).join(", ");
  const hoursText = place => PLACES[place] ? PLACES[place].hours.map(([d, o, c]) => `${dayRange(d)} ${o}–${c}`).join(" · ") : "";
  function openState(place, now = new Date()) {
    const p = PLACES[place]; if (!p) return null;
    const day = now.getDay(), m = now.getHours() * 60 + now.getMinutes();
    for (const [d, o, c] of p.hours) if (d.includes(day) && m >= toMin(o) && m < toMin(c)) return { open: true, text: `Open now · until ${c}` };
    for (let k = 0; k < 8; k++) {
      const dd = (day + k) % 7;
      const slot = p.hours.filter(([d, o]) => d.includes(dd) && (k > 0 || m < toMin(o))).sort((a, b) => toMin(a[1]) - toMin(b[1]))[0];
      if (slot) return { open: false, text: `Closed · opens ${k === 0 ? "today" : k === 1 ? "tomorrow" : DAYS[dd]} ${slot[1]}` };
    }
    return { open: false, text: "Closed" };
  }

  // Things to do while waiting, by category (from the interviews: a lost wallet means cancelling cards and replacing IDs).
  const CHECKLIST = {
    "Wallet/Cards": ["Block your bank cards in your banking app or by phone", "Ask the Student Service Centre to block and replace your student ID", "If an official ID or residence permit was inside, report the loss to the police"],
    "Electronics": ["Locate it with Find My (Apple) or Find My Device (Android/Samsung)", "Mark it as lost there so the finder sees a message", "Change important passwords if it is a phone or laptop"],
    "Keys": ["Tell the dorm reception or your landlord if building keys are missing", "Check the pockets of bags and jackets you used that day"],
    "Bags/Clothing": ["Write down what was inside the bag", "Check the sports hall shelves and changing rooms"],
    "Bottles/Other": ["Check the last room you used – most items stay where they were left"]
  };

  const DAY = 864e5;
  const daysLeft = expires => Math.ceil((new Date(expires) - Date.now()) / DAY);
  const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY).toISOString();

  function seed() {
    const now = Date.now();
    const mk = (id, name, cat, colors, zone, keep, ago, days, q, a, brand) => ({
      id, name, cat, colors, zone, keep, brand: brand || "", q, a, photo: "",
      createdAt: new Date(now - ago * DAY).toISOString(), expires: new Date(now + days * DAY).toISOString()
    });
    return [
      mk("1", "Black leather wallet", "Wallet/Cards", ["Black"], "Lecture Hall A", "UE Central Lost & Found", 0, 20, "Which department is on the student ID inside?", "computer"),
      mk("2", "White wireless earbuds", "Electronics", ["White"], "Library", "Library Desk", 1, 12, "What colour is the sticker on the case?", "blue", "Apple AirPods"),
      mk("3", "House keys (bear keyring)", "Keys", ["Silver"], "Cafeteria", "Cafeteria Counter", 0, 6, "Which animal is the keyring?", "bear"),
      mk("4", "Steel tumbler", "Bottles/Other", ["Grey"], "Library", "Library Desk", 0, 13, "What colour is the lid?", "black"),
      mk("5", "Football boot (single)", "Bags/Clothing", ["Black", "White"], "Sports Hall", "Sports Hall Equipment Room", 3, 9, "Which brand is it?", "nike")
    ];
  }

  return { ZONES, CATS, NOMEM, COLORS, PLACES, CHECKLIST, hoursText, openState, norm, sameAnswer, textMatch, match, bestMatch, daysLeft, addDays, seed, DAY };
});
