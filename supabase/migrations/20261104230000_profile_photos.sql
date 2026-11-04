-- Profile photos: stored in a public "avatars" bucket, one folder per player.
alter table public.profiles add column if not exists avatar_url text;

create or replace function public.set_avatar(_url text) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  if _url is not null and _url <> '' and (_url !~* '^https://' or length(_url) > 500) then raise exception 'Invalid photo'; end if;
  update profiles set avatar_url = nullif(_url, '') where id = auth.uid();
end $$;
revoke execute on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;

do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = true;

  drop policy if exists "avatars: anyone can view" on storage.objects;
  drop policy if exists "avatars: upload own" on storage.objects;
  drop policy if exists "avatars: update own" on storage.objects;
  drop policy if exists "avatars: delete own" on storage.objects;
  create policy "avatars: anyone can view" on storage.objects for select using (bucket_id = 'avatars');
  create policy "avatars: upload own" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy "avatars: update own" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy "avatars: delete own" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception when undefined_table or invalid_schema_name then raise notice 'storage not available here';
end $$;
