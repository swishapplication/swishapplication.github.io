-- One-time reset of test data before the squad starts using the app.
-- Keeps: players, admins, settings, weekly games and upcoming games.
-- Clears: played games (with their votes, bets and team challenges), stats, IOUs, free-game credits and alerts.
delete from public.sessions where status = 'played';
update public.entries set covered_by = null where covered_by is not null;
delete from public.credits;
delete from public.debts;
delete from public.notifications;
update public.profiles set games = 0, wins = 0, mvps = 0, spent = 0, last_played = null;
