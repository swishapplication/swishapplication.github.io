-- =====================================================================
-- Hoop Squad: database, security rules and game logic
-- All writes go through the functions below (security definer), so the
-- rules (capacity, waitlist, who can do what) can't be bypassed from a phone.
-- =====================================================================

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------- tables
create table public.settings (
  id int primary key default 1 check (id = 1),
  app_name text not null default 'Hoop Squad',
  logo text,                                   -- small data: URL (resized in the app)
  pay_link text not null default '',
  tz text not null default 'Europe/Berlin',
  currency text not null default '$'
);
insert into public.settings default values;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text not null default '',
  phone text not null default '',
  color text not null default '#ff9a3d',
  is_admin boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved')),
  onboarded boolean not null default false,
  prefs jsonb not null default '{"email":true,"push":true}',
  skill int not null default 3 check (skill between 1 and 5),
  games int not null default 0,
  wins int not null default 0,
  mvps int not null default 0,
  spent numeric not null default 0,
  last_played date,
  created_at timestamptz not null default now()
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  dow int not null check (dow between 0 and 6),          -- 0 = Sunday
  start_time time not null default '20:00',
  court text not null,
  address text not null default '',
  capacity int not null default 8,
  price numeric not null default 80,
  open_dow int not null default 6,
  open_time time not null default '10:00',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  game_date date not null,
  start_time time not null default '20:00',
  court text not null,
  address text not null default '',
  capacity int not null default 8 check (capacity between 2 and 30),
  price numeric not null default 0,
  rule_id uuid references public.rules(id) on delete set null,
  opens_at timestamptz not null default now(),
  announced boolean not null default true,
  status text not null default 'upcoming' check (status in ('upcoming','played')),
  winner text check (winner in ('A','B')),
  teams jsonb,                                   -- {"A":[entry ids],"B":[entry ids]}
  mvp uuid references public.profiles(id) on delete set null,
  mvp_closed boolean not null default false,
  hype jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  guest text,
  pay text not null default 'spot' check (pay in ('spot','prepaid')),
  paid boolean not null default false,
  covered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create unique index entries_one_self on public.entries(session_id, player_id) where guest is null;

create table public.waitlist (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (session_id, player_id)
);

create table public.mvp_votes (
  session_id uuid not null references public.sessions(id) on delete cascade,
  voter uuid not null references public.profiles(id) on delete cascade,
  target uuid not null references public.profiles(id) on delete cascade,
  primary key (session_id, voter)
);

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  stake text not null,
  stake_text text not null,
  status text not null default 'pending',
  winner uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

create table public.team_bets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  from_team text not null check (from_team in ('A','B')),
  by_id uuid references public.profiles(id) on delete set null,
  stake_text text not null,
  status text not null default 'pending',
  winner_team text,
  created_at timestamptz not null default clock_timestamp()
);

create table public.credits (
  id uuid primary key default gen_random_uuid(),
  winner uuid not null references public.profiles(id) on delete cascade,
  loser uuid not null references public.profiles(id) on delete cascade,
  used boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  from_ids uuid[] not null,
  to_ids uuid[] not null,
  stake_text text not null,
  game_date date not null,
  team boolean not null default false,
  settled boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  to_id uuid not null references public.profiles(id) on delete cascade,
  icon text not null default '🏀',
  title text not null,
  body text not null default '',
  link text,
  link_label text,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz
);
create index notifications_to on public.notifications(to_id, created_at desc);
create index notifications_unsent on public.notifications(id) where sent_at is null;

create table public.push_subs (
  endpoint text primary key,
  player_id uuid not null references public.profiles(id) on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);

create table private.config (
  key text primary key,
  value text not null
);

-- ---------------------------------------------------------------- helpers
create or replace function private.uid() returns uuid language sql stable as $$ select auth.uid() $$;

create or replace function private.is_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and status = 'approved')
$$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and status = 'approved' and is_admin)
$$;
create or replace function private.require_member() returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_member() then raise exception 'You need to be approved by an admin first'; end if;
  return auth.uid();
end $$;
create or replace function private.require_admin() returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'Only admins can do that'; end if;
  return auth.uid();
end $$;

create or replace function private.tz() returns text language sql stable as $$ select tz from public.settings where id = 1 $$;
create or replace function private.today() returns date language sql stable as $$ select (now() at time zone private.tz())::date $$;
create or replace function private.local_ts(d date, t time) returns timestamptz language sql stable as $$ select (d + t) at time zone private.tz() $$;
create or replace function private.fday(d date) returns text language sql immutable as $$ select to_char(d, 'FMDay FMDD FMMonth') $$;
create or replace function private.fshort(d date) returns text language sql immutable as $$ select to_char(d, 'Dy FMDD Mon') $$;
create or replace function private.ftime(t time) returns text language sql immutable as $$ select to_char(t, 'HH24:MI') $$;
create or replace function private.fopen(ts timestamptz) returns text language sql stable as $$
  select to_char(ts at time zone private.tz(), 'Dy FMDD Mon, HH24:MI') $$;
create or replace function private.fmoney(x numeric) returns text language sql stable as $$
  select (select currency from public.settings where id = 1) || regexp_replace(to_char(round(x, 2), 'FM999999990.00'), '\.00$', '') $$;
create or replace function private.pname(p uuid) returns text language sql stable as $$ select coalesce(nullif(name,''), split_part(email,'@',1)) from public.profiles where id = p $$;

create or replace function private.urlencode(t text) returns text language sql immutable as $$
  select coalesce(string_agg(case when ch ~ '^[A-Za-z0-9_.~-]$' then ch
    else regexp_replace(upper(encode(convert_to(ch, 'UTF8'), 'hex')), '(..)', '%\1', 'g') end, '' order by i), '')
  from regexp_split_to_table(t, '') with ordinality as x(ch, i) $$;
create or replace function private.map_url(addr text) returns text language sql immutable as $$
  select case when addr ~* '^https?://' then addr else 'https://www.google.com/maps/search/?api=1&query=' || private.urlencode(addr) end $$;
create or replace function private.cal_url(s public.sessions) returns text language sql stable as $$
  select 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' || private.urlencode('🏀 ' || (select app_name from public.settings where id = 1))
    || '&dates=' || to_char(s.game_date + s.start_time, 'YYYYMMDD"T"HH24MISS') || '/' || to_char(s.game_date + s.start_time + interval '2 hours', 'YYYYMMDD"T"HH24MISS')
    || '&ctz=' || private.urlencode(private.tz())
    || '&location=' || private.urlencode(s.court || ', ' || s.address) $$;

create or replace function private.members() returns setof uuid language sql stable as $$ select id from public.profiles where status = 'approved' $$;
create or replace function private.admins() returns setof uuid language sql stable as $$ select id from public.profiles where status = 'approved' and is_admin $$;
create or replace function private.roster_players(_sid uuid) returns setof uuid language sql stable as $$
  select distinct player_id from public.entries where session_id = _sid $$;
create or replace function private.count_entries(_sid uuid) returns int language sql stable as $$
  select count(*)::int from public.entries where session_id = _sid $$;
create or replace function private.each_now(s public.sessions) returns numeric language sql stable as $$
  select s.price / greatest(private.count_entries(s.id), 1) $$;
create or replace function private.each_full(s public.sessions) returns numeric language sql stable as $$
  select s.price / greatest(s.capacity, 1) $$;
create or replace function private.self_entry(_sid uuid, _pid uuid) returns uuid language sql stable as $$
  select id from public.entries where session_id = _sid and player_id = _pid and guest is null $$;
create or replace function private.team_of(s public.sessions, _entry uuid) returns text language sql stable as $$
  select case when s.teams is null or _entry is null then null
    when s.teams->'A' ? _entry::text then 'A' when s.teams->'B' ? _entry::text then 'B' end $$;
create or replace function private.team_players(s public.sessions, _team text) returns uuid[] language sql stable as $$
  select coalesce(array_agg(e.player_id), '{}') from public.entries e
  where e.session_id = s.id and e.guest is null and s.teams->_team ? e.id::text $$;
create or replace function private.my_share(s public.sessions, _pid uuid) returns numeric language sql stable as $$
  select count(*) * private.each_now(s) from public.entries e
  where e.session_id = s.id and ((e.player_id = _pid and e.covered_by is null) or e.covered_by = _pid) $$;

-- notifications
create or replace function private.notify(_to uuid, _icon text, _title text, _body text, _link text default null, _label text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications(to_id, icon, title, body, link, link_label) values (_to, _icon, _title, _body, _link, _label) $$;
create or replace function private.notify_many(_to uuid[], _icon text, _title text, _body text, _link text default null, _label text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications(to_id, icon, title, body, link, link_label)
  select distinct t, _icon, _title, _body, _link, _label from unnest(_to) t where t is not null $$;

create or replace function private.announce_open(s public.sessions) returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform notify_many(array(select members()), '📣', 'Booking is OPEN',
    fday(s.game_date) || ' at ' || ftime(s.start_time) || ' · ' || s.court || ' · ' || s.capacity || ' spots · '
    || fmoney(each_full(s)) || ' each. First come, first served!');
end $$;

create or replace function private.spots_broadcast(_sid uuid, _why text) returns void language plpgsql security definer set search_path = public, private as $$
declare s sessions; n int; lft int; others uuid[];
begin
  select * into s from sessions where id = _sid;
  n := count_entries(_sid); lft := s.capacity - n;
  others := array(select m from members() m where self_entry(_sid, m) is null);
  if lft <= 0 then
    perform notify_many(array(select roster_players(_sid)), '🏀', 'Game on, all spots booked!',
      fday(s.game_date) || ', ' || ftime(s.start_time) || ' is locked in with ' || s.capacity || ' players. ' || fmoney(each_now(s)) || ' each.');
    perform notify_many(array(select o from unnest(others) o where not exists(select 1 from waitlist w where w.session_id = _sid and w.player_id = o)),
      '🚫', 'All spots booked', fday(s.game_date) || ' is full (' || s.capacity || '/' || s.capacity || '). Join the waitlist and you''ll be pinged if someone drops.');
  elsif _why = 'opened' then
    perform notify_many(others, '🟢', 'A spot just opened up!',
      fday(s.game_date) || ', ' || ftime(s.start_time) || ': ' || lft || ' spot' || case when lft > 1 then 's' else '' end || ' left. Grab it before someone else does.');
  elsif lft <= 3 or _why = 'manual' then
    perform notify_many(others, case when lft <= 2 then '⚡' else '🏀' end,
      case when lft <= 2 then 'Only ' || lft || ' spot' || case when lft > 1 then 's' else '' end || ' left!' else lft || ' spots left' end,
      fday(s.game_date) || ', ' || ftime(s.start_time) || ' at ' || s.court || ': ' || n || '/' || s.capacity || ' booked.');
  end if;
end $$;

create or replace function private.reset_teams(_sid uuid) returns void language sql security definer set search_path = public as $$
  update sessions set teams = null where id = _sid and teams is not null;
  delete from team_bets where session_id = _sid;
$$;

create or replace function private.apply_credit(_sid uuid, _pid uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare e entries; c credits; s sessions;
begin
  select * into e from entries where session_id = _sid and player_id = _pid and guest is null;
  if e.id is null or e.covered_by is not null then return; end if;
  select * into c from credits where winner = _pid and not used order by created_at limit 1 for update;
  if c.id is null then return; end if;
  select * into s from sessions where id = _sid;
  update credits set used = true where id = c.id;
  update entries set covered_by = c.loser where id = e.id;
  perform notify(c.loser, '💸', 'Time to pay up!', 'You lost the bet, so you''re covering ' || pname(_pid) || '''s game on ' || fshort(s.game_date) || ' (' || fmoney(each_full(s)) || ').');
  perform notify(_pid, '🎁', 'Free game!', pname(c.loser) || ' is paying your spot on ' || fshort(s.game_date) || '. You won the bet.');
end $$;

create or replace function private.release_credit(e public.entries) returns void language sql security definer set search_path = public as $$
  update credits set used = false where id = (select id from credits where winner = e.player_id and loser = e.covered_by and used order by created_at desc limit 1)
$$;

create or replace function private.free_spots(_sid uuid, _k int) returns text[] language plpgsql security definer set search_path = public, private as $$
declare s sessions; w waitlist; moved text[] := '{}'; i int := 0;
begin
  select * into s from sessions where id = _sid;
  while i < _k loop
    i := i + 1;
    exit when count_entries(_sid) >= s.capacity;
    select * into w from waitlist where session_id = _sid order by created_at limit 1;
    exit when w.player_id is null;
    delete from waitlist where session_id = _sid and player_id = w.player_id;
    insert into entries(session_id, player_id) values (_sid, w.player_id);
    perform apply_credit(_sid, w.player_id);
    perform notify(w.player_id, '🎉', 'A spot opened, you''re IN!', 'You moved off the waitlist for ' || fday(s.game_date) || ' at ' || ftime(s.start_time) || '.', cal_url(s), '📅 Add to calendar');
    moved := moved || pname(w.player_id);
    w := null;
  end loop;
  if count_entries(_sid) < s.capacity then perform spots_broadcast(_sid, 'opened'); end if;
  return moved;
end $$;

-- weekly games: one at a time per rule
create or replace function private.generate_games(_announce boolean) returns void language plpgsql security definer set search_path = public, private as $$
declare r rules; last date; d date; s sessions; oa date;
begin
  for r in select * from rules where active loop
    continue when exists(select 1 from sessions where rule_id = r.id and status = 'upcoming');
    select max(game_date) into last from sessions where rule_id = r.id;
    d := greatest(coalesce(last, today()), today()) + 1;
    while extract(dow from d)::int <> r.dow loop d := d + 1; end loop;
    oa := d - 1;
    while extract(dow from oa)::int <> r.open_dow loop oa := oa - 1; end loop;
    insert into sessions(game_date, start_time, court, address, capacity, price, rule_id, opens_at, announced)
    values (d, r.start_time, r.court, r.address, r.capacity, r.price, r.id, local_ts(oa, r.open_time), false)
    returning * into s;
    if s.opens_at <= now() then
      update sessions set announced = true where id = s.id;
      if _announce then perform announce_open(s); end if;
    end if;
  end loop;
end $$;

-- run every minute by pg_cron
create or replace function private.open_due_bookings() returns int language plpgsql security definer set search_path = public, private as $$
declare s sessions; n int := 0;
begin
  perform generate_games(true);
  for s in select * from sessions where status = 'upcoming' and not announced and opens_at <= now() for update loop
    update sessions set announced = true where id = s.id;
    perform announce_open(s);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- new users
create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = public, private as $$
declare first boolean; colors text[] := array['#ff9a3d','#c8f43c','#5ab0ff','#ff7eb6','#b78bff','#5ef0c4','#ffd23f','#ff6b6b','#7ee081','#64d2ff','#f7a8ff','#ffb86b'];
begin
  first := not exists(select 1 from profiles);
  insert into profiles(id, email, name, color, is_admin, status)
  values (new.id, new.email, '', colors[1 + floor(random() * array_length(colors, 1))::int],
          first, case when first then 'approved' else 'pending' end);
  if not first then
    perform notify_many(array(select admins()), '🙋', 'New player wants to join', coalesce(new.email, 'Someone') || ' signed up. Approve them in the Squad tab.');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- ================================================================ API (rpc)
-- profile & membership
create or replace function public.update_profile(_name text, _phone text, _prefs jsonb) returns void language plpgsql security definer set search_path = public, private as $$
declare was_pending boolean;
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  if length(trim(coalesce(_name, ''))) = 0 then raise exception 'Please enter your name'; end if;
  select status = 'pending' and not onboarded into was_pending from profiles where id = auth.uid();
  update profiles set name = left(trim(_name), 24), phone = left(coalesce(_phone, ''), 30),
    prefs = coalesce(_prefs, prefs), onboarded = true where id = auth.uid();
  if was_pending then
    perform notify_many(array(select admins()), '🙋', trim(_name) || ' wants to join', 'Approve or decline them in the Squad tab.');
  end if;
end $$;

create or replace function public.approve_member(_pid uuid, _ok boolean) returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform require_admin();
  if _ok then
    update profiles set status = 'approved' where id = _pid;
    perform notify(_pid, '🎉', 'You''re in the squad!', 'An admin approved you. See you on court.');
  else
    delete from auth.users where id = _pid and exists(select 1 from profiles where id = _pid and status = 'pending');
  end if;
end $$;

create or replace function public.set_admin(_pid uuid, _on boolean) returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform require_admin();
  if not _on and (select count(*) from admins()) <= 1 then raise exception 'There must be at least one admin'; end if;
  update profiles set is_admin = _on where id = _pid and status = 'approved';
  if _on then perform notify(_pid, '🛡️', 'You''re now an admin', 'You can post games, pick teams and manage payments.'); end if;
end $$;

create or replace function public.remove_member(_pid uuid) returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform require_admin();
  if _pid = auth.uid() then raise exception 'You can''t remove yourself'; end if;
  delete from auth.users where id = _pid;
end $$;

create or replace function public.set_skill(_pid uuid, _skill int) returns void language plpgsql security definer set search_path = public, private as $$
begin perform require_admin(); update profiles set skill = greatest(1, least(5, _skill)) where id = _pid; end $$;

create or replace function public.update_settings(_app_name text, _logo text, _pay_link text) returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform require_admin();
  if _logo is not null and length(_logo) > 300000 then raise exception 'Logo image is too big'; end if;
  update settings set app_name = coalesce(nullif(left(trim(_app_name), 24), ''), app_name),
    logo = case when _logo = '' then null else coalesce(_logo, logo) end,
    pay_link = coalesce(_pay_link, pay_link) where id = 1;
end $$;

create or replace function public.save_push_sub(_endpoint text, _sub jsonb) returns void language plpgsql security definer set search_path = public, private as $$
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  insert into push_subs(endpoint, player_id, sub) values (_endpoint, auth.uid(), _sub)
  on conflict (endpoint) do update set player_id = excluded.player_id, sub = excluded.sub;
end $$;

create or replace function public.get_vapid_key() returns text language sql stable security definer set search_path = private as $$
  select value from private.config where key = 'vapid_public' $$;

-- booking
create or replace function public.join_game(_sid uuid) returns text language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); s sessions; n int;
begin
  select * into s from sessions where id = _sid for update;
  if s.id is null or s.status <> 'upcoming' then raise exception 'This game is no longer available'; end if;
  if now() < s.opens_at then raise exception 'Booking opens %', fopen(s.opens_at); end if;
  if self_entry(_sid, me) is not null or exists(select 1 from waitlist where session_id = _sid and player_id = me) then return 'already'; end if;
  n := count_entries(_sid);
  if n < s.capacity then
    insert into entries(session_id, player_id) values (_sid, me);
    perform reset_teams(_sid);
    perform apply_credit(_sid, me);
    perform notify(me, '✅', 'You''re booked!', fday(s.game_date) || ' at ' || ftime(s.start_time) || ' · ' || s.court || ', ' || s.address
      || '. Your share: ' || fmoney(each_full(s)) || '.', cal_url(s), '📅 Add to calendar');
    perform spots_broadcast(_sid, 'joined');
    return case when n + 1 >= s.capacity then 'full' else 'in' end;
  end if;
  insert into waitlist(session_id, player_id) values (_sid, me);
  perform notify(me, '⏳', 'Added to waitlist', 'You''re #' || (select count(*) from waitlist where session_id = _sid)
    || ' for ' || fday(s.game_date) || '. We''ll ping you the second a spot opens.');
  return 'waitlist:' || (select count(*) from waitlist where session_id = _sid);
end $$;

create or replace function public.leave_game(_sid uuid) returns text language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); s sessions; e entries; k int; moved text[];
begin
  select * into s from sessions where id = _sid for update;
  if s.status <> 'upcoming' then raise exception 'This game has already been played'; end if;
  if exists(select 1 from waitlist where session_id = _sid and player_id = me) then
    delete from waitlist where session_id = _sid and player_id = me; return 'left-waitlist';
  end if;
  select * into e from entries where session_id = _sid and player_id = me and guest is null;
  if e.id is null then return 'not-in'; end if;
  if e.covered_by is not null then perform release_credit(e); end if;
  select count(*) into k from entries where session_id = _sid and player_id = me;
  delete from entries where session_id = _sid and player_id = me;
  delete from bets where session_id = _sid and (from_id = me or to_id = me) and status in ('pending','accepted');
  perform reset_teams(_sid);
  moved := free_spots(_sid, k);
  perform notify_many(array(select a from admins() a where a <> me), '👋', pname(me) || ' dropped out',
    fday(s.game_date) || ': now ' || count_entries(_sid) || '/' || s.capacity || '.');
  return array_to_string(moved, ' & ');
end $$;

create or replace function public.add_guest(_sid uuid, _name text) returns text language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); s sessions;
begin
  select * into s from sessions where id = _sid for update;
  if self_entry(_sid, me) is null then raise exception 'Book your own spot first'; end if;
  if length(trim(coalesce(_name, ''))) = 0 then raise exception 'Type your friend''s name'; end if;
  if count_entries(_sid) >= s.capacity then raise exception 'No spots left for a guest'; end if;
  insert into entries(session_id, player_id, guest) values (_sid, me, left(trim(_name), 20));
  perform reset_teams(_sid);
  perform spots_broadcast(_sid, 'joined');
  return case when count_entries(_sid) >= s.capacity then 'full' else 'ok' end;
end $$;

create or replace function public.remove_guest(_eid uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); e entries;
begin
  select * into e from entries where id = _eid;
  if e.guest is null then raise exception 'Not a guest'; end if;
  if e.player_id <> me and not is_admin() then raise exception 'Only the host or an admin can remove a guest'; end if;
  perform 1 from sessions where id = e.session_id for update;
  delete from entries where id = _eid;
  perform reset_teams(e.session_id);
  perform free_spots(e.session_id, 1);
end $$;

create or replace function public.set_pay(_sid uuid, _how text) returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); s sessions;
begin
  if _how not in ('spot','prepaid') then raise exception 'Invalid choice'; end if;
  update entries set pay = _how where session_id = _sid and player_id = me;
  if _how = 'prepaid' then
    select * into s from sessions where id = _sid;
    perform notify_many(array(select admins()), '💸', pname(me) || ' says they prepaid',
      fmoney(my_share(s, me)) || ' for ' || fday(s.game_date) || '. Confirm when you receive it.');
  end if;
end $$;

create or replace function public.toggle_paid(_eid uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare e entries; s sessions;
begin
  perform require_admin();
  update entries set paid = not paid where id = _eid returning * into e;
  select * into s from sessions where id = e.session_id;
  if e.paid then
    perform notify(coalesce(e.covered_by, e.player_id), '🧾', 'Payment confirmed',
      'Thanks! ' || fmoney(each_now(s)) || ' for ' || coalesce(e.guest || ' on ', '') || fshort(s.game_date) || ' marked paid.');
  end if;
end $$;

create or replace function public.toggle_hype(_sid uuid, _emoji text) returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); h jsonb; arr jsonb;
begin
  if _emoji not in ('🔥','🏀','💪','😤','🐐') then raise exception 'Unknown reaction'; end if;
  select hype into h from sessions where id = _sid for update;
  arr := coalesce(h->_emoji, '[]'::jsonb);
  if arr ? me::text then
    arr := (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements_text(arr) x where x <> me::text);
  else arr := arr || to_jsonb(me::text); end if;
  update sessions set hype = jsonb_set(coalesce(h, '{}'), array[_emoji], arr) where id = _sid;
end $$;

-- admin game management
create or replace function public.create_game(_date date, _time time, _court text, _address text, _capacity int, _price numeric) returns uuid language plpgsql security definer set search_path = public, private as $$
declare s sessions;
begin
  perform require_admin();
  if _date < today() then raise exception 'That date is in the past'; end if;
  insert into sessions(game_date, start_time, court, address, capacity, price, opens_at, announced)
  values (_date, _time, coalesce(nullif(trim(_court), ''), 'Court TBD'), coalesce(nullif(trim(_address), ''), _court), _capacity, coalesce(_price, 0), now(), true)
  returning * into s;
  perform announce_open(s);
  return s.id;
end $$;

create or replace function public.cancel_game(_sid uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare s sessions; e entries;
begin
  perform require_admin();
  select * into s from sessions where id = _sid for update;
  perform notify_many(array(select roster_players(_sid) union select player_id from waitlist where session_id = _sid), '❌', 'Game cancelled',
    fday(s.game_date) || ' at ' || s.court || ' is cancelled.');
  for e in select * from entries where session_id = _sid and covered_by is not null and guest is null loop perform release_credit(e); end loop;
  update sessions set rule_id = null where id = _sid;   -- so the weekly rule can schedule the next one
  delete from sessions where id = _sid;
  perform generate_games(true);
end $$;

create or replace function public.open_now(_sid uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare s sessions;
begin
  perform require_admin();
  update sessions set opens_at = now(), announced = true where id = _sid and status = 'upcoming' returning * into s;
  perform announce_open(s);
end $$;

create or replace function public.send_location(_sid uuid) returns int language plpgsql security definer set search_path = public, private as $$
declare s sessions; who uuid[];
begin
  perform require_admin();
  select * into s from sessions where id = _sid;
  who := array(select roster_players(_sid) union select player_id from waitlist where session_id = _sid);
  perform notify_many(who, '📍', 'Location for ' || fshort(s.game_date), s.court || ', ' || s.address || '. Game starts ' || ftime(s.start_time) || '.', map_url(s.address), '🗺️ Open in Maps');
  return coalesce(array_length(who, 1), 0);
end $$;

create or replace function public.send_spots(_sid uuid) returns void language plpgsql security definer set search_path = public, private as $$
begin perform require_admin(); perform spots_broadcast(_sid, 'manual'); end $$;

create or replace function public.remind_unpaid(_sid uuid) returns int language plpgsql security definer set search_path = public, private as $$
declare s sessions; p uuid; n int := 0;
begin
  perform require_admin();
  select * into s from sessions where id = _sid;
  for p in select distinct coalesce(covered_by, player_id) from entries where session_id = _sid and not paid loop
    perform notify(p, '⏰', 'Payment reminder', fmoney(my_share(s, p)) || ' for ' || fday(s.game_date) || '. Pay on court or prepay the admin.',
      nullif((select pay_link from settings where id = 1), ''), '💸 Prepay now');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.pick_teams(_sid uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare s sessions; r record; a jsonb := '[]'; b jsonb := '[]'; sa numeric := 0; sb numeric := 0; half int; na text; nb text;
begin
  perform require_admin();
  select * into s from sessions where id = _sid for update;
  if count_entries(_sid) < 2 then raise exception 'Need at least 2 players'; end if;
  half := ceil(count_entries(_sid) / 2.0);
  for r in select e.id, (case when e.guest is not null then 3 else p.skill end) + random() * 1.2 as sk
           from entries e join profiles p on p.id = e.player_id where e.session_id = _sid order by 2 desc loop
    if jsonb_array_length(a) >= half or (jsonb_array_length(b) < half and sb < sa) then
      b := b || to_jsonb(r.id::text); sb := sb + r.sk;
    else a := a || to_jsonb(r.id::text); sa := sa + r.sk; end if;
  end loop;
  delete from team_bets where session_id = _sid;
  update sessions set teams = jsonb_build_object('A', a, 'B', b) where id = _sid returning * into s;
  select string_agg(coalesce(e.guest, pname(e.player_id)), ', ') into na from entries e where e.session_id = _sid and a ? e.id::text;
  select string_agg(coalesce(e.guest, pname(e.player_id)), ', ') into nb from entries e where e.session_id = _sid and b ? e.id::text;
  perform notify_many(array(select roster_players(_sid)), '⚔️', 'Teams are out for ' || fshort(s.game_date) || '!',
    '🟠 Team A: ' || na || E'\n🟢 Team B: ' || nb);
end $$;

create or replace function private.close_mvp_impl(_sid uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare s sessions; best uuid; votes int;
begin
  select * into s from sessions where id = _sid for update;
  if s.mvp_closed then return; end if;
  select target, count(*) into best, votes from mvp_votes where session_id = _sid group by target order by count(*) desc, min(ctid::text) limit 1;
  update sessions set mvp_closed = true, mvp = best where id = _sid;
  if best is not null then
    update profiles set mvps = mvps + 1 where id = best;
    perform notify_many(array(select members()), '🐐', pname(best) || ' is the MVP!',
      votes || ' vote' || case when votes > 1 then 's' else '' end || ' for ' || fshort(s.game_date) || '. All hail the GOAT.');
  end if;
end $$;

create or replace function public.close_mvp(_sid uuid) returns void language plpgsql security definer set search_path = public, private as $$
begin perform require_admin(); perform close_mvp_impl(_sid); end $$;

create or replace function public.mark_played(_sid uuid, _winner text) returns void language plpgsql security definer set search_path = public, private as $$
declare s sessions; e entries; b bets; tb team_bets; per numeric; tf text; tt text; w uuid; l uuid; nxt uuid;
begin
  perform require_admin();
  select * into s from sessions where id = _sid for update;
  if s.status <> 'upcoming' then raise exception 'Already recorded'; end if;
  if _winner = '' then _winner := null; end if;
  if _winner is not null and s.teams is null then raise exception 'Pick teams first to record a winner'; end if;
  per := each_now(s);
  for e in select * from entries where session_id = _sid loop
    update profiles set spent = spent + per where id = coalesce(e.covered_by, e.player_id);
    if e.guest is null then
      update profiles set games = games + 1, last_played = least(s.game_date, today()),
        wins = wins + case when _winner is not null and team_of(s, e.id) = _winner then 1 else 0 end where id = e.player_id;
    end if;
  end loop;
  update sessions set status = 'played', winner = _winner where id = _sid;
  -- 1v1 bets
  for b in select * from bets where session_id = _sid loop
    if b.status = 'pending' then update bets set status = 'expired' where id = b.id; continue; end if;
    continue when b.status <> 'accepted';
    tf := team_of(s, self_entry(_sid, b.from_id)); tt := team_of(s, self_entry(_sid, b.to_id));
    if _winner is null or tf is null or tt is null or tf = tt then
      update bets set status = 'void' where id = b.id;
      perform notify_many(array[b.from_id, b.to_id], '🤷', 'Bet cancelled', pname(b.from_id) || ' vs ' || pname(b.to_id) || ': '
        || case when tf = tt then 'you ended up on the same team' else 'no result recorded' end || ', so nobody owes anything.');
      continue;
    end if;
    w := case when tf = _winner then b.from_id else b.to_id end; l := case when w = b.from_id then b.to_id else b.from_id end;
    update bets set status = 'won', winner = w where id = b.id;
    perform notify_many(array(select roster_players(_sid)), '💰', pname(w) || ' won the bet vs ' || pname(l) || '!', pname(l) || ' owes ' || pname(w) || ' ' || b.stake_text || '. 😂');
    if b.stake = 'game' then
      insert into credits(winner, loser) values (w, l);
      select x.id into nxt from sessions x where x.status = 'upcoming' and self_entry(x.id, w) is not null order by x.game_date limit 1;
      if nxt is not null then perform apply_credit(nxt, w); end if;
    else
      insert into debts(from_ids, to_ids, stake_text, game_date) values (array[l], array[w], b.stake_text, s.game_date);
    end if;
  end loop;
  -- team challenge
  for tb in select * from team_bets where session_id = _sid loop
    if tb.status = 'pending' then update team_bets set status = 'expired' where id = tb.id; continue; end if;
    continue when tb.status <> 'accepted';
    if _winner is null then update team_bets set status = 'void' where id = tb.id; continue; end if;
    update team_bets set status = 'won', winner_team = _winner where id = tb.id;
    insert into debts(from_ids, to_ids, stake_text, game_date, team)
    values (team_players(s, case when _winner = 'A' then 'B' else 'A' end), team_players(s, _winner), tb.stake_text, s.game_date, true);
    perform notify_many(array(select roster_players(_sid)), '🍽️', 'Team ' || _winner || ' won the team challenge!',
      'Team ' || case when _winner = 'A' then 'B' else 'A' end || ' owes Team ' || _winner || ' ' || tb.stake_text || '. Enjoy! 😂');
  end loop;
  -- MVP vote: only the players who played
  perform notify_many(array(select distinct player_id from entries where session_id = _sid and guest is null), '🐐', 'Vote for MVP!',
    'Who balled out on ' || fshort(s.game_date) || '? Cast your vote.');
  if s.rule_id is not null then perform generate_games(true); end if;
end $$;

create or replace function public.vote_mvp(_sid uuid, _target uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); s sessions;
begin
  select * into s from sessions where id = _sid;
  if s.status <> 'played' or s.mvp_closed then raise exception 'Voting is closed'; end if;
  if self_entry(_sid, me) is null then raise exception 'Only players who played can vote'; end if;
  if _target = me then raise exception 'Nice try, you can''t vote for yourself 😄'; end if;
  if self_entry(_sid, _target) is null then raise exception 'They didn''t play in this game'; end if;
  insert into mvp_votes(session_id, voter, target) values (_sid, me, _target);
  if not exists(select 1 from entries e where e.session_id = _sid and e.guest is null
                and not exists(select 1 from mvp_votes v where v.session_id = _sid and v.voter = e.player_id)) then
    perform close_mvp_impl(_sid);
  end if;
end $$;

-- bets
create or replace function public.challenge(_sid uuid, _to uuid, _stake text, _text text) returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); s sessions;
begin
  select * into s from sessions where id = _sid;
  if s.status <> 'upcoming' then raise exception 'This game has already been played'; end if;
  if self_entry(_sid, me) is null or self_entry(_sid, _to) is null then raise exception 'You both need to be booked in this game'; end if;
  if _to = me then raise exception 'You can''t bet against yourself'; end if;
  if exists(select 1 from bets where session_id = _sid and status in ('pending','accepted')
            and ((from_id = me and to_id = _to) or (from_id = _to and to_id = me))) then raise exception 'You already have a bet with them'; end if;
  insert into bets(session_id, from_id, to_id, stake, stake_text) values (_sid, me, _to, _stake, left(coalesce(nullif(trim(_text), ''), 'a surprise'), 40));
  perform notify(_to, '⚔️', pname(me) || ' challenged you!', 'Bet for ' || fshort(s.game_date) || ': loser owes the winner '
    || left(coalesce(nullif(trim(_text), ''), 'a surprise'), 40) || '. Only counts if you end up on opposite teams. Open the game to accept.');
end $$;

create or replace function public.respond_bet(_bid uuid, _ok boolean) returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); b bets; s sessions;
begin
  select * into b from bets where id = _bid for update;
  if b.to_id <> me or b.status <> 'pending' then raise exception 'This bet isn''t waiting for you'; end if;
  update bets set status = case when _ok then 'accepted' else 'declined' end where id = _bid;
  select * into s from sessions where id = b.session_id;
  if _ok then
    perform notify(b.from_id, '🤝', pname(me) || ' accepted your bet!', 'It''s on for ' || fshort(s.game_date) || '. Loser owes ' || b.stake_text || '.');
    perform notify_many(array(select p from roster_players(b.session_id) p where p not in (b.from_id, b.to_id)), '🍿', 'A bet is on!',
      pname(b.from_id) || ' vs ' || pname(b.to_id) || ' on ' || fshort(s.game_date) || '. Loser owes ' || b.stake_text || '.');
  else
    perform notify(b.from_id, '🐔', pname(me) || ' declined your bet', 'Maybe next time.');
  end if;
end $$;

create or replace function public.team_challenge(_sid uuid, _text text) returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); s sessions; mt text; ot text; txt text;
begin
  select * into s from sessions where id = _sid;
  if s.status <> 'upcoming' or s.teams is null then raise exception 'Teams need to be picked first'; end if;
  mt := team_of(s, self_entry(_sid, me));
  if mt is null then raise exception 'You''re not on a team in this game'; end if;
  if exists(select 1 from team_bets where session_id = _sid and status in ('pending','accepted')) then raise exception 'There''s already a team challenge'; end if;
  ot := case when mt = 'A' then 'B' else 'A' end;
  txt := left(coalesce(nullif(trim(_text), ''), 'a surprise'), 40);
  insert into team_bets(session_id, from_team, by_id, stake_text) values (_sid, mt, me, txt);
  perform notify_many(team_players(s, ot), '🔥', 'Team ' || mt || ' challenged your team!', pname(me) || ' says Team ' || mt || ' beats Team ' || ot
    || ' on ' || fshort(s.game_date) || '. Losing team owes ' || txt || '. Anyone on your team can accept.');
  perform notify_many(array(select p from unnest(team_players(s, mt)) p where p <> me), '📣', pname(me) || ' challenged Team ' || ot,
    'Your team is playing for ' || txt || ' on ' || fshort(s.game_date) || '. Don''t let us down!');
end $$;

create or replace function public.respond_team_bet(_id uuid, _ok boolean) returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); tb team_bets; s sessions; mt text;
begin
  select * into tb from team_bets where id = _id for update;
  select * into s from sessions where id = tb.session_id;
  mt := team_of(s, self_entry(s.id, me));
  if tb.status <> 'pending' or mt is null or mt = tb.from_team then raise exception 'Only the challenged team can answer'; end if;
  update team_bets set status = case when _ok then 'accepted' else 'declined' end where id = _id;
  perform notify_many(array(select roster_players(s.id)), case when _ok then '🤝' else '🐔' end,
    case when _ok then 'Team challenge is ON: ' || tb.stake_text else 'Team ' || mt || ' declined the challenge' end,
    case when _ok then pname(me) || ' accepted for Team ' || mt || '. Losing team owes the winners ' || tb.stake_text || '.' else 'No team bet this time.' end);
end $$;

create or replace function public.settle_debt(_id uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); d debts;
begin
  select * into d from debts where id = _id for update;
  if not (me = any(d.from_ids) or me = any(d.to_ids)) then raise exception 'That''s not your bet'; end if;
  update debts set settled = true where id = _id;
  perform notify_many(array(select x from unnest(d.from_ids || d.to_ids) x where x <> me), '✅', 'Settled: ' || d.stake_text,
    pname(me) || ' marked the ' || d.stake_text || ' from ' || fshort(d.game_date) || ' as settled.');
end $$;

create or replace function public.nudge(_pid uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare p profiles; s sessions; days int;
begin
  perform require_admin();
  select * into p from profiles where id = _pid;
  days := case when p.last_played is null then null else today() - p.last_played end;
  select * into s from sessions x where x.status = 'upcoming' and x.opens_at <= now() and count_entries(x.id) < x.capacity order by game_date limit 1;
  perform notify(_pid, '👋', 'We miss you on court!',
    coalesce('It''s been ' || days || ' days since your last game.', 'Come play with us!')
    || coalesce(' ' || fshort(s.game_date) || ' has ' || (s.capacity - count_entries(s.id)) || ' spots left.', ''));
end $$;

-- weekly rules
create or replace function public.add_rule(_dow int, _time time, _court text, _address text, _capacity int, _price numeric, _open_dow int, _open_time time) returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform require_admin();
  insert into rules(dow, start_time, court, address, capacity, price, open_dow, open_time)
  values (_dow, _time, coalesce(nullif(trim(_court), ''), 'Court TBD'), coalesce(nullif(trim(_address), ''), _court), _capacity, coalesce(_price, 0), _open_dow, _open_time);
  perform generate_games(true);
end $$;
create or replace function public.toggle_rule(_id uuid) returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform require_admin();
  update rules set active = not active where id = _id;
  perform generate_games(true);
end $$;
create or replace function public.delete_rule(_id uuid) returns void language plpgsql security definer set search_path = public, private as $$
begin perform require_admin(); delete from rules where id = _id; end $$;

-- ---------------------------------------------------------------- security
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.rules enable row level security;
alter table public.sessions enable row level security;
alter table public.entries enable row level security;
alter table public.waitlist enable row level security;
alter table public.mvp_votes enable row level security;
alter table public.bets enable row level security;
alter table public.team_bets enable row level security;
alter table public.credits enable row level security;
alter table public.debts enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subs enable row level security;

create policy "anyone reads branding" on public.settings for select using (true);
create policy "members read profiles" on public.profiles for select using (private.is_member() or id = auth.uid());
create policy "members read" on public.rules for select using (private.is_member());
create policy "members read" on public.sessions for select using (private.is_member());
create policy "members read" on public.entries for select using (private.is_member());
create policy "members read" on public.waitlist for select using (private.is_member());
create policy "members read" on public.mvp_votes for select using (private.is_member());
create policy "members read" on public.bets for select using (private.is_member());
create policy "members read" on public.team_bets for select using (private.is_member());
create policy "members read" on public.credits for select using (private.is_member());
create policy "members read" on public.debts for select using (private.is_member());
create policy "own notifications" on public.notifications for select using (to_id = auth.uid());
-- push_subs: no client access at all

grant usage on schema private to authenticated, anon;   -- needed so policies can call private.is_member()
revoke all on all tables in schema private from authenticated, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_member(), private.is_admin() to authenticated, anon;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
grant execute on function public.get_vapid_key() to anon;

-- live updates in the app
do $$ begin
  alter publication supabase_realtime add table public.sessions, public.entries, public.waitlist, public.mvp_votes, public.bets,
    public.team_bets, public.debts, public.credits, public.profiles, public.rules, public.settings, public.notifications;
exception when others then raise notice 'realtime publication not available: %', sqlerrm; end $$;

-- ---------------------------------------------------------------- every minute: open bookings + send notifications
create or replace function private.tick() returns void language plpgsql security definer set search_path = public, private as $$
declare u text;
begin
  perform open_due_bookings();
  select value into u from private.config where key = 'functions_url';
  if u is not null and exists(select 1 from notifications where sent_at is null) then
    execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := ''{"Content-Type":"application/json"}''::jsonb)' using u || '/dispatch';
  end if;
end $$;

do $$ begin
  create extension if not exists pg_net;
  create extension if not exists pg_cron;
  perform cron.schedule('hoop-squad-tick', '* * * * *', 'select private.tick()');
exception when others then raise notice 'pg_cron/pg_net not available here: %', sqlerrm; end $$;
