-- Achievement badges, worked out from game history.
--   early  ⚡ Early Bird : booked a weekly game within 60 seconds of booking opening
--   iron   🧱 Iron Man   : played 5 games in a row
--   shark  🦈 Bet Shark  : won 3 bets (1v1)
--   clutch 🏆 Clutch     : MVP twice
--   ghost  👻 Ghost      : hasn't played for 30+ days (goes away when they play again)

create or replace function private.max_streak(_pid uuid) returns int language sql stable security definer set search_path = public as $$
  with g as (
    select row_number() over (order by s.game_date, s.start_time) as rn,
           exists(select 1 from entries e where e.session_id = s.id and e.player_id = _pid and e.guest is null) as att
    from sessions s where s.status = 'played'),
  a as (select rn - row_number() over (order by rn) as grp from g where att)
  select coalesce(max(c), 0)::int from (select count(*) as c from a group by grp) z
$$;

create or replace function public.get_badges() returns table(player_id uuid, badge text)
language sql stable security definer set search_path = public, private as $$
  select p.id, x.b from profiles p cross join lateral (
    select 'early' as b where exists(
      select 1 from entries e join sessions s on s.id = e.session_id
      where e.player_id = p.id and e.guest is null and s.rule_id is not null
        and e.created_at <= s.opens_at + interval '60 seconds')
    union all select 'iron' where private.max_streak(p.id) >= 5
    union all select 'shark' where (select count(*) from bets where winner = p.id and status = 'won') >= 3
    union all select 'clutch' where p.mvps >= 2
    union all select 'ghost' where coalesce(p.last_played, p.created_at::date) < private.today() - 30
  ) x
  where p.status = 'approved' and private.is_member()
$$;
revoke execute on function public.get_badges() from public, anon;
grant execute on function public.get_badges() to authenticated;
revoke execute on function private.max_streak(uuid) from public, anon, authenticated;
