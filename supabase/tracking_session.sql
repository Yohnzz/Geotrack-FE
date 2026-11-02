-- =====================================================================
--  GeoTrack · Fitur Sesi Lari / Tracking IoT (Start & Stop)
--  Untuk ESP32 GPS Tracker & Supabase
--  Cara pakai: Buka Supabase Dashboard > SQL Editor > New query > Tempel > Run.
-- =====================================================================

-- 1. Tabel Sesi Pelacakan (Tracking Sessions)
create table if not exists public.tracking_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  device_id         uuid not null references public.devices(id) on delete cascade,
  status            text not null default 'active' check (status in ('active', 'paused', 'completed')),
  started_at        timestamptz not null default now(),
  stopped_at        timestamptz,
  total_distance_km numeric(10,2) not null default 0 check (total_distance_km >= 0),
  duration_seconds  bigint not null default 0 check (duration_seconds >= 0),
  route             jsonb not null default '[]'::jsonb,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists tracking_sessions_user_idx on public.tracking_sessions (user_id, started_at desc);
create index if not exists tracking_sessions_device_idx on public.tracking_sessions (device_id, status);

-- 2. Tabel Antrean Perintah untuk ESP32 (Device Commands)
create table if not exists public.device_commands (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references public.devices(id) on delete cascade,
  session_id   uuid references public.tracking_sessions(id) on delete cascade,
  command      text not null check (command in ('START', 'STOP', 'PAUSE', 'RESUME')),
  status       text not null default 'pending' check (status in ('pending', 'acknowledged', 'completed')),
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  executed_at  timestamptz
);

create index if not exists device_commands_poll_idx on public.device_commands (device_id, status, created_at desc);

-- 3. Row Level Security (RLS)
alter table public.tracking_sessions enable row level security;
alter table public.device_commands   enable row level security;

-- Policy untuk tracking_sessions:
create policy "admin tracking_sessions all" on public.tracking_sessions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "user lihat sesi sendiri" on public.tracking_sessions
  for select to authenticated using (user_id = auth.uid());

create policy "user buat sesi sendiri" on public.tracking_sessions
  for insert to authenticated with check (user_id = auth.uid());

create policy "user update sesi sendiri" on public.tracking_sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Policy untuk device_commands:
create policy "admin device_commands all" on public.device_commands
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "user buat perintah device sendiri" on public.device_commands
  for insert to authenticated
  with check (exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid()));

create policy "user lihat perintah device sendiri" on public.device_commands
  for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid()));

-- Policy agar ESP32 dengan anon key bisa membaca dan mengonfirmasi perintah miliknya
create policy "esp32 baca perintah" on public.device_commands
  for select to anon using (true);

create policy "esp32 update status perintah" on public.device_commands
  for update to anon using (true) with check (true);


-- 4. Fungsi RPC: Mulai Sesi Lari (Start Tracking)
create or replace function public.start_tracking_session(p_device_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_session_id uuid;
  v_now       timestamptz := now();
begin
  -- Pastikan device milik user yang memanggil
  if not exists (select 1 from public.devices where id = p_device_id and owner_id = v_user_id) then
    raise exception 'Device tidak ditemukan atau bukan milik Anda.';
  end if;

  -- Jika ada sesi aktif sebelumnya pada device ini, otomatis selesaikan terlebih dahulu
  update public.tracking_sessions
  set status = 'completed', stopped_at = v_now
  where device_id = p_device_id and status = 'active';

  -- Buat sesi baru
  insert into public.tracking_sessions (user_id, device_id, status, started_at)
  values (v_user_id, p_device_id, 'active', v_now)
  returning id into v_session_id;

  -- Buat perintah START untuk ESP32
  insert into public.device_commands (device_id, session_id, command, status, payload)
  values (p_device_id, v_session_id, 'START', 'pending', json_build_object(
    'started_at', v_now,
    'session_id', v_session_id
  ));

  return json_build_object(
    'ok', true,
    'session_id', v_session_id,
    'device_id', p_device_id,
    'started_at', v_now,
    'status', 'active'
  );
end;
$$;


-- 5. Fungsi RPC: Selesai Sesi Lari (Stop Tracking & Rekonstruksi Rute)
create or replace function public.stop_tracking_session(p_session_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session    record;
  v_now        timestamptz := now();
  v_duration   bigint;
  v_route      jsonb;
  v_dist_km    numeric(10,2) := 0;
  v_run_id     uuid;
begin
  -- Ambil data sesi
  select * into v_session
  from public.tracking_sessions
  where id = p_session_id and (user_id = v_user_id or public.is_admin());

  if not found then
    raise exception 'Sesi pelacakan tidak ditemukan.';
  end if;

  if v_session.status = 'completed' then
    return json_build_object(
      'ok', true,
      'message', 'Sesi ini sudah dihentikan sebelumnya.',
      'session_id', p_session_id
    );
  end if;

  -- Hitung durasi lari dalam detik
  v_duration := extract(epoch from (v_now - v_session.started_at))::int;

  -- Kumpulkan seluruh koordinat GPS milik device ini yang tercatat antara started_at dan sekarang
  -- (Termasuk data yang baru diunggah dari antrean SD card offline!)
  select coalesce(jsonb_agg(jsonb_build_array(g.latitude, g.longitude) order by g.recorded_at asc), '[]'::jsonb)
  into v_route
  from public.gps_data g
  where g.device_id = v_session.device_id
    and g.recorded_at >= v_session.started_at
    and g.recorded_at <= v_now;

  -- Update status sesi tracking
  update public.tracking_sessions
  set status = 'completed',
      stopped_at = v_now,
      duration_seconds = v_duration,
      route = v_route
  where id = p_session_id;

  -- Buat perintah STOP untuk ESP32
  insert into public.device_commands (device_id, session_id, command, status, payload)
  values (v_session.device_id, p_session_id, 'STOP', 'pending', json_build_object(
    'stopped_at', v_now,
    'session_id', p_session_id
  ));

  -- Simpan juga ke tabel riwayat aktivitas running bawaan (public.runs)
  insert into public.runs (
    user_id,
    device_id,
    distance_km,
    duration_seconds,
    route,
    started_at,
    note
  ) values (
    v_session.user_id,
    v_session.device_id,
    v_dist_km,
    v_duration,
    v_route,
    v_session.started_at,
    'Aktivitas lari via GeoTrack IoT ESP32'
  ) returning id into v_run_id;

  return json_build_object(
    'ok', true,
    'session_id', p_session_id,
    'run_id', v_run_id,
    'started_at', v_session.started_at,
    'stopped_at', v_now,
    'duration_seconds', v_duration,
    'points_count', jsonb_array_length(v_route)
  );
end;
$$;
