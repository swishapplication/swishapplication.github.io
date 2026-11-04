-- Arcade: Flick Shot + Lebanese Hoops Trivia, weekly squad leaderboard (resets Monday),
-- weekly champions (👑 Arcade King / 🧠 Trivia Brain) and "beat my score" challenges.

create table public.arcade_scores (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles(id) on delete cascade,
  game text not null check (game in ('flick', 'trivia')),
  score int not null check (score >= 0),
  played_on date not null,
  week_start date not null,
  created_at timestamptz not null default now()
);
create index arcade_scores_board on public.arcade_scores(game, week_start, score desc);
create unique index arcade_trivia_once_a_day on public.arcade_scores(player_id, played_on) where game = 'trivia';
alter table public.arcade_scores enable row level security;
create policy "members read" on public.arcade_scores for select using (private.is_member());
do $$ begin alter publication supabase_realtime add table public.arcade_scores;
exception when others then raise notice 'realtime publication not available: %', sqlerrm; end $$;

create or replace function private.week_start(d date) returns date language sql immutable as $$
  select d - ((extract(isodow from d)::int) - 1) $$;

create or replace function private.arcade_label(_game text) returns text language sql immutable as $$
  select case _game when 'flick' then 'Flick Shot' else 'Lebanese Hoops Trivia' end $$;

-- best score per player for a game and week
create or replace function public.arcade_board(_game text, _week date default null)
returns table(player_id uuid, best int, plays int)
language sql stable security definer set search_path = public, private as $$
  select a.player_id, max(a.score)::int, count(*)::int from arcade_scores a
  where private.is_member() and a.game = _game and a.week_start = coalesce(_week, private.week_start(private.today()))
  group by a.player_id order by 2 desc, min(a.created_at)
$$;

create or replace function public.submit_score(_game text, _score int) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member(); d date := today(); wk date := week_start(today()); prev int; r int; n int; leader uuid;
begin
  if _game not in ('flick', 'trivia') then raise exception 'Unknown game'; end if;
  if _score < 0 or (_game = 'flick' and _score > 400) or (_game = 'trivia' and _score > 1500) then raise exception 'That score looks off'; end if;
  if _game = 'trivia' and exists(select 1 from arcade_scores where player_id = me and game = 'trivia' and played_on = d) then
    raise exception 'You already played today''s trivia. New questions tomorrow!';
  end if;
  select max(score) into prev from arcade_scores where player_id = me and game = _game and week_start = wk;
  select b.player_id into leader from arcade_board(_game) b limit 1;
  insert into arcade_scores(player_id, game, score, played_on, week_start) values (me, _game, _score, d, wk);
  select count(*) into n from arcade_board(_game);
  select rk into r from (select b.player_id, row_number() over (order by b.best desc) as rk from arcade_board(_game) b) z where z.player_id = me;
  -- tell the previous leader when they lose first place
  if r = 1 and leader is not null and leader <> me then
    perform notify_many(array[leader], '😤',
      pname(me) || ' took first place!', pname(me) || ' scored ' || _score || ' in ' || arcade_label(_game) || '. Go win it back!', '#arcade', '🕹️ Play now');
  end if;
  return jsonb_build_object('best', greatest(coalesce(prev, 0), _score), 'personal_best', coalesce(prev, -1) < _score, 'rank', r, 'players', n);
end $$;

create or replace function public.arcade_challenge(_to uuid, _game text, _score int) returns void
language plpgsql security definer set search_path = public, private as $$
declare me uuid := require_member();
begin
  if _to = me then raise exception 'You can''t challenge yourself'; end if;
  perform notify(_to, '🎯', pname(me) || ' says: beat my ' || _score || '!',
    pname(me) || ' scored ' || _score || ' in ' || arcade_label(_game) || '. Your move 😏', '#arcade', '🕹️ Accept the challenge');
end $$;

-- champions of a finished week
create or replace function private.arcade_winner(_game text, _week date) returns uuid
language sql stable security definer set search_path = public as $$
  select player_id from arcade_scores where game = _game and week_start = _week
  group by player_id order by max(score) desc, min(created_at) limit 1
$$;

-- once a week (first tick of a new week): announce last week's champions
create or replace function private.arcade_weekly() returns void
language plpgsql security definer set search_path = public, private as $$
declare lw date := week_start(today()) - 7; done text; k uuid; b uuid;
begin
  select value into done from private.config where key = 'arcade_announced';
  if done = lw::text then return; end if;
  insert into private.config(key, value) values ('arcade_announced', lw::text) on conflict (key) do update set value = excluded.value;
  k := arcade_winner('flick', lw); b := arcade_winner('trivia', lw);
  if k is not null then
    perform notify_many(array(select members()), '👑', pname(k) || ' is the Arcade King!',
      'Top Flick Shot score last week. New week, new leaderboard. Go dethrone them!', '#arcade', '🕹️ Play now');
  end if;
  if b is not null then
    perform notify_many(array(select members()), '🧠', pname(b) || ' is the Trivia Brain!',
      'Best Lebanese Hoops Trivia score last week. Fresh questions every day.', '#arcade', '🕹️ Play now');
  end if;
end $$;

create or replace function private.tick() returns void language plpgsql security definer set search_path = public, private as $$
declare u text;
begin
  perform open_due_bookings();
  begin perform arcade_weekly(); exception when others then raise notice 'arcade weekly: %', sqlerrm; end;
  select value into u from private.config where key = 'functions_url';
  if u is not null and exists(select 1 from notifications where sent_at is null) then
    execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := ''{"Content-Type":"application/json"}''::jsonb)' using u || '/dispatch';
  end if;
end $$;

-- badges: add the reigning weekly champions
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
    union all select 'king' where private.arcade_winner('flick', private.week_start(private.today()) - 7) = p.id
    union all select 'brain' where private.arcade_winner('trivia', private.week_start(private.today()) - 7) = p.id
  ) x
  where p.status = 'approved' and private.is_member()
$$;

revoke execute on function public.arcade_board(text, date), public.submit_score(text, int), public.arcade_challenge(uuid, text, int) from public, anon;
grant execute on function public.arcade_board(text, date), public.submit_score(text, int), public.arcade_challenge(uuid, text, int) to authenticated;
revoke execute on function private.arcade_weekly(), private.arcade_winner(text, date) from public, anon, authenticated;
