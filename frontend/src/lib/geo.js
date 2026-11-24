// One reading of where the phone is, for recognising a saved workout place (lib/places.js).
// Never rejects and never hangs past the timeout: a workout start waits on nothing here — the
// check-in just shows "Finding your place…" until this settles, and null means "no GPS",
// which places.js turns into the last-used place.
import { MOBILE } from './mobile.js'

const TIMEOUT_MS = 8000

const fromCoords = c => ({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy })

async function nativeFix(timeout) {
  const { Geolocation } = await import('@capacitor/geolocation')
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout })
  return fromCoords(pos.coords)
}

function webFix(timeout) {
  // Browsers only expose location to secure contexts; asking on plain HTTP would just fail.
  if (!globalThis.isSecureContext || !globalThis.navigator?.geolocation) return Promise.resolve(null)
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve(fromCoords(pos.coords)),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    )
  })
}

export function getFix({ timeoutMs = TIMEOUT_MS } = {}) {
  let timer
  const guard = new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs) })
  const read = Promise.resolve()
    .then(() => (MOBILE ? nativeFix(timeoutMs) : webFix(timeoutMs)))
    .catch(() => null)
  return Promise.race([read, guard]).finally(() => clearTimeout(timer))
}
