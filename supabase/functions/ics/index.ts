// Returns a game as a calendar file (.ics) so iPhones open it in the built-in Calendar app.
// Usage: GET /functions/v1/ics?sid=<game id>
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const APP_URL = Deno.env.get("APP_URL") ?? "";
const esc = (t: string) => String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// calendar lines must be folded at 75 bytes
const fold = (line: string) => {
  const out: string[] = []; let cur = ""; const enc = new TextEncoder();
  for (const ch of line) { if (enc.encode(cur + ch).length > 73) { out.push(cur); cur = " " + ch; } else cur += ch; }
  out.push(cur); return out.join("\r\n");
};

Deno.serve(async (req) => {
  const sid = new URL(req.url).searchParams.get("sid") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(sid)) return new Response("Missing game", { status: 400 });
  const rows = await sql`
    select s.id, s.court, s.address, s.capacity, s.price, st.app_name, st.currency,
      to_char(((s.game_date + s.start_time) at time zone st.tz) at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') as dtstart,
      to_char(((s.game_date + s.start_time + interval '2 hours') at time zone st.tz) at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') as dtend,
      to_char(now() at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') as stamp
    from public.sessions s, public.settings st where s.id = ${sid} and st.id = 1`;
  if (!rows.length) return new Response("Game not found", { status: 404 });
  const g = rows[0];
  const link = APP_URL ? APP_URL + "#game-" + g.id : "";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${esc(g.app_name)}//Games//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${g.id}@swish`, `DTSTAMP:${g.stamp}`, `DTSTART:${g.dtstart}`, `DTEND:${g.dtend}`,
    `SUMMARY:${esc("🏀 " + g.app_name + " basketball")}`,
    `LOCATION:${esc(g.court + (g.address && g.address !== g.court ? ", " + g.address : ""))}`,
    `DESCRIPTION:${esc(`${g.capacity}-player court${link ? "\nOpen the game: " + link : ""}`)}`,
    ...(link ? [`URL:${link}`] : []),
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT2H", `DESCRIPTION:${esc("🏀 Basketball in 2 hours")}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="${String(g.app_name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-game.ics"`,
      "cache-control": "no-store",
    },
  });
});
