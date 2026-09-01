const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export function assertLocalRequest(request) {
  const host = hostnameFromAuthority(request.headers.host)
  if (!LOOPBACK_HOSTS.has(host)) throw forbidden('Host header must resolve to the local QVAC Vision Lab origin')

  const origin = request.headers.origin
  if (!origin) return
  let originHost
  try { originHost = normalizeHostname(new URL(origin).hostname) } catch { throw forbidden('Invalid request Origin') }
  if (!LOOPBACK_HOSTS.has(originHost)) throw forbidden('Cross-origin access to the local QVAC Vision Lab API is not allowed')
}

function hostnameFromAuthority(authority) {
  try { return normalizeHostname(new URL(`http://${String(authority || '')}`).hostname) } catch { return '' }
}

function normalizeHostname(value) { return String(value || '').toLowerCase().replace(/^\[|\]$/g, '') }

function forbidden(message) {
  return Object.assign(new Error(message), { statusCode: 403, code: 'LOCAL_ORIGIN_REQUIRED' })
}
