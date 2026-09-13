const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export function assertLocalRequest(request) {
  const host = hostnameFromAuthority(request.headers.host)
  if (!LOOPBACK_HOSTS.has(host)) throw forbidden('Host header must resolve to the local QVAC Vision Lab origin')

  const origin = request.headers.origin
  if (!origin) return
  let parsed
  try { parsed = new URL(origin) } catch { throw forbidden('Invalid request Origin') }
  const expected = new URL(`http://${request.headers.host}`).origin
  if (parsed.origin !== expected || origin !== parsed.origin) throw forbidden('Cross-origin access to the local QVAC Vision Lab API is not allowed')
}

function hostnameFromAuthority(authority) {
  try { return normalizeHostname(new URL(`http://${String(authority || '')}`).hostname) } catch { return '' }
}

function normalizeHostname(value) { return String(value || '').toLowerCase().replace(/^\[|\]$/g, '') }

function forbidden(message) {
  return Object.assign(new Error(message), { statusCode: 403, code: 'LOCAL_ORIGIN_REQUIRED' })
}
