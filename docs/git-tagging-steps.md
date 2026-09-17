# Panduan Lengkap: Membuat & Mendorong Tag Git untuk Memicu Release

File ini menjelaskan langkah‑per‑langkah cara menyiapkan versi baru proyek Anda, membuat tag Git, dan mem‑push‑nya ke GitHub sehingga **GitHub Actions** akan otomatis menjalankan workflow release.

---

## 1. Persiapan Awal

- Pastikan **Git** ter‑install dan Anda sudah berada di dalam direktori proyek:
  ```bash
  cd c:/Projek/Aplikasi-Trading-Journal-Otomatis
  ```
- Pastikan remote `origin` sudah ter‑hubung ke repositori di GitHub:
  ```bash
  git remote -v
  # contoh output: origin  https://github.com/username/repo.git (fetch)
  ```
- Pastikan Anda memiliki hak **push** ke repositori (biasanya menggunakan token personal access dengan scope `repo`).

---

## 2. Perbarui Nomor Versi di `package.json`

Buka file `package.json` dan ubah properti `version` ke nilai yang diinginkan sesuai **Semantic Versioning** (`MAJOR.MINOR.PATCH`). Contoh:
```json
{
  "name": "trading-journal",
  "version": "1.3.0",   // ganti ke versi yang diinginkan
  ...
}
```
Simpan perubahan.

---

## 3. Commit Perubahan Versi

```bash
git add package.json
git commit -m "Bump versi ke 1.3.0"
```
Jika Anda menggunakan branch selain `main`, sesuaikan nama branch pada langkah push berikutnya.

---

## 4. Buat Tag Git (Annotated)

Workflow yang telah dibuat akan terpicu pada **tag yang dimulai dengan huruf `v`**. Buat tag anotasi dengan perintah:
```bash
git tag -a v1.3.0 -m "Release v1.3.0"
```
Penjelasan opsi:
- `-a` → membuat *annotated tag* (menyimpan pesan, tanggal, penulis).
- `v1.3.0` → nama tag, **harus diawali `v`** agar workflow `on: push: tags: - 'v*'` tertrigger.
- `-m` → pesan tag.

---

## 5. Push Commit **dan** Tag ke Remote

```bash
# Push commit (ubah `main` jika Anda berada di branch lain)
git push origin main

# Push tag

git push origin v1.3.0
```
Setelah perintah di atas berhasil, GitHub akan menerima tag baru dan mulai menjalankan workflow release.

---

## 6. Verifikasi di GitHub

1. Buka repositori di GitHub.
2. Pilih tab **Actions** → lihat job *Build & Release* yang baru muncul; tunggu hingga status **Success**.
3. Pilih tab **Releases** → Anda akan melihat release baru dengan artefak binary untuk Linux, macOS, dan Windows.

---

## 7. (Opsional) Tambahkan *Release Notes*

- Anda dapat menulis catatan perubahan secara manual pada halaman release.
- Atau gunakan tool **standard‑version** atau **conventional‑commits** untuk menghasilkan changelog otomatis.

```bash
npm install -g standard-version
standard-version   # otomatis buat tag, commit, dan changelog
```

---

## 8. Tips Tambahan

- **Secret `GITHUB_TOKEN`** sudah tersedia secara otomatis pada setiap repository, sehingga workflow dapat membuat release tanpa konfigurasi tambahan.
- Jika Anda memerlukan penandatanganan **installer Windows** atau **notarization macOS**, tambahkan secret yang diperlukan (`WIN_CERT`, `APPLE_ID`, `APPLE_PASSWORD`) di **Settings → Secrets and variables → Actions**.
- Untuk meng‑disable workflow sementara, cukup beri komentar pada seluruh konten file `release.yml` atau tambahkan `if: false` pada job.

---

**Selesai!** Sekarang Anda dapat membuat versi baru, men‑tag‑nya, dan membiarkan GitHub Actions mengurus proses build & release secara otomatis.
