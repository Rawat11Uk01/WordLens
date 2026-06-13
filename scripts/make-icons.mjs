// Generates the required extension icon sizes from a single square-ish source.
// Center-crops to a square, then resizes. Run: node scripts/make-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const SOURCE = process.argv[2] ?? resolve(root, 'scripts/icon-source.png')
const OUT_DIR = resolve(root, 'src/assets/icons')
const SIZES = [16, 32, 48, 128]

mkdirSync(OUT_DIR, { recursive: true })

const meta = await sharp(SOURCE).metadata()
const side = Math.min(meta.width, meta.height)
const left = Math.floor((meta.width - side) / 2)
const top = Math.floor((meta.height - side) / 2)

for (const size of SIZES) {
  const out = resolve(OUT_DIR, `icon${size}.png`)
  await sharp(SOURCE)
    .extract({ left, top, width: side, height: side })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(out)
  console.log(`✓ ${out}`)
}
console.log('Done.')
