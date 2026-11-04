-- "You're booked" alerts link to their game, so tapping one opens the game in the app
-- (where "Add to calendar" uses the phone's own calendar).
create or replace function private.notify_gl(_sid uuid, _to uuid, _icon text, _title text, _body text, _link text, _label text)
returns void language sql security definer set search_path = public as $$
  insert into notifications(to_id, icon, title, body, link, link_label, session_id) values (_to, _icon, _title, _body, _link, _label, _sid) $$;
revoke execute on function private.notify_gl(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;

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
    perform notify_gl(_sid, w.player_id, '🎉', 'A spot opened, you''re IN!', 'You moved off the waitlist for ' || fday(s.game_date) || ' at ' || ftime(s.start_time) || '.', cal_url(s), '📅 Add to calendar');
    moved := moved || pname(w.player_id);
    w := null;
  end loop;
  if count_entries(_sid) < s.capacity then perform spots_broadcast(_sid, 'opened'); end if;
  return moved;
end $$;

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
    perform notify_gl(_sid, me, '✅', 'You''re booked!', fday(s.game_date) || ' at ' || ftime(s.start_time) || ' · ' || s.court || ', ' || s.address
      || '. Your share: ' || fmoney(each_full(s)) || '.', cal_url(s), '📅 Add to calendar');
    perform spots_broadcast(_sid, 'joined');
    return case when n + 1 >= s.capacity then 'full' else 'in' end;
  end if;
  insert into waitlist(session_id, player_id) values (_sid, me);
  perform notify(me, '⏳', 'Added to waitlist', 'You''re #' || (select count(*) from waitlist where session_id = _sid)
    || ' for ' || fday(s.game_date) || '. We''ll ping you the second a spot opens.');
  return 'waitlist:' || (select count(*) from waitlist where session_id = _sid);
end $$;
