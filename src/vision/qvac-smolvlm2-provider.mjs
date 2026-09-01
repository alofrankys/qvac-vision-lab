import { MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0, SMOLVLM2_500M_MULTIMODAL_Q8_0 } from '@qvac/sdk'
import { QvacMultimodalProvider } from './qvac-provider.mjs'

export class QvacSmolVlm2Provider extends QvacMultimodalProvider {
  constructor() {
    super({
      status: {
        id: 'qvac-smolvlm2', name: 'SmolVLM2-500M', kind: 'FAIR_ARENA_PEER',
        runtime: 'QVAC MTMD', runtimeVersion: '@qvac/sdk 0.18.2 · @qvac/llm-llamacpp 0.47.0',
        model: 'SmolVLM2-500M-Video-Instruct-Q8_0', modelVersion: `${SMOLVLM2_500M_MULTIMODAL_Q8_0.modelId}@ccd7aae53bcb1997355c2f094959e72b3642ce17`,
        projection: MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0.modelId,
        state: 'READY', label: 'PRIMARY PEER · Q8_0 · METAL', reason: null
      },
      modelSource: SMOLVLM2_500M_MULTIMODAL_Q8_0,
      projectionSource: MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
      modelConfig: { 'mmproj-use-gpu': true }
    })
  }
}
