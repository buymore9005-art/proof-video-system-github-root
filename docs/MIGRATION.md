# Migrasi dari Project Lama

Implementasi lama tidak dipertahankan. Project sekarang sepenuhnya berorientasi pada Proof Video System dan hanya memakai GitHub, Supabase, serta Vercel.

## File lama yang dihapus

- `main.tsx` di root: diganti oleh `src/main.tsx` dan struktur frontend modular.
- `robot.txt`: diganti oleh `public/robots.txt` agar diproses sebagai static asset Vite.
- `package-lock.json` lama: harus dihapus karena tidak konsisten dengan `package.json`; buat ulang melalui `npm install`.

## Dependency lama yang dihapus

- `xlsx`: tidak diperlukan karena ekspor data memakai CSV aman.
- Seluruh library atau kode Google Drive/Google OAuth: tidak digunakan.
- Seluruh alur FFmpeg server: tidak digunakan.

## Struktur baru

- `src/`: frontend React modular.
- `api/`: Vercel Functions untuk operasi server-only.
- `supabase/setup.sql`: schema, RPC, RLS, dan Storage sekali run.
- `.github/workflows/ci.yml`: verifikasi otomatis GitHub.
- `vercel.json`: build dan security headers.
- `tests/`: unit test logika inti.

## Penyimpanan video baru

```text
Browser MediaRecorder
→ IndexedDB
→ TUS direct upload
→ Supabase Storage private bucket
```

Tidak ada file video yang disimpan di GitHub atau filesystem Vercel.
