-- Mengatur timezone default database PostgreSQL Supabase ke Asia/Jakarta (WIB, UTC+7)
-- Jalankan skrip ini di menu Supabase SQL Editor.
-- Setelah dijalankan, Supabase Table Editor dan query database akan menampilkan waktu dalam WIB (+07:00 / +0700).

alter database postgres set timezone to 'Asia/Jakarta';
alter role anon set timezone to 'Asia/Jakarta';
alter role authenticated set timezone to 'Asia/Jakarta';
alter role service_role set timezone to 'Asia/Jakarta';
alter role postgres set timezone to 'Asia/Jakarta';
