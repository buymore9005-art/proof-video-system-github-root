# Pengaturan Supabase

1. Buat project Supabase.
2. Buka **SQL Editor**.
3. Salin seluruh isi `supabase/setup.sql`.
4. Klik **Run** satu kali.
5. Pastikan hasil terakhir menampilkan `status = READY` dan `storage_bucket_ready = 1`.
6. Buka **Authentication → Providers → Email** dan aktifkan email/password.
7. Nonaktifkan pendaftaran publik pada Authentication Settings. Akun baru dibuat melalui menu Admin aplikasi.
8. Dari **Connect** atau **Project Settings → API Keys**, ambil:
   - Project URL.
   - Publishable key `sb_publishable_...` untuk frontend.
   - Secret key `sb_secret_...` untuk Vercel Functions.
9. Masukkan nilai tersebut ke `.env.local` dan Vercel Environment Variables.

Bucket `proof-videos` dibuat private oleh SQL. Video hanya dapat dibaca pemiliknya atau Admin melalui signed URL yang berlaku sementara.

Upload memakai TUS langsung dari browser ke Supabase Storage. Untuk paket Free, perhatikan batas maksimal satu file dan kuota penyimpanan. Sesuaikan bitrate, durasi packing, dan Storage Settings sebelum produksi.
