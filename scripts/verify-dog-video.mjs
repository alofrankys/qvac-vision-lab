import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
const file = path.resolve(process.argv[2] || 'artifacts/visionpsy-live-demo-3-dogs-realworldqa-final.mp4')
const manifest = JSON.parse(await readFile(`${file}.manifest.json`, 'utf8'))
const hash = createHash('sha256').update(await readFile(file)).digest('hex')
if (hash !== manifest.outputSha256) throw new Error('Video hash differs from evidence manifest')
const binary = name => process.env[`${name.toUpperCase()}_PATH`] || (existsSync(`/opt/homebrew/bin/${name}`) ? `/opt/homebrew/bin/${name}` : name)
const probe = JSON.parse(execFileSync(binary('ffprobe'), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }))
const video = probe.streams.find(stream => stream.codec_type === 'video')
const audio = probe.streams.find(stream => stream.codec_type === 'audio')
const duration = Number(probe.format.duration)
if (!video || video.codec_name !== 'h264' || video.width !== 1600 || video.height !== 900 || audio?.codec_name !== 'aac' || !(duration >= 48 && duration <= 50)) throw new Error('Video format/duration release gate failed')
execFileSync(binary('ffmpeg'), ['-v', 'error', '-xerror', '-threads', '2', '-i', file, '-f', 'null', '-'], { stdio: 'pipe' })
console.log(JSON.stringify({ verified: true, durationSeconds: duration, video: 'H.264 1600x900', audio: 'AAC', sha256: hash, note: 'Full decode passed. Visual legibility remains a separate review.' }, null, 2))
