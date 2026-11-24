import { describe, it, expect, vi, afterEach } from 'vitest'
import { getFix } from './geo.js'

// The web path (tests don't run the MOBILE build). getFix must never reject and never hang:
// starting a workout is waiting on it.
const geoWith = impl => ({ geolocation: { getCurrentPosition: vi.fn(impl) } })

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('getFix (web)', () => {
  it('returns lat, lng and accuracy from the browser', async () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', geoWith(ok => ok({ coords: { latitude: 14.64, longitude: 121.07, accuracy: 18 } })))
    await expect(getFix()).resolves.toEqual({ lat: 14.64, lng: 121.07, accuracy: 18 })
  })

  it('returns null without asking on an insecure (plain HTTP) page', async () => {
    vi.stubGlobal('isSecureContext', false)
    const nav = geoWith(ok => ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 } }))
    vi.stubGlobal('navigator', nav)
    await expect(getFix()).resolves.toBeNull()
    expect(nav.geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })

  it('returns null when the browser has no geolocation', async () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', {})
    await expect(getFix()).resolves.toBeNull()
  })

  it('returns null when permission is denied', async () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', geoWith((ok, fail) => fail({ code: 1, message: 'denied' })))
    await expect(getFix()).resolves.toBeNull()
  })

  it('returns null at 8 s when the browser never answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', geoWith(() => {}))
    const p = getFix()
    await vi.advanceTimersByTimeAsync(7999)
    let settled = false
    p.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toBeNull()
  })
})
