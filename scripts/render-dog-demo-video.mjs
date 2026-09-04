import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const captureRoot = path.join(root, 'artifacts', 'demo3-frame-capture')
const requestedCapture = process.argv[2]
const captureDir = requestedCapture ? path.resolve(requestedCapture) : await latestCompleteCapture(captureRoot)
const manifest = JSON.parse(await readFile(path.join(captureDir, 'manifest.json'), 'utf8'))
const audioPath = path.join(root, 'artifacts', 'music-previews', 'real', '01-soul-jazz-francisco-alvear.mp3')
const outputPath = path.join(root, 'artifacts', 'visionpsy-live-demo-3-dogs-realworldqa-final.mp4')
const previewPath = path.join(root, 'public', 'showcase', 'videos', 'visionpsy-live-demo-3-four-models-qvac-style.mp4')
const ffmpegBinary = process.env.FFMPEG_PATH || (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg')

const sourceDuration = manifest.elapsedMs / 1000
const sourceTrimStartSeconds = 0.65
const boundaries = [sourceTrimStartSeconds, manifest.introEndedAtMs / 1000, manifest.popupStartedAtMs / 1000, manifest.officialStartedAtMs / 1000, sourceDuration]
if (!boundaries.every(Number.isFinite) || !boundaries.every((value, index) => !index || value > boundaries[index - 1])) throw new Error(`Invalid capture boundaries in ${captureDir}`)

const speeds = [1.75, 2.5, 1.5, 1.75]
const duration = boundaries.slice(1).reduce((sum, end, index) => sum + ((end - boundaries[index]) / speeds[index]), 0)
const fadeStart = Math.max(0, duration - 2)
const videoFilters = speeds.map((speed, index) => `[0:v]trim=start=${boundaries[index]}:end=${boundaries[index + 1]},setpts=(PTS-STARTPTS)/${speed}[v${index}]`).join(';')
const filter = `${videoFilters};[v0][v1][v2][v3]concat=n=4:v=1:a=0,format=yuv420p[v];[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=0.10,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeStart}:d=2[a]`

execFileSync(ffmpegBinary, [
  '-y',
  '-framerate', '20',
  '-i', path.join(captureDir, 'frame-%05d.jpg'),
  '-stream_loop', '-1',
  '-i', audioPath,
  '-filter_complex', filter,
  '-map', '[v]',
  '-map', '[a]',
  '-r', '30',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '18',
  '-profile:v', 'high',
  '-level', '4.1',
  '-c:a', 'aac',
  '-b:a', '160k',
  '-movflags', '+faststart',
  '-shortest',
  outputPath
], { stdio: 'inherit' })

await copyFile(outputPath, previewPath)
process.stdout.write(`${JSON.stringify({ captureDir, outputPath, previewPath, durationSeconds: duration, sourceTrimStartSeconds, speeds, audioVolume: 0.10, audioFadeSeconds: 2 }, null, 2)}\n`)

async function latestCompleteCapture(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(directory, entry.name)
    try {
      const manifest = JSON.parse(await readFile(path.join(candidate, 'manifest.json'), 'utf8'))
      if (Number.isFinite(manifest.officialStartedAtMs) && Number.isFinite(manifest.elapsedMs)) candidates.push({ candidate, modified: (await stat(path.join(candidate, 'manifest.json'))).mtimeMs })
    } catch {}
  }
  candidates.sort((left, right) => right.modified - left.modified)
  if (!candidates.length) throw new Error('No complete dog-demo frame capture found.')
  return candidates[0].candidate
}
