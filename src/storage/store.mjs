import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { TASKS } from '../domain/tasks.mjs'
import { migrateLabState } from '../lab/index.mjs'
import { migrateArenaState } from '../arena/index.mjs'
import { migrateArenaBuilderState } from '../arena/builder.mjs'

export class StateStore {
  #state
  #writeChain = Promise.resolve()
  #updateChain = Promise.resolve()

  constructor(filePath) {
    this.filePath = filePath
  }

  async init() {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    try {
      this.#state = JSON.parse(await readFile(this.filePath, 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      this.#state = {
        schemaVersion: 4,
        photos: [],
        runs: [],
        inferences: [],
        reviews: [],
        annotations: [],
        taskStatuses: Object.fromEntries(TASKS.map(task => [task.id, task.defaultStatus]))
      }
      await this.#persist()
    }
    this.#state.runs ??= []
    this.#state.annotations ??= []
    this.#state.taskStatuses ??= {}
    for (const run of this.#state.runs) {
      run.status ??= run.finishedAt ? 'COMPLETED' : run.providerId ? 'COMPLETED' : 'CANCELLED'
      run.photoCount ??= run.photoIds?.length || 0
      run.taskCount ??= run.taskIds?.length || 0
      run.completedPredictions ??= this.#state.inferences.filter(item => item.runId === run.id && !item.error).length
      run.failedPredictions ??= this.#state.inferences.filter(item => item.runId === run.id && item.error).length
      run.cancelled ??= run.status === 'CANCELLED'
    }
    for (const task of TASKS) this.#state.taskStatuses[task.id] ??= task.defaultStatus
    this.#state.migrations ??= {}
    migrateLabState(this.#state)
    migrateArenaState(this.#state)
    migrateArenaBuilderState(this.#state)
    if (!this.#state.migrations.dogCountV2Experimental) {
      this.#state.taskStatuses.dog_count = 'EXPERIMENTAL'
      this.#state.migrations.dogCountV2Experimental = new Date().toISOString()
      await this.#persist()
    }
    await this.#persist()
    return this
  }

  snapshot() {
    return structuredClone(this.#state)
  }

  async update(mutator) {
    const operation = this.#updateChain.then(async () => {
      const draft = structuredClone(this.#state)
      const result = await mutator(draft)
      this.#state = draft
      await this.#persist()
      return result
    })
    this.#updateChain = operation.catch(() => {})
    return operation
  }

  #persist() {
    this.#writeChain = this.#writeChain.then(async () => {
      const temp = `${this.filePath}.tmp`
      await writeFile(temp, `${JSON.stringify(this.#state, null, 2)}\n`)
      await rename(temp, this.filePath)
    })
    return this.#writeChain
  }
}
