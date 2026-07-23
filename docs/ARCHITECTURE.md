# Arsitektur Proof Video System

## Batas layanan

Project menggunakan tiga layanan dan tidak bergantung pada layanan keempat:

```text
GitHub   = source code, version control, CI
Supabase = Auth, PostgreSQL, RLS, Storage
Vercel   = frontend hosting dan serverless API
```

Video tidak disimpan di GitHub atau Vercel. Byte video dikirim langsung dari browser ke Supabase Storage.

## Alur perekaman

1. Operator login.
2. Operator membuka halaman Perekaman.
3. Browser meminta izin kamera dan, bila diaktifkan, mikrofon.
4. Operator menekan **Mulai Sesi**.
5. Barcode pertama memulai `MediaRecorder` pertama.
6. Barcode berikutnya menghentikan recorder aktif, menyimpan Blob sebelumnya ke IndexedDB, lalu memulai recorder baru.
7. Saat sesi diakhiri, segmen aktif disimpan dan sesi ditutup.

Setiap Blob adalah file video mandiri untuk satu pesanan. Pemotongan FFmpeg tidak diperlukan.

## Alur upload

```text
MediaRecorder Blob
→ IndexedDB
→ register_video_segment RPC
→ TUS direct upload ke Supabase Storage
→ complete_video_upload RPC
→ hapus Blob lokal setelah sukses
```

Upload memakai hostname Storage langsung dan protokol TUS. JWT pengguna dikirim sebagai kredensial. Storage policy hanya mengizinkan object path yang folder pertamanya sama dengan `auth.uid()`.

## Metadata dan idempotensi

Sebelum upload, client memanggil RPC `register_video_segment`. Setelah TUS selesai, client memanggil `complete_video_upload`.

Kolom `client_id` bersifat unik. Ketika browser refresh atau proses retry, event yang sama tidak membuat record video duplikat.

## Path Storage

```text
proof-videos/USER_ID/YYYY/MM/DD/SESSION_ID/SEQUENCE_ORDER.ext
```

Supabase PostgreSQL hanya menyimpan metadata dan `storage_path`, bukan byte video.

## Hak akses

### Operator

- Membuat dan menutup sesi miliknya.
- Mengunggah video ke folder Storage miliknya.
- Melihat dan mengunduh video miliknya.
- Melihat status antrean upload miliknya.

### Admin

- Seluruh hak Operator.
- Melihat dashboard dan seluruh video.
- Membuat, mengubah, menonaktifkan, serta mengganti password pengguna.
- Mengubah pengaturan global.
- Melihat audit log.
- Menghapus metadata dan object Storage melalui `/api/videos/delete`.

## Setup Admin atomik

Tabel internal `system_state` dan tiga RPC khusus `service_role` mengunci proses setup. Hanya satu request yang dapat mengklaim pembuatan Admin pertama. Claim yang gagal dilepas kembali, sedangkan claim yang ditinggalkan lebih dari sepuluh menit dapat dipulihkan. Tabel ini tidak dapat dibaca atau diubah oleh browser.

## Vercel Functions

- `/api/health`: pemeriksaan endpoint.
- `/api/setup`: membuat Admin pertama setelah memvalidasi `SETUP_SECRET`.
- `/api/users`: operasi administrasi pengguna setelah memvalidasi JWT dan role Admin.
- `/api/videos/delete`: soft delete metadata, hapus object Storage, dan tulis audit log.

Secret key Supabase hanya digunakan di Vercel Functions dan tidak pernah dibundel ke frontend.

## Pemulihan kegagalan

- Blob disimpan ke IndexedDB sebelum upload.
- Job `uploading` yang tertinggal setelah refresh dikembalikan menjadi `queued`.
- TUS menyimpan URL upload untuk melanjutkan dari offset terakhir.
- Koneksi online memicu proses antrean kembali.
- Kamera terputus menyelamatkan segmen aktif, menandai sesi `interrupted`, lalu mencoba membuka kamera kembali.
- Heartbeat membantu mendeteksi sesi yang ditinggalkan tanpa penutupan normal.
