// Browser-only mutation protection. Command-line clients are separately restricted
// to loopback by the server's Host/Origin policy.
const nativeFetch = globalThis.fetch.bind(globalThis)
let tokenPromise
export async function localFetch(input, options = {}) {
  const url = new URL(input, globalThis.location.href)
  const method = String(options.method || 'GET').toUpperCase()
  if (url.origin === globalThis.location.origin && url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    tokenPromise ||= nativeFetch('/api/session', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Unable to establish local API session; reload the page')
      return (await response.json()).token
    }).catch(error => { tokenPromise = null; throw error })
    const headers = new Headers(options.headers)
    headers.set('X-QVAC-Session', await tokenPromise)
    options = { ...options, headers }
  }
  return nativeFetch(input, options)
}
