# Checklist Pengujian

## Otomatis

```powershell
npm run verify
```

Perintah harus berakhir dengan exit code `0`.

## Auth dan role

- Setup Admin berhasil ketika database belum memiliki profil.
- Setup Admin menolak `SETUP_SECRET` salah.
- Setup Admin menolak percobaan kedua.
- Login salah ditolak.
- User nonaktif otomatis keluar.
- Operator tidak dapat membuka Dashboard, Pengguna, Pengaturan, atau Audit.
- Operator hanya melihat video miliknya.
- Admin melihat seluruh video.
- Admin aktif terakhir tidak dapat dinonaktifkan atau diturunkan role-nya.

## Kamera dan barcode

- Izin kamera diterima.
- Fallback tanpa audio bekerja ketika mikrofon ditolak.
- Native BarcodeDetector bekerja pada browser yang mendukung.
- ZXing fallback bekerja pada browser tanpa BarcodeDetector.
- Barcode yang sama tidak membuat segmen berulang selama cooldown.
- Input barcode manual bekerja untuk pengujian.
- Barcode pertama memulai segmen.
- Barcode berikutnya menutup segmen sebelumnya dan memulai segmen baru.
- Batalkan Barcode Terakhir membuang video aktif dan membatalkan metadata terkait.
- Kamera terputus menyelamatkan segmen aktif serta mengubah sesi menjadi `interrupted`.
- Navigasi ditolak ketika sesi masih aktif.

## Upload

- Blob muncul di IndexedDB dan drawer antrean.
- Refresh halaman tidak menghapus antrean.
- Job `uploading` yang tertinggal pulih menjadi `queued`.
- Putuskan internet lalu sambungkan kembali.
- Progress upload bergerak.
- TUS melanjutkan upload dari offset sebelumnya.
- Object muncul pada bucket `proof-videos`.
- Metadata berubah menjadi `completed`.
- Blob lokal dihapus setelah upload sukses.
- Preview dan download signed URL bekerja.

## Data Video

- Pencarian nomor pesanan, barcode, nama file, dan nama operator bekerja.
- Filter tanggal dan status bekerja.
- Filter durasi dan ukuran file bekerja.
- Operator tidak melihat video operator lain.
- Ekspor CSV tidak menjalankan formula dari nilai yang diawali `=`, `+`, `-`, atau `@`.
- Admin dapat menghapus video melalui `/api/videos/delete`.
- Object Storage hilang dan metadata menjadi `deleted` setelah penghapusan berhasil.

## Vercel

- `/api/health` merespons `{ "status": "ok" }`.
- `/api/setup` menerima GET/POST dan menolak method lain seperti PUT atau DELETE.
- `/api/users` menolak Operator.
- `/api/videos/delete` menolak Operator.
- Security headers terlihat pada browser Network panel.

## Supabase

- RLS aktif pada seluruh tabel.
- Bucket `proof-videos` private.
- Object path yang tidak diawali UUID user ditolak.
- SQL dapat dijalankan ulang tanpa gagal.
- Hasil akhir SQL menunjukkan `status = READY`.
