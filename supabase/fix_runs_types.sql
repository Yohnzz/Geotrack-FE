-- =====================================================================
--  GeoTrack · Migrasi Perbaikan Tipe Data Kolom runs & tracking_sessions
--  Mencegah error: "value out of range for type integer" / numeric overflow
--  Cara pakai: Supabase Dashboard > SQL Editor > New Query > Paste & Run
-- =====================================================================

-- 1. Perbarui kolom tabel runs agar mampu menampung durasi & jarak besar tanpa overflow
alter table if exists public.runs 
  alter column duration_seconds type bigint,
  alter column distance_km type numeric(10,2);

-- 2. Perbarui kolom tabel tracking_sessions jika sudah dibuat
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tracking_sessions') then
    alter table public.tracking_sessions
      alter column duration_seconds type bigint,
      alter column total_distance_km type numeric(10,2);
  end if;
end $$;
