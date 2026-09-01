import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir } from 'node:fs/promises'
import os from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const IMAGE_ERROR_CODES = Object.freeze(['FILE_READ_FAILED','IMAGE_DECODE_FAILED','HEIC_CONVERSION_FAILED','EXIF_ORIENTATION_FAILED','COLOR_CONVERSION_FAILED','IMAGE_RESIZE_FAILED','IMAGE_ENCODE_FAILED','PREPROCESSING_INVALID_IMAGE'])

export async function prepareImage({ originalPath, outputDir, photoId, reportedMime, originalFilename }) {
  const pipeline = initPipeline()
  let input
  try { input = await stage(pipeline, 'fileRead', async () => readFile(originalPath)) }
  catch (error) { return failed('FILE_READ_FAILED', error, pipeline) }
  if (!input.length) return failed('FILE_READ_FAILED', new Error('Image file is empty'), pipeline)

  let metadata
  try { metadata = await stage(pipeline, 'imageDecode', async () => sharp(input, { failOn: 'error', unlimited: false }).metadata()) }
  catch (error) { return failed(detectFormat(input) === 'heic' ? 'HEIC_CONVERSION_FAILED' : 'IMAGE_DECODE_FAILED', error, pipeline) }
  if (!metadata.width || !metadata.height) return failed('IMAGE_DECODE_FAILED', new Error('Decoded image has zero dimensions'), pipeline)

  const detectedFormat = metadata.format || detectFormat(input)
  let normalized
  try {
    const started = performance.now()
    const image = sharp(input, { failOn: 'error', unlimited: false }).rotate()
    pipeline.exifOrientation = ok(performance.now() - started)
    const colorStart = performance.now()
    const rgb = image.flatten({ background: '#ffffff' }).toColourspace('srgb')
    pipeline.colorNormalization = ok(performance.now() - colorStart)
    const resizeStart = performance.now()
    const resized = rgb.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    pipeline.resize = ok(performance.now() - resizeStart)
    const encodeStart = performance.now()
    normalized = await resized.jpeg({ quality: 92, chromaSubsampling: '4:4:4', progressive: false }).toBuffer()
    pipeline.imageEncode = ok(performance.now() - encodeStart)
  } catch (error) {
    if (detectedFormat === 'heif' || detectedFormat === 'heic') {
      try {
        const fallbackStart = performance.now()
        const decoded = await decodeHeicWithQuickLook(originalPath)
        pipeline.imageDecode = { status: 'ok', durationMs: pipeline.imageDecode.durationMs + Math.round(performance.now() - fallbackStart), error: null, decoder: 'macOS Quick Look fallback' }
        const image = sharp(decoded, { failOn: 'error' }).rotate().flatten({ background: '#ffffff' }).toColourspace('srgb').resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        normalized = await image.jpeg({ quality: 92, chromaSubsampling: '4:4:4', progressive: false }).toBuffer()
        pipeline.exifOrientation = ok(0); pipeline.colorNormalization = ok(0); pipeline.resize = ok(0); pipeline.imageEncode = ok(0)
      } catch (fallbackError) { return failed('HEIC_CONVERSION_FAILED', fallbackError, pipeline, { detectedFormat }) }
    } else return failed('IMAGE_ENCODE_FAILED', error, pipeline, { detectedFormat })
  }

  let validation
  try {
    validation = await validateNormalized(normalized)
    pipeline.normalizedDecode = { status: validation.valid ? 'ok' : 'failed', durationMs: validation.durationMs, error: validation.valid ? null : validation.reason }
  } catch (error) { return failed('PREPROCESSING_INVALID_IMAGE', error, pipeline) }
  if (!validation.valid) return failed('PREPROCESSING_INVALID_IMAGE', new Error(validation.reason), pipeline, { metadata, detectedFormat, validation })

  await mkdir(outputDir, { recursive: true })
  const normalizedFilename = `${photoId}.jpg`
  const normalizedPath = path.join(outputDir, normalizedFilename)
  await writeFile(normalizedPath, normalized)
  pipeline.preview = { status: 'ok', durationMs: 0, error: null }
  pipeline.inferenceInput = { status: 'ok', durationMs: 0, error: null }
  return {
    pipelineVersion: 1, ready: true, errorCode: null, error: null, pipeline,
    detectedFormat, originalFilename, reportedMime, extension: path.extname(originalFilename).toLowerCase(),
    original: { sizeBytes: input.length, width: metadata.width, height: metadata.height, orientation: metadata.orientation ?? null, colorspace: metadata.space ?? null, hasAlpha: Boolean(metadata.hasAlpha), bitDepth: metadata.depth ?? null, isProgressive: metadata.isProgressive ?? null, iccPresent: Boolean(metadata.icc) },
    normalized: { filename: normalizedFilename, mimeType: 'image/jpeg', format: 'jpeg', sizeBytes: normalized.length, width: validation.width, height: validation.height, colorspace: validation.space, hasAlpha: false, bitDepth: validation.depth, crop: 'full-image', maxDimension: 2048 },
    technicalFrameCheck: validation
  }
}

export async function validateNormalized(buffer) {
  const started = performance.now()
  if (!buffer?.length) return { valid: false, reason: 'empty normalized buffer', durationMs: Math.round(performance.now() - started) }
  const image = sharp(buffer, { failOn: 'error' })
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height) return { valid: false, reason: 'zero dimensions', durationMs: Math.round(performance.now() - started) }
  const stats = await image.resize({ width: 64, height: 64, fit: 'inside' }).removeAlpha().stats()
  const means = stats.channels.slice(0, 3).map(channel => channel.mean)
  const deviations = stats.channels.slice(0, 3).map(channel => channel.stdev)
  const mean = means.reduce((sum, value) => sum + value, 0) / means.length
  const deviation = deviations.reduce((sum, value) => sum + value, 0) / deviations.length
  let reason = null
  if (mean < 1 && deviation < 1) reason = 'technically black or empty frame'
  else if (mean > 254 && deviation < 1) reason = 'technically white frame'
  else if (deviation < 0.25) reason = 'technically near-uniform frame'
  return { valid: !reason, reason, mean: round(mean), deviation: round(deviation), width: metadata.width, height: metadata.height, space: metadata.space, depth: metadata.depth, durationMs: Math.round(performance.now() - started) }
}

export function detectFormat(buffer) {
  if (!buffer?.length) return 'unknown'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp' && /hei[cf]|hev[cf]|mif1|msf1/.test(buffer.subarray(8, 16).toString('ascii'))) return 'heic'
  return 'unknown'
}

function initPipeline() { return Object.fromEntries(['fileImport','fileRead','imageDecode','exifOrientation','colorNormalization','resize','imageEncode','normalizedDecode','preview','inferenceInput'].map(name => [name, { status: name === 'fileImport' ? 'ok' : 'skipped', durationMs: 0, error: null }])) }
async function stage(pipeline, name, operation) { const started = performance.now(); try { const value = await operation(); pipeline[name] = ok(performance.now() - started); return value } catch (error) { pipeline[name] = { status: 'failed', durationMs: Math.round(performance.now() - started), error: String(error.message || error) }; throw error } }
function ok(duration) { return { status: 'ok', durationMs: Math.round(duration), error: null } }
function failed(errorCode, error, pipeline, extra = {}) { return { pipelineVersion: 1, ready: false, errorCode, error: String(error.message || error), pipeline, ...extra } }
function round(value) { return Math.round(value * 100) / 100 }

async function decodeHeicWithQuickLook(originalPath) {
  if (process.platform !== 'darwin') throw new Error('HEIC decoder unavailable: macOS Quick Look fallback requires Darwin')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pawvault-heic-'))
  await execFileAsync('/usr/bin/qlmanage', ['-t', '-s', '2048', '-o', directory, originalPath], { timeout: 30000 })
  const output = (await readdir(directory)).find(name => name.endsWith('.png'))
  if (!output) throw new Error('HEIC conversion produced no decoded image')
  const buffer = await readFile(path.join(directory, output))
  const metadata = await sharp(buffer, { failOn: 'error' }).metadata()
  if (!metadata.width || !metadata.height) throw new Error('HEIC conversion output failed decode validation')
  return buffer
}
