// Sends queued notifications by push (Web Push). Email alerts can be switched back on with EMAIL_ALERTS.
// Called by the app after every action, and every minute by the database (pg_cron).
import postgres from "npm:postgres@3.4.4";
import webpush from "npm:web-push@3.6.7";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const EMAIL_ALERTS = false; // set to true to email notifications again
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (t: string) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function config() {
  await sql`insert into private.config(key, value) values ('functions_url', ${Deno.env.get("SUPABASE_URL") + "/functions/v1"})
            on conflict (key) do update set value = excluded.value`;
  let rows = await sql`select key, value from private.config where key in ('vapid_public', 'vapid_private')`;
  if (rows.length < 2) {
    const k = webpush.generateVAPIDKeys();
    await sql`insert into private.config(key, value) values ('vapid_public', ${k.publicKey}), ('vapid_private', ${k.privateKey})
              on conflict (key) do nothing`;
    rows = await sql`select key, value from private.config where key in ('vapid_public', 'vapid_private')`;
  }
  const c = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  webpush.setVapidDetails("mailto:" + (SENDER_EMAIL || "admin@example.com"), c.vapid_public, c.vapid_private);
}

function emailHtml(app: string, n: any) {
  const btn = n.link
    ? `<p style="margin:22px 0 0"><a href="${esc(n.link)}" style="background:#ff6b1a;color:#1a0b02;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:12px;display:inline-block">${esc(n.link_label || "Open")}</a></p>`
    : "";
  const open = APP_URL ? `<p style="margin:22px 0 0;font-size:13px"><a href="${esc(APP_URL)}" style="color:#9a9fac">Open ${esc(app)}</a></p>` : "";
  return `<div style="background:#0e0f13;padding:28px 16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:460px;margin:0 auto;background:#181a21;border:1px solid #2c303b;border-radius:20px;padding:24px;color:#f4f2ee">
    <div style="font-size:13px;font-weight:800;color:#ff9a3d;letter-spacing:.5px;text-transform:uppercase">🏀 ${esc(app)}</div>
    <h1 style="font-size:22px;margin:10px 0 8px">${esc(n.icon)} ${esc(n.title)}</h1>
    <p style="font-size:15px;line-height:1.5;color:#c9ccd4;white-space:pre-line;margin:0">${esc(n.body)}</p>${btn}${open}
  </div></div>`;
}

async function sendEmail(app: string, to: string, n: any) {
  if (!BREVO_API_KEY || !SENDER_EMAIL || !to) return;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: SENDER_EMAIL, name: app },
      to: [{ email: to }],
      subject: `${n.icon} ${n.title}`,
      htmlContent: emailHtml(app, n),
      textContent: `${n.title}\n\n${n.body}${n.link ? `\n\n${n.link_label || "Open"}: ${n.link}` : ""}`,
    }),
  });
  if (!r.ok) console.error("brevo", r.status, await r.text());
}

// phone notifications: bold title + ONE short line of detail (full text stays in the app's Alerts tab)
function oneLine(body: string, max = 60) {
  let t = String(body ?? "").replace(/🟠 Team A:/g, "A:").replace(/🟢 Team B:/g, "B:").replace(/\s*\n+\s*/g, " · ").replace(/\s+/g, " ").trim();
  if ([...t].length > max) t = [...t].slice(0, max - 1).join("").replace(/[\s·,.;:]+$/, "") + "…";
  return t;
}

async function sendPush(n: any, subs: any[]) {
  for (const s of subs) {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify({ title: `${n.icon} ${n.title}`, body: oneLine(n.body), url: n.session_id && APP_URL ? APP_URL + "#game-" + n.session_id : n.link && n.link.startsWith("#") ? APP_URL + n.link : (n.link || APP_URL || "/") }));
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await sql`delete from public.push_subs where endpoint = ${s.endpoint}`;
      else console.error("push", e?.statusCode, e?.body ?? String(e));
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    await config();
    const [{ app_name: app }] = await sql`select app_name from public.settings where id = 1`;
    let total = 0;
    for (let round = 0; round < 5; round++) {
      const batch = await sql`
        update public.notifications set sent_at = now()
        where id in (select id from public.notifications where sent_at is null order by id limit 100 for update skip locked)
        returning id, to_id, icon, title, body, link, link_label, session_id`;
      if (!batch.length) break;
      const ids = [...new Set(batch.map((n) => n.to_id))];
      const people = await sql`select id, email, prefs from public.profiles where id = any(${ids})`;
      const subs = await sql`select endpoint, player_id, sub from public.push_subs where player_id = any(${ids})`;
      const byId = Object.fromEntries(people.map((p) => [p.id, p]));
      await Promise.all(batch.map(async (n) => {
        if (n.session_id && !n.link && APP_URL) { n.link = APP_URL + "#game-" + n.session_id; n.link_label = "Open in the app"; }
        const p = byId[n.to_id];
        if (!p) return;
        const prefs = p.prefs || {};
        const tasks: Promise<unknown>[] = [];
        // notification emails are switched off: alerts go by push (and show in the app's Alerts tab). Login codes are still emailed by Supabase.
        if (EMAIL_ALERTS && prefs.email !== false) tasks.push(sendEmail(app, p.email, n));
        if (prefs.push !== false) tasks.push(sendPush(n, subs.filter((s) => s.player_id === n.to_id)));
        await Promise.allSettled(tasks);
      }));
      total += batch.length;
    }
    return new Response(JSON.stringify({ sent: total }), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "content-type": "application/json" } });
  }
});
