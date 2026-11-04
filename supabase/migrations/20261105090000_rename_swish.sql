-- Rename the app to Swish (only if the admin hasn't already chosen another name)
alter table public.settings alter column app_name set default 'Swish';
update public.settings set app_name = 'Swish' where id = 1 and app_name = 'Hoop Squad';
