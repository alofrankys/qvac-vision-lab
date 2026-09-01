export const PET_IDENTITIES = Object.freeze(['Lucky', 'Romeo', 'Both', 'Unknown'])

// Future PetIdentityProvider implementations (for example the proven DogWatch
// DINOv2 boundary) must return Unknown below calibrated evidence thresholds.
export class PetIdentityProvider {
  async identify() {
    throw new Error('Automatic pet identity is intentionally not implemented in milestone 1')
  }
}
