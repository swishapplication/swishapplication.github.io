-- Fresh start before inviting the squad.
-- Keeps: accounts (Bassem, Maher, admin rights, photos), app settings, the weekly game and upcoming games, push subscriptions.
-- Clears: played games, all bookings/waitlists, bets, team challenges, MVP votes, IOUs, credits, stats, arcade scores and alerts.
delete from public.sessions where status <> 'upcoming';
delete from public.mvp_votes;
delete from public.bets;
delete from public.team_bets;
delete from public.waitlist;
update public.entries set covered_by = null where covered_by is not null;
delete from public.entries;
delete from public.credits;
delete from public.debts;
delete from public.notifications;
delete from public.arcade_scores;
update public.sessions set hype = '{}'::jsonb, teams = null, winner = null, mvp = null, mvp_closed = false;
update public.profiles set games = 0, wins = 0, mvps = 0, spent = 0, last_played = null;
