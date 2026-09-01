import { open } from 'node:fs/promises'
import path from 'node:path'

const TYPES = Object.freeze({
  0: ['uint8', 1], 1: ['int8', 1], 2: ['uint16', 2], 3: ['int16', 2],
  4: ['uint32', 4], 5: ['int32', 4], 6: ['float32', 4], 7: ['bool', 1],
  8: ['string'], 9: ['array'], 10: ['uint64', 8], 11: ['int64', 8], 12: ['float64', 8]
})

for (const filename of process.argv.slice(2)) {
  const handle = await open(filename, 'r')
  let offset = 0
  async function bytes(length) {
    const buffer = Buffer.alloc(Number(length))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
    if (bytesRead !== buffer.length) throw new Error(`Unexpected EOF at ${offset}`)
    offset += buffer.length
    return buffer
  }
  async function scalar(type) {
    const spec = TYPES[type]
    if (!spec) throw new Error(`Unknown GGUF type ${type}`)
    if (type === 8) {
      const length = Number((await bytes(8)).readBigUInt64LE())
      return (await bytes(length)).toString('utf8')
    }
    if (type === 9) {
      const childType = (await bytes(4)).readUInt32LE()
      const length = Number((await bytes(8)).readBigUInt64LE())
      const values = []
      for (let index = 0; index < length; index++) values.push(await scalar(childType))
      return values
    }
    const buffer = await bytes(spec[1])
    const readers = {
      0: 'readUInt8', 1: 'readInt8', 2: 'readUInt16LE', 3: 'readInt16LE',
      4: 'readUInt32LE', 5: 'readInt32LE', 6: 'readFloatLE', 7: 'readUInt8',
      10: 'readBigUInt64LE', 11: 'readBigInt64LE', 12: 'readDoubleLE'
    }
    const value = buffer[readers[type]]()
    return typeof value === 'bigint' ? value.toString() : type === 7 ? Boolean(value) : value
  }
  try {
    const magic = (await bytes(4)).toString('ascii')
    if (magic !== 'GGUF') throw new Error(`Not GGUF: ${magic}`)
    const version = (await bytes(4)).readUInt32LE()
    const tensorCountValue = (await bytes(8)).readBigUInt64LE()
    const tensorCount = tensorCountValue.toString()
    const metadataCount = Number((await bytes(8)).readBigUInt64LE())
    const metadata = {}
    for (let index = 0; index < metadataCount; index++) {
      const key = await scalar(8)
      const type = (await bytes(4)).readUInt32LE()
      metadata[key] = await scalar(type)
    }
    let parameterCount = 0n
    const tensorTypes = {}
    for (let index = 0; index < Number(tensorCountValue); index++) {
      await scalar(8)
      const dimensions = (await bytes(4)).readUInt32LE()
      let elements = 1n
      for (let dimension = 0; dimension < dimensions; dimension++) elements *= (await bytes(8)).readBigUInt64LE()
      const tensorType = (await bytes(4)).readUInt32LE()
      await bytes(8)
      parameterCount += elements
      tensorTypes[tensorType] = (tensorTypes[tensorType] || 0) + 1
    }
    const compactMetadata = Object.fromEntries(Object.entries(metadata).map(([key, value]) => {
      if (!Array.isArray(value)) return [key, value]
      return [key, { length: value.length, preview: value.slice(0, 5) }]
    }))
    console.log(JSON.stringify({
      filename: path.resolve(filename), version, tensorCount, parameterCount: parameterCount.toString(), tensorTypes, metadataCount,
      metadata: compactMetadata
    }, null, 2))
  } finally {
    await handle.close()
  }
}
