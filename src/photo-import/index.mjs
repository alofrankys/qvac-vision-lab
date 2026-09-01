// Photo import is orchestrated by the local HTTP endpoint in server.mjs.
// This boundary owns future import-source adapters without exposing browser or
// filesystem assumptions to metadata, evaluation, or identity modules.
export const SUPPORTED_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
