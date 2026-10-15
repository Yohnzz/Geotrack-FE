-- Jalankan sekali di Supabase SQL Editor setelah schema.sql.
create table if not exists public.device_heartbeats (
  device_id uuid primary key references public.devices(id) on delete cascade,
  last_seen timestamptz not null default now(),
  signal numeric
);

alter table public.device_heartbeats enable row level security;

drop policy if exists "admin all" on public.device_heartbeats;
create policy "admin all" on public.device_heartbeats for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "heartbeat device sendiri (baca)" on public.device_heartbeats;
create policy "heartbeat device sendiri (baca)" on public.device_heartbeats for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid()));

grant select on public.device_heartbeats to authenticated;

create or replace function public.ingest_heartbeat(
  p_device_code text, p_device_key text, p_signal numeric default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select d.id into v_id from public.devices d
    join public.device_secrets s on s.device_id = d.id
   where d.device_code = p_device_code and s.device_key = p_device_key;
  if v_id is null then raise exception 'Device atau kunci tidak valid' using errcode = '28000'; end if;

  insert into public.device_heartbeats (device_id, last_seen, signal)
  values (v_id, now(), p_signal)
  on conflict (device_id) do update set last_seen = excluded.last_seen, signal = excluded.signal;
end $$;

revoke all on function public.ingest_heartbeat(text, text, numeric) from public, anon, authenticated;
grant execute on function public.ingest_heartbeat(text, text, numeric) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'device_heartbeats'
     ) then
    alter publication supabase_realtime add table public.device_heartbeats;
  end if;
end $$;
