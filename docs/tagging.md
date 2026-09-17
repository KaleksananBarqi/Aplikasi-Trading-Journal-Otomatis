# Cara Membuat dan Mendorong Tag Versi untuk Memicu Release GitHub Actions

Ikuti langkah‑langkah berikut di terminal proyek Anda (`c:/Projek/Aplikasi-Trading-Journal-Otomatis`). Pastikan Git sudah ter‑install dan Anda memiliki akses push ke repositori remote.

## 1. Perbarui nomor versi di `package.json`

```json
{
  "name": "trading-journal",
  "version": "1.2.0",   // ganti ke versi yang diinginkan, gunakan Semantic Versioning
  ...
}
```

Simpan perubahan.

## 2. Commit perubahan versi

```bash
git add package.json
git commit -m "Bump versi ke 1.2.0"
```

## 3. Buat tag Git yang sesuai dengan pola workflow

Workflow yang kami buat akan dipicu pada **tag yang diawali huruf `v`** (misal `v1.2.0`). Buat tag anotasi:

```bash
git tag -a v1.2.0 -m "Release v1.2.0"
```

- `-a` membuat *annotated tag* yang menyimpan pesan dan metadata.
- Pastikan nama tag **dimulai dengan `v`** agar workflow terpicu.

## 4. Push commit dan tag ke remote GitHub

```bash
# Push commit (sesuaikan nama branch jika bukan main)
git push origin main

# Push tag
git push origin v1.2.0
```

Setelah tag berhasil dipush, GitHub Actions akan otomatis menjalankan workflow `release.yml` yang berada di `.github/workflows/`.

## 5. Verifikasi di GitHub

1. Buka repositori Anda di GitHub.
2. Klik tab **Actions** → pastikan job *Build & Release* muncul dan berstatus **Success**.
3. Buka tab **Releases** → Anda akan melihat release baru dengan artefak binary untuk Linux, macOS, dan Windows.

## 6. (Opsional) Tambahkan catatan perubahan

Anda dapat menulis *release notes* secara manual pada halaman release, atau menggunakan tool seperti `standard-version` untuk menghasilkan changelog otomatis berdasarkan **commit convention**.

---

**Catatan penting**
- Secret `GITHUB_TOKEN` sudah tersedia secara default pada setiap repository, jadi workflow dapat membuat release tanpa konfigurasi tambahan.
- Jika Anda menandatangani installer Windows atau melakukan notarization untuk macOS, tambahkan secret yang diperlukan (`WIN_CERT`, `APPLE_ID`, dll.) ke **Settings → Secrets and variables → Actions**.
