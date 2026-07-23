# Menaruh Semua File di GitHub

## Cara yang disarankan: Git dari VS Code

Buka folder project di VS Code, lalu buka Terminal.

```powershell
git init
git add .
git status
git commit -m "feat: initial proof video system"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Ganti `USERNAME` dan `REPOSITORY` dengan repository GitHub milik Anda.

## File yang tidak boleh masuk GitHub

File berikut sudah tercakup oleh `.gitignore` dan tidak boleh diunggah:

```text
.env
.env.local
.env.*.local
node_modules/
dist/
.vercel/
```

`package-lock.json` justru harus di-commit setelah `npm install` berhasil karena file tersebut mengunci versi dependency.

## Memeriksa isi sebelum push

```powershell
git status
git ls-files
```

Pastikan tidak ada nilai berikut di source:

```text
sb_secret_
SETUP_SECRET asli
password pengguna
access token
```

## Perubahan berikutnya

```powershell
git add .
git commit -m "deskripsi perubahan"
git push
```

GitHub Actions akan menjalankan `npm run verify`. Vercel akan membuat deployment baru dari commit GitHub sesuai pengaturan project Vercel.
