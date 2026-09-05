import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import test from 'node:test'
import { DOG_ASTRA_REVIEW, findDogAstraReview } from '../public/showcase/dog-astra-review.js'

const evidence = JSON.parse(readFileSync(new URL('../reports/visionpsy-dog-demo-astra-20260905.json', import.meta.url), 'utf8'))
const script = readFileSync(new URL('../public/showcase.js', import.meta.url), 'utf8')
const start = script.indexOf('const LIVE_DEMO_3_SCENES =')
const end = script.indexOf('const LIVE_DEMO_OFFICIAL_RESULTS =', start)
const replay = vm.runInNewContext(`${script.slice(start,end)}; ({scenes:LIVE_DEMO_3_SCENES,results:LIVE_DEMO_3_REPLAY_RESULTS})`)
const sha = value => createHash('sha256').update(value).digest('hex')
const mean = values => values.reduce((a,b)=>a+b,0)/values.length
const median = values => {const s=[...values].sort((a,b)=>a-b);return s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2}

test('Astra evidence contains three blinded passes and exact source images/questions/outputs', () => {
  assert.equal(evidence.manifest.model,'gpt-6-astra')
  assert.equal(evidence.manifest.protocolSha256,sha(evidence.protocol))
  assert.equal(evidence.passes.length,3)
  assert.equal(evidence.manifest.uniqueResponses,14)
  assert.equal(DOG_ASTRA_REVIEW.rows.length,16)
  assert.equal(evidence.manifest.rawInputs.length,16)
  for (const photo of evidence.manifest.photos) {
    const scene = replay.scenes.find(s=>s.id===photo.scene_id)
    assert.equal(photo.question,scene.prompt)
    const actualHash=sha(readFileSync(new URL(`../public${scene.imageUrl}`,import.meta.url)))
    assert.equal(actualHash,photo.sha256)
    for (const [provider,result] of Object.entries(replay.results[scene.id])) {
      const frozen=evidence.manifest.rawInputs.find(r=>r.photo_id===photo.photo_id&&r.provider===provider)
      assert.equal(result.output,frozen.response)
      assert.equal(frozen.key,sha(`${photo.photo_id}\n${scene.prompt}\n${frozen.response}`))
      const review=findDogAstraReview(scene,provider,result.output)
      assert.ok(review)
      assert.equal(review.imageSha256,actualHash)
    }
  }
  for (const pass of evidence.passes) {
    assert.deepEqual(pass.execution,['model: gpt-6-astra','provider: openai','reasoning effort: high'])
    assert.ok(pass.input.startsWith(evidence.protocol))
    const candidates=JSON.parse(pass.input.split('\n\nCANDIDATE DATA:\n')[1])
    assert.equal(candidates.length,14)
    assert.equal(new Set(candidates.map(c=>c.candidate_id)).size,14)
    assert.doesNotMatch(pass.input,/qvac-visionpsy|semanticScore|semanticReason/)
    for (const c of candidates) {
      assert.deepEqual(Object.keys(c).sort(),['candidate_id','photo_id','question','response'])
      const mapping=pass.mapping.find(m=>m.candidate_id===c.candidate_id)
      assert.equal(mapping.key,sha(`${c.photo_id}\n${c.question}\n${c.response}`))
    }
  }
})

test('Astra arithmetic and aggregates recompute from original grader outputs', () => {
  for (const pass of evidence.passes) {
    assert.equal(pass.output.grades.length,14)
    assert.equal(new Set(pass.output.grades.map(g=>g.candidate_id)).size,14)
    assert.equal(new Set(pass.mapping.map(g=>g.key)).size,14)
    for (const g of pass.output.grades) {
      for (const field of ['part_a','part_b']) assert.ok(Number.isInteger(g[field])&&g[field]>=0&&g[field]<=4)
      for (const field of ['grounding','explicit_constraints']) assert.ok([0,1].includes(g[field]))
      assert.equal(g.score,(g.part_a+g.part_b+g.grounding+g.explicit_constraints)/10)
      assert.ok(pass.mapping.find(m=>m.candidate_id===g.candidate_id))
    }
  }
  for (const row of evidence.summary.evaluated) {
    const grades=evidence.passes.map(pass=>pass.output.grades.find(g=>g.candidate_id===pass.mapping.find(m=>m.key===row.key).candidate_id))
    assert.deepEqual(row.scores,grades.map(g=>g.score))
    assert.equal(row.median,median(row.scores))
    assert.equal(row.mean,mean(row.scores))
    const source=evidence.manifest.photos.find(p=>p.photo_id===row.photo_id)
    const review=DOG_ASTRA_REVIEW.rows.find(r=>r.sceneId===source.scene_id&&r.providerId===row.provider)
    assert.equal(review.score,row.median)
  }
  const totals=evidence.summary.aggregates.map(aggregate=>{
    const rows=evidence.summary.evaluated.filter(r=>r.provider===aggregate.provider)
    assert.equal(rows.length,4)
    assert.equal(aggregate.meanOfPhotoMedians,mean(rows.map(r=>median(r.scores))))
    assert.equal(aggregate.medianOfPhotoMedians,median(rows.map(r=>median(r.scores))))
    return Math.round(aggregate.meanOfPhotoMedians*1000)/100
  })
  assert.deepEqual(totals,[8.5,7.75,9,8.25])
})

test('frozen Astra grades never silently match a changed question, answer or scene', () => {
  const row=DOG_ASTRA_REVIEW.rows[0]
  const scene={id:row.sceneId,prompt:row.prompt}
  assert.ok(findDogAstraReview(scene,row.providerId,row.output))
  assert.equal(findDogAstraReview(scene,row.providerId,row.output+' changed'),null)
  assert.equal(findDogAstraReview({...scene,prompt:'Different question'},row.providerId,row.output),null)
  assert.equal(findDogAstraReview({...scene,id:'another-photo'},row.providerId,row.output),null)
  const freshRun=script.slice(script.indexOf('async function runLiveDemoProvider'),script.indexOf('async function replayLiveDemoProvider'))
  assert.doesNotMatch(freshRun,/findDogAstraReview|DOG_ASTRA_REVIEW/)
})
