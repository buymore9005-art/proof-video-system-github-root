# File Lama yang Dihapus

Dokumen ini menjelaskan file snapshot awal yang tidak lagi dipakai oleh Proof Video System.

## `main.tsx` — Delete

Entry point monolitik pada root dihapus. Penggantinya adalah `src/main.tsx`, sedangkan fungsi aplikasi dipisah menjadi `src/components`, `src/pages`, `src/providers`, dan `src/lib` agar mudah dipelihara.

## `robot.txt` — Delete

Nama dan lokasi file lama tidak mengikuti struktur aset Vite. Penggantinya adalah `public/robots.txt`, sehingga Vite menyalinnya menjadi `/robots.txt` saat build.

## `package-lock.json` lama — Delete lalu regenerate

Lock file snapshot lama tidak konsisten dengan `package.json` lama maupun dependency Proof Video System. Jalankan `npm install` satu kali setelah mengekstrak repository. Commit `package-lock.json` baru yang dihasilkan npm ke GitHub.

## Modul Google Drive/Google Cloud versi terdahulu — Delete jika masih ada

Repository akhir tidak membutuhkan Google OAuth, Google Drive API, token encryption Google, halaman Drive, atau API `/api/drive/*`. Jika branch lama masih memiliki file seperti berikut, hapus seluruhnya:

```text
api/drive/
api/_lib/google.ts
api/_lib/crypto.ts
src/pages/drive-page.tsx
src/lib/google-resumable.ts
src/lib/drive/
```

Video sekarang disimpan langsung pada bucket private Supabase Storage bernama `proof-videos`.

## Alur FFmpeg server — Delete jika masih ada

Tidak ada proses pemotongan FFmpeg pada Vercel. Browser membuat satu `MediaRecorder` segment untuk setiap barcode, lalu mengantrekannya di IndexedDB dan mengunggahnya melalui TUS ke Supabase Storage.
