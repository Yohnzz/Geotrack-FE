-- =====================================================================
--  GeoTrack · Skema Supabase LENGKAP (tanpa data dummy)
--  Cara pakai: Supabase Dashboard > SQL Editor > New query > tempel semua > Run.
--
--  PERHATIAN: Bagian 0 menghapus tabel aplikasi lama (profiles, devices, gps_data,
--  dst.) beserta isinya agar skema bersih. Jalankan di project yang memang
--  untuk GeoTrack. Akun di Authentication > Users TIDAK dihapus.
--  Setelah selesai, buat akun admin pertama di BAGIAN 11 (di paling bawah).
-- =====================================================================

-- ---------- 0. Bersihkan skema lama ----------
drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop view     if exists public.public_listings;
drop view     if exists public.device_latest;
drop table if exists public.notifications, public.route_points, public.routes,
  public.activity_logs, public.tickets, public.runs, public.rental_requests,
  public.listings, public.gps_data, public.device_secrets, public.devices,
  public.profiles cascade;

-- ---------- 1. Tabel ----------
-- Profil akun. Login memakai Supabase Auth; username/role/mode disimpan di sini.
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null check (username ~ '^[A-Za-z0-9_.]{3,30}$'),
  full_name  text not null,
  email      text not null,
  phone      text,
  role       text not null default 'user' check (role in ('admin','user')),
  mode       text check (mode in ('Running','Rental')),
  created_at timestamptz not null default now(),
  constraint mode_wajib_untuk_user check (role = 'admin' or mode is not null)
);
create unique index profiles_username_key on public.profiles (lower(username));
create unique index profiles_email_key    on public.profiles (lower(email));

-- Perangkat GPS. device_code = ID yang dipakai ESP32.
create table public.devices (
  id          uuid primary key default gen_random_uuid(),
  device_code text not null unique,
  name        text not null,
  alias       text check (alias is null or char_length(alias) <= 60),  -- nama alias opsional dari pemilik, mis. "Toyota Avanza 001"
  owner_id    uuid references public.profiles(id) on delete set null,
  sale_status text not null default 'Tersedia' check (sale_status in ('Tersedia','Terjual')),
  notes       text,
  created_at  timestamptz not null default now()
);
create index devices_owner_idx on public.devices (owner_id);

-- Kunci rahasia tiap device (hanya admin yang bisa membaca) untuk ESP32.
create table public.device_secrets (
  device_id  uuid primary key references public.devices(id) on delete cascade,
  device_key text not null default replace(gen_random_uuid()::text, '-', '')
);

-- Data GPS (struktur sama persis dengan tabel gps_data yang sudah ada).
create table public.gps_data (
  id          uuid primary key default gen_random_uuid(),
  device_id   uuid not null references public.devices(id) on delete cascade,
  latitude    float8 not null,
  longitude   float8 not null,
  speed       numeric,
  accuracy    numeric,
  satellites  int4,
  battery     numeric,
  signal      numeric,
  recorded_at timestamptz not null default now()
);
create index gps_data_device_time_idx on public.gps_data (device_id, recorded_at desc);

-- Mode Rental: alat yang disewakan pemilik.
create table public.listings (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  device_id       uuid not null unique references public.devices(id) on delete cascade,
  title           text not null,
  description     text,
  price_per_day   int  not null default 0 check (price_per_day >= 0),
  contact_phone   text,
  pickup_location text,
  status          text not null default 'Tersedia' check (status in ('Tersedia','Disewa','Nonaktif')),
  created_at      timestamptz not null default now()
);

-- Permintaan sewa dari orang lain (diajukan lewat halaman publik, diputuskan pemilik).
create table public.rental_requests (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  renter_name  text not null,
  renter_phone text not null,
  start_date   date,
  days         int  not null check (days between 1 and 365),
  note         text,
  status       text not null default 'Menunggu' check (status in ('Menunggu','Diterima','Ditolak','Selesai')),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index rental_requests_listing_idx on public.rental_requests (listing_id);

-- Mode Running: riwayat lari.
create table public.runs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  device_id        uuid references public.devices(id) on delete set null,
  distance_km      numeric(8,2) not null default 0 check (distance_km >= 0),
  duration_seconds int not null default 0 check (duration_seconds >= 0),
  note             text,
  route            jsonb not null default '[]'::jsonb,
  started_at       timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index runs_user_idx on public.runs (user_id, started_at desc);

-- Pengaduan ke admin.
create table public.tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  category   text not null,
  title      text not null,
  detail     text not null,
  status     text not null default 'Baru' check (status in ('Baru','Diproses','Selesai')),
  reply      text,
  created_at timestamptz not null default now()
);

-- Riwayat aktivitas (dibaca admin).
create table public.activity_logs (
  id         bigserial primary key,
  actor_id   uuid references public.profiles(id) on delete set null,
  actor_name text,
  text       text not null,
  created_at timestamptz not null default now()
);

-- ---------- 2. View ----------
-- Posisi terakhir tiap device. security_invoker = RLS pembaca tetap berlaku.
create view public.device_latest with (security_invoker = true) as
  select distinct on (device_id)
         device_id, latitude, longitude, speed, accuracy, satellites, battery, signal, recorded_at
  from public.gps_data
  order by device_id, recorded_at desc;

-- Katalog publik: hanya alat berstatus Tersedia dan hanya kolom yang aman.
create view public.public_listings as
  select l.id, l.title, l.description, l.price_per_day, l.contact_phone, l.pickup_location,
         d.name as device_name, p.full_name as owner_name
  from public.listings l
  join public.devices  d on d.id = l.device_id
  join public.profiles p on p.id = l.owner_id
  where l.status = 'Tersedia';

-- ---------- 3. Fungsi bantu ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.my_mode() returns text
language sql stable security definer set search_path = public as
$$ select mode from public.profiles where id = auth.uid() $$;

-- ---------- 4. Trigger ----------
-- User biasa hanya boleh mengubah alias/deskripsi device, bukan kode/nama resmi/pemilik/status jual.
create or replace function public.devices_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_admin() and (
       new.device_code is distinct from old.device_code
    or new.name        is distinct from old.name
    or new.owner_id    is distinct from old.owner_id
    or new.sale_status is distinct from old.sale_status) then
    raise exception 'Hanya admin yang dapat mengubah kode, nama resmi, pemilik, atau status penjualan device';
  end if;
  -- alias dirapikan: spasi di tepi dibuang, string kosong menjadi NULL
  new.alias := nullif(btrim(new.alias), '');
  return new;
end $$;
create trigger devices_guard_trg before update on public.devices
  for each row execute function public.devices_guard();

-- Pemilik berganti / dilepas -> listing sewa lama otomatis dihapus.
create or replace function public.devices_owner_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    delete from public.listings where device_id = new.id;
  end if;
  return new;
end $$;
create trigger devices_owner_changed_trg after update on public.devices
  for each row execute function public.devices_owner_changed();

-- Tiap device baru otomatis dibuatkan kunci ESP32.
create or replace function public.devices_make_secret() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.device_secrets (device_id) values (new.id);
  return new;
end $$;
create trigger devices_make_secret_trg after insert on public.devices
  for each row execute function public.devices_make_secret();

-- Keputusan pemilik: Diterima -> listing "Disewa", Selesai -> kembali "Tersedia".
create or replace function public.rental_request_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'Diterima' then
      if exists (select 1 from public.rental_requests
                 where listing_id = new.listing_id and status = 'Diterima' and id <> new.id) then
        raise exception 'Alat ini sedang disewa. Selesaikan sewa sebelumnya terlebih dahulu';
      end if;
      update public.listings set status = 'Disewa' where id = new.listing_id;
    elsif new.status = 'Selesai' then
      update public.listings set status = 'Tersedia' where id = new.listing_id and status = 'Disewa';
    end if;
    if new.status in ('Diterima','Ditolak','Selesai') then new.decided_at := now(); end if;
  end if;
  return new;
end $$;
create trigger rental_request_status_trg before update on public.rental_requests
  for each row execute function public.rental_request_status();

-- ---------- 5. Row Level Security ----------
alter table public.profiles        enable row level security;
alter table public.devices         enable row level security;
alter table public.device_secrets  enable row level security;
alter table public.gps_data        enable row level security;
alter table public.listings        enable row level security;
alter table public.rental_requests enable row level security;
alter table public.runs            enable row level security;
alter table public.tickets         enable row level security;
alter table public.activity_logs   enable row level security;

-- Admin memegang semua tabel.
do $$ declare t text; begin
  foreach t in array array['profiles','devices','device_secrets','gps_data','listings',
                           'rental_requests','runs','tickets','activity_logs'] loop
    execute format('create policy "admin all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- User: hanya data miliknya.
create policy "profil sendiri"   on public.profiles for select to authenticated using (id = auth.uid());

create policy "device milik sendiri (baca)"  on public.devices for select to authenticated using (owner_id = auth.uid());
create policy "device milik sendiri (ubah)"  on public.devices for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "titik gps device sendiri" on public.gps_data for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid()));

create policy "listing sendiri (baca)"  on public.listings for select to authenticated using (owner_id = auth.uid());
create policy "listing sendiri (tambah)" on public.listings for insert to authenticated
  with check (owner_id = auth.uid() and public.my_mode() = 'Rental'
              and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid()));
create policy "listing sendiri (ubah)"  on public.listings for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
              and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid()));
create policy "listing sendiri (hapus)" on public.listings for delete to authenticated using (owner_id = auth.uid());

create policy "pemilik lihat permintaan" on public.rental_requests for select to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()));
create policy "pemilik memutuskan permintaan" on public.rental_requests for update to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()));
-- Pemilik hanya boleh mengubah kolom status (data penyewa tidak boleh diubah).
revoke update on public.rental_requests from authenticated;
grant  update (status) on public.rental_requests to authenticated;

create policy "run sendiri (baca)"   on public.runs for select to authenticated using (user_id = auth.uid());
create policy "run sendiri (tambah)" on public.runs for insert to authenticated
  with check (user_id = auth.uid() and public.my_mode() = 'Running');
create policy "run sendiri (ubah)"   on public.runs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "run sendiri (hapus)"  on public.runs for delete to authenticated using (user_id = auth.uid());

create policy "tiket sendiri (baca)"   on public.tickets for select to authenticated using (user_id = auth.uid());
create policy "tiket sendiri (kirim)"  on public.tickets for insert to authenticated with check (user_id = auth.uid());

create policy "catat aktivitas sendiri" on public.activity_logs for insert to authenticated with check (actor_id = auth.uid());

-- ---------- 6. Pembuatan akun (admin) ----------
-- Fungsi internal: membuat akun login + profil sekaligus. TIDAK bisa dipanggil dari browser.
create or replace function public._create_auth_user(
  p_email text, p_password text, p_username text, p_full_name text,
  p_phone text, p_role text, p_mode text) returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_id uuid := gen_random_uuid(); v_email text := lower(trim(p_email));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Format email tidak valid'; end if;
  if coalesce(length(p_password), 0) < 6 then raise exception 'Password minimal 6 karakter'; end if;
  if p_role not in ('admin','user') then raise exception 'Role tidak valid'; end if;
  if p_role = 'user' and p_mode not in ('Running','Rental') then raise exception 'Mode wajib dipilih (Running atau Rental)'; end if;
  if p_username !~ '^[A-Za-z0-9_.]{3,30}$' then raise exception 'Username 3-30 karakter: huruf, angka, titik, atau underscore'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'Email sudah terdaftar'; end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username)) then raise exception 'Username sudah dipakai'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());

  insert into public.profiles (id, username, full_name, email, phone, role, mode)
  values (v_id, p_username, trim(p_full_name), v_email, nullif(trim(p_phone), ''), p_role,
          case when p_role = 'admin' then null else p_mode end);
  return v_id;
end $$;

create or replace function public.admin_create_user(
  p_email text, p_password text, p_username text, p_full_name text,
  p_phone text, p_role text, p_mode text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin yang dapat menambah user'; end if;
  return public._create_auth_user(p_email, p_password, p_username, p_full_name, p_phone, p_role, p_mode);
end $$;

create or replace function public.admin_update_user(
  p_id uuid, p_email text, p_password text, p_username text, p_full_name text,
  p_phone text, p_role text, p_mode text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then raise exception 'Hanya admin yang dapat mengubah user'; end if;
  if p_id = auth.uid() and p_role <> 'admin' then raise exception 'Role akun Anda sendiri tidak dapat diturunkan'; end if;
  if p_role = 'user' and p_mode not in ('Running','Rental') then raise exception 'Mode wajib dipilih (Running atau Rental)'; end if;
  if coalesce(p_password, '') <> '' and length(p_password) < 6 then raise exception 'Password minimal 6 karakter'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email and id <> p_id) then raise exception 'Email sudah terdaftar'; end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username) and id <> p_id) then raise exception 'Username sudah dipakai'; end if;

  update public.profiles set username = p_username, full_name = trim(p_full_name), email = v_email,
         phone = nullif(trim(p_phone), ''), role = p_role,
         mode = case when p_role = 'admin' then null else p_mode end
   where id = p_id;
  update auth.users set email = v_email, updated_at = now(),
         encrypted_password = case when coalesce(p_password, '') <> '' then crypt(p_password, gen_salt('bf')) else encrypted_password end
   where id = p_id;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_email)
   where user_id = p_id and provider = 'email';
end $$;

create or replace function public.admin_delete_user(p_id uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin yang dapat menghapus user'; end if;
  if p_id = auth.uid() then raise exception 'Akun Anda sendiri tidak dapat dihapus'; end if;
  update public.devices set owner_id = null, sale_status = 'Tersedia' where owner_id = p_id;
  delete from auth.users where id = p_id;   -- profil, listing, run ikut terhapus
end $$;

-- ---------- 7. Login pakai username ----------
create or replace function public.login_email(p_identifier text) returns text
language sql stable security definer set search_path = public as
$$ select email from public.profiles where lower(username) = lower(trim(p_identifier)) limit 1 $$;

-- ---------- 8. ESP32 mengirim data GPS ----------
-- POST {SUPABASE_URL}/rest/v1/rpc/ingest_gps  (header apikey + Authorization: Bearer <publishable key>)
-- Body JSON: {"p_device_code":"GT-001","p_device_key":"<kunci dari menu Device>","p_latitude":-7.98,"p_longitude":112.63,
--             "p_speed":0,"p_accuracy":5,"p_satellites":8,"p_battery":80,"p_signal":-70}
create or replace function public.ingest_gps(
  p_device_code text, p_device_key text, p_latitude float8, p_longitude float8,
  p_speed numeric default null, p_accuracy numeric default null, p_satellites int default null,
  p_battery numeric default null, p_signal numeric default null, p_recorded_at timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select d.id into v_id from public.devices d
    join public.device_secrets s on s.device_id = d.id
   where d.device_code = p_device_code and s.device_key = p_device_key;
  if v_id is null then raise exception 'Device atau kunci tidak valid' using errcode = '28000'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Koordinat tidak valid';
  end if;
  insert into public.gps_data (device_id, latitude, longitude, speed, accuracy, satellites, battery, signal, recorded_at)
  values (v_id, p_latitude, p_longitude, p_speed, p_accuracy, p_satellites, p_battery, p_signal,
          coalesce(least(p_recorded_at, now()), now()));
end $$;

-- ---------- 9. Katalog & permintaan sewa publik ----------
create or replace function public.submit_rental_request(
  p_listing_id uuid, p_name text, p_phone text, p_start date, p_days int, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then raise exception 'Nama dan nomor telepon wajib diisi'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'Lama sewa harus 1-365 hari'; end if;
  if not exists (select 1 from public.listings where id = p_listing_id and status = 'Tersedia') then
    raise exception 'Alat tidak tersedia untuk disewa';
  end if;
  insert into public.rental_requests (listing_id, renter_name, renter_phone, start_date, days, note)
  values (p_listing_id, trim(p_name), trim(p_phone), p_start, p_days, nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ---------- 10. Hak akses fungsi & view ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.my_mode()                       to authenticated;
grant execute on function public.admin_create_user(text,text,text,text,text,text,text)       to authenticated;
grant execute on function public.admin_update_user(uuid,text,text,text,text,text,text,text)  to authenticated;
grant execute on function public.admin_delete_user(uuid)                            to authenticated;
grant execute on function public.login_email(text)                                  to anon, authenticated;
grant execute on function public.ingest_gps(text,text,float8,float8,numeric,numeric,int,numeric,numeric,timestamptz) to anon, authenticated;
grant execute on function public.submit_rental_request(uuid,text,text,date,int,text) to anon, authenticated;
grant select on public.public_listings to anon, authenticated;
grant select on public.device_latest   to authenticated;

-- Realtime (peta live & permintaan sewa masuk otomatis).
alter publication supabase_realtime add table
  public.gps_data, public.devices, public.profiles, public.listings,
  public.rental_requests, public.runs, public.tickets, public.activity_logs;

-- ---------- 11. AKUN ADMIN PERTAMA ----------
-- Ganti 3 nilai di bawah (email, password, nama), lalu hapus tanda "--" di depan dan Run bagian ini saja.
-- select public._create_auth_user('EMAIL_ADMIN_ANDA', 'PASSWORD_ADMIN_ANDA', 'admin', 'Administrator', null, 'admin', null);