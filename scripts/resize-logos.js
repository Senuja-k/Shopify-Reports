#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const ROOT = process.cwd()
const srcCandidates = [
  path.join(ROOT, 'assets', 'logo-source.png'),
  path.join(ROOT, 'public', 'logo.png')
]
let src = srcCandidates[0]

async function findSource() {
  for (const p of srcCandidates) {
    try { await fs.access(p); return p } catch {}
  }
  return null
}
const outDir = path.join(ROOT, 'public')

async function ensureExists(p) {
  try { await fs.access(p); } catch { await fs.mkdir(p, { recursive: true }) }
}

async function main() {
  await ensureExists(outDir)

  const found = await findSource()
  if (!found) throw new Error(`Input file is missing. Put your source image at ${srcCandidates[0]} or add one at ${srcCandidates[1]}`)
  src = found

  // sizes to emit as PNG
  const sizes = [512, 256, 128, 64, 32]
  for (const s of sizes) {
    const out = path.join(outDir, `logo-${s}.png`)
    console.log('Writing', out)
    await sharp(src)
      .resize(s, s, { fit: 'cover' })
      .png({ quality: 85 })
      .toFile(out)
  }

  // apple touch icon
  console.log('Writing apple-touch-icon.png')
  await sharp(src)
    .resize(180, 180, { fit: 'cover' })
    .png({ quality: 85 })
    .toFile(path.join(outDir, 'apple-touch-icon.png'))

  // WebP versions for smaller sizes
  for (const s of [256, 64]) {
    const out = path.join(outDir, `logo-${s}.webp`)
    console.log('Writing', out)
    await sharp(src)
      .resize(s, s, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(out)
  }

  // Create small PNGs for favicon generation (16/32/48)
  const favSizes = [16, 32, 48]
  const favFiles = []
  for (const s of favSizes) {
    const out = path.join(outDir, `logo-${s}.png`)
    console.log('Writing', out)
    await sharp(src)
      .resize(s, s, { fit: 'cover' })
      .png({ quality: 85 })
      .toFile(out)
    favFiles.push(out)
  }

  // Convert PNGs to favicon.ico
  try {
    console.log('Generating favicon.ico')
    const buf = await pngToIco(favFiles)
    await fs.writeFile(path.join(outDir, 'favicon.ico'), buf)
    console.log('favicon.ico written')
  } catch (err) {
    console.warn('favicon.ico generation failed; you can create it manually:', err.message)
  }

  console.log('All done — files written to', outDir)
}

main().catch(err => {
  console.error('Error resizing logos:', err)
  process.exit(1)
})
