export class CaptureBudget {
  constructor({ maxBytes = 512 * 1024 * 1024, maxFrames = 4000, maxSessions = 2 } = {}) {
    Object.assign(this, { maxBytes, maxFrames, maxSessions, bytes: 0, frames: 0, sessions: new Set() })
  }
  reserve(runId, bytes, frame = true) {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || this.bytes + bytes > this.maxBytes || this.frames + Number(frame) > this.maxFrames || (!this.sessions.has(runId) && this.sessions.size >= this.maxSessions)) {
      throw Object.assign(new Error('Capture session quota reached; no existing recording was deleted'), { statusCode: 429 })
    }
    this.sessions.add(runId); this.bytes += bytes; this.frames += Number(frame)
  }
}
