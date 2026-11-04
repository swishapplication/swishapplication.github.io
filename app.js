import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

// ================= helpers =================
const DAY = 864e5;
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const pad = (n) => String(n).padStart(2, "0");
const fmtDay = (d) => d.toLocaleDateString("en-GB", { weekday: "short" });
const fmtLong = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = (d) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (t) => String(t || "").slice(0, 5);
const hhmm = (d) => pad(d.getHours()) + ":" + pad(d.getMinutes());
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STAKES = [["game", "🏀 Next game"], ["dinner", "🍔 Dinner"], ["drinks", "🍻 Drinks"], ["water", "💧 Water / Gatorade"], ["custom", "✏️ Own idea"]];
const stakeText = (k, custom) => k === "custom" ? (custom || "a surprise") : STAKES.find((x) => x[0] === k)[1];
const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const BALL = '<svg class="ball" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="#ff6b1a"/><g stroke="#0e0f13" stroke-width="4" stroke-linecap="round"><path d="M44 12v12M60 8v14M76 12v12"/></g><circle cx="60" cy="50" r="22" fill="#0e0f13"/><g fill="none" stroke="#ff6b1a" stroke-width="2.6"><path d="M38 50h44M60 28v44M45 35c8 8 8 22 0 30M75 35c-8 8-8 22 0 30"/></g><path d="M28 62h64" stroke="#f4f2ee" stroke-width="6" stroke-linecap="round"/><g fill="none" stroke="#f4f2ee" stroke-width="2.4" stroke-linecap="round"><path d="M32 62l12 36M46 62l10 36M74 62l-10 36M88 62l-12 36M44 98h32M36 80h48"/></g></svg>';
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ================= sound =================
let actx = null;
const soundOn = () => ls.get("sound") !== "off";
function ensureAudio() {
  try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state !== "running") actx.resume().catch(() => {}); } catch { actx = null; }
  return actx;
}
// real recordings: sounds/swish.mp3 (ball through the net) and sounds/cheer.mp3 (crowd cheer)
const sndBuf = {}, sndLoading = {};
function loadSound(name) {
  const ctx = ensureAudio(); if (!ctx) return Promise.resolve(null); if (sndBuf[name]) return Promise.resolve(sndBuf[name]);
  if (!sndLoading[name]) sndLoading[name] = fetch(`sounds/${name}.mp3`).then((r) => { if (!r.ok) throw 0; return r.arrayBuffer(); })
    .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej))).then((buf) => (sndBuf[name] = buf)).catch(() => { delete sndLoading[name]; return null; });
  return sndLoading[name];
}
function playSound(name, vol = 1) {
  if (!soundOn()) return; const ctx = ensureAudio(); if (!ctx) return;
  loadSound(name).then(async (buf) => { if (!buf) return; if (ctx.state !== "running") { try { await ctx.resume(); } catch {} } if (ctx.state !== "running") return; const src = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = vol; src.buffer = buf; src.connect(g).connect(ctx.destination); src.start(); });
}
// arena buzzer (generated): two rough, slightly detuned tones
function playBuzzer() {
  if (!soundOn()) return; const ctx = ensureAudio(); if (!ctx || ctx.state !== "running") return; const t = ctx.currentTime;
  const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.32, t + 0.02); out.gain.setValueAtTime(0.32, t + 0.85); out.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200; lp.connect(out).connect(ctx.destination);
  [[196, "sawtooth"], [199.5, "sawtooth"], [392, "square"]].forEach(([f, type]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; g.gain.value = type === "square" ? 0.18 : 0.5; o.connect(g).connect(lp); o.start(t); o.stop(t + 1.1); });
  buzz([300]);
}
setTimeout(() => loadSound("cheer"), 3000);
// the swish: a real recording of a ball going through the net (sounds/swish.mp3)
let swishBuf = null, swishLoading = null;
function loadSwish() {
  const ctx = ensureAudio(); if (!ctx || swishBuf) return Promise.resolve(swishBuf);
  if (!swishLoading) swishLoading = fetch("sounds/swish.mp3").then((r) => r.arrayBuffer())
    .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej))).then((buf) => (swishBuf = buf)).catch(() => (swishLoading = null));
  return swishLoading;
}
function playSwish() { playSound("swish"); }
window.__sounds = { playSwish: () => playSwish(), playBuzzer: () => playBuzzer(), playCheer: () => playSound("cheer") };
setTimeout(() => loadSound("swish"), 500);
// iPhones put web audio to sleep after the app has been in the background: wake it on every tap
["pointerdown", "touchend", "click"].forEach((ev) => document.addEventListener(ev, () => { if (!actx || actx.state !== "running") ensureAudio(); }, { passive: true }));
document.addEventListener("visibilitychange", () => { if (!document.hidden && actx && actx.state !== "running") actx.resume().catch(() => {}); });

// ================= state =================
const state = {
  screen: "loading", user: null, profile: null, tab: "games", open: null, sort: "games",
  settings: { app_name: "Swish", logo: null, pay_link: "", currency: "$" },
  players: [], pending: [], badges: {}, arc: { tab: "flick", board: { flick: [], trivia: [] }, champs: {}, triviaToday: null }, rules: [], sessions: [], notifs: [], credits: [], debts: [],
  guestOpen: false, chOpen: false, tOpen: false, stake: "game", tstake: "dinner", chTarget: null, stakeCustom: "", tstakeCustom: "",
  loginEmail: "", codeSent: false, busy: false, pushState: "unknown", installEvt: null, lastSeen: Number(ls.get("lastSeenNotif") || 0),
};
const $$ = (n) => state.settings.currency + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "");
const P = (id) => state.players.find((p) => p.id === id) || { id, name: "Former player", color: "#3a3f4c", skill: 3, prefs: {} };
const meId = () => state.user?.id;
const me = () => P(meId());
const S = (id) => state.sessions.find((s) => s.id === id);
const upcoming = () => state.sessions.filter((s) => s.status === "upcoming").sort((a, b) => a.date - b.date || a.time.localeCompare(b.time));
const recent = () => state.sessions.filter((s) => s.status === "played").sort((a, b) => b.date - a.date);
const isOpen = (s) => Date.now() >= s.opensAt.getTime();
const fmtOpen = (s) => `${fmtShort(s.opensAt)}, ${hhmm(s.opensAt)}`;
const entryOf = (s, pid) => s.roster.find((r) => r.pid === pid && !r.guest);
const guestsOf = (s, pid) => s.roster.filter((r) => r.pid === pid && r.guest);
const inWait = (s, pid) => s.waitlist.indexOf(pid);
const each = (s) => s.price / Math.max(s.roster.length, 1);
const eachFull = (s) => s.price / s.capacity;
const entryById = (s, k) => s.roster.find((r) => r.id === k);
const nameOfKey = (s, k) => { const r = entryById(s, k); return r ? (r.guest || P(r.pid).name) : "?"; };
const teamOf = (s, k) => !s.teams || !k ? null : s.teams.A?.includes(k) ? "A" : s.teams.B?.includes(k) ? "B" : null;
const teamOfPid = (s, pid) => teamOf(s, entryOf(s, pid)?.id);
const otherT = (t) => t === "A" ? "B" : "A";
const tName = (t) => t === "A" ? "🟠 Team A" : "🟢 Team B";
const daysSince = (p) => p.lastPlayed ? Math.max(0, Math.round((today0() - p.lastPlayed) / DAY)) : null;
const mapUrl = (s) => /^https?:\/\//i.test(s.address) ? s.address : "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.address);
const myShare = (s, pid) => s.roster.filter((r) => (r.pid === pid && !r.coveredBy) || r.coveredBy === pid).length * each(s);
// iPhone: a calendar file opens the built-in Calendar app. Android: Google Calendar (the default there).
const calHref = (s) => isIOS() ? `${SUPABASE_URL}/functions/v1/ics?sid=${s.id}` : calUrl(s);
function calUrl(s) {
  const [h, m] = s.time.split(":").map(Number); const st = new Date(s.date); st.setHours(h, m, 0, 0); const en = new Date(st.getTime() + 2 * 3600e3);
  const f = (d) => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00";
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("🏀 " + state.settings.app_name) + "&dates=" + f(st) + "/" + f(en) +
    "&location=" + encodeURIComponent(s.court + ", " + s.address) + "&details=" + encodeURIComponent("Your share: " + $$(each(s)));
}
const initials = (n) => (n || "?").slice(0, 2).toUpperCase();
const av = (p, cls = "") => p.avatar ? `<img class="av ${cls}" src="${esc(p.avatar)}" alt="" loading="lazy" decoding="async">` : `<div class="av ${cls}" style="background:${p.color}">${esc(initials(p.name))}</div>`;
const avR = (r, cls = "") => r.guest ? `<div class="av ${cls}" style="background:#3a3f4c;color:#fff">+${esc(r.guest[0].toUpperCase())}</div>` : av(P(r.pid), cls);

// ================= data =================
async function loadAll() {
  const uid = meId();
  const { data: prof } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
  state.profile = prof;
  const { data: set } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
  if (set) state.settings = set;
  applyBranding();
  if (!prof) { state.screen = "pending"; return; }
  if (!prof.onboarded) { state.screen = "onboard"; return; }
  if (prof.status !== "approved") { state.screen = "pending"; return; }
  state.screen = "app";
  const [profiles, rules, upc, played, notifs, credits, debts] = await Promise.all([
    sb.from("profiles").select("*").order("name"),
    sb.from("rules").select("*").order("created_at"),
    sb.from("sessions").select("*").eq("status", "upcoming"),
    sb.from("sessions").select("*").eq("status", "played").order("game_date", { ascending: false }).limit(8),
    sb.from("notifications").select("*").eq("to_id", uid).order("id", { ascending: false }).limit(100),
    sb.from("credits").select("*").eq("used", false),
    sb.from("debts").select("*").eq("settled", false),
  ]);
  const { data: bdg } = await sb.rpc("get_badges");
  state.badges = {}; (bdg || []).forEach((r) => (state.badges[r.player_id] = [...(state.badges[r.player_id] || []), r.badge]));
  const toP = (p) => ({ id: p.id, name: p.name || (p.email || "").split("@")[0], email: p.email, phone: p.phone, color: p.color, avatar: p.avatar_url, admin: p.is_admin, status: p.status,
    prefs: p.prefs || {}, skill: p.skill, games: p.games, wins: p.wins, mvps: p.mvps, spent: Number(p.spent), lastPlayed: p.last_played ? parseDate(p.last_played) : null });
  const all = (profiles.data || []).map(toP);
  state.players = all.filter((p) => p.status === "approved");
  state.pending = (profiles.data || []).filter((p) => p.status === "pending" && p.onboarded).map(toP);
  state.rules = (rules.data || []).map((r) => ({ id: r.id, dow: r.dow, time: fmtTime(r.start_time), court: r.court, address: r.address, cap: r.capacity, price: Number(r.price), openDow: r.open_dow, openTime: fmtTime(r.open_time), active: r.active }));
  const sess = [...(upc.data || []), ...(played.data || [])];
  const ids = sess.map((s) => s.id);
  let entries = [], wl = [], votes = [], bets = [], tbets = [];
  if (ids.length) {
    const r = await Promise.all([
      sb.from("entries").select("*").in("session_id", ids).order("created_at"),
      sb.from("waitlist").select("*").in("session_id", ids).order("created_at"),
      sb.from("mvp_votes").select("*").in("session_id", ids),
      sb.from("bets").select("*").in("session_id", ids).order("created_at"),
      sb.from("team_bets").select("*").in("session_id", ids).order("created_at"),
    ]);
    [entries, wl, votes, bets, tbets] = r.map((x) => x.data || []);
  }
  state.sessions = sess.map((s) => ({
    id: s.id, date: parseDate(s.game_date), time: fmtTime(s.start_time), court: s.court, address: s.address, capacity: s.capacity, price: Number(s.price),
    ruleId: s.rule_id, opensAt: new Date(s.opens_at), status: s.status, winner: s.winner, teams: s.teams, mvp: s.mvp, mvpClosed: s.mvp_closed, hype: s.hype || {},
    roster: entries.filter((e) => e.session_id === s.id).map((e) => ({ id: e.id, pid: e.player_id, guest: e.guest, pay: e.pay, paid: e.paid, coveredBy: e.covered_by })),
    waitlist: wl.filter((w) => w.session_id === s.id).map((w) => w.player_id),
    mvpVotes: Object.fromEntries(votes.filter((v) => v.session_id === s.id).map((v) => [v.voter, v.target])),
    bets: bets.filter((b) => b.session_id === s.id).map((b) => ({ id: b.id, from: b.from_id, to: b.to_id, stake: b.stake, text: b.stake_text, status: b.status, winner: b.winner })),
    teamBets: tbets.filter((b) => b.session_id === s.id).map((b) => ({ id: b.id, fromTeam: b.from_team, by: b.by_id, text: b.stake_text, status: b.status, winnerTeam: b.winner_team })),
  }));
  state.notifs = (notifs.data || []).map((n) => ({ id: n.id, sid: n.session_id, icon: n.icon, title: n.title, body: n.body, link: n.link, linkLabel: n.link_label, time: new Date(n.created_at) }));
  state.credits = (credits.data || []).map((c) => ({ winner: c.winner, loser: c.loser, used: c.used }));
  await loadArcade();
  state.debts = (debts.data || []).map((d) => ({ id: d.id, from: d.from_ids, to: d.to_ids, text: d.stake_text, date: parseDate(d.game_date), team: d.team, settled: d.settled }));
}

let reloadTimer = null;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    const fullBefore = new Set(upcoming().filter((s) => entryOf(s, meId()) && s.roster.length >= s.capacity).map((s) => s.id));
    const os = state.open && S(state.open); const before = os ? Object.fromEntries(Object.entries(os.hype).map(([k, v]) => [k, v.length])) : null; const openId = state.open;
    await loadAll(); render(); celebrate();
    const nowFull = upcoming().filter((s) => entryOf(s, meId()) && s.roster.length >= s.capacity && !fullBefore.has(s.id));
    if (nowFull.length && Date.now() - lastLocalJoin > 4000) { playSound("cheer", 0.7); toast(`🏀 ${fmtShort(nowFull[0].date)} is FULL. Game on!`); }
    const ns = state.open === openId && S(openId);
    if (ns && before && Date.now() - lastLocalHype > 2500) Object.entries(ns.hype).forEach(([e, v]) => { if (v.length > (before[e] || 0)) floatEmoji(document.querySelector(`#sheet [data-act=hype][data-e="${e}"]`), e, 5); });
  }, 350);
}
let channel = null;
function subscribe() {
  if (channel) return;
  channel = sb.channel("hoop-db").on("postgres_changes", { event: "*", schema: "public" }, scheduleReload).subscribe();
}
const kickDispatch = () => fetch(SUPABASE_URL + "/functions/v1/dispatch", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {});

async function rpc(fn, args) {
  if (state.busy) return { error: { message: "Hang on…" } };
  state.busy = true; document.body.classList.add("busy");
  try {
    const { data, error } = await sb.rpc(fn, args || {});
    if (error) { toast("⚠️ " + error.message.replace(/^.*?ERROR:\s*/, "")); return { error }; }
    await loadAll(); render(); kickDispatch(); setTimeout(celebrate, 600);
    return { data };
  } finally { state.busy = false; document.body.classList.remove("busy"); }
}

// ================= actions =================
const MINI_BALL = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#ff6b1a"/><g fill="none" stroke="#1a0b02" stroke-width="2.5"><circle cx="20" cy="20" r="18"/><path d="M2 20h36M20 2v36M7 7c7 6 7 20 0 26M33 7c-7 6-7 20 0 26"/></g></svg>';
function shotAnim(btn) {
  const ring = document.querySelector("#sheet .ring"); if (!btn || !ring) return;
  const a = btn.getBoundingClientRect(), b = ring.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2, peak = Math.min(y0, y1) - 140;
  const ball = document.createElement("div"); ball.className = "shot"; ball.innerHTML = MINI_BALL; document.body.appendChild(ball);
  const frames = []; for (let i = 0; i <= 20; i++) { const t = i / 20, x = x0 + (x1 - x0) * t, y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * peak + t ** 2 * y1;
    frames.push({ transform: `translate(${x - 16}px, ${y - 16}px) scale(${1.15 - 0.45 * t}) rotate(${t * 600}deg)`, opacity: t > 0.92 ? (1 - t) * 12 : 1 }); }
  ball.animate(frames, { duration: 700, easing: "cubic-bezier(.35,.05,.4,1)" }).onfinish = () => {
    ball.remove(); const r = document.querySelector("#sheet .ring"); if (r) { r.classList.remove("bump"); void r.offsetWidth; r.classList.add("bump"); }
  };
  buzz([18, 40, 28]);
}
const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch {} };
async function join(id) {
  lastLocalJoin = Date.now(); const s0 = S(id); if (s0 && isOpen(s0) && s0.roster.length < s0.capacity) shotAnim(document.querySelector('#sheet [data-act="join"]'));
  const { data, error } = await rpc("join_game", { _sid: id }); if (error) return;
  const popIn = () => setTimeout(() => document.querySelector("#sheet .pill.in")?.classList.add("pop"), 30);
  if (data === "full") { playSwish(); setTimeout(() => playSound("cheer", 0.8), 350); confetti(); buzz([40, 60, 40, 60, 80]); popIn(); toast("🏀 You took the last spot. Squad is FULL!"); }
  else if (data === "in") { playSwish(); popIn(); toast("✅ You're in! See you on court."); }
  else if (String(data).startsWith("waitlist")) toast(`⏳ You're #${data.split(":")[1]} on the waitlist`);
}
async function leave(id) {
  const { data, error } = await rpc("leave_game", { _sid: id }); if (error) return;
  toast(data === "left-waitlist" ? "Left the waitlist" : data ? `${data} moved up from the waitlist 📲` : "You dropped out. Squad told a spot is open 📲");
}
async function addGuest(id) {
  const n = (document.getElementById("guestName")?.value || "").trim(); if (!n) { toast("Type your friend's name"); return; }
  state.guestOpen = false;
  const { data, error } = await rpc("add_guest", { _sid: id, _name: n }); if (error) return;
  if (data === "full") { confetti(); setTimeout(() => playSound("cheer", 0.8), 200); } toast(`➕ ${n} is in as your guest`);
}
async function challenge(id) {
  const to = document.getElementById("chTarget")?.value; if (!to) return;
  const text = stakeText(state.stake, state.stakeCustom.trim()); state.chOpen = false;
  const { error } = await rpc("challenge", { _sid: id, _to: to, _stake: state.stake, _text: text }); if (!error) toast(`⚔️ Challenge sent to ${P(to).name}`);
}
async function teamChallenge(id) {
  const text = stakeText(state.tstake, state.tstakeCustom.trim()); state.tOpen = false;
  const { error } = await rpc("team_challenge", { _sid: id, _text: text }); if (!error) toast("🔥 Team challenge sent");
}
async function createSession(f) {
  if (!f.date.value) { toast("Pick a date"); return; }
  const { error } = await rpc("create_game", { _date: f.date.value, _time: f.time.value || "20:00", _court: f.court.value, _address: f.address.value, _capacity: Number(f.cap.value), _price: Number(f.price.value) || 0 });
  if (!error) { state.open = null; state.tab = "games"; render(); toast(`📣 Game posted · squad notified`); }
}
async function addRule(f) {
  const { error } = await rpc("add_rule", { _dow: Number(f.dow.value), _time: f.time.value || "20:00", _court: f.court.value, _address: f.address.value, _capacity: Number(f.cap.value), _price: Number(f.price.value) || 0, _open_dow: Number(f.openDow.value), _open_time: f.openTime.value || "10:00" });
  if (!error) toast(`🔁 Every ${DOW[f.dow.value]} added`);
}
async function saveProfile() {
  const name = document.getElementById("pfName")?.value || me().name, phone = document.getElementById("pfPhone")?.value || "";
  const { error } = await rpc("update_profile", { _name: name, _phone: phone, _prefs: me().prefs }); if (!error) toast("✅ Saved");
}
async function togglePref(k) {
  const prefs = { ...me().prefs, [k]: me().prefs[k] === false };
  await rpc("update_profile", { _name: me().name, _phone: me().phone || "", _prefs: prefs });
}
async function uploadLogo(file) {
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = async () => {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    const s = Math.min(img.width, img.height); g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
    URL.revokeObjectURL(url);
    const { error } = await rpc("update_settings", { _app_name: null, _logo: c.toDataURL("image/png"), _pay_link: null }); if (!error) toast("🖼️ New logo set");
  };
  img.onerror = () => toast("⚠️ Couldn't read that image"); img.src = url;
}

// profile photo: crop to a square, shrink, upload to the "avatars" bucket, save the link
async function uploadAvatar(file) {
  toast("📸 Uploading your photo…");
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const c = document.createElement("canvas"); c.width = c.height = 320; const g = c.getContext("2d"); const sz = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - sz) / 2, (img.height - sz) / 2, sz, sz, 0, 0, 320, 320); URL.revokeObjectURL(img.src);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.86));
    const path = `${meId()}/${Date.now()}.jpg`;
    const up = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw up.error;
    const { data } = sb.storage.from("avatars").getPublicUrl(path);
    const { error } = await rpc("set_avatar", { _url: data.publicUrl }); if (!error) { toast("📸 Looking good!"); confetti(); }
  } catch (e) { toast("⚠️ Couldn't upload that photo"); }
}

// push notifications
function b64ToU8(b) { const p = "=".repeat((4 - (b.length % 4)) % 4); const r = atob((b + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); }
async function checkPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { state.pushState = isIOS() && !isStandalone() ? "needs-install" : "unsupported"; return; }
  if (Notification.permission === "denied") { state.pushState = "denied"; return; }
  const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && (await reg.pushManager.getSubscription());
  state.pushState = sub ? "on" : "off";
}
async function enablePush() {
  try {
    if (isIOS() && !isStandalone()) { toast("📲 Add the app to your home screen first"); return; }
    const perm = await Notification.requestPermission(); if (perm !== "granted") { toast("Notifications were blocked"); await checkPush(); render(); return; }
    const reg = await navigator.serviceWorker.ready;
    let { data: key } = await sb.rpc("get_vapid_key");
    if (!key) { await kickDispatch(); ({ data: key } = await sb.rpc("get_vapid_key")); }
    if (!key) { toast("⚠️ Push isn't set up on the server yet"); return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
    const { error } = await sb.rpc("save_push_sub", { _endpoint: sub.endpoint, _sub: sub.toJSON() });
    if (error) throw error;
    state.pushState = "on"; toast("🔔 Push notifications are on"); render();
  } catch (e) { toast("⚠️ " + (e.message || e)); }
}

// ================= views =================
function ring(s) {
  const pct = Math.min(s.roster.length / s.capacity, 1); const r = 23, c = 2 * Math.PI * r; const col = pct >= 1 ? "#ff4d5e" : pct >= 0.75 ? "#ff9a3d" : "#c8f43c";
  return `<div class="ring"><svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="${r}" fill="none" stroke="#2c303b" stroke-width="5"/><circle cx="27" cy="27" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 27 27)"/></svg><span>${s.roster.length}/${s.capacity}</span></div>`;
}
function statusPill(s) {
  const pid = meId();
  if (entryOf(s, pid)) return '<span class="pill in">✓ You\'re in</span>';
  const w = inWait(s, pid); if (w >= 0) return `<span class="pill wait">⏳ Waitlist #${w + 1}</span>`;
  if (!isOpen(s)) return `<span class="pill lock">🔒 Opens ${fmtOpen(s)}</span>`;
  if (s.roster.length >= s.capacity) return '<span class="pill full">All spots booked</span>';
  const left = s.capacity - s.roster.length; return `<span class="pill ${left <= 2 ? "hot" : ""}">${left <= 2 ? "⚡ " : ""}${left} spot${left > 1 ? "s" : ""} left</span>`;
}
function installCard() {
  if (isStandalone() || ls.get("hideInstall")) return "";
  const how = isIOS() ? "In Safari, tap <b>Share</b> <span style='font-size:15px'>⎋</span> then <b>Add to Home Screen</b>." : state.installEvt ? "Install it like a normal app:" : "In your browser menu <b>⋮</b>, tap <b>Add to Home screen</b> or <b>Install app</b>.";
  return `<div class="teaser"><span>📲</span><div style="flex:1"><b>Add ${esc(state.settings.app_name)} to your home screen</b><br>${how}
    ${state.installEvt ? `<div style="margin-top:8px"><button class="btn orange sm" data-act="install">Install</button></div>` : ""}</div><button class="btn ghost sm" data-act="hideinstall">✕</button></div>`;
}
// reminder for players who haven't turned on push yet (alerts are push-only)
function pushCard() {
  if (state.pushState === "on" || state.pushState === "unsupported" || state.pushState === "needs-install") return "";
  if (state.pushState === "denied") {
    if (ls.get("hidePushDenied")) return "";
    return `<div class="teaser push"><span>🔕</span><div style="flex:1"><b>Notifications are blocked</b><br>You'll miss bookings opening and challenges. Allow notifications for ${esc(state.settings.app_name)} in your phone's Settings, then reopen the app.</div><button class="btn ghost sm" data-act="hidepushdenied">✕</button></div>`;
  }
  return `<div class="teaser push"><span>🔔</span><div style="flex:1"><b>Turn on notifications</b><br>So you know the second booking opens, a spot frees up, or someone challenges you.
    <div style="margin-top:10px"><button class="btn primary sm" data-act="push">Turn on</button></div></div></div>`;
}
// ================= countdown hero =================
const gameStart = (s) => { const [hh, mm] = s.time.split(":").map(Number); const d = new Date(s.date); d.setHours(hh, mm, 0, 0); return d; };
const fmtCount = (ms) => { ms = Math.max(0, ms); const t = Math.floor(ms / 1000), d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), mi = Math.floor((t % 3600) / 60), se = t % 60;
  return (d ? `${d}d ` : "") + pad(h) + ":" + pad(mi) + ":" + pad(se); };
const cdSpan = (target, kind = "") => `<div class="cd" data-cd="${target.getTime()}" data-kind="${kind}">${fmtCount(target - Date.now())}</div>`;
const heroBall = `<svg class="bg" viewBox="0 0 40 40"><g fill="none" stroke="#000" stroke-width="2"><circle cx="20" cy="20" r="18"/><path d="M2 20h36M20 2v36M7 7c7 6 7 20 0 26M33 7c-7 6-7 20 0 26"/></g></svg>`;
function heroCard(m, ups, mine) {
  const now = Date.now(), ds = daysSince(m);
  const stats = `<div class="stat"><div><b>${m.games}</b><span>games</span></div><div><b>${m.wins}</b><span>wins</span></div><div><b>${m.mvps}🐐</b><span>MVPs</span></div><div><b>${ds === null ? "–" : ds + "d"}</b><span>since last game</span></div></div>`;
  const live = mine.find((s) => now >= gameStart(s) && now < gameStart(s).getTime() + 2 * 3600e3);
  if (live) return `<div class="hero live" data-act="open" data-id="${live.id}">${heroBall}<div class="tag"><i class="dot"></i> LIVE NOW</div><h3>Game on at ${esc(live.court)} 🔥</h3><p>Ball out! Tap for teams and bets.</p>${stats}</div>`;
  const nxt = mine.find((s) => gameStart(s) > now);
  if (nxt) {
    const st = gameStart(nxt);
    if (st.toDateString() === new Date().toDateString())
      return `<div class="hero gameday" data-act="open" data-id="${nxt.id}"><div class="flames">🔥🔥🔥</div><div class="tag">GAME DAY</div><h3>${fmtTime(nxt.time)} · ${esc(nxt.court)}</h3><div class="cdwrap"><small>Tip-off in</small>${cdSpan(st)}</div>${stats}</div>`;
    return `<div class="hero" data-act="open" data-id="${nxt.id}">${heroBall}<div class="tag">Next up · ${fmtShort(nxt.date)}, ${fmtTime(nxt.time)}</div><h3>${esc(nxt.court)}</h3><div class="cdwrap"><small>Tip-off in</small>${cdSpan(st)}</div>${stats}</div>`;
  }
  const open = ups.find((s) => isOpen(s) && s.roster.length < s.capacity && inWait(s, meId()) < 0 && gameStart(s) > now);
  if (open) { const left = open.capacity - open.roster.length;
    return `<div class="hero" data-act="open" data-id="${open.id}">${heroBall}<div class="tag">Spots open · ${left} left</div><h3>${fmtShort(open.date)}, ${fmtTime(open.time)} · ${esc(open.court)}</h3><div class="cdwrap"><small>Tip-off in</small>${cdSpan(gameStart(open))}</div>
      <button class="btn dark sm" style="margin-top:12px" data-act="open" data-id="${open.id}">🏀 Book my spot</button>${stats}</div>`; }
  const lock = ups.filter((s) => !isOpen(s)).sort((a, b) => a.opensAt - b.opensAt)[0];
  if (lock) return `<div class="hero">${heroBall}<div class="tag">Next ${DOW[lock.date.getDay()]} game · ${fmtShort(lock.date)}, ${fmtTime(lock.time)}</div><h3>Booking opens in</h3>${cdSpan(lock.opensAt, "open")}<p style="margin-top:4px">Be quick. First come, first served ⚡</p>${stats}</div>`;
  return `<div class="hero">${heroBall}<h3>Hey ${esc(m.name)}, lace up! 👟</h3><p>No games posted yet.</p>${stats}</div>`;
}
let lastCdRender = 0; const buzzedFor = new Set();
setInterval(() => {
  document.querySelectorAll("[data-cd]").forEach((el) => {
    const ms = Number(el.dataset.cd) - Date.now(); el.textContent = fmtCount(ms);
    if (el.classList.contains("mini-cd")) return;
    if (ms <= 0 && el.dataset.kind === "open" && !buzzedFor.has(el.dataset.cd)) { buzzedFor.add(el.dataset.cd); playBuzzer(); toast("📣 Booking is OPEN. Go go go!"); }
    if (ms <= 0 && Date.now() - lastCdRender > 5000 && state.screen === "app" && !state.open) { lastCdRender = Date.now(); scheduleReload(); }
  });
}, 1000);

// ================= badges =================
const BADGES = {
  early: { e: "⚡", n: "Early Bird", d: "Booked a weekly game within a minute of booking opening" },
  iron: { e: "🧱", n: "Iron Man", d: "Played 5 games in a row" },
  shark: { e: "🦈", n: "Bet Shark", d: "Won 3 bets" },
  clutch: { e: "🏆", n: "Clutch", d: "Won MVP twice" },
  ghost: { e: "👻", n: "Ghost", d: "Hasn't played for 30+ days. Play a game to shake it off!" },
  king: { e: "👑", n: "Arcade King", d: "Top Flick Shot score last week" },
  brain: { e: "🧠", n: "Trivia Brain", d: "Best Lebanese trivia score last week" },
};
const badgesOf = (pid) => state.badges[pid] || [];

// ================= celebration overlays (badge unlocks, MVP reveal) =================
const ovQueue = []; let ovShowing = false;
function queueOverlay(html, after) { ovQueue.push({ html, after }); if (!ovShowing) nextOverlay(); }
function nextOverlay() {
  const it = ovQueue.shift(); if (!it) { ovShowing = false; return; } ovShowing = true;
  const el = document.createElement("div"); el.className = "ov"; el.innerHTML = `<div class="ov-card">${it.html}</div>`;
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-ov-close]")) { el.classList.add("out"); setTimeout(() => { el.remove(); nextOverlay(); }, 220); } });
  document.body.appendChild(el); if (it.after) it.after(el);
}
function checkUnlocks() {
  const uid = meId(); if (!uid) return; const key = "seenBadges:" + uid; const mine = badgesOf(uid);
  let seen; try { seen = JSON.parse(ls.get(key) || "[]"); } catch { seen = []; }
  mine.filter((b) => !seen.includes(b)).forEach((b) => {
    const B = BADGES[b]; if (!B) return; const ghost = b === "ghost";
    queueOverlay(`<div class="burst"></div><div class="badge-big">${B.e}</div><div class="ov-k">${ghost ? "Uh oh…" : "Badge unlocked"}</div><h2>${B.n}</h2><p>${B.d}</p><button class="btn primary" data-ov-close>${ghost ? "I'll be back 😤" : "Let's go 🔥"}</button>`,
      () => { if (!ghost) { confetti(); playSwish(); } });
  });
  ls.set(key, JSON.stringify(mine));
}
function mvpRevealHtml(s) {
  const tally = {}; Object.values(s.mvpVotes).forEach((t) => (tally[t] = (tally[t] || 0) + 1));
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1] || (a[0] === s.mvp ? -1 : b[0] === s.mvp ? 1 : 0)).slice(0, 3);
  if (!top.length || top[0][0] !== s.mvp) { top.unshift([s.mvp, tally[s.mvp] || 0]); top.length = Math.min(top.length, 3); }
  const col = (i) => { const t = top[i]; if (!t) return `<div class="pod empty"></div>`; const p = P(t[0]);
    return `<div class="pod p${i + 1}"><div class="pod-who">${av(p, i === 0 ? "lg" : "")}<b>${esc(p.name)}</b><small>${t[1]} vote${t[1] === 1 ? "" : "s"}</small></div><div class="pod-block">${["🥇", "🥈", "🥉"][i]}</div></div>`; };
  return `<div class="ov-k">MVP of ${fmtShort(s.date)}</div><h2 style="margin-bottom:14px">And the GOAT is…</h2>
    <div class="podium">${col(1)}${col(0)}${col(2)}</div><div class="winner-name">🐐 ${esc(P(s.mvp).name)}</div><button class="btn primary" style="margin-top:14px" data-ov-close>Respect 🙌</button>`;
}
function showMvpReveal(s) { queueOverlay(mvpRevealHtml(s), () => setTimeout(() => { confetti(); playSwish(); }, 1700)); }
function checkMvpReveals() {
  let seen; try { seen = JSON.parse(ls.get("seenMvp") || "[]"); } catch { seen = []; }
  const fresh = recent().filter((s) => s.mvp && s.mvpClosed && !seen.includes(s.id) && Date.now() - s.date.getTime() < 14 * 864e5);
  fresh.reverse().forEach((s) => { showMvpReveal(s); seen.push(s.id); });
  ls.set("seenMvp", JSON.stringify(seen.slice(-50)));
}
let celebrated = false;
function celebrate() { if (state.screen !== "app") return; checkUnlocks(); checkMvpReveals(); }

// ================= floating reactions =================
let lastLocalHype = 0, lastLocalJoin = 0;
function floatEmoji(el, emoji, n = 7) {
  if (!el) return; const r = el.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const f = document.createElement("span"); f.className = "fl"; f.textContent = emoji;
    f.style.left = r.left + r.width / 2 + (Math.random() * 16 - 8) + "px"; f.style.top = r.top + "px";
    f.style.setProperty("--dx", Math.random() * 90 - 45 + "px"); f.style.setProperty("--dy", -(140 + Math.random() * 120) + "px");
    f.style.setProperty("--rot", Math.random() * 60 - 30 + "deg"); f.style.animationDelay = i * 70 + "ms"; f.style.fontSize = 18 + Math.random() * 14 + "px";
    document.body.appendChild(f); setTimeout(() => f.remove(), 1900);
  }
}

// ================= arcade =================
const tzToday = () => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: state.settings.tz || "Europe/Berlin" }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } };
const weekStartIso = (iso) => { const d = new Date(iso + "T00:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); };
async function loadArcade() {
  const today = tzToday(), wk = weekStartIso(today), lw = (() => { const d = new Date(wk + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); })();
  const [f, t, lf, lt, mine] = await Promise.all([
    sb.rpc("arcade_board", { _game: "flick" }), sb.rpc("arcade_board", { _game: "trivia" }),
    sb.rpc("arcade_board", { _game: "flick", _week: lw }), sb.rpc("arcade_board", { _game: "trivia", _week: lw }),
    sb.from("arcade_scores").select("score").eq("player_id", meId()).eq("game", "trivia").eq("played_on", today).maybeSingle(),
  ]);
  state.arc.board = { flick: f.data || [], trivia: t.data || [] };
  state.arc.champs = { flick: (lf.data || [])[0], trivia: (lt.data || [])[0] };
  state.arc.triviaToday = mine.data ? mine.data.score : null;
}
const nextMonday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d; };
const tomorrow0 = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d; };
function arcadeView() {
  const a = state.arc, board = a.board[a.tab], meRow = board.findIndex((r) => r.player_id === meId());
  const myBest = (g) => (a.board[g].find((r) => r.player_id === meId()) || {}).best;
  let h = `<h2>🕹️ Arcade</h2><div class="sub">Play between games. Best score this week wins the crown.</div>
  <div class="arc-tiles">
    <div class="arc-tile flick" data-act="arcplay" data-g="flick"><div class="ic">🏀</div><div style="flex:1;min-width:0"><b>Flick Shot</b><small>30 seconds. Swipe to shoot. The hoop speeds up.</small></div>
      <div class="arc-best">${myBest("flick") ?? "–"}<span>your best</span></div></div>
    <div class="arc-tile trivia ${a.triviaToday !== null ? "done" : ""}" data-act="arcplay" data-g="trivia"><div class="ic">🇱🇧</div><div style="flex:1;min-width:0"><b>Lebanese Hoops Trivia</b>
      <small>${a.triviaToday !== null ? `✅ Done today: ${a.triviaToday} pts · new questions in <span class="mini-cd" data-cd="${tomorrow0().getTime()}">${fmtCount(tomorrow0() - Date.now())}</span>` : "5 questions a day about the Cedars and the Lebanese league. Same for everyone."}</small></div>
      <div class="arc-best">${myBest("trivia") ?? "–"}<span>week best</span></div></div>
  </div>`;
  const ch = (g, ic) => a.champs[g] ? `<div class="champ"><span>${ic}</span>${av(P(a.champs[g].player_id), "sm")}<div><b>${esc(P(a.champs[g].player_id).name)}</b><small>${g === "flick" ? "Arcade King" : "Trivia Brain"} · ${a.champs[g].best} last week</small></div></div>` : "";
  if (a.champs.flick || a.champs.trivia) h += `<div class="champs">${ch("flick", "👑")}${ch("trivia", "🧠")}</div>`;
  h += `<div class="row between" style="margin:18px 2px 8px"><div class="sec" style="margin:0">This week's leaderboard</div><small class="reset">Resets in <span class="mini-cd" data-cd="${nextMonday().getTime()}">${fmtCount(nextMonday() - Date.now())}</span></small></div>
  <div class="seg" style="margin-bottom:10px"><button class="${a.tab === "flick" ? "on" : ""}" data-act="arctab" data-v="flick">🏀 Flick Shot</button><button class="${a.tab === "trivia" ? "on" : ""}" data-act="arctab" data-v="trivia">🇱🇧 Trivia</button></div>`;
  if (!board.length) h += `<div class="empty">No scores yet this week. Be the first on the board 👀</div>`;
  board.forEach((r, i) => {
    const p = P(r.player_id), medal = ["🥇", "🥈", "🥉"][i] || `<span class="rkn">${i + 1}</span>`;
    h += `<div class="lb ${i === 0 ? "top1" : ""} ${r.player_id === meId() ? "me" : ""}"><div class="rk" style="font-size:18px">${medal}</div>${av(p)}<div style="flex:1;min-width:0"><div style="font-weight:800">${esc(p.name)}${r.player_id === meId() ? " (you)" : ""}</div>
      <div style="color:var(--muted);font-size:12px;font-weight:600">${r.plays} ${a.tab === "trivia" ? (r.plays === 1 ? "day" : "days") : (r.plays === 1 ? "game" : "games")} played</div></div><div class="arc-score">${r.best}</div></div>`;
  });
  if (board.length && meRow < 0) h += `<div class="sub" style="margin-top:8px">You're not on the board yet this week.</div>`;
  return h;
}
let arcStop = null;
const arcSfx = { swish: () => playSwish(), rim: () => blipSnd(110, 0.09), miss: () => blipSnd(90, 0.18) };
function blipSnd(freq, dur) { if (!soundOn()) return; const c = ensureAudio(); if (!c || c.state !== "running") return; const o = c.createOscillator(), g = c.createGain(); o.type = "square"; o.frequency.value = freq; g.gain.setValueAtTime(0.08, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur); }
function arcPlay(game) {
  if (game === "trivia" && state.arc.triviaToday !== null) { toast("✅ You've played today's trivia. New questions tomorrow!"); return; }
  if (!window.SwishArcade) { toast("⚠️ Games are still loading, try again"); return; }
  ensureAudio(); document.getElementById("arcPlay")?.remove();
  const el = document.createElement("div"); el.id = "arcPlay";
  el.innerHTML = `<div class="arc-top"><button class="back" data-arc="quit">✕ Quit</button><b>${game === "flick" ? "🏀 Flick Shot" : "🇱🇧 Lebanese Hoops Trivia"}</b><span></span></div><div class="arc-root"></div>`;
  document.body.appendChild(el); document.body.classList.add("playing");
  const root = el.querySelector(".arc-root");
  el.querySelector('[data-arc="quit"]').onclick = () => {
    if (game === "trivia" && !el.dataset.done) { toast("Trivia counts once a day, finish it! 😉"); return; }
    closeArc();
  };
  const onEnd = async (score, correct) => {
    el.dataset.done = 1; arcStop = null;
    root.innerHTML = `<div class="arc-result"><div class="k">Submitting…</div><div class="big">${score}</div></div>`;
    const { data, error } = await sb.rpc("submit_score", { _game: game, _score: score });
    if (error) { root.innerHTML = `<div class="arc-result"><div class="k">Couldn't save</div><div class="big">${score}</div><p>${esc(error.message)}</p><button class="btn ghost" data-arc="quit2">Back</button></div>`; root.querySelector('[data-arc="quit2"]').onclick = closeArc; return; }
    const pb = data.personal_best && score > 0, first = data.rank === 1;
    if (first || pb) { setTimeout(() => playSound("cheer", 0.8), 250); confetti(); }
    const friends = state.players.filter((p) => p.id !== meId());
    root.innerHTML = `<div class="arc-result"><div class="k">${first ? "👑 #1 this week!" : pb ? "🏆 New personal best!" : "Final score"}</div>
      <div class="big">${score}</div><p>${game === "trivia" ? `${correct}/5 correct · ` : ""}#${data.rank} of ${data.players} this week${!pb && data.best ? ` · your best: ${data.best}` : ""}</p>
      ${friends.length && score > 0 ? `<div class="chal"><select id="chalTo">${friends.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><button class="btn orange sm" data-arc="chal">🎯 Challenge</button></div>` : ""}
      ${game === "flick" ? `<button class="btn primary" data-arc="again">🏀 Play again</button>` : ""}
      <button class="btn ghost" style="margin-top:8px" data-arc="done">See leaderboard</button></div>`;
    root.querySelector('[data-arc="again"]')?.addEventListener("click", () => arcPlay("flick"));
    root.querySelector('[data-arc="done"]').onclick = () => { state.arc.tab = game; closeArc(); };
    root.querySelector('[data-arc="chal"]')?.addEventListener("click", async () => {
      const to = root.querySelector("#chalTo").value; const { error } = await sb.rpc("arcade_challenge", { _to: to, _game: game, _score: score });
      if (error) toast("⚠️ " + error.message); else { toast(`🎯 Challenge sent to ${P(to).name}`); kickDispatch(); }
    });
    kickDispatch(); await loadArcade(); if (state.tab === "arcade") render();
  };
  arcStop = game === "flick" ? SwishArcade.flick(root, { sfx: arcSfx, onEnd }) : SwishArcade.trivia(root, window.TRIVIA_LB || [], { sfx: arcSfx, onEnd });
}
function closeArc() { if (arcStop) arcStop(); arcStop = null; document.getElementById("arcPlay")?.remove(); document.body.classList.remove("playing"); state.tab = "arcade"; render(); celebrate(); }

function gamesView() {
  const m = me(); const ups = upcoming(); const mine = ups.filter((s) => entryOf(s, meId())); const nxt = mine[0]; const ds = daysSince(m);
  let h = heroCard(m, ups, mine);
  h += installCard();
  h += pushCard();
  if (!m.avatar && !ls.get("hidePhoto")) h += `<div class="teaser"><span>📸</span><div style="flex:1"><b>Add your photo</b><br>So the squad sees your face on teams, the podium and the leaderboard.
    <div style="margin-top:10px"><label class="btn primary sm" style="display:inline-block;width:auto">Add photo<input type="file" accept="image/*" data-field="avatar" style="display:none"></label></div></div><button class="btn ghost sm" data-act="hidephoto">✕</button></div>`;
  state.credits.filter((c) => c.winner === meId() && !c.used).forEach((c) => h += `<div class="gift"><span>🎁</span><div><b>Your next game is free!</b><br>${esc(P(c.loser).name)} lost a bet and pays your next spot.</div></div>`);
  state.credits.filter((c) => c.loser === meId() && !c.used).forEach((c) => h += `<div class="gift owe"><span>💸</span><div><b>You owe ${esc(P(c.winner).name)} a game</b><br>You'll cover their spot the next time they book.</div></div>`);
  state.debts.filter((d) => d.to.includes(meId()) || d.from.includes(meId())).forEach((d) => {
    const won = d.to.includes(meId());
    const line = won ? (d.team ? "The other team owes your team" : P(d.from[0]).name + " owes you") : (d.team ? "Your team owes the winners" : "You owe " + P(d.to[0]).name);
    h += `<div class="gift ${won ? "" : "owe"}"><span>${won ? "🎉" : "🫣"}</span><div style="flex:1"><b>${esc(line)} ${esc(d.text)}</b><br>${d.team ? "Team challenge" : "Bet"} from ${fmtShort(d.date)}${d.team ? ` · ${(won ? d.from : d.to).map((x) => esc(P(x).name)).join(", ")}` : ""}</div>
      <button class="btn ghost sm" data-act="settle" data-did="${d.id}">✓ Settled</button></div>`;
  });
  if (m.admin) h += `<div class="grid2" style="margin:8px 0 2px"><button class="btn orange" data-act="new">+ One-off game</button><button class="btn ghost" data-act="rules">🔁 Weekly games</button></div>`;
  h += `<h2>Upcoming games</h2>`;
  const locked = ups.filter((s) => s.ruleId && !isOpen(s)); const shown = m.admin ? ups : ups.filter((s) => !locked.includes(s));
  if (!m.admin) locked.forEach((s) => h += `<div class="teaser"><span>🔒</span><div><b>Next ${DOW[s.date.getDay()]} game: ${fmtShort(s.date)}, ${fmtTime(s.time)}</b><br>Booking opens ${fmtOpen(s)}. We'll notify you.</div></div>`);
  if (!shown.length && !(locked.length && !m.admin)) h += `<div class="empty">No games open right now.${m.admin ? " Post a one-off game or set up your weekly game." : ""}</div>`;
  shown.forEach((s) => {
    const leftN = s.capacity - s.roster.length, hot = isOpen(s) && leftN > 0 && leftN <= 2, sold = leftN <= 0;
    h += `<div class="card ${hot ? "hot" : ""} ${sold ? "sold" : ""}" data-act="open" data-id="${s.id}">${sold ? '<div class="stamp">SOLD OUT</div>' : ""}<div class="row">
      <div class="day"><small>${fmtDay(s.date)}</small><big>${s.date.getDate()}</big><small style="margin:2px 0 0">${s.date.toLocaleDateString("en-GB", { month: "short" })}</small></div>
      <div class="meta"><div class="t">${fmtTime(s.time)} · ${s.capacity}-player court</div><div class="m">${esc(s.court)}</div>
        <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${statusPill(s)}<span class="pill money">${$$(eachFull(s))} each</span>${s.ruleId ? '<span class="pill">🔁 Weekly</span>' : '<span class="pill">📌 One-off</span>'}${s.waitlist.length ? `<span class="pill wait">+${s.waitlist.length} waiting</span>` : ""}${s.teams ? '<span class="pill hot">⚔️ Teams out</span>' : ""}</div></div>
      ${ring(s)}</div>
      ${m.admin && s.ruleId && !isOpen(s) ? `<div class="sub" style="margin:10px 0 0">🛡️ Only admins see this. Players see it when booking opens.</div>` : ""}
      ${s.roster.length ? `<div class="stack">${s.roster.slice(0, 10).map((r) => avR(r, "sm")).join("")}${s.roster.length > 10 ? `<div class="av sm" style="background:#2c303b;color:#fff">+${s.roster.length - 10}</div>` : ""}</div>` : ""}</div>`;
  });
  const rec = recent();
  if (rec.length) {
    h += `<h2>Recent games</h2>`;
    rec.slice(0, 4).forEach((s) => {
      const canVote = !s.mvpClosed && entryOf(s, meId()) && !s.mvpVotes[meId()];
      h += `<div class="card" data-act="open" data-id="${s.id}"><div class="row"><div class="day" style="opacity:.7"><small>${fmtDay(s.date)}</small><big>${s.date.getDate()}</big></div>
      <div class="meta"><div class="t">${s.winner ? `🏆 Team ${s.winner} won` : "✅ Played"}</div><div class="m">${esc(s.court)}</div>
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${s.mvp ? `<span class="pill gold">🐐 MVP: ${esc(P(s.mvp).name)}</span>` : canVote ? '<span class="pill hot">🗳️ Vote for MVP</span>' : '<span class="pill">🗳️ Players are voting</span>'}${s.bets.filter((b) => b.status === "won").map((b) => `<span class="pill money">💰 ${esc(P(b.winner).name)} won ${esc(b.text)}</span>`).join("")}${s.teamBets.filter((b) => b.status === "won").map((b) => `<span class="pill money">🍽️ Team ${b.winnerTeam} won ${esc(b.text)}</span>`).join("")}</div></div></div></div>`;
    });
  }
  return h;
}

function squadView() {
  const m = me(); const key = { games: (p) => p.games, wins: (p) => p.wins, mvps: (p) => p.mvps, away: (p) => daysSince(p) ?? 9999 }[state.sort];
  const ranked = [...state.players].sort((a, b) => key(b) - key(a));
  let h = `<h2>Squad</h2>`;
  if (m.admin && state.pending.length) {
    h += `<div class="sec">🙋 Wants to join</div>`;
    state.pending.forEach((p) => h += `<div class="lb">${av(p)}<div style="flex:1;min-width:0"><div style="font-weight:800">${esc(p.name)}</div><div style="color:var(--muted);font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis">${esc(p.email)}</div></div>
      <button class="btn primary sm" data-act="approve" data-pid="${p.id}">Approve</button><button class="btn ghost sm" data-act="decline" data-pid="${p.id}">✕</button></div>`);
  }
  h += `<div class="seg" style="margin-bottom:12px">${[["games", "Games"], ["wins", "Wins"], ["mvps", "🐐 MVPs"], ["away", "😴 Away"]].map(([k, l]) => `<button class="${state.sort === k ? "on" : ""}" data-act="sort" data-v="${k}">${l}</button>`).join("")}</div>`;
  if (state.sort === "away") h += `<div class="sub">Days since each player's last game${m.admin ? ". Nudge the ones you miss 👋" : ""}</div>`;
  let moves = {};
  if (state.sort !== "away") {
    const cur = Object.fromEntries(ranked.map((p, i) => [p.id, i + 1])); const k = "ranks:" + state.sort;
    let st; try { st = JSON.parse(ls.get(k) || "{}"); } catch { st = {}; }
    if (JSON.stringify(st.cur) !== JSON.stringify(cur)) { st = { prev: st.cur || cur, cur }; ls.set(k, JSON.stringify(st)); }
    ranked.forEach((p) => { const was = st.prev?.[p.id]; if (was) moves[p.id] = was - cur[p.id]; });
  }
  ranked.forEach((p, i) => {
    const d = daysSince(p); const b = []; if (state.sort !== "away" && i === 0 && key(p) > 0) b.push("👑"); if (p.mvps) b.push("🐐".repeat(Math.min(p.mvps, 3))); if (p.admin) b.push("🛡️"); if (p.games >= 20) b.push("💯"); badgesOf(p.id).forEach((k) => BADGES[k] && b.push(BADGES[k].e));
    const stat = { games: `${p.games} games`, wins: `${p.wins} wins · ${p.games ? Math.round((p.wins / p.games) * 100) : 0}% win rate`, mvps: `${p.mvps} MVP award${p.mvps === 1 ? "" : "s"}`, away: d === null ? "No games yet" : `Last game ${d === 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"}` }[state.sort];
    h += `<div class="lb ${state.sort !== "away" && i === 0 && key(p) > 0 ? "top1" : ""}" ${m.admin ? `data-act="player" data-pid="${p.id}" style="cursor:pointer"` : ""}><div class="rk">${state.sort === "away" ? "" : i + 1}${moves[p.id] > 0 ? `<i class="mv up">▲${moves[p.id]}</i>` : moves[p.id] < 0 ? `<i class="mv down">▼${-moves[p.id]}</i>` : ""}</div>${av(p)}<div style="flex:1;min-width:0"><div style="font-weight:800">${esc(p.name)}${p.id === meId() ? " (you)" : ""} <span class="badges">${b.join("")}</span></div>
    <div style="color:var(--muted);font-size:12px;font-weight:600">${stat}</div></div>
    ${d === null ? "" : `<span class="pill ${d >= 21 ? "full" : d >= 14 ? "hot" : ""}">${d >= 14 ? "😴 " : ""}${d}d</span>`}
    ${m.admin && d !== null && d >= 14 && p.id !== meId() ? `<button class="btn ghost sm" data-act="nudge" data-pid="${p.id}">👋</button>` : ""}</div>`;
  });
  h += `<div class="sub" style="margin-top:12px">👑 Top of the list · 🐐 MVP awards · 💯 20+ games · 🛡️ Admin · 😴 14+ days away${m.admin ? " · Tap a player to manage them" : ""}</div>`;
  return h;
}

function alertsView() {
  let h = `<h2>Alerts</h2>`;
  if (!state.notifs.length) h += `<div class="empty">No alerts yet. They'll show up here and on your phone.</div>`;
  state.notifs.forEach((n) => {
    const isBet = /challeng|bet/i.test(n.title);
    const tap = n.sid ? ` data-act="opengame" data-id="${n.sid}" data-bets="${isBet ? 1 : ""}" style="cursor:pointer"` : "";
    const cal = n.link && n.link.includes("calendar.google.com") && n.sid && S(n.sid);
    const href = cal ? calHref(S(n.sid)) : n.link;
    h += `<div class="notif${n.sid ? " tap" : ""}"${tap}><div class="ic">${esc(n.icon)}</div><div style="flex:1"><b>${esc(n.title)}</b><p style="white-space:pre-line">${esc(n.body)}</p>${n.sid ? `<div class="go">${isBet ? "View challenge →" : "Open game →"}</div>` : ""}
    ${n.link && (!n.link.includes("calendar.google.com") || cal) ? `<a href="${esc(href)}" ${(cal && isIOS()) || String(href).startsWith("#") ? "" : 'target="_blank" rel="noopener"'} class="pill money" style="text-decoration:none;margin-top:8px">${esc(n.linkLabel || "Open")}</a>` : ""}
    <div class="chan"><span>${fmtShort(n.time)} · ${hhmm(n.time)}</span></div></div></div>`;
  });
  return h;
}

function meView() {
  const m = me(); const d = daysSince(m); const wr = m.games ? Math.round((m.wins / m.games) * 100) : 0;
  const pushTxt = { on: "✅ On for this phone", off: "Off on this phone", denied: "Blocked in your phone settings", unsupported: "Not supported in this browser", "needs-install": "Add the app to your home screen first", unknown: "" }[state.pushState];
  let h = `<div class="row" style="margin:14px 4px 4px;gap:14px"><label class="av-edit">${av(m, "xl")}<span class="cam">📷</span><input type="file" accept="image/*" data-field="avatar" style="display:none"></label><div style="min-width:0"><div style="font-family:'Archivo Black',system-ui,sans-serif;font-size:22px">${esc(m.name)}</div><div style="color:var(--muted);font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis">${m.admin ? "🛡️ Admin" : "Player"} · ${esc(m.email)}</div></div></div>
  <div class="sec">My season</div>
  <div class="stats">
    <div><b data-count="${m.games}">${m.games}</b><span>Games played</span></div><div><b data-count="${m.wins}">${m.wins}</b><span>Wins</span></div><div><b data-count="${wr}" data-suf="%">${wr}%</b><span>Win rate</span></div>
    <div><b data-count="${m.mvps}" data-suf="🐐">${m.mvps}🐐</b><span>MVP awards</span></div><div><b data-count="${m.spent}" data-money="1">${$$(m.spent)}</b><span>Spent on courts</span></div><div><b ${d === null ? "" : `data-count="${d}" data-suf="d"`}>${d === null ? "–" : d + "d"}</b><span>Since last game</span></div></div>
  <div class="sec">🏅 Badges</div>
  <div class="badges-grid">${Object.entries(BADGES).map(([k, B]) => { const has = badgesOf(meId()).includes(k);
    return `<div class="bdg ${has ? "on" : ""} ${k}"><div class="e">${B.e}</div><b>${B.n}</b><small>${has ? (k === "ghost" ? "Active, go play!" : "Unlocked") : B.d}</small></div>`; }).join("")}</div>
  <div class="sec">Notifications</div>
  <div class="toggle"><div>🔔 Push on this phone<small>${pushTxt}</small></div>${state.pushState === "on" ? '<span class="pill in">On</span>' : state.pushState === "off" || state.pushState === "unknown" ? '<button class="btn primary sm" data-act="push">Turn on</button>' : ""}</div>
  ${[["push", "📲 Push", "Instant alerts on your phone"]].map(([k, l, dd]) =>
    `<div class="toggle"><div>${l}<small>${dd}</small></div><button class="sw ${m.prefs[k] !== false ? "on" : ""}" data-act="pref" data-k="${k}"></button></div>`).join("")}
  <div class="toggle"><div>🔊 Sounds<small>Swish when the app opens and when you book</small></div><button class="sw ${soundOn() ? "on" : ""}" data-act="sound"></button></div>
  <div class="sec">Profile</div>
  <div class="row" style="gap:8px"><label class="btn ghost sm" style="width:auto;display:inline-block">📷 ${m.avatar ? "Change photo" : "Add a photo"}<input type="file" accept="image/*" data-field="avatar" style="display:none"></label>${m.avatar ? '<button class="btn ghost sm" style="width:auto" data-act="rmavatar">Remove photo</button>' : ""}</div>
  <label class="f">Name</label><input id="pfName" value="${esc(m.name)}" maxlength="24">
  <label class="f">Phone (optional)</label><input id="pfPhone" value="${esc(m.phone || "")}" maxlength="30">
  <button class="btn ghost" style="margin-top:10px" data-act="saveprofile">Save profile</button>`;
  if (m.admin) {
    const logo = state.settings.logo;
    h += `<div class="sec">Admin · App name & logo</div>
    <div class="row" style="gap:12px">${logo ? `<img src="${esc(logo)}" alt="" style="width:56px;height:56px;border-radius:16px;object-fit:cover;flex:none">` : `<div style="width:56px;height:56px;flex:none">${BALL.replace('class="ball"', 'style="width:56px;height:56px"')}</div>`}
      <div style="flex:1"><label class="btn ghost sm" style="display:inline-block;width:auto">🖼️ Upload logo<input type="file" accept="image/*" data-field="logo" style="display:none"></label>
      ${logo ? `<button class="btn ghost sm" data-act="resetlogo" style="margin-left:6px">Reset</button>` : ""}<div class="sub" style="margin:6px 0 0">Square images look best.</div></div></div>
    <label class="f">App name</label><input id="appName" value="${esc(state.settings.app_name)}" maxlength="24">
    <label class="f">Prepay link (PayPal, Venmo…)</label><input id="payLink" value="${esc(state.settings.pay_link)}" placeholder="https://paypal.me/yourname">
    <button class="btn ghost" style="margin-top:10px" data-act="savesettings">Save app settings</button>`;
  }
  h += `<button class="btn danger" style="margin-top:22px" data-act="logout">Log out</button><div style="height:10px"></div>`;
  return h;
}

function teamsBlock(s) {
  if (!s.teams) return ""; const col = (t) => (s.winner === t ? "win" : "");
  const list = (t) => (s.teams[t] || []).map((k) => { const r = entryById(s, k); return r ? `<div class="tm">${avR(r, "sm")}<span>${esc(nameOfKey(s, k))}</span></div>` : ""; }).join("");
  return `<div class="teams"><div class="team A ${col("A")}"><div class="th">🟠 Team A${s.winner === "A" ? " 🏆" : ""}</div>${list("A")}</div><div class="team B ${col("B")}"><div class="th">🟢 Team B${s.winner === "B" ? " 🏆" : ""}</div>${list("B")}</div></div>`;
}
function stakeChips(cur, act, noGame, cid) {
  return `<div class="chips">${STAKES.filter((x) => !(noGame && x[0] === "game")).map(([k, l]) => `<button class="${cur === k ? "on" : ""}" data-act="${act}" data-v="${k}">${l}</button>`).join("")}</div>
  ${cur === "custom" ? `<input data-field="${cid}" value="${esc(state[cid] || "")}" placeholder="e.g. Shawarma, washing the bibs, a coffee…" maxlength="40" style="margin-top:8px">` : ""}`;
}
const BLABEL = { pending: "⏳ Waiting", accepted: "🤝 On", declined: "🐔 Declined", won: "💰 Won", void: "🤷 Void", expired: "⌛ Expired" };
function betsBlock(s, played) {
  const m = meId(); const mineE = entryOf(s, m); let h = "";
  h += `<div id="betsAnchor"></div>`;
  const tb = s.teamBets.find((b) => ["pending", "accepted", "won"].includes(b.status)) || s.teamBets[s.teamBets.length - 1]; const mt = teamOfPid(s, m);
  if (s.teams && (tb || (!played && mt))) {
    h += `<div class="sec">🍽️ Team challenge</div>`;
    if (tb) {
      const canAccept = !played && tb.status === "pending" && mt === otherT(tb.fromTeam);
      h += `<div class="tbet"><div style="flex:1;min-width:0"><div style="font-weight:800">${tName(tb.fromTeam)} vs ${tName(otherT(tb.fromTeam))}</div>
        <div style="color:var(--muted);font-size:12.5px;font-weight:600;margin-top:2px">Losing team owes ${esc(tb.text)} · called by ${esc(P(tb.by).name)}${tb.status === "won" ? ` · ${tName(tb.winnerTeam)} won` : ""}</div></div>
        ${canAccept ? `<button class="btn primary sm" data-act="tyes" data-bid="${tb.id}">Accept</button><button class="btn ghost sm" data-act="tno" data-bid="${tb.id}">Nah</button>` : `<span class="pill ${tb.status === "won" ? "money" : tb.status === "accepted" ? "in" : ""}">${BLABEL[tb.status] || tb.status}</span>`}</div>`;
    }
    if (!played && mt && (!tb || tb.status === "declined")) {
      if (state.tOpen) h += `<div class="paybox"><div style="font-weight:800;margin-bottom:8px">${tName(mt)} challenges ${tName(otherT(mt))} for…</div>${stakeChips(state.tstake, "tstake", true, "tstakeCustom")}
        <div class="sub" style="margin:8px 0 10px">Anyone on the other team can accept. Losing team owes the winners.</div><button class="btn orange" data-act="tchallenge" data-id="${s.id}">🔥 Send team challenge</button></div>`;
      else h += `<button class="btn ghost" data-act="topen">🔥 Challenge ${tName(otherT(mt))}</button>`;
    }
  }
  if (s.bets.length || (!played && mineE)) h += `<div class="sec">⚔️ 1v1 bets</div>`;
  s.bets.forEach((b) => {
    const incoming = b.to === m && b.status === "pending" && !played;
    h += `<div class="bet"><div class="row" style="gap:6px">${av(P(b.from), "sm")}<b style="font-size:13px">vs</b>${av(P(b.to), "sm")}</div>
      <div style="flex:1;min-width:0;font-size:13.5px;font-weight:700">${esc(P(b.from).name)} vs ${esc(P(b.to).name)}<br><span style="color:var(--muted);font-weight:600;font-size:12.5px">${b.status === "won" ? `${esc(P(b.winner).name)} wins ${esc(b.text)}` : `For: ${esc(b.text)}`}</span></div>
      ${incoming ? `<button class="btn primary sm" data-act="betyes" data-bid="${b.id}">Accept</button><button class="btn ghost sm" data-act="betno" data-bid="${b.id}">Nah</button>` : `<span class="pill ${b.status === "won" ? "money" : b.status === "accepted" ? "in" : ""}">${BLABEL[b.status] || b.status}</span>`}</div>`;
  });
  if (!played && mineE) {
    const opts = s.roster.filter((r) => !r.guest && r.pid !== m).map((r) => P(r.pid));
    if (state.chOpen && opts.length) h += `<div class="paybox"><div style="font-weight:800;margin-bottom:8px">Who are you calling out?</div><select id="chTarget" data-field="chTarget">${opts.map((p) => `<option value="${p.id}" ${state.chTarget === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <div style="font-weight:800;margin:12px 0 8px">Loser owes…</div>${stakeChips(state.stake, "stake", false, "stakeCustom")}
      <div class="sub" style="margin:8px 0 10px">Only counts if you end up on opposite teams.</div>
      <button class="btn orange" data-act="challenge" data-id="${s.id}">⚔️ Send challenge</button></div>`;
    else if (opts.length) h += `<button class="btn ghost" data-act="chopen">⚔️ Challenge someone 1v1</button>`;
  }
  return h;
}

function sessionSheet(s) {
  const m = me(); const played = s.status === "played"; const r = entryOf(s, meId()); const w = inWait(s, meId()); const full = s.roster.length >= s.capacity; const open = isOpen(s);
  const paidCount = s.roster.filter((x) => x.paid).length; const collected = paidCount * each(s);
  let h = `<div class="grab"></div><div class="row between"><div><div style="color:var(--orange2);font-weight:800;font-size:13px">${fmtLong(s.date).toUpperCase()}${s.ruleId ? " · 🔁 WEEKLY" : ""}</div>
  <div style="font-family:'Archivo Black',system-ui,sans-serif;font-size:24px;margin-top:2px">${played ? (s.winner ? `🏆 Team ${s.winner} won` : "✅ Played") : fmtTime(s.time)}</div></div>${ring(s)}</div>
  <div class="loc"><div style="flex:1;min-width:0"><div style="font-weight:800;font-size:14px">📍 ${esc(s.court)}</div><div style="color:var(--muted);font-size:12.5px;margin-top:2px;overflow-wrap:anywhere">${esc(s.address)}</div></div>
  <a class="btn sm orange" href="${esc(mapUrl(s))}" target="_blank" rel="noopener" style="text-decoration:none">🗺️ Directions</a></div>`;
  if (played) {
    h += teamsBlock(s);
    const voters = [...new Set(s.roster.filter((x) => !x.guest).map((x) => x.pid))]; const tally = {}; Object.values(s.mvpVotes).forEach((t) => (tally[t] = (tally[t] || 0) + 1));
    h += `<div class="sec">🐐 MVP</div>`;
    if (s.mvp) h += `<div class="mvp">${av(P(s.mvp), "lg")}<div><div style="font-family:'Archivo Black',system-ui,sans-serif;font-size:20px">${esc(P(s.mvp).name)}</div><div style="color:#1a0b02;font-weight:700;font-size:13px">MVP · ${tally[s.mvp] || 0} vote${tally[s.mvp] === 1 ? "" : "s"}</div></div><div style="font-size:40px;margin-left:auto">🐐</div></div>`;
    if (s.mvp) h += `<button class="btn ghost sm" style="margin-top:8px;width:100%" data-act="replaymvp" data-id="${s.id}">🎬 Replay the MVP reveal</button>`;
    else if (s.mvpClosed) h += `<div class="empty">No MVP this time.</div>`;
    else {
      const myVote = s.mvpVotes[meId()];
      h += `<div class="sub" style="margin:0 2px 8px">${Object.keys(s.mvpVotes).length}/${voters.length} voted${r && !myVote ? " · tap who balled out" : ""}${myVote ? ` · you voted ${esc(P(myVote).name)}` : ""}${!r ? " · only players who played can vote" : ""}</div><div class="plist">`;
      voters.forEach((pid) => {
        const p = P(pid); const n = tally[pid] || 0; const can = r && !myVote && pid !== meId();
        h += `<div class="p">${av(p, "sm")}<div class="n">${esc(p.name)}<small>${"🗳️".repeat(Math.min(n, 6)) || "no votes yet"}</small></div>${can ? `<button class="btn primary sm" data-act="vote" data-id="${s.id}" data-pid="${pid}">Vote</button>` : myVote === pid ? '<span class="pill in">Your pick</span>' : ""}</div>`;
      });
      h += `</div>`; if (m.admin) h += `<button class="btn ghost" style="margin-top:10px" data-act="closemvp" data-id="${s.id}">🏁 Close vote & crown MVP</button>`;
    }
    h += betsBlock(s, true);
    return h;
  }
  h += `<div class="row" style="gap:6px;margin-top:12px;flex-wrap:wrap">${statusPill(s)}<span class="pill money">Court ${$$(s.price)} · ${$$(each(s))} each now</span></div>
  <div class="hype">${["🔥", "🏀", "💪", "😤", "🐐"].map((e) => { const l = s.hype[e] || []; return `<button class="${l.includes(meId()) ? "on" : ""}" data-act="hype" data-id="${s.id}" data-e="${e}">${e} ${l.length || ""}</button>`; }).join("")}</div>
  <div style="margin-top:16px">`;
  if (r) h += `<div class="grid2"><a class="btn ghost" href="${esc(calHref(s))}" ${isIOS() ? "" : 'target="_blank" rel="noopener"'} style="text-decoration:none;text-align:center">📅 Add to calendar</a><button class="btn danger" data-act="leave" data-id="${s.id}">Drop out</button></div>`;
  else if (w >= 0) h += `<button class="btn ghost" data-act="leave" data-id="${s.id}">Leave waitlist (you're #${w + 1})</button>`;
  else if (!open) h += `<button class="btn ghost" disabled style="opacity:.7">🔒 Booking opens ${fmtOpen(s)}</button>`;
  else if (full) h += `<button class="btn ghost" style="border-color:var(--blue);color:var(--blue)" data-act="join" data-id="${s.id}">Join waitlist (${s.waitlist.length} ahead)</button>`;
  else h += `<button class="btn primary" data-act="join" data-id="${s.id}">🏀 I'm in! (${$$(eachFull(s))})</button>`;
  h += `</div>`;
  if (r) {
    const gs = guestsOf(s, meId());
    if (state.guestOpen) h += `<div class="paybox" style="margin-top:10px"><div style="font-weight:800;margin-bottom:8px">➕ Bring a friend</div><div class="row"><input id="guestName" placeholder="Friend's name" maxlength="20"><button class="btn primary sm" data-act="addguest" data-id="${s.id}">Add</button></div><div class="sub" style="margin:8px 0 0">They take a spot and their ${$$(eachFull(s))} goes on your tab.</div></div>`;
    else if (!full) h += `<button class="btn ghost" style="margin-top:10px" data-act="guestopen">➕ Bring a friend (+1)</button>`;
    const share = myShare(s, meId()); const parts = []; if (!r.coveredBy) parts.push("you"); gs.forEach((g) => parts.push(esc(g.guest))); s.roster.filter((x) => x.coveredBy === meId()).forEach((x) => parts.push(esc(P(x.pid).name) + " (bet)"));
    h += `<div class="sec">How are you paying?</div>`;
    if (r.coveredBy) h += `<div class="gift" style="margin:0 0 8px"><span>🎁</span><div><b>Your spot is on ${esc(P(r.coveredBy).name)}</b><br>They lost the bet, so they pay this one.</div></div>`;
    if (share > 0) {
      h += `<div class="seg"><button class="${r.pay === "spot" ? "on" : ""}" data-act="pay" data-id="${s.id}" data-v="spot">💵 On the spot</button><button class="${r.pay === "prepaid" ? "on" : ""}" data-act="pay" data-id="${s.id}" data-v="prepaid">💸 Prepay admin</button></div>
      <div class="sub" style="margin:8px 2px 0">Your total: <b style="color:var(--text)">${$$(share)}</b> (${parts.join(" + ")})</div>`;
      if (r.pay === "prepaid") h += `<div class="paybox"><div style="font-weight:800">Send ${$$(share)} to the admin</div>${state.settings.pay_link ? `<div style="color:var(--muted);font-size:13px;margin:4px 0 10px;word-break:break-all">${esc(state.settings.pay_link)}</div>
        <a href="${esc(state.settings.pay_link)}" target="_blank" rel="noopener" style="text-decoration:none"><div class="btn orange" style="text-align:center">Open payment link</div></a>` : `<div class="sub" style="margin:6px 0 0">Ask the admin how to send it.</div>`}
        <div style="margin-top:10px;font-size:13px;font-weight:700;color:${r.paid ? "var(--lime)" : "var(--muted)"}">${r.paid ? "✓ Admin confirmed your payment" : "Waiting for admin to confirm…"}</div></div>`;
    }
  }
  h += `<div class="sec">Players (${s.roster.length}/${s.capacity})</div><div class="plist">`;
  s.roster.forEach((x) => {
    const p = P(x.pid); const nm = x.guest ? esc(x.guest) : esc(p.name) + (p.id === meId() ? " (you)" : "");
    const sub = x.guest ? `➕ Guest of ${esc(p.name)} · ${esc(p.name)} pays` : x.coveredBy ? `🎁 ${esc(P(x.coveredBy).name)} pays (lost bet)` : x.pay === "prepaid" ? "💸 Prepaid to admin" : "💵 Pays on the spot";
    const t = teamOf(s, x.id);
    h += `<div class="p">${avR(x, "sm")}<div class="n">${nm}${t ? ` <span class="tdot ${t}">${t}</span>` : ""}<small>${sub}</small></div>
    ${x.guest && (x.pid === meId() || m.admin) ? `<button class="btn ghost sm" data-act="rmguest" data-eid="${x.id}">✕</button>` : ""}
    ${m.admin ? `<button class="chk ${x.paid ? "on" : ""}" data-act="paid" data-eid="${x.id}" title="Mark paid">${x.paid ? "✓" : ""}</button>` : x.paid ? '<span class="pill in">Paid</span>' : ""}</div>`;
  });
  for (let i = s.roster.length; i < s.capacity; i++) h += `<div class="p"><div class="slot"></div><div class="n" style="color:var(--muted)">Open spot</div></div>`;
  h += `</div>`;
  if (s.waitlist.length) { h += `<div class="sec">Waitlist</div><div class="plist">`; s.waitlist.forEach((pid, i) => { const p = P(pid); h += `<div class="p"><span style="font-family:'Archivo Black',system-ui,sans-serif;color:var(--blue);width:22px">#${i + 1}</span>${av(p, "sm")}<div class="n">${esc(p.name)}</div></div>`; }); h += `</div>`; }
  if (s.teams) h += `<div class="sec">⚔️ Teams</div>` + teamsBlock(s);
  h += betsBlock(s, false);
  if (m.admin) {
    h += `<div class="sec">🛡️ Admin</div><div class="paybox"><div class="row between"><b>Collected ${$$(collected)}</b><span style="color:var(--muted);font-size:13px;font-weight:700">of ${$$(s.price)} court fee</span></div>
    <div class="bar"><i style="width:${Math.min(100, (collected / Math.max(s.price, 1)) * 100)}%"></i></div>
    <div style="color:var(--muted);font-size:12.5px;margin-top:8px">${paidCount} of ${s.roster.length} paid · tick the box next to a player once you get their money</div>
    <div class="grid2" style="margin-top:12px">
      ${!open ? `<button class="btn orange sm" style="width:100%;grid-column:1/-1" data-act="opennow" data-id="${s.id}">🔓 Open booking now</button>` : ""}
      <button class="btn ghost sm" style="width:100%" data-act="teams" data-id="${s.id}">${s.teams ? "🔀 Reshuffle teams" : "🎲 Pick teams"}</button>
      <button class="btn ghost sm" style="width:100%" data-act="sendloc" data-id="${s.id}">📍 Send location</button>
      <button class="btn ghost sm" style="width:100%" data-act="spots" data-id="${s.id}">📢 Spots update</button>
      <button class="btn ghost sm" style="width:100%" data-act="remind" data-id="${s.id}">⏰ Remind unpaid</button></div>
    <div class="sec" style="margin-top:14px">After the game</div>
    ${s.teams ? `<div class="grid2"><button class="btn sm" style="width:100%;background:#ff9a3d;color:#1a0b02" data-act="played" data-id="${s.id}" data-w="A">🏆 Team A won</button><button class="btn sm" style="width:100%;background:var(--lime);color:#121a00" data-act="played" data-id="${s.id}" data-w="B">🏆 Team B won</button></div>`
      : `<button class="btn ghost sm" style="width:100%" data-act="played" data-id="${s.id}" data-w="">✅ Mark as played</button><div class="sub" style="margin:6px 2px 0">Pick teams first to record a winner and settle bets.</div>`}
    <button class="btn danger sm" style="width:100%;margin-top:8px" data-act="cancel" data-id="${s.id}">Cancel game</button></div>`;
  }
  return h;
}

const dateIso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
function courtFields() {
  return `<label class="f">Court</label><input name="court" placeholder="e.g. Downtown Rec Center · Court 2">
  <label class="f">📍 Address (for directions)</label><input name="address" placeholder="Street and city, or a Google Maps link">
  <div class="grid2"><div><label class="f">Time</label><input type="time" name="time" value="20:00"></div><div><label class="f">Total court price (${esc(state.settings.currency)})</label><input type="number" name="price" value="80" min="0" step="1"></div></div>
  <label class="f">Court size</label><input type="hidden" name="cap" value="8">
  <div class="seg capSeg">${[8, 10, 12].map((n) => `<button type="button" class="${n === 8 ? "on" : ""}" data-cap="${n}">${n} players</button>`).join("")}</div>
  <div class="sub eachHint" style="margin-top:10px">${$$(10)} each when full</div>`;
}
function newSheet() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `<div class="grab"></div><div style="font-family:'Archivo Black',system-ui,sans-serif;font-size:22px">One-off game</div><div class="sub" style="margin:4px 0 0">For an extra court on Thursday or any other day. Booking opens right away and everyone is notified.</div>
  <form id="gForm"><label class="f">Date</label><input type="date" name="date" value="${dateIso(d)}">${courtFields()}
  <button class="btn primary" style="margin-top:14px" type="submit">📣 Post game & notify squad</button></form>`;
}
function rulesSheet() {
  let h = `<div class="grab"></div><div style="font-family:'Archivo Black',system-ui,sans-serif;font-size:22px">🔁 Weekly games</div>
  <div class="sub" style="margin:4px 0 12px">One game at a time: the next one only appears after the current one is played, and booking opens on its own on the day you set. Everyone is notified the moment it opens.</div>`;
  state.rules.forEach((r) => {
    const nx = state.sessions.find((s) => s.ruleId === r.id && s.status === "upcoming");
    h += `<div class="rule ${r.active ? "" : "off"}"><div style="flex:1;min-width:0"><div style="font-weight:800">Every ${DOW[r.dow]} · ${r.time}</div>
    <div style="color:var(--muted);font-size:12.5px;margin-top:2px">${esc(r.court)} · ${r.cap} players · ${$$(r.price)}</div>
    <div style="color:var(--orange2);font-size:12.5px;font-weight:700;margin-top:4px">🔓 Booking opens the ${DOW[r.openDow]} before at ${r.openTime}</div>
    ${nx ? `<div style="color:var(--muted);font-size:12.5px;font-weight:600;margin-top:2px">Next: ${fmtShort(nx.date)} · ${isOpen(nx) ? "booking open now" : "opens " + fmtOpen(nx)}</div>` : ""}</div>
    <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end"><button class="sw ${r.active ? "on" : ""}" data-act="rtoggle" data-rid="${r.id}"></button><button class="btn ghost sm" data-act="rdel" data-rid="${r.id}">🗑️</button></div></div>`;
  });
  if (!state.rules.length) h += `<div class="empty">No weekly games yet. Add your Tuesday game below.</div>`;
  h += `<div class="sec">Add a weekly game</div><form id="rForm"><label class="f">Day</label><select name="dow">${DOW.map((d, i) => `<option value="${i}" ${i === 2 ? "selected" : ""}>Every ${d}</option>`).join("")}</select>
  ${courtFields()}
  <div class="grid2"><div><label class="f">Booking opens</label><select name="openDow">${DOW.map((d, i) => `<option value="${i}" ${i === 6 ? "selected" : ""}>${d} before</option>`).join("")}</select></div><div><label class="f">At</label><input type="time" name="openTime" value="10:00"></div></div>
  <button class="btn primary" style="margin-top:14px" type="submit">🔁 Add weekly game</button></form>`;
  return h;
}
function playerSheet(pid) {
  const p = P(pid);
  return `<div class="grab"></div><div class="row" style="gap:14px">${av(p, "lg")}<div><div style="font-family:'Archivo Black',system-ui,sans-serif;font-size:22px">${esc(p.name)}</div><div style="color:var(--muted);font-size:13px">${esc(p.email || "")}${p.phone ? " · " + esc(p.phone) : ""}</div></div></div>
  <div class="sec">Skill (only admins see this, used to balance teams)</div>
  <div class="chips">${[1, 2, 3, 4, 5].map((n) => `<button class="${p.skill === n ? "on" : ""}" data-act="skill" data-pid="${p.id}" data-v="${n}">${"⭐".repeat(n)}</button>`).join("")}</div>
  <div class="sec">Role</div>
  ${p.id === meId() ? `<div class="sub">You're an admin.</div>` : `<button class="btn ghost" data-act="admin" data-pid="${p.id}" data-v="${p.admin ? "0" : "1"}">${p.admin ? "Remove admin rights" : "🛡️ Make admin"}</button>
  <button class="btn danger" style="margin-top:10px" data-act="remove" data-pid="${p.id}">Remove from squad</button>`}`;
}

// ---------- screens before the app ----------
function skeletonView() {
  return `<div class="sk-wrap"><div class="sk sk-head"></div><div class="sk sk-hero"></div><div class="sk sk-line"></div>${'<div class="sk sk-card"></div>'.repeat(3)}</div>`;
}
function loginView() {
  const logo = state.settings.logo ? `<img src="${esc(state.settings.logo)}" alt="" style="width:84px;height:84px;border-radius:24px;object-fit:cover">` : BALL.replace('class="ball"', 'style="width:84px;height:84px"');
  return `<div class="gate"><div>${logo}</div><h1>${esc(state.settings.app_name)}</h1><p class="sub" style="margin:0 0 22px">Book your spot. Talk your trash. 🏀</p>
  ${!state.codeSent ? `<form id="emailForm"><label class="f">Your email</label><input type="email" name="email" required autocomplete="email" placeholder="you@example.com" value="${esc(state.loginEmail)}">
    <button class="btn primary" style="margin-top:12px" type="submit">Send me a login code</button></form>`
  : `<form id="codeForm"><div class="sub" style="margin:0 0 8px">We emailed a 6-digit code to <b style="color:var(--text)">${esc(state.loginEmail)}</b></div>
    <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" style="font-size:28px;letter-spacing:10px;text-align:center" required>
    <button class="btn primary" style="margin-top:12px" type="submit">Log in</button>
    <button class="btn ghost" style="margin-top:8px" type="button" data-act="backemail">Use a different email</button></form>`}
  </div>`;
}
function onboardView() {
  return `<div class="gate"><div style="font-size:56px">👋</div><h1>Welcome!</h1><p class="sub" style="margin:0 0 18px">What should the squad call you?</p>
  <form id="onboardForm"><label class="f">Name</label><input name="name" required maxlength="24" placeholder="e.g. Bassem">
  <label class="f">Phone (optional)</label><input name="phone" maxlength="30" placeholder="+49 …">
  <button class="btn primary" style="margin-top:14px" type="submit">Let's go</button></form></div>`;
}
function pendingView() {
  return `<div class="gate"><div style="font-size:56px">⏳</div><h1>Almost there</h1><p class="sub" style="margin:0 0 18px">An admin needs to approve you before you can book. We'll send you an email the moment you're in.</p>
  <button class="btn ghost" data-act="refresh">Check again</button><button class="btn danger" style="margin-top:10px" data-act="logout">Log out</button></div>`;
}

function applyBranding() {
  const st = state.settings; document.title = st.app_name;
  const icon = st.logo || new URL("icons/icon-192.png", location.href).href;
  const big = st.logo || new URL("icons/icon-512.png", location.href).href;
  document.getElementById("appleIcon")?.setAttribute("href", icon);
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", st.app_name);
  const manifest = { name: st.app_name, short_name: st.app_name, start_url: new URL(".", location.href).href, scope: new URL(".", location.href).href, display: "standalone",
    background_color: "#0e0f13", theme_color: "#0e0f13", icons: [{ src: icon, sizes: "192x192", type: "image/png" }, { src: big, sizes: "512x512", type: "image/png", purpose: "any maskable" }] };
  const link = document.getElementById("manifest");
  if (link && (st.app_name !== "Swish" || st.logo)) link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
}

const TABS = ["games", "squad", "arcade", "alerts", "me"]; let lastTab = null;
const countText = (el, v) => el.dataset.money ? $$(v) : (el.dataset.pre || "") + Math.round(v) + (el.dataset.suf || "");
function countUp(el) {
  const to = Number(el.dataset.count) || 0, t0 = performance.now(), dur = 900;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = countText(el, to * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function render() {
  const view = document.getElementById("view"); const nav = document.getElementById("nav"); const hdr = document.getElementById("hdr");
  if (state.screen !== "app") {
    hdr.style.display = "none"; nav.style.display = "none"; document.getElementById("scrim").classList.remove("show");
    view.innerHTML = state.screen === "login" ? loginView() : state.screen === "onboard" ? onboardView() : state.screen === "pending" ? pendingView() : skeletonView();
    wireForms(); if (state.screen !== "loading") splashEnd(); return;
  }
  hdr.style.display = ""; nav.style.display = ""; splashEnd();
  const m = me();
  document.getElementById("logo").innerHTML = (state.settings.logo ? `<img class="ball" src="${esc(state.settings.logo)}" alt="">` : BALL) + esc(state.settings.app_name);
  document.getElementById("whoChip").innerHTML = `${av(m, "sm")}<b>${esc(m.name)}</b>${m.admin ? "🛡️" : ""}`;
  const scrollY = window.scrollY; const tabChanged = state.tab !== lastTab;
  view.innerHTML = { games: gamesView, squad: squadView, arcade: arcadeView, alerts: alertsView, me: meView }[state.tab]();
  if (tabChanged) {
    const dir = TABS.indexOf(state.tab) > TABS.indexOf(lastTab) ? "slide-l" : "slide-r";
    view.classList.remove("slide-l", "slide-r"); void view.offsetWidth; if (lastTab) view.classList.add(dir); window.scrollTo(0, 0);
  } else window.scrollTo(0, scrollY);
  view.querySelectorAll("[data-count]").forEach((el) => (tabChanged ? countUp(el) : (el.textContent = countText(el, Number(el.dataset.count)))));
  if (state.tab === "alerts" && state.notifs[0]) { state.lastSeen = state.notifs[0].id; ls.set("lastSeenNotif", state.lastSeen); }
  const unread = state.notifs.filter((n) => n.id > state.lastSeen).length;
  const reqs = m.admin ? state.pending.length : 0;
  document.getElementById("navInd").style.transform = `translateX(${TABS.indexOf(state.tab) * 100}%)`;
  document.getElementById("navBtns").innerHTML = [["games", "🏀", "Games"], ["squad", "🏆", "Squad"], ["arcade", "🕹️", "Arcade"], ["alerts", "🔔", "Alerts"], ["me", "👤", "Me"]].map(([k, i, l]) =>
    `<button class="${state.tab === k ? "on" : ""}" data-act="tab" data-tab="${k}"><span class="i">${i}</span>${l}${k === "alerts" && unread && state.tab !== "alerts" ? `<span class="dot">${unread > 99 ? "99+" : unread}</span>` : ""}${k === "squad" && reqs ? `<span class="dot">${reqs}</span>` : ""}</button>`).join("");
  if (tabChanged && lastTab) document.querySelector("#navBtns .on .i")?.classList.add("bump");
  lastTab = state.tab;
  const sc = document.getElementById("scrim");
  if (state.open) {
    const sh = document.getElementById("sheet"); const top = sh.scrollTop;
    const html = state.open === "new" ? newSheet() : state.open === "rules" ? rulesSheet() : state.open.startsWith("player:") ? playerSheet(state.open.slice(7)) : S(state.open) ? sessionSheet(S(state.open)) : null;
    if (html === null) { state.open = null; sc.classList.remove("show"); return; }
    sh.innerHTML = `<button class="sheet-x" data-act="close" aria-label="Close">✕</button>` + html; sc.classList.add("show"); sh.scrollTop = top;
  } else sc.classList.remove("show");
  wireForms();
}

function wireForms() {
  ["gForm", "rForm"].forEach((fid) => {
    const f = document.getElementById(fid); if (!f || f.dataset.wired) return; f.dataset.wired = 1;
    const hint = () => { f.querySelector(".eachHint").textContent = $$((Number(f.price.value) || 0) / Number(f.cap.value)) + " each when full"; };
    f.querySelectorAll("[data-cap]").forEach((b) => (b.onclick = () => { f.cap.value = b.dataset.cap; f.querySelectorAll("[data-cap]").forEach((x) => x.classList.toggle("on", x === b)); f.price.value = { 8: 80, 10: 100, 12: 120 }[b.dataset.cap]; hint(); }));
    f.price.oninput = hint; f.onsubmit = (e) => { e.preventDefault(); fid === "gForm" ? createSession(f) : addRule(f); };
  });
  const ef = document.getElementById("emailForm");
  if (ef) ef.onsubmit = async (e) => {
    e.preventDefault(); const email = ef.email.value.trim().toLowerCase(); state.loginEmail = email;
    const btn = ef.querySelector("button"); btn.disabled = true; btn.textContent = "Sending…";
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) { toast("⚠️ " + error.message); btn.disabled = false; btn.textContent = "Send me a login code"; return; }
    state.codeSent = true; render(); document.querySelector("#codeForm input")?.focus();
  };
  const cf = document.getElementById("codeForm");
  if (cf) cf.onsubmit = async (e) => {
    e.preventDefault(); const btn = cf.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Checking…";
    const { error } = await sb.auth.verifyOtp({ email: state.loginEmail, token: cf.code.value.trim(), type: "email" });
    if (error) { toast("⚠️ That code didn't work. Try again."); btn.disabled = false; btn.textContent = "Log in"; }
  };
  const of = document.getElementById("onboardForm");
  if (of) of.onsubmit = async (e) => {
    e.preventDefault(); const { error } = await sb.rpc("update_profile", { _name: of.name.value, _phone: of.phone.value, _prefs: null });
    if (error) { toast("⚠️ " + error.message); return; } kickDispatch(); await loadAll(); render();
  };
}

// ================= events =================
document.addEventListener("click", async (e) => {
  if (e.target.id === "scrim") { state.open = null; render(); return; }
  const lnk = e.target.closest("a[href]");
  if (lnk) { if (lnk.getAttribute("href") === "#arcade") { e.preventDefault(); state.tab = "arcade"; state.open = null; render(); } return; }   // links inside a card shouldn't also open the card
  const t = e.target.closest("[data-act]"); if (!t) return; const a = t.dataset.act, id = t.dataset.id;
  const R = (fn, args, msg) => rpc(fn, args).then((r) => { if (!r.error && msg) toast(typeof msg === "function" ? msg(r.data) : msg); });
  const acts = {
    join: () => join(id), leave: () => leave(id), addguest: () => addGuest(id), challenge: () => challenge(id), tchallenge: () => teamChallenge(id),
    pay: () => R("set_pay", { _sid: id, _how: t.dataset.v }, t.dataset.v === "prepaid" ? "💸 Admin notified to confirm your payment" : null),
    paid: () => R("toggle_paid", { _eid: t.dataset.eid }), rmguest: () => R("remove_guest", { _eid: t.dataset.eid }, "Guest removed"),
    hype: () => { const s = S(id); if (!(s.hype[t.dataset.e] || []).includes(meId())) floatEmoji(t, t.dataset.e); lastLocalHype = Date.now(); R("toggle_hype", { _sid: id, _emoji: t.dataset.e }); },
    replaymvp: () => showMvpReveal(S(id)),
    arcplay: () => arcPlay(t.dataset.g),
    remind: () => R("remind_unpaid", { _sid: id }, (n) => `⏰ Reminder sent to ${n} player${n === 1 ? "" : "s"}`),
    cancel: () => { if (t.dataset.sure) { state.open = null; R("cancel_game", { _sid: id }, "Game cancelled · everyone notified"); } else { t.dataset.sure = 1; t.textContent = "Tap again to cancel the game"; } },
    sendloc: () => R("send_location", { _sid: id }, (n) => `📍 Location sent to ${n} players`), spots: () => R("send_spots", { _sid: id }, "📢 Spots update sent"),
    opennow: () => R("open_now", { _sid: id }, "📣 Booking open · squad notified"), teams: () => R("pick_teams", { _sid: id }, "⚔️ Teams picked & sent to the squad"),
    betyes: () => R("respond_bet", { _bid: t.dataset.bid, _ok: true }, "🤝 Bet accepted. Game on!"), betno: () => R("respond_bet", { _bid: t.dataset.bid, _ok: false }, "Bet declined"),
    tyes: () => R("respond_team_bet", { _id: t.dataset.bid, _ok: true }, "🤝 Challenge accepted!"), tno: () => R("respond_team_bet", { _id: t.dataset.bid, _ok: false }, "Challenge declined"),
    played: () => R("mark_played", { _sid: id, _winner: t.dataset.w }, () => { confetti(); return t.dataset.w ? `🏆 Team ${t.dataset.w} wins! MVP vote is open` : "✅ Game recorded · MVP vote is open"; }),
    vote: () => R("vote_mvp", { _sid: id, _target: t.dataset.pid }, `🐐 You voted for ${P(t.dataset.pid).name}`), closemvp: () => R("close_mvp", { _sid: id }, "🐐 MVP crowned"),
    nudge: (ev) => { e.stopPropagation(); R("nudge", { _pid: t.dataset.pid }, `👋 Nudged ${P(t.dataset.pid).name}`); },
    settle: () => R("settle_debt", { _id: t.dataset.did }, "✅ Settled"),
    rtoggle: () => R("toggle_rule", { _id: t.dataset.rid }), rdel: () => { if (t.dataset.sure) R("delete_rule", { _id: t.dataset.rid }, "Weekly game removed. Posted games stay"); else { t.dataset.sure = 1; t.textContent = "Sure?"; } },
    approve: () => R("approve_member", { _pid: t.dataset.pid, _ok: true }, "🎉 Approved"), decline: () => R("approve_member", { _pid: t.dataset.pid, _ok: false }, "Declined"),
    skill: () => R("set_skill", { _pid: t.dataset.pid, _skill: Number(t.dataset.v) }),
    admin: () => R("set_admin", { _pid: t.dataset.pid, _on: t.dataset.v === "1" }, t.dataset.v === "1" ? "🛡️ Now an admin" : "Admin rights removed"),
    remove: () => { if (t.dataset.sure) { state.open = null; R("remove_member", { _pid: t.dataset.pid }, "Removed from the squad"); } else { t.dataset.sure = 1; t.textContent = "Tap again to remove"; } },
    pref: () => togglePref(t.dataset.k), sound: () => { ls.set("sound", soundOn() ? "off" : "on"); if (soundOn()) playSwish(); render(); }, push: () => enablePush(), saveprofile: () => saveProfile(),
    savesettings: () => R("update_settings", { _app_name: document.getElementById("appName").value, _logo: null, _pay_link: document.getElementById("payLink").value.trim() }, "✅ App settings saved"),
    resetlogo: () => R("update_settings", { _app_name: null, _logo: "", _pay_link: null }, "Logo reset"),
    logout: async () => { await sb.auth.signOut(); location.reload(); },
    refresh: async () => { await loadAll(); render(); if (state.screen === "pending") toast("Still waiting for approval"); },
    backemail: () => { state.codeSent = false; render(); },
    install: async () => { if (state.installEvt) { state.installEvt.prompt(); state.installEvt = null; render(); } },
    hideinstall: () => { ls.set("hideInstall", "1"); render(); },
    hidepushdenied: () => { ls.set("hidePushDenied", "1"); render(); },
    rmavatar: () => R("set_avatar", { _url: "" }, "Photo removed"),
    hidephoto: () => { ls.set("hidePhoto", "1"); render(); },
  };
  if (acts[a]) return acts[a]();
  if (a === "close") { closeSheet(); return; }
  if (a === "opengame") { openGame(id, !!t.dataset.bets); return; }
  if (a === "tab") { state.tab = t.dataset.tab; state.open = null; window.scrollTo(0, 0); }
  else if (a === "open") { state.open = id; state.guestOpen = state.chOpen = state.tOpen = false; document.getElementById("sheet").scrollTop = 0; }
  else if (a === "player") { state.open = "player:" + t.dataset.pid; document.getElementById("sheet").scrollTop = 0; }
  else if (a === "new" || a === "rules") { state.open = a; document.getElementById("sheet").scrollTop = 0; }
  else if (a === "guestopen") { state.guestOpen = true; render(); document.getElementById("guestName")?.focus(); return; }
  else if (a === "chopen") state.chOpen = true;
  else if (a === "topen") state.tOpen = true;
  else if (a === "stake") state.stake = t.dataset.v;
  else if (a === "tstake") state.tstake = t.dataset.v;
  else if (a === "sort") state.sort = t.dataset.v;
  else if (a === "arctab") state.arc.tab = t.dataset.v;
  else return;
  render();
});
// open a game's panel (from an alert, a push notification or a #game-<id> link), jumping to the bets section
function openGame(id, toBets) {
  if (!S(id)) { toast("That game isn't available anymore"); return; }
  state.open = id; state.guestOpen = state.chOpen = state.tOpen = false; state.tab = "games";
  document.getElementById("sheet").scrollTop = 0; render();
  if (toBets) setTimeout(() => { const el = document.getElementById("betsAnchor"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
}
function openFromHash() {
  if (location.hash === "#arcade" && state.screen === "app") { history.replaceState(null, "", location.pathname + location.search); state.open = null; state.tab = "arcade"; render(); return; }
  const m = location.hash.match(/^#game-([0-9a-f-]{36})$/i); if (!m || state.screen !== "app") return;
  history.replaceState(null, "", location.pathname + location.search);
  const s = S(m[1]); openGame(m[1], !!s && (s.bets.some((b) => b.status === "pending") || s.teamBets.some((b) => b.status === "pending")));
}
window.addEventListener("hashchange", openFromHash);
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.openHash) { location.hash = e.data.openHash; } });

// ---------- pull down on the main screen to refresh ----------
(() => {
  const ptr = document.createElement("div"); ptr.id = "ptr"; ptr.innerHTML = `<div class="b">${MINI_BALL}</div>`; document.body.appendChild(ptr);
  let y0 = null, d = 0, busy = false;
  window.addEventListener("touchstart", (e) => { y0 = (state.screen === "app" && !state.open && !busy && window.scrollY <= 0 && !document.querySelector(".ov,#arcPlay")) ? e.touches[0].clientY : null; d = 0; }, { passive: true });
  window.addEventListener("touchmove", (e) => { if (y0 === null) return; d = Math.max(0, Math.min((e.touches[0].clientY - y0) * 0.5, 90));
    ptr.style.transition = "none"; ptr.style.opacity = Math.min(1, d / 45); ptr.style.transform = `translate(-50%, ${d}px) rotate(${d * 5}deg)`; }, { passive: true });
  window.addEventListener("touchend", async () => {
    if (y0 === null) return; y0 = null;
    if (d > 60) { busy = true; ptr.style.transition = "transform .2s"; ptr.style.transform = "translate(-50%, 62px)"; ptr.classList.add("spin"); buzz(12);
      await loadAll(); render(); celebrate(); await new Promise((r) => setTimeout(r, 350)); ptr.classList.remove("spin"); busy = false; }
    ptr.style.transition = "transform .3s ease, opacity .3s"; ptr.style.transform = "translate(-50%, 0)"; ptr.style.opacity = 0; d = 0;
  });
})();

// ---------- bottom sheet: swipe down (or tap the handle / ✕ / outside) to close ----------
function closeSheet() {
  const sh = document.getElementById("sheet");
  sh.style.transition = "transform .22s ease-in"; sh.style.transform = "translateY(100%)";
  setTimeout(() => { sh.style.transition = ""; sh.style.transform = ""; state.open = null; render(); }, 210);
}
(() => {
  const sh = document.getElementById("sheet"); let y0 = null, dy = 0, t0 = 0, dragging = false;
  sh.addEventListener("touchstart", (e) => {
    const onHandle = e.target.closest(".grab");
    if (sh.scrollTop > 0 && !onHandle) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); dragging = false;
  }, { passive: true });
  sh.addEventListener("touchmove", (e) => {
    if (y0 === null) return; dy = e.touches[0].clientY - y0;
    if (dy > 8 && (sh.scrollTop <= 0 || dragging)) { dragging = true; e.preventDefault(); sh.style.transition = "none"; sh.style.transform = `translateY(${dy}px)`; }
    else if (!dragging && dy < 0) y0 = null;
  }, { passive: false });
  sh.addEventListener("touchend", () => {
    if (y0 === null) return; y0 = null; if (!dragging) return;
    const fast = dy / Math.max(Date.now() - t0, 1) > 0.6;
    if (dy > 110 || (fast && dy > 40)) closeSheet();
    else { sh.style.transition = "transform .2s ease-out"; sh.style.transform = ""; setTimeout(() => (sh.style.transition = ""), 200); }
    dragging = false;
  });
  document.addEventListener("click", (e) => { if (e.target.closest(".grab") && state.open) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.open) closeSheet(); });
})();

document.addEventListener("input", (e) => { const f = e.target.dataset.field; if (f === "stakeCustom" || f === "tstakeCustom") state[f] = e.target.value; });
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "guestName") { e.preventDefault(); addGuest(state.open); } });
document.addEventListener("change", (e) => {
  const f = e.target.dataset.field;
  if (f === "chTarget") state.chTarget = e.target.value;
  if (f === "logo" && e.target.files[0]) uploadLogo(e.target.files[0]);
  if (f === "avatar" && e.target.files[0]) uploadAvatar(e.target.files[0]);
});
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state.installEvt = e; if (state.screen === "app" && state.tab === "games") render(); });

// pop-up messages at the top are switched off (Bassem, 4 Nov). Re-enable by removing the next line.
const TOASTS_ON = false;
let tt; function toast(msg) { if (!TOASTS_ON) return; const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2800); }
function confetti() {
  const cols = ["#ff6b1a", "#c8f43c", "#5ab0ff", "#ff7eb6", "#ffd23f"];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement("div"); c.className = "confetti"; c.style.left = Math.random() * 100 + "vw"; c.style.background = cols[i % cols.length];
    c.style.animationDuration = 1.6 + Math.random() * 1.6 + "s"; c.style.animationDelay = Math.random() * 0.4 + "s"; c.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    document.body.appendChild(c); setTimeout(() => c.remove(), 3800);
  }
}

// ================= boot =================
setTimeout(() => { ensureAudio(); playSwish(); }, 700);   // plays if the phone allows sound on open
// The splash stays up until the first real screen is drawn (at least 1.55 s so the swish plays, at most 4.5 s),
// so the app never flashes half-loaded behind it.
function splashEnd() {   // a hoisted function, so render() can call it at any time
  if (window.__splashEnded) return; window.__splashEnded = true; const sp = document.getElementById("splash"); if (!sp) return;
  setTimeout(() => requestAnimationFrame(() => { sp.classList.add("done"); setTimeout(() => sp.remove(), 450); }), Math.max(0, 1550 - performance.now()));
}
setTimeout(splashEnd, 4500);
async function onSession(session) {
  state.user = session?.user || null;
  if (!state.user) { state.screen = "login"; const { data } = await sb.from("settings").select("*").eq("id", 1).maybeSingle(); if (data) state.settings = data; applyBranding(); render(); return; }
  await loadAll(); subscribe(); await checkPush(); render(); openFromHash();
  setTimeout(celebrate, 2300);
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
const { data: { session } } = await sb.auth.getSession();
await onSession(session);
sb.auth.onAuthStateChange((ev, session) => { if (ev === "SIGNED_IN" && !state.user) onSession(session); if (ev === "SIGNED_OUT") onSession(null); });
setInterval(() => { if (state.screen === "app" && !state.open) render(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && state.user) scheduleReload(); });
// iPhone ignores the no-zoom setting for pinch gestures, so block them here too
["gesturestart", "gesturechange", "gestureend"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
