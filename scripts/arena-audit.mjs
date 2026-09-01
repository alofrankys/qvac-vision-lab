import { readFile } from 'node:fs/promises'
import { VisionProviderRegistry } from '../src/vision/providers.mjs'
import { auditFairArena } from '../src/arena/readiness.mjs'
import { migrateArenaState } from '../src/arena/index.mjs'

const state = migrateArenaState(JSON.parse(await readFile(new URL('../data/pawvault.json', import.meta.url))))
const benchmarkArg = process.argv.find(value => value.startsWith('--benchmark-set='))
const benchmarkSetId = benchmarkArg?.slice('--benchmark-set='.length) || 'real_world_vision_arena_v1'
const providers = new VisionProviderRegistry()
try {
  const report = await auditFairArena({ providerStatuses: await providers.statuses(), state, verifyHashes: !process.argv.includes('--fast'), benchmarkSetId })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = report.verdict === 'BENCHMARK_READY' ? 0 : 2
} finally { await providers.shutdown() }
