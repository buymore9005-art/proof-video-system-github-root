# Keamanan

## Supabase

- Seluruh tabel aplikasi memakai Row Level Security.
- Bucket `proof-videos` bersifat private.
- Path upload wajib diawali UUID pengguna aktif.
- Operator tidak dapat membaca metadata atau object milik operator lain.
- Admin dapat membaca seluruh video melalui policy dan signed URL sementara.
- Secret key Supabase tidak pernah dikirim ke browser.
- Publishable key hanya memberi hak rendah; keputusan akses tetap dilakukan oleh RLS dan JWT pengguna.

## Vercel Functions

- `/api/setup` memerlukan `SETUP_SECRET` dan hanya bekerja sebelum profil pertama tersedia.
- `/api/users` memvalidasi JWT, profil aktif, dan role Admin.
- `/api/videos/delete` memvalidasi JWT dan role Admin sebelum menghapus object.
- Admin terakhir yang aktif tidak dapat dinonaktifkan atau diturunkan role-nya.
- Secret key hanya dibaca dari environment server.

## Frontend

- `.env.local` berada dalam `.gitignore`.
- Signed URL video berlaku sementara dan bukan URL publik permanen.
- Ekspor CSV menetralkan karakter awal yang dapat memicu formula spreadsheet.
- Barcode divalidasi terhadap panjang dan regular expression.
- Navigasi dicegah saat sesi masih aktif agar rekaman tidak terputus tanpa sengaja.

## Header keamanan

Vercel mengirim:

- Content-Security-Policy.
- X-Content-Type-Options.
- X-Frame-Options.
- Referrer-Policy.
- Permissions-Policy.

Sebelum produksi, aktifkan MFA untuk akun GitHub, Supabase, dan Vercel. Batasi anggota tim yang dapat membaca environment variables dan melakukan deployment produksi.
