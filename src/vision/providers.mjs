import { publicProviderStatus } from './provider-contract.mjs'
import { QvacVisionPsyFlashQ4Provider, QvacVisionPsyProvider, QvacVisionPsyStandardQ8Provider } from './qvac-visionpsy-provider.mjs'
import { Lfm25VlProvider, VisionPsyPatchedProvider, VisionPsyPatchedBaseProvider } from './visionpsy-patched-provider.mjs'
import { QvacSmolVlm2Provider } from './qvac-smolvlm2-provider.mjs'

export class VisionProviderRegistry {
  constructor(providers = [
    new QvacVisionPsyProvider(),
    new VisionPsyPatchedProvider(),
    new VisionPsyPatchedBaseProvider(),
    new Lfm25VlProvider(),
    new QvacSmolVlm2Provider(),
    new QvacVisionPsyStandardQ8Provider(),
    new QvacVisionPsyFlashQ4Provider()
  ]) {
    this.providers = new Map(providers.map(provider => [provider.definition.id, provider]))
  }

  get(id) {
    const provider = this.providers.get(id)
    if (!provider) throw Object.assign(new Error(`Unknown vision provider: ${id}`), { statusCode: 400 })
    return provider
  }

  async statuses() {
    return Promise.all([...this.providers.values()].map(async provider => publicProviderStatus(await provider.status())))
  }

  async shutdown() {
    await Promise.allSettled([...this.providers.values()].map(provider => provider.shutdown()))
  }
}
