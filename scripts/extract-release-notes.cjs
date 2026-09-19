/**
 * Helper script untuk mengekstrak catatan rilis dari CHANGELOG.md berdasarkan versi tag.
 * Digunakan oleh CI GitHub Actions untuk menghasilkan release notes otomatis.
 *
 * Penggunaan:
 *   node scripts/extract-release-notes.cjs [tag] [output_file]
 * Contoh:
 *   node scripts/extract-release-notes.cjs v1.2.0 release_notes.txt
 */

const fs = require('fs')
const path = require('path')

function extractReleaseNotes() {
  const args = process.argv.slice(2)
  const tag = args[0] || process.env.RELEASE_TAG || ''
  const outputFile = args[1] || 'release_notes.txt'

  const cleanVersion = tag.replace(/^v/, '').trim()
  const changelogPath = path.resolve(process.cwd(), 'CHANGELOG.md')

  if (!fs.existsSync(changelogPath)) {
    console.warn('[extract-release-notes] File CHANGELOG.md tidak ditemukan.')
    return
  }

  const content = fs.readFileSync(changelogPath, 'utf8')

  if (!cleanVersion) {
    console.warn('[extract-release-notes] Versi tag kosong, melewatinya.')
    return
  }

  // Regex mencari blok: ## [1.2.0] ... sampai ke ## [ berikutnya atau akhir file
  const escapedVer = cleanVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`##\\s*\\[${escapedVer}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s*\\[|$)`, 'i')
  const match = content.match(regex)

  if (match && match[1]) {
    const notes = match[1].trim()
    fs.writeFileSync(outputFile, notes, 'utf8')
    console.log(`[extract-release-notes] Berhasil mengekstrak ${notes.length} karakter catatan untuk versi ${cleanVersion} ke ${outputFile}`)
  } else {
    console.warn(`[extract-release-notes] Bagian catatan untuk versi [${cleanVersion}] tidak ditemukan di CHANGELOG.md`)
  }
}

extractReleaseNotes()
