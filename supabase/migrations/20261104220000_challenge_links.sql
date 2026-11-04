-- Alerts about challenges link to their game, so tapping one opens the challenge directly.
alter table public.notifications add column if not exists session_id uuid references public.sessions(id) on delete set null;

create or replace function private.notify_g(_sid uuid, _to uuid, _icon text, _title text, _body text)
returns void language sql security definer set search_path = public as $$
  insert into notifications(to_id, icon, title, body, session_id) values (_to, _icon, _title, _body, _sid) $$;
create or replace function private.notify_many_g(_sid uuid, _to uuid[], _icon text, _title text, _body text)
returns void language sql security definer set search_path = public as $$
  insert into notifications(to_id, icon, title, body, session_id)
  select distinct t, _icon, _title, _body, _sid from unnest(_to) t where t is not null $$;
revoke execute on function private.notify_g(uuid, uuid, text, text, text), private.notify_many_g(uuid, uuid[], text, text, text) from public, anon, authenticated;

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
  perform notify_g(_sid, _to, '⚔️', pname(me) || ' challenged you!', 'Bet for ' || fshort(s.game_date) || ': loser owes the winner '
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
    perform notify_g(b.session_id, b.from_id, '🤝', pname(me) || ' accepted your bet!', 'It''s on for ' || fshort(s.game_date) || '. Loser owes ' || b.stake_text || '.');
    perform notify_many_g(b.session_id, array(select p from roster_players(b.session_id) p where p not in (b.from_id, b.to_id)), '🍿', 'A bet is on!',
      pname(b.from_id) || ' vs ' || pname(b.to_id) || ' on ' || fshort(s.game_date) || '. Loser owes ' || b.stake_text || '.');
  else
    perform notify_g(b.session_id, b.from_id, '🐔', pname(me) || ' declined your bet', 'Maybe next time.');
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
  perform notify_many_g(_sid, team_players(s, ot), '🔥', 'Team ' || mt || ' challenged your team!', pname(me) || ' says Team ' || mt || ' beats Team ' || ot
    || ' on ' || fshort(s.game_date) || '. Losing team owes ' || txt || '. Anyone on your team can accept.');
  perform notify_many_g(_sid, array(select p from unnest(team_players(s, mt)) p where p <> me), '📣', pname(me) || ' challenged Team ' || ot,
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
  perform notify_many_g(s.id, array(select roster_players(s.id)), case when _ok then '🤝' else '🐔' end,
    case when _ok then 'Team challenge is ON: ' || tb.stake_text else 'Team ' || mt || ' declined the challenge' end,
    case when _ok then pname(me) || ' accepted for Team ' || mt || '. Losing team owes the winners ' || tb.stake_text || '.' else 'No team bet this time.' end);
end $$;
