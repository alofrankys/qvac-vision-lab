import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { detectFormat, prepareImage } from '../src/image-pipeline/pipeline.mjs'

async function fixture(name, buffer) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pawvault-image-'))
  const originalPath = path.join(directory, name)
  await writeFile(originalPath, buffer)
  return { originalPath, outputDir: path.join(directory, 'inference'), photoId: path.parse(name).name, originalFilename: name, reportedMime: 'image/jpeg' }
}

async function patterned(format = 'jpeg', options = {}) {
  const svg = Buffer.from('<svg width="90" height="60" xmlns="http://www.w3.org/2000/svg"><rect width="45" height="60" fill="#245b31"/><rect x="45" width="45" height="60" fill="#9bbbe0"/><circle cx="45" cy="30" r="18" fill="#d5723b"/></svg>')
  const image = sharp(svg)
  if (options.orientation) image.withMetadata({ orientation: options.orientation })
  return format === 'png' ? image.png().toBuffer() : image.jpeg({ progressive: options.progressive }).toBuffer()
}

test('detects real content instead of trusting extension or reported MIME', async () => {
  const jpeg = await patterned()
  assert.equal(detectFormat(jpeg), 'jpeg')
  const result = await prepareImage(await fixture('misnamed.HEIC', jpeg))
  assert.equal(result.detectedFormat, 'jpeg')
  assert.equal(result.ready, true)
})

test('normal JPEG, progressive JPEG, EXIF rotation and PNG normalize to validated RGB JPEG', async () => {
  const inputs = [
    ['normal.jpg', await patterned()],
    ['progressive.jpg', await patterned('jpeg', { progressive: true })],
    ['rotated.jpg', await patterned('jpeg', { orientation: 6 })],
    ['alpha.png', await patterned('png')]
  ]
  for (const [name, buffer] of inputs) {
    const result = await prepareImage(await fixture(name, buffer))
    assert.equal(result.ready, true, `${name}: ${result.error}`)
    assert.equal(result.normalized.format, 'jpeg')
    assert.equal(result.normalized.colorspace, 'srgb')
    assert.equal(result.pipeline.normalizedDecode.status, 'ok')
  }
})

test('corrupted, empty and technically black images never reach inference-ready state', async () => {
  const corrupted = await prepareImage(await fixture('bad.jpg', Buffer.from([0xff, 0xd8, 0xff, 0x00])))
  assert.equal(corrupted.ready, false)
  assert.equal(corrupted.errorCode, 'IMAGE_DECODE_FAILED')
  const empty = await prepareImage(await fixture('empty.jpg', Buffer.alloc(0)))
  assert.equal(empty.ready, false)
  assert.equal(empty.errorCode, 'FILE_READ_FAILED')
  const black = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#000000' } }).jpeg().toBuffer()
  const blackResult = await prepareImage(await fixture('black.jpg', black))
  assert.equal(blackResult.ready, false)
  assert.equal(blackResult.errorCode, 'PREPROCESSING_INVALID_IMAGE')
})

test('local HEIC fixture decodes and revalidates when codec is available', async t => {
  let heic
  try { heic = await sharp({ create: { width: 80, height: 50, channels: 3, background: '#498c61' } }).heif({ compression: 'hevc' }).toBuffer() } catch { return t.skip('HEIC encoder unavailable in local libvips') }
  const result = await prepareImage(await fixture('valid.HEIC', heic))
  assert.equal(result.ready, true, result.error)
  assert.equal(result.detectedFormat, 'heif')
})
