/* Shared rules used by both the app (index.html) and the server (netlify/functions/api.mjs).
   Goal: different people describe the same item differently ("gray" vs "grey", "AirPods" vs "earbuds"),
   so free text is normalised and colours are picked from a fixed palette instead of typed. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Shared = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const ZONES = [["Library", "📚"], ["Lecture Room", "🏫"], ["Cafeteria", "☕"], ["Sports Hall", "⚽"], ["Central Office", "🏢"]];
  const CATS = [["Wallet/Cards", "👛"], ["Electronics", "🎧"], ["Keys", "🔑"], ["Bags/Clothing", "🎒"], ["Bottles/Other", "🧴"]];
  const NOMEM = "Don’t remember";
  // What exactly the item is, per category. Finder and owner pick from the same list, so "AirPods" and "earphones" end up the same.
  const TYPES = {
    "Wallet/Cards": ["Wallet", "Card holder", "Student ID", "Bank card", "Passport / ID"],
    "Electronics": ["Earbuds", "Headphones", "Phone", "Laptop", "Tablet", "Charger / cable", "Smartwatch"],
    "Keys": ["Key ring", "Single key", "Car key", "Key card"],
    "Bags/Clothing": ["Backpack", "Handbag / tote", "Jacket / coat", "Sweater / hoodie", "Scarf / hat", "Gloves", "Shoes"],
    "Bottles/Other": ["Water bottle", "Umbrella", "Glasses", "Book / notes", "Jewellery", "Other"]
  };
  // Fixed colour palette: people tap a swatch instead of typing a colour word.
  // colors[0] = main colour (what you see first), colors[1] = optional second colour (pattern, logo, lid …).
  const COLORS = [
    ["Black", "#1b1b1b"], ["White", "#f7f7f7"], ["Grey", "#9a9a9a"], ["Silver", "#c9ced3"],
    ["Brown", "#7a4a26"], ["Beige", "#d9c7a3"], ["Red", "#d23b3b"], ["Pink", "#ec8fb8"],
    ["Orange", "#ef8a2a"], ["Yellow", "#f2d03b"], ["Green", "#3f9a54"], ["Blue", "#2f6fd6"],
    ["Purple", "#8a52c7"]
  ];
  // Words people use for the same thing -> one canonical word.
  const SYN = {
    gray: "grey", charcoal: "grey", graphite: "grey", "space grey": "grey", "space gray": "grey",
    navy: "blue", sky: "blue", teal: "blue", turquoise: "blue", cyan: "blue", indigo: "blue",
    gold: "yellow", golden: "yellow", cream: "beige", ivory: "white", tan: "beige", khaki: "beige",
    maroon: "red", burgundy: "red", crimson: "red", scarlet: "red", violet: "purple", lilac: "purple", lavender: "purple",
    olive: "green", mint: "green", lime: "green", rose: "pink", magenta: "pink", chrome: "silver", metal: "silver", steel: "silver",
    colour: "color", 
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
    const hay = words([item.name, item.brand, item.cat, item.type, ...(item.colors || [])].join(" "));
    return [...q].every(w => hay.has(w) || [...hay].some(h => h.startsWith(w)));
  }

  // Lost report vs found item. Hard rules first (anything that clearly differs is not a match),
  // then a score so the most likely item is shown first. Returns { score, level, why }.
  const NO = { score: 0, level: "", why: [] };
  function match(lost, found) {
    if (!lost.cat || lost.cat !== found.cat) return NO;
    // Found before it was lost? Then it can't be the same item (1 day of slack).
    if (lost.lostAt && found.createdAt && new Date(found.createdAt) < new Date(lost.lostAt) - DAY) return NO;
    const why = ["same category"];
    let score = 1;
    if (lost.type && found.type) {
      if (lost.type !== found.type) return NO;
      score += 3; why.push("same type");
    }
    const [lm, ls] = lost.colors || [], [fm, fs] = found.colors || [];
    if (lm && fm) {
      if (lm === fm) { score += 3; why.push("same main colour"); }
      else if (lm === fs || ls === fm) { score += 1; why.push("colours overlap"); } // two-tone items described the other way round
      else return NO;
      if (ls && fs && ls === fs) score += 1;
    }
    if (lost.zone && lost.zone !== NOMEM) {
      if (lost.zone === found.zone) { score += 2; why.push("same place"); }
      else score -= 1;
    }
    const lb = words(lost.brand), fb = words(found.brand);
    if (lb.size && [...lb].some(w => fb.has(w))) { score += 2; why.push("same brand"); }
    const lw = words(lost.name), fw = words(found.name);
    const common = [...lw].filter(w => fw.has(w));
    if (common.length) { score += Math.min(common.length, 2); why.push("similar description"); }
    score = Math.max(score, 0);
    return { score, level: score >= 7 ? "Strong match" : "Possible match", why };
  }
  // Best candidates for one lost report, most likely first.
  const matches = (lost, items, n = 3) => lost.resolved ? [] : items
    .filter(i => !i.claimed)
    .map(i => ({ item: i, ...match(lost, i) }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.item.createdAt) - new Date(a.item.createdAt))
    .slice(0, n);
  const bestMatch = (lost, items) => matches(lost, items, 1)[0] || null;

  // Where items are stored and when they can be picked up.
  // NOTE: example opening hours – replace them with the real ones from each office.
  const WK = [1, 2, 3, 4, 5];
  const PLACES = {
    "Library Desk": { where: "Library, ground floor – information desk", hours: [[WK, "09:00", "20:00"], [[6], "10:00", "16:00"]] },
    "Lecture Room Office": { where: "Lecture building, ground floor office", hours: [[WK, "09:00", "17:00"]] },
    "Cafeteria Counter": { where: "Cafeteria, cash desk", hours: [[WK, "08:00", "18:00"]] },
    "Sports Hall Equipment Room": { where: "Sports Hall, equipment room next to the entrance", hours: [[WK, "10:00", "21:00"], [[6], "10:00", "18:00"]] },
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
    const mk = (id, name, cat, type, colors, zone, keep, ago, days, q, a, brand) => ({
      id, name, cat, type, colors, zone, keep, brand: brand || "", q, a, photo: "",
      createdAt: new Date(now - ago * DAY).toISOString(), expires: new Date(now + days * DAY).toISOString()
    });
    return [
      mk("1", "Black leather wallet", "Wallet/Cards", "Wallet", ["Black"], "Lecture Room", "UE Central Lost & Found", 0, 20, "Which department is on the student ID inside?", "computer"),
      mk("2", "White wireless earbuds", "Electronics", "Earbuds", ["White"], "Library", "Library Desk", 1, 12, "What colour is the sticker on the case?", "blue", "Apple AirPods"),
      mk("3", "House keys (bear keyring)", "Keys", "Key ring", ["Silver"], "Cafeteria", "Cafeteria Counter", 0, 6, "Which animal is the keyring?", "bear"),
      mk("4", "Steel tumbler", "Bottles/Other", "Water bottle", ["Grey", "Black"], "Library", "Library Desk", 0, 13, "What colour is the lid?", "black"),
      mk("5", "Football boot (single)", "Bags/Clothing", "Shoes", ["Black", "White"], "Sports Hall", "Sports Hall Equipment Room", 3, 9, "Which brand is it?", "nike")
    ];
  }

  return { ZONES, CATS, TYPES, NOMEM, COLORS, matches, PLACES, CHECKLIST, hoursText, openState, norm, sameAnswer, textMatch, match, bestMatch, daysLeft, addDays, seed, DAY };
});
