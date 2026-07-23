# Instalasi Lokal Lengkap

## 1. Ambil source dari GitHub

```powershell
git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY
code .
```

## 2. Periksa Node.js

```powershell
node -v
npm -v
```

Gunakan Node.js minimal `22.12.0`.

## 3. Instal dependency

```powershell
npm install
```

Perintah tersebut membuat atau memperbarui `package-lock.json`. Commit lock file:

```powershell
git add package-lock.json
git commit -m "chore: add npm lockfile"
```

## 4. Siapkan Supabase

1. Buat project Supabase.
2. Buka **SQL Editor**.
3. Salin seluruh isi `supabase/setup.sql`.
4. Klik **Run** satu kali.
5. Pastikan hasil akhir menunjukkan `READY` dan `storage_bucket_ready = 1`.
6. Aktifkan provider Email/Password.
7. Nonaktifkan pendaftaran publik.
8. Dari **Connect** atau **Project Settings → API Keys**, ambil:
   - Project URL.
   - Publishable key dengan awalan `sb_publishable_`.
   - Secret key dengan awalan `sb_secret_`.

## 5. Buat environment lokal

```powershell
Copy-Item .env.example .env.local
npm run secret
```

Isi `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
SUPABASE_SECRET_KEY=sb_secret_REPLACE_ME
SETUP_SECRET=PASTE_RANDOM_SECRET_FROM_NPM_COMMAND
```

`SUPABASE_SECRET_KEY` hanya digunakan oleh Vercel Functions. Jangan commit `.env.local`.

## 6. Jalankan aplikasi dan Vercel Functions

```powershell
npm run dev:vercel
```

Buka:

```text
http://localhost:3000/#/setup
```

## 7. Buat Admin dan Petugas

1. Buat Admin pertama melalui halaman Setup.
2. Login.
3. Buka menu **Pengguna**.
4. Buat akun Operator/Petugas.
5. Login sebagai Operator untuk menguji pembatasan role.

## 8. Uji kamera dan upload

1. Buka menu **Perekaman**.
2. Izinkan kamera dan mikrofon.
3. Mulai sesi.
4. Gunakan dua barcode berbeda.
5. Akhiri sesi.
6. Periksa antrean upload.
7. Periksa table `videos` dan bucket `proof-videos` pada Supabase.

## 9. Verifikasi source

```powershell
npm run verify
```

Jangan deploy ketika test, typecheck, lint, atau build gagal.
