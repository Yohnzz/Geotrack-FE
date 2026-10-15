-- Jalankan sekali di Supabase SQL Editor (setelah schema.sql & heartbeat.sql).
-- Menambah tabel laporan pembelian alat. Aplikasi tetap berjalan tanpa tabel ini,
-- tetapi halaman "Laporan Pembelian" akan kosong sampai SQL ini dijalankan.

create table if not exists public.purchases (
  id             uuid primary key default gen_random_uuid(),
  device_id      uuid references public.devices(id) on delete set null,
  device_code    text not null,            -- salinan agar laporan tetap utuh walau device dihapus
  device_name    text not null,
  buyer_id       uuid references public.profiles(id) on delete set null,
  buyer_name     text not null,            -- salinan nama pembeli
  price          numeric not null default 0 check (price >= 0),
  purchased_at   date not null default current_date,
  payment_method text not null default 'Transfer' check (payment_method in ('Tunai','Transfer','QRIS','Lainnya')),
  note           text,
  status         text not null default 'Aktif' check (status in ('Aktif','Dilepas')),
  created_at     timestamptz not null default now()
);
create index if not exists purchases_buyer_idx on public.purchases (buyer_id);
create index if not exists purchases_date_idx  on public.purchases (purchased_at desc);

alter table public.purchases enable row level security;

drop policy if exists "admin all" on public.purchases;
create policy "admin all" on public.purchases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pembelian sendiri (baca)" on public.purchases;
create policy "pembelian sendiri (baca)" on public.purchases for select to authenticated
  using (buyer_id = auth.uid());

grant select, insert, update, delete on public.purchases to authenticated;

-- Isi otomatis dari device yang SUDAH terhubung ke user sebelum fitur ini ada
-- (harga 0 -> admin bisa melengkapinya lewat tombol Edit di Laporan Pembelian).
insert into public.purchases (device_id, device_code, device_name, buyer_id, buyer_name, purchased_at)
select d.id, d.device_code, d.name, d.owner_id, p.full_name, d.created_at::date
  from public.devices d
  join public.profiles p on p.id = d.owner_id
 where d.owner_id is not null
   and not exists (select 1 from public.purchases x where x.device_id = d.id and x.status = 'Aktif');

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'purchases'
     ) then
    alter publication supabase_realtime add table public.purchases;
  end if;
end $$;
