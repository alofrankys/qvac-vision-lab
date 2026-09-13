import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, link, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { frameTimeline } from './video-frame-timeline.mjs'

const root = path.resolve(import.meta.dirname, '..')
const captureRoot = path.join(root, 'artifacts', 'demo3-frame-capture')
const requestedCapture = process.argv[2]
const captureDir = requestedCapture ? path.resolve(requestedCapture) : await latestCompleteCapture(captureRoot)
const manifest = JSON.parse(await readFile(path.join(captureDir, 'manifest.json'), 'utf8'))
const audioPath = path.join(root, 'artifacts', 'music-previews', 'real', '01-soul-jazz-francisco-alvear.mp3')
const outputPath = path.join(root, 'artifacts', 'visionpsy-live-demo-3-dogs-realworldqa-final.mp4')
const previewPath = path.join(root, 'public', 'showcase', 'videos', 'visionpsy-live-demo-3-four-models-qvac-style.mp4')
const ffmpegBinary = process.env.FFMPEG_PATH || (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg')
if (!existsSync(audioPath)) throw new Error('Licensed audio is not redistributed in Git. Supply the documented local music asset before rendering.')
if (existsSync(outputPath)) await copyFile(outputPath, outputPath.replace('.mp4', `-backup-${Date.now()}.mp4`))

const sourceDuration = manifest.elapsedMs / 1000
// Capture can fall below 20 fps when the Mac is busy. Reconstruct its real timeline
// by holding the latest captured frame, rather than treating every file as 50 ms.
const timeline = frameTimeline(manifest.timestampsMs, manifest.frameCount, manifest.elapsedMs)
const timelineDir = await mkdtemp(path.join(captureDir, 'render-timeline-'))
const timelineFrames = timeline.length
for (let frame = 0; frame < timelineFrames; frame += 1) {
  const sourceIndex = timeline[frame]
  await link(path.join(captureDir, `frame-${String(sourceIndex).padStart(5, '0')}.jpg`), path.join(timelineDir, `frame-${String(frame).padStart(5, '0')}.jpg`))
}
const sourceTrimStartSeconds = 0.65
const boundaries = [sourceTrimStartSeconds, manifest.introEndedAtMs / 1000, manifest.popupStartedAtMs / 1000, manifest.officialStartedAtMs / 1000, sourceDuration]
if (!boundaries.every(Number.isFinite) || !boundaries.every((value, index) => !index || value > boundaries[index - 1])) throw new Error(`Invalid capture boundaries in ${captureDir}`)

// Keep the readable intro and two result cards; absorb capture jitter in the replay segment.
// The video is explicitly a montage, never a real-time performance measurement.
const targetDurationSeconds = 50
const dogResultsSeconds = 4
const benchmarkResultsSeconds = 10
const fixedSectionsDuration = (boundaries[1] - boundaries[0]) / 1.75 + dogResultsSeconds + benchmarkResultsSeconds
const replayBudgetSeconds = targetDurationSeconds - fixedSectionsDuration
if (replayBudgetSeconds <= 0) throw new Error('Intro/result cards exceed the video duration budget')
const speeds = [1.75, (boundaries[2] - boundaries[1]) / replayBudgetSeconds, (boundaries[3] - boundaries[2]) / dogResultsSeconds, (boundaries[4] - boundaries[3]) / benchmarkResultsSeconds]
const duration = boundaries.slice(1).reduce((sum, end, index) => sum + ((end - boundaries[index]) / speeds[index]), 0)
const fadeStart = Math.max(0, duration - 2)
const videoFilters = speeds.map((speed, index) => `[0:v]trim=start=${boundaries[index]}:end=${boundaries[index + 1]},setpts=(PTS-STARTPTS)/${speed}[v${index}]`).join(';')
const filter = `${videoFilters};[v0][v1][v2][v3]concat=n=4:v=1:a=0,format=yuv420p[v];[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=0.10,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeStart}:d=2[a]`

execFileSync(ffmpegBinary, [
  '-y',
  '-filter_complex_threads', '1',
  '-framerate', '20',
  '-i', path.join(timelineDir, 'frame-%05d.jpg'),
  '-stream_loop', '-1',
  '-i', audioPath,
  '-filter_complex', filter,
  '-map', '[v]',
  '-map', '[a]',
  '-r', '30',
  '-c:v', 'libx264',
  '-threads', '2',
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
const inputFiles = ['public/showcase.js', 'public/showcase/dog-astra-review.js', 'public/showcase/visionpsy-four-way-realworldqa-765.json', 'reports/visionpsy-dog-demo-astra-20260905.json', 'scripts/render-dog-demo-video.mjs', 'scripts/video-frame-timeline.mjs']
const hashFile = async file => createHash('sha256').update(await readFile(file)).digest('hex')
const frameHashes = []
for (let index = 0; index < manifest.frameCount; index++) frameHashes.push(await hashFile(path.join(captureDir, `frame-${String(index).padStart(5, '0')}.jpg`)))
const evidenceManifest = {
  schemaVersion: 1,
  presentation: 'Animated replay of actual saved responses; synthetic reveal cadence; original metrics; not a live speed benchmark',
  generatedAt: new Date().toISOString(),
  renderTimeSourceHashes: Object.fromEntries(await Promise.all(inputFiles.map(async file => [file, await hashFile(path.join(root, file))]))),
  sourceHashScope: 'Files present at render time, not proof of which JavaScript was executed by the capture browser',
  captureManifestSha256: await hashFile(path.join(captureDir, 'manifest.json')),
  frameSequenceSha256: createHash('sha256').update(frameHashes.join('\n')).digest('hex'),
  audioSha256: await hashFile(audioPath), outputSha256: await hashFile(outputPath),
  settings: { targetDurationSeconds, speeds, dogResultsSeconds, benchmarkResultsSeconds, audioVolume: 0.10, audioFadeSeconds: 2 },
  ffmpegVersion: execFileSync(ffmpegBinary, ['-version'], { encoding: 'utf8' }).split('\n')[0]
}
await writeFile(`${outputPath}.manifest.json`, `${JSON.stringify(evidenceManifest, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ captureDir, timelineDir, sourceFrames: manifest.frameCount, timelineFrames, outputPath, previewPath, durationSeconds: duration, sourceTrimStartSeconds, speeds, dogResultsSeconds, benchmarkResultsSeconds, audioVolume: 0.10, audioFadeSeconds: 2 }, null, 2)}\n`)

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
