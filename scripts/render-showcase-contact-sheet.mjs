#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const manifestPath = path.resolve(process.argv[2] || path.join(root, 'public', 'showcase', 'realworldqa', 'manifest.json'))
const outputPath = path.resolve(process.argv[3] || '/tmp/qvac-realworldqa-contact-sheet.jpg')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const tileWidth = 360
const tileHeight = 245
const gap = 14
const columns = 4
const rows = Math.ceil(manifest.cases.length / columns)
const composites = []

for (const [index, item] of manifest.cases.entries()) {
  const imagePath = path.join(root, 'public', item.imageUrl.replace(/^\//, ''))
  const image = await sharp(imagePath).resize(tileWidth, 200, { fit: 'contain', background: '#08080a' }).jpeg().toBuffer()
  const label = Buffer.from(`<svg width="${tileWidth}" height="45"><rect width="100%" height="100%" fill="#17171a"/><text x="12" y="18" fill="#ffb340" font-size="12" font-family="Arial" font-weight="700">${String(index + 1).padStart(2, '0')} · RWQA ${item.sourceIndex}</text><text x="12" y="36" fill="#f5f5f7" font-size="11" font-family="Arial">${escapeXml(item.question).slice(0, 56)}</text></svg>`)
  const x = (index % columns) * (tileWidth + gap)
  const y = Math.floor(index / columns) * (tileHeight + gap)
  composites.push({ input: image, left: x, top: y }, { input: label, left: x, top: y + 200 })
}

await sharp({
  create: {
    width: columns * tileWidth + (columns - 1) * gap,
    height: rows * tileHeight + (rows - 1) * gap,
    channels: 3,
    background: '#050506'
  }
}).composite(composites).jpeg({ quality: 88 }).toFile(outputPath)

process.stdout.write(`${outputPath}\n`)

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character])
}
