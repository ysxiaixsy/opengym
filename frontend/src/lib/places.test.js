import { describe, it, expect } from 'vitest'
import {
  MATCH_M, NEARBY_M, GOOD_ACCURACY_M, NAME_MAX,
  distanceM, cleanPlaceName, nearestPlace, suggestPlace, mergeSuggestion,
  addPlace, renamePlace, movePlace, deletePlace, setWorkoutPlace, DEFAULT_TILES, tileConfig
} from './places.js'

const GYM = { id: 'g', name: 'Gym', lat: 14.6400, lng: 121.0770, created: 1 }
const HOME = { id: 'h', name: 'Home', lat: 14.6500, lng: 121.0500, created: 1 }
// Due north by m metres: one degree of latitude is ~111.32 km everywhere.
const offsetN = (p, m) => ({ lat: p.lat + m / 111320, lng: p.lng })
const fix = (p, accuracy = 20) => ({ lat: p.lat, lng: p.lng, accuracy })

describe('constants', () => {
  it('carries the radii the design settled on', () => {
    expect([MATCH_M, NEARBY_M, GOOD_ACCURACY_M, NAME_MAX]).toEqual([150, 500, 100, 60])
  })
})

describe('distanceM', () => {
  it('is ~0 for the same point and ~1 km for 1 km north', () => {
    expect(distanceM(GYM, GYM)).toBeLessThan(0.01)
    expect(Math.abs(distanceM(GYM, offsetN(GYM, 1000)) - 1000)).toBeLessThan(5)
  })
})

describe('cleanPlaceName', () => {
  it('trims, caps at 60, and rejects blank or non-strings', () => {
    expect(cleanPlaceName('  Gym  ')).toBe('Gym')
    expect(cleanPlaceName('x'.repeat(80))).toHaveLength(60)
    expect(cleanPlaceName('   ')).toBeNull()
    expect(cleanPlaceName('')).toBeNull()
    expect(cleanPlaceName(undefined)).toBeNull()
    expect(cleanPlaceName(42)).toBeNull()
  })
})

describe('nearestPlace', () => {
  it('returns the closest place with its distance, or null with no places', () => {
    const r = nearestPlace([GYM, HOME], offsetN(GYM, 100))
    expect(r.place.id).toBe('g')
    expect(Math.abs(r.m - 100)).toBeLessThan(2)
    expect(nearestPlace([], GYM)).toBeNull()
    expect(nearestPlace(undefined, GYM)).toBeNull()
  })
})

describe('suggestPlace', () => {
  it('returns empty when there are no saved places — old state included', () => {
    expect(suggestPlace({ fix: fix(GYM), places: undefined, lastPlaceId: undefined })).toEqual({ kind: 'empty' })
    expect(suggestPlace({ fix: fix(GYM), places: [], lastPlaceId: null })).toEqual({ kind: 'empty' })
  })

  it('matches within 150 m, picking the closer of two in range', () => {
    expect(suggestPlace({ fix: fix(offsetN(GYM, 140)), places: [GYM, HOME], lastPlaceId: null })).toEqual({ kind: 'match', placeId: 'g' })
    const near = { ...GYM, id: 'g2', lat: GYM.lat + 120 / 111320 }
    expect(suggestPlace({ fix: fix(offsetN(GYM, 100)), places: [GYM, near], lastPlaceId: null })).toEqual({ kind: 'match', placeId: 'g2' })
  })

  it('offers "nearby?" between 150 and 500 m', () => {
    expect(suggestPlace({ fix: fix(offsetN(GYM, 160)), places: [GYM], lastPlaceId: null })).toEqual({ kind: 'nearby', placeId: 'g' })
    expect(suggestPlace({ fix: fix(offsetN(GYM, 490)), places: [GYM], lastPlaceId: null })).toEqual({ kind: 'nearby', placeId: 'g' })
  })

  it('calls it new beyond 500 m', () => {
    expect(suggestPlace({ fix: fix(offsetN(GYM, 520)), places: [GYM], lastPlaceId: 'g' })).toEqual({ kind: 'new' })
  })

  it('falls back to last-used on weak, missing or garbage fixes — never "new"', () => {
    const base = { places: [GYM, HOME], lastPlaceId: 'h' }
    const fb = { kind: 'fallback', placeId: 'h' }
    expect(suggestPlace({ ...base, fix: fix(offsetN(GYM, 5000), 101) })).toEqual(fb)
    expect(suggestPlace({ ...base, fix: null })).toEqual(fb)
    expect(suggestPlace({ ...base, fix: { lat: NaN, lng: 1, accuracy: 5 } })).toEqual(fb)
    expect(suggestPlace({ ...base, fix: { lat: 1, lng: 2 } })).toEqual(fb)
  })

  it('falls back to no selection when the last-used place no longer exists', () => {
    expect(suggestPlace({ fix: null, places: [GYM], lastPlaceId: 'gone' })).toEqual({ kind: 'fallback', placeId: null })
  })
})

describe('mergeSuggestion', () => {
  const fresh = { placeId: null, touched: false }
  it('applies match and fallback selections while the user has not picked', () => {
    expect(mergeSuggestion(fresh, { kind: 'match', placeId: 'g' })).toEqual({ placeId: 'g', touched: false })
    expect(mergeSuggestion(fresh, { kind: 'fallback', placeId: 'h' })).toEqual({ placeId: 'h', touched: false })
  })
  it('selects nothing for nearby, new and empty', () => {
    const cur = { placeId: 'h', touched: false }
    expect(mergeSuggestion(cur, { kind: 'nearby', placeId: 'g' })).toEqual({ placeId: null, touched: false })
    expect(mergeSuggestion(cur, { kind: 'new' })).toEqual({ placeId: null, touched: false })
    expect(mergeSuggestion(cur, { kind: 'empty' })).toEqual({ placeId: null, touched: false })
  })
  it('never overrides a place the user picked', () => {
    const picked = { placeId: 'h', touched: true }
    expect(mergeSuggestion(picked, { kind: 'match', placeId: 'g' })).toBe(picked)
    expect(mergeSuggestion({ placeId: null, touched: true }, { kind: 'fallback', placeId: 'h' })).toEqual({ placeId: null, touched: true })
  })
})

describe('mutators', () => {
  const state = () => ({
    places: [{ ...GYM }, { ...HOME }], lastPlaceId: 'g',
    workouts: [{ id: 'w1', placeId: 'g', placeName: 'Gym' }, { id: 'w2', placeId: 'h', placeName: 'Home' }, { id: 'w3' }],
    active: { id: 'a', placeId: 'g', placeName: 'Gym' }
  })

  it('addPlace appends with a fresh id, even on state without a places key', () => {
    const s = {}
    const p = addPlace(s, { name: 'Gym', lat: 1, lng: 2 })
    expect(s.places).toEqual([p])
    expect(p).toMatchObject({ name: 'Gym', lat: 1, lng: 2 })
    expect(typeof p.id).toBe('string')
    expect(typeof p.created).toBe('number')
    const q = addPlace(s, { name: 'Other', lat: 3, lng: 4 })
    expect(q.id).not.toBe(p.id)
  })

  it('renamePlace follows through to past workouts and the active one', () => {
    const s = state()
    renamePlace(s, 'g', 'Gold’s')
    expect(s.places[0].name).toBe('Gold’s')
    expect(s.workouts[0].placeName).toBe('Gold’s')
    expect(s.workouts[1].placeName).toBe('Home')
    expect(s.active.placeName).toBe('Gold’s')
  })

  it('movePlace changes only the coordinates', () => {
    const s = state()
    movePlace(s, 'g', { lat: 5, lng: 6 })
    expect(s.places[0]).toMatchObject({ id: 'g', name: 'Gym', lat: 5, lng: 6 })
  })

  it('deletePlace keeps names on workouts (active included), drops the id, clears last-used', () => {
    const s = state()
    deletePlace(s, 'g')
    expect(s.places.map(p => p.id)).toEqual(['h'])
    expect(s.workouts[0]).toEqual({ id: 'w1', placeName: 'Gym' })
    expect(s.workouts[1]).toEqual({ id: 'w2', placeId: 'h', placeName: 'Home' })
    expect(s.active).toEqual({ id: 'a', placeName: 'Gym' })
    expect(s.lastPlaceId).toBeNull()
  })

  it('setWorkoutPlace snapshots the name and remembers it as last-used; null clears the workout only', () => {
    const s = state()
    const rec = s.workouts[2]
    setWorkoutPlace(s, rec, 'h')
    expect(rec).toMatchObject({ placeId: 'h', placeName: 'Home' })
    expect(s.lastPlaceId).toBe('h')
    setWorkoutPlace(s, rec, null)
    expect(rec.placeId).toBeUndefined()
    expect(rec.placeName).toBeUndefined()
    expect(s.lastPlaceId).toBe('h')
  })
})

describe('tileConfig', () => {
  it('uses OpenStreetMap when the server says nothing', () => {
    expect(DEFAULT_TILES).toEqual({ tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' })
    expect(tileConfig(null)).toEqual(DEFAULT_TILES)
    expect(tileConfig({})).toEqual(DEFAULT_TILES)
    expect(tileConfig({ map: { tileUrl: '' } })).toEqual(DEFAULT_TILES)
  })
  it('uses the self-hoster’s tiles when configured', () => {
    expect(tileConfig({ map: { tileUrl: 'https://x/{z}/{x}/{y}.png', attribution: 'X' } }))
      .toEqual({ tileUrl: 'https://x/{z}/{x}/{y}.png', attribution: 'X' })
  })
})
