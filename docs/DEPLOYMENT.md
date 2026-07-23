# Deployment GitHub ke Vercel

## 1. Push repository ke GitHub

Jalankan dari root project:

```powershell
git init
git add .
git commit -m "feat: add proof video system"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Pastikan `.env.local` tidak ikut ter-commit.

## 2. Import repository ke Vercel

1. Login ke Vercel menggunakan GitHub.
2. Klik **Add New → Project**.
3. Pilih repository Proof Video System.
4. Framework akan terdeteksi sebagai Vite.
5. Gunakan Build Command `npm run build`.
6. Gunakan Output Directory `dist`.
7. Install Command dapat dibiarkan `npm install`.

## 3. Environment Variables Vercel

Tambahkan untuk **Production**, **Preview**, dan bila diperlukan **Development**:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SETUP_SECRET
```

Nilai yang sama juga digunakan dalam `.env.local`, tetapi `SUPABASE_SECRET_KEY` tidak boleh pernah memiliki awalan `VITE_`.

## 4. Deploy

Klik **Deploy**. Setelah build berhasil, buka:

```text
https://NAMA-PROJECT.vercel.app/#/setup
```

Aplikasi memakai hash routing (`/#/halaman`), sehingga refresh halaman tidak membutuhkan rewrite SPA khusus dan endpoint `/api/*` tetap terpisah.

## 5. Setup Admin produksi

1. Buka `/#/setup` pada domain Vercel.
2. Masukkan `SETUP_SECRET` yang sama dengan environment Vercel.
3. Buat Admin pertama.
4. Setelah berhasil, endpoint setup otomatis menolak pembuatan Admin berikutnya karena profil sudah tersedia.

## 6. GitHub Actions

Workflow `.github/workflows/ci.yml` menjalankan `npm run verify` pada push dan pull request ke `main`.

Sebelum menggabungkan perubahan ke `main`, pastikan semua langkah berikut lulus:

```text
static verification
unit tests
typecheck
lint
production build
```
