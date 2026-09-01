import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { TASKS } from '../domain/tasks.mjs'
import { calculateRunTimings, summarizeRun } from '../evaluation/diagnostics.mjs'
import { createZip } from './zip.mjs'

export function buildDiagnosticRun(state, run) {
  const inferences = state.inferences.filter(item => item.runId === run.id)
  const reviews = state.reviews.filter(review => inferences.some(item => item.id === review.inferenceId))
  const reviewMap = new Map(reviews.map(item => [item.inferenceId, item]))
  return {
    project: { name: 'QVAC Vision Lab', historicalProduct: run.experimentId === 'experiment_01_pawvault' ? 'QVAC PawVault' : null },
    experiment_id: run.experimentId ?? 'experiment_01_pawvault',
    dataset_id: run.datasetId ?? null,
    question_set: run.questionSet ?? null,
    benchmark_preset: run.benchmarkPreset ?? null,
    run: { ...run, timings: calculateRunTimings(run, inferences) },
    provider: run.providerDiagnostics,
    photos: run.photoIds.map(photoId => {
      const photo = state.photos.find(item => item.id === photoId)
      const predictions = inferences.filter(item => item.photoId === photoId)
      return {
        photoId, filename: photo.filename, sourcePath: photo.sourcePath, width: photo.width ?? null, height: photo.height ?? null,
        orientation: photo.orientation ?? null, fileSizeBytes: photo.fileSizeBytes, mimeType: photo.mimeType, exifDate: photo.exifCaptureDate,
        originalFormat: photo.detectedFormat ?? null, colorspace: photo.imagePipeline?.original?.colorspace ?? null, hasAlpha: photo.imagePipeline?.original?.hasAlpha ?? null, bitDepth: photo.imagePipeline?.original?.bitDepth ?? null,
        decodeStatus: photo.imagePipeline?.pipeline?.imageDecode?.status ?? 'unknown', normalizationStatus: photo.imagePipeline?.pipeline?.normalizedDecode?.status ?? 'unknown', previewStatus: photo.imagePipeline?.pipeline?.preview?.status ?? 'unknown', inferenceReady: Boolean(photo.imagePipeline?.ready), inferenceWasCalled: predictions.length > 0, pipelineError: photo.imagePipeline?.errorCode ? { code: photo.imagePipeline.errorCode, message: photo.imagePipeline.error } : null, pipeline: photo.imagePipeline?.pipeline ?? null,
        exifGpsPresent: Boolean(photo.exifGps), exifGps: photo.exifGps, manualIdentity: photo.petIdentity, manualLocation: photo.manualLocation,
        analysisStartedAt: predictions[0]?.startedAt ?? null, analysisFinishedAt: predictions.at(-1)?.finishedAt ?? null,
        analysisDurationMs: predictions.length ? Date.parse(predictions.at(-1).finishedAt) - Date.parse(predictions[0].startedAt) : null,
        inferenceInput: photo.imagePipeline?.normalized ? { image: `photos/inference/${path.parse(photo.filename).name}.jpg`, format: 'standard RGB JPEG', resize: `inside ${photo.imagePipeline.normalized.maxDimension}px, no enlargement`, effectiveDimensions: { width: photo.imagePipeline.normalized.width, height: photo.imagePipeline.normalized.height }, preprocessing: 'full decode; EXIF autorotate; alpha flatten; sRGB conversion; aspect-preserving resize; non-progressive JPEG encode; decode/pixel validation', crop: photo.imagePipeline.normalized.crop } : null,
        predictions: predictions.map(item => {
          const task = TASKS.find(candidate => candidate.id === item.taskId)
          const review = reviewMap.get(item.id)
          const exportedReview = review ? { status: review.verdict.toLowerCase(), correctLabel: review.correctLabel, correctedText: review.correctedText ?? null, humanNote: review.humanNote ?? null, groundTruthSource: review.groundTruthSource ?? null, reviewSource: review.reviewSource ?? null } : { status: 'unreviewed', correctLabel: null, correctedText: null, humanNote: null, groundTruthSource: null, reviewSource: null }
          const humanReview = review && (!review.groundTruthSource || ['HUMAN_CONFIRMED', 'USER_MANUAL'].includes(review.groundTruthSource))
            ? { status: review.verdict.toLowerCase(), correctLabel: review.correctLabel }
            : { status: 'unreviewed', correctLabel: null }
          return { taskId: item.taskId, questionId: item.questionId ?? null, providerId: item.providerId, runtime: item.runtime, runtimeVersion: item.runtimeVersion, model: item.model, modelVersion: item.modelVersion, projection: item.projection, promptVersion: item.promptVersion, prompt: item.prompt, allowedLabels: task?.labels || [], startedAt: item.startedAt, finishedAt: item.finishedAt, latencyMs: item.latencyMs, rawOutput: item.rawOutput, normalizedOutput: item.normalizedOutput, semanticPhrase: item.semanticPhrase ?? null, searchToken: item.searchToken ?? null, parseStatus: item.validationResult === 'VALID' ? 'valid' : item.validationResult === 'INVALID_OUTPUT' ? 'invalid' : 'not_parsed', validationStatus: item.validationResult.toLowerCase(), errorCode: item.errorCode ?? null, error: item.error, runtimeStats: item.runtimeStats ?? null, review: exportedReview, humanReview }
        })
      }
    }),
    summary: summarizeRun(run, inferences, reviews)
  }
}

export async function buildDiagnosticBundle(state, run, photosDir, inferenceDir = path.join(path.dirname(photosDir), 'inference-images')) {
  const diagnostic = buildDiagnosticRun(state, run)
  const entries = [
    { name: 'run.json', data: `${JSON.stringify(diagnostic, null, 2)}\n` },
    { name: 'summary.json', data: `${JSON.stringify(diagnostic.summary, null, 2)}\n` },
    { name: 'README.txt', data: `QVAC Vision Lab local diagnostic bundle.\nexperiment = ${run.experimentId ?? 'experiment_01_pawvault'}\nhistorical_product = ${run.experimentId === 'experiment_01_pawvault' || !run.experimentId ? 'QVAC PawVault' : 'none'}\nbenchmark_preset = ${run.benchmarkPreset ?? 'none'}\n\nPRIVACY WARNING: this bundle may contain original photos, EXIF/GPS data, filenames, locations, and model outputs. Review it before publishing or sharing. Photos are export copies; originals are not modified.\n` }
  ]
  for (const photoId of run.photoIds) {
    const photo = state.photos.find(item => item.id === photoId)
    entries.push({ name: `photos/original/${photo.filename}`, data: await readFile(path.join(photosDir, photo.storedFilename)) })
    if (photo.imagePipeline?.ready && photo.inferenceFilename) entries.push({ name: `photos/inference/${path.parse(photo.filename).name}.jpg`, data: await readFile(path.join(inferenceDir, photo.inferenceFilename)) })
  }
  return createZip(entries)
}
