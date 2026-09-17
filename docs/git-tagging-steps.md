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

## 9. Troubleshooting Workflow Release

### 9.1 `Application entry file "out/main/index.js" ... was not found in this archive`

**Gejala:** job `build` gagal di step *Package application*, dan pesan error menyebut entry file tidak ditemukan di dalam arsip ASAR.

**Penyebab:** `electron-builder` dijalankan tanpa lebih dulu menjalankan `electron-vite build`.

`electron-builder` hanya **membungkus** hasil compile; ia tidak meng‑compile renderer/preload/main. Entry point yang dibaca berasal dari `package.json`:

```json
"main": "out/main/index.js"
```

Folder `out/` baru dibuat oleh script `build`:

```json
"build": "electron-vite build"
```

Kalau step build dilewati, ASAR tetap dibuat tetapi **tanpa** `out/main/index.js`, sehingga validasi entry point gagal.

**Perbaikan:** step build dan packaging harus dipisah dan urutannya benar.

```yaml
- name: Build application (main, preload, renderer)
  run: npm run build

- name: Package application
  run: npx electron-builder --publish=never
```

**Catatan:** jangan pakai `npm run dist` di CI. Script itu sudah meng‑hardcode platform Windows (`electron-builder --win`), sedangkan matrix CI berjalan di Linux, macOS, dan Windows. Biarkan tiap runner memakai konfigurasi platform‑nya sendiri dari `electron-builder.yml`.

---

### 9.2 Artifact ter‑upload tetapi kosong / release tanpa file

**Gejala:** step *Upload artifacts* sukses, tetapi release di GitHub tidak punya asset apa pun.

**Penyebab:** path upload menunjuk ke `dist/*`, padahal output `electron-builder` diarahkan ke folder lain:

```yaml
# electron-builder.yml
directories:
  output: release
```

**Perbaikan:** ganti sumber artifact ke `release/`. Sebaiknya tulis glob‑nya eksplisit agar folder hasil unpack (`win-unpacked/`, `mac/`) yang berisi ribuan file tidak ikut ter‑upload:

```yaml
path: |
  release/*.exe
  release/*.AppImage
  release/*.dmg
  release/*.blockmap
  release/latest*.yml
```

Tambahkan juga `if-no-files-found: error` supaya CI langsung gagal saat artifact memang tidak ada, bukan diam‑diam menghasilkan release kosong.

---

### 9.3 Pesan yang BUKAN penyebab kegagalan

Dua pesan berikut sering muncul di log tetapi **tidak** membuat build gagal — jangan tertukar dengan error asli:

- `duplicate dependency references  dependencies=["@noble/curves@2.2.0","bufferutil@4.1.0"]` — ini hanya peringatan dari `electron-builder` karena ada beberapa referensi ke paket yang sama.
- `Node.js 20 actions are deprecated` — peringatan deprecasi dari GitHub Actions, bukan kegagalan build.

Selalu cari baris yang mengandung `⨯` atau `Error:` untuk menemukan penyebab sebenarnya.

---

### 9.4 Verifikasi lokal sebelum push tag

Jalankan urutan yang sama seperti CI untuk memastikan tidak akan gagal di GitHub:

```bash
npm run build                 # harus menghasilkan out/main/index.js
npx electron-builder --win --dir --publish=never
```

Perintah kedua memakai `--dir`, sehingga tidak menjalankan NSIS/signing dan jauh lebih cepat. Yang perlu dipastikan: folder `release/win-unpacked/resources/app.asar` berisi `out/main/index.js`.

Untuk memeriksa isi ASAR tanpa mengekstrak:

```bash
node -e "const a=require('@electron/asar');console.log(a.listPackage('release/win-unpacked/resources/app.asar').filter(p=>/out.main/.test(p)))"
```

**Catatan:** `npm run dist` lokal masih memakai `--win` dan tetap valid untuk build di mesin Windows Anda sendiri. Hanya CI yang perlu membangun secara dinamis per‑OS.

---

**Selesai!** Sekarang Anda dapat membuat versi baru, men‑tag‑nya, dan membiarkan GitHub Actions mengurus proses build & release secara otomatis.
