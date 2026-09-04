import {
  MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
  MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1,
  VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M,
  VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M_1,
  VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
  VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1
} from '@qvac/sdk'
import { QvacMultimodalProvider } from './qvac-provider.mjs'

const FLASH_COMMIT = 'a24fb9cdd1119406b15ff60b06a51f8438a931c1'
const STANDARD_COMMIT = '4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1'
const RUNTIME_VERSION = '@qvac/sdk 0.18.2 · @qvac/llm-llamacpp 0.47.0'

export class QvacVisionPsyProvider extends QvacMultimodalProvider {
  constructor() {
    super({
      status: {
        id: 'qvac-visionpsy', name: 'QVAC VisionPsy — Flash Q8_0', kind: 'PRIMARY',
        runtime: 'QVAC SDK · qvac-fabric-llm.cpp', runtimeVersion: RUNTIME_VERSION,
        model: 'VisionPsy-Nano-460M-Flash Q8_0', modelVersion: `${FLASH_COMMIT} · Q8_0`,
        projection: 'mmproj-visionpsy-nano-460m-flash-q8.gguf', state: 'READY',
        label: 'READY · QVAC NATIVE · FLASH Q8_0 · METAL · NATIVE RESOLUTION', reason: null
      },
      modelSource: VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
      projectionSource: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
      preprocessPolicy: 'native-resolution-no-upscale',
      modelConfig: { 'mmproj-use-gpu': true, image_no_upscale: 'on' }
    })
  }
}

export class QvacVisionPsyStandardQ8Provider extends QvacMultimodalProvider {
  constructor() {
    super({
      status: {
        id: 'qvac-visionpsy-standard-q8', name: 'QVAC VisionPsy — Standard Q8_0', kind: 'PRIMARY',
        runtime: 'QVAC SDK · qvac-fabric-llm.cpp', runtimeVersion: RUNTIME_VERSION,
        model: 'VisionPsy-Nano-460M Q8_0', modelVersion: `${STANDARD_COMMIT} · Q8_0`,
        projection: 'mmproj-visionpsy-nano-460m-q8.gguf', state: 'READY',
        label: 'READY · QVAC NATIVE · STANDARD Q8_0 · METAL · OFFICIAL TILING', reason: null
      },
      modelSource: VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1,
      projectionSource: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1,
      preprocessPolicy: 'official-standard-tiled-upscale',
      modelConfig: { 'mmproj-use-gpu': true }
    })
  }
}

export class QvacVisionPsyStandardQ4Provider extends QvacMultimodalProvider {
  constructor() {
    super({
      status: {
        id: 'qvac-visionpsy-standard-q4', name: 'QVAC VisionPsy — Standard Q4_K_M', kind: 'PRIMARY',
        runtime: 'QVAC SDK · qvac-fabric-llm.cpp', runtimeVersion: RUNTIME_VERSION,
        model: 'VisionPsy-Nano-460M Q4_K_M', modelVersion: `${STANDARD_COMMIT} · Q4_K_M · imatrix`,
        projection: 'mmproj-visionpsy-nano-460m-q8.gguf', state: 'READY',
        label: 'READY · QVAC NATIVE · STANDARD Q4_K_M · METAL · OFFICIAL TILING', reason: null
      },
      modelSource: VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M_1,
      projectionSource: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1,
      preprocessPolicy: 'official-standard-tiled-upscale',
      modelConfig: { 'mmproj-use-gpu': true }
    })
  }
}

export class QvacVisionPsyFlashQ4Provider extends QvacMultimodalProvider {
  constructor() {
    super({
      status: {
        id: 'qvac-visionpsy-flash-q4', name: 'QVAC VisionPsy — Flash Q4_K_M', kind: 'PRIMARY',
        runtime: 'QVAC SDK · qvac-fabric-llm.cpp', runtimeVersion: RUNTIME_VERSION,
        model: 'VisionPsy-Nano-460M-Flash Q4_K_M', modelVersion: `${FLASH_COMMIT} · Q4_K_M · imatrix`,
        projection: 'mmproj-visionpsy-nano-460m-flash-q8.gguf', state: 'READY',
        label: 'READY · QVAC NATIVE · FLASH Q4_K_M · METAL · NATIVE RESOLUTION', reason: null
      },
      modelSource: VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M,
      projectionSource: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
      preprocessPolicy: 'native-resolution-no-upscale',
      modelConfig: { 'mmproj-use-gpu': true, image_no_upscale: 'on' }
    })
  }
}
