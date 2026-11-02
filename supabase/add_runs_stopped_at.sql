-- Migration: Menambahkan kolom stopped_at pada tabel runs
-- Jalankan di Supabase SQL Editor jika kolom stopped_at belum ada.

alter table public.runs 
add column if not exists stopped_at timestamptz;
