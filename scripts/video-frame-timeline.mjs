// Hold the latest available captured frame on a uniform output timeline.
// Missing frames are not invented; a busy capture must not shorten the video.
export function frameTimeline(timestamps, frameCount, elapsedMs, fps = 20) {
  if (!Array.isArray(timestamps) || !timestamps.length || timestamps.length !== frameCount ||
      !Number.isFinite(elapsedMs) || elapsedMs <= 0 || !Number.isFinite(fps) || fps <= 0 ||
      !timestamps.every((value, index) => Number.isFinite(value) && value >= 0 && (!index || value > timestamps[index - 1])) ||
      timestamps.at(-1) > elapsedMs) throw new Error('Missing or invalid capture timestamps')
  const indices = []
  let source = 0
  for (let frame = 0; frame < Math.ceil(elapsedMs / 1000 * fps); frame += 1) {
    while (source + 1 < timestamps.length && timestamps[source + 1] <= frame * 1000 / fps) source += 1
    indices.push(source)
  }
  return indices
}
