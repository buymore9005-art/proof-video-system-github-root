# Proof Video System

Proof Video System adalah aplikasi bukti video packing otomatis yang menggunakan tepat tiga layanan:

- **GitHub** untuk seluruh source code, riwayat perubahan, dan Continuous Integration.
- **Supabase** untuk Authentication, PostgreSQL, Row Level Security, dan Storage video.
- **Vercel** untuk hosting aplikasi Vite dan serverless API administrasi.

Aplikasi ini tidak memakai Google Drive, Google Cloud, FFmpeg server, atau penyimpanan file pada Vercel.

## Fitur utama

- Login Supabase dengan role `admin` dan `operator`.
- Setup Admin pertama yang hanya dapat dilakukan satu kali.
- Kamera browser dengan `MediaRecorder`.
- Deteksi barcode melalui native `BarcodeDetector` dan fallback ZXing.
- Konfirmasi barcode, validasi pola, cooldown, dan pencegahan pembacaan ganda.
- Satu video mandiri untuk satu barcode/pesanan.
- IndexedDB sebagai antrean lokal sebelum upload.
- TUS resumable upload langsung dari browser ke Supabase Storage.
- Auto retry, auto resume setelah refresh, dan pemulihan setelah koneksi kembali.
- Dashboard statistik untuk Admin.
- Data Video dengan pencarian, filter, preview, download, tautan sementara, ekspor CSV, dan hapus oleh Admin.
- Manajemen pengguna melalui Vercel Functions.
- Pengaturan kualitas video dan perilaku barcode.
- Audit log.
- SQL Supabase satu kali run dengan RLS dan Storage policies.
- GitHub Actions untuk test, typecheck, lint, dan production build.

## Arsitektur layanan

```text
Browser
├── React + Vite
├── MediaRecorder + BarcodeDetector/ZXing
├── IndexedDB upload queue
├── Supabase Auth/PostgREST/RPC
└── TUS upload langsung ke Supabase Storage

Vercel
├── Static Vite build
├── /api/health
├── /api/setup
├── /api/users
└── /api/videos/delete

Supabase
├── Authentication
├── PostgreSQL + RLS
└── Private Storage bucket: proof-videos
```

## Persyaratan lokal

- Node.js `22.12.0` atau lebih baru.
- VS Code.
- Akun GitHub.
- Project Supabase.
- Project Vercel yang terhubung ke repository GitHub.
- Chrome atau Edge modern dan kamera untuk pengujian perekaman.

## Instalasi cepat

```powershell
npm install
Copy-Item .env.example .env.local
npm run secret
npm run dev:vercel
```

`npm install` pertama membuat `package-lock.json`. Commit file tersebut ke GitHub agar instalasi berikutnya konsisten.

Buka:

```text
http://localhost:3000/#/setup
```

Gunakan `npm run dev:vercel`, bukan hanya `npm run dev`, saat menguji endpoint `/api/*` secara lokal.

## Environment variables

Salin `.env.example` menjadi `.env.local`, lalu isi empat nilai berikut:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
SUPABASE_SECRET_KEY=sb_secret_REPLACE_ME
SETUP_SECRET=RANDOM_SECRET_MINIMUM_32_CHARACTERS
```

Aturan keamanan:

- `VITE_SUPABASE_PUBLISHABLE_KEY` memang ditujukan untuk browser. Keamanan data tetap wajib ditegakkan oleh RLS.
- `SUPABASE_SECRET_KEY` hanya boleh ada di Vercel dan `.env.local`. Jangan pernah menambahkan awalan `VITE_` pada secret key.
- Jangan commit `.env.local`.
- Jangan menaruh secret key pada GitHub source, issue, README, atau workflow log.

## Setup Supabase

1. Buka Supabase Dashboard.
2. Masuk ke **SQL Editor**.
3. Salin seluruh isi `supabase/setup.sql`.
4. Klik **Run** satu kali.
5. Pastikan hasil terakhir menampilkan:

```text
status = READY
storage_bucket_ready = 1
```

6. Aktifkan provider Email/Password.
7. Nonaktifkan pendaftaran publik. Akun berikutnya dibuat oleh Admin dari aplikasi.
8. Buka **Storage Settings** dan sesuaikan batas file dengan paket Supabase yang digunakan.

## Setup Admin pertama

1. Jalankan aplikasi.
2. Buka `/#/setup`.
3. Isi nama, email, password, dan `SETUP_SECRET`.
4. Login melalui `/#/login`.
5. Buat akun Petugas melalui menu **Pengguna**.

## Pengujian perekaman

```text
Mulai Sesi
→ tampilkan ORDER001
→ lakukan packing
→ tampilkan ORDER002
→ lakukan packing
→ Akhiri Sesi
```

Objek yang dihasilkan:

```text
proof-videos/
└── USER_ID/
    └── YYYY/MM/DD/SESSION_ID/
        ├── 0001_ORDER001.webm
        └── 0002_ORDER002.webm
```

Browser mencoba MP4 ketika codec tersedia dan menggunakan WebM sebagai fallback.

## Verifikasi

```powershell
npm run verify
```

Perintah tersebut menjalankan:

```text
static project check
unit tests
TypeScript typecheck
ESLint
Vite production build
```

GitHub Actions menjalankan verifikasi yang sama pada push dan pull request ke branch `main`.

## Deploy

1. Push seluruh isi folder project ke branch `main` GitHub.
2. Import repository tersebut di Vercel.
3. Tambahkan empat environment variables yang sama pada Vercel untuk Production dan Preview.
4. Deploy.
5. Buka `https://NAMA-PROJECT.vercel.app/#/setup`.

Panduan lengkap:

- `docs/GITHUB.md`
- `docs/INSTALLATION.md`
- `docs/DEPLOYMENT.md`
- `docs/TESTING.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/MIGRATION.md`
