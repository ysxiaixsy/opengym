// Workout places: where a session happened, as a name the user chose ("Home", "Gold's BGC").
// Coordinates exist only to recognise a saved place again at the next start; history shows
// the name, snapshotted onto each workout so deleting a place never blanks old sessions.
// None of this is ever sent to the Coach (see api/coach/payload.js and its test).
//
// Matching rules (design: .scratch/workout-places/design.md):
//   ≤ 150 m from a saved place      → that place, preselected
//   150–500 m (likely GPS drift)     → ask "nearby?", preselect nothing
//   > 500 m                          → somewhere new: offer the map
//   weak / missing / garbage fix     → last-used place — a flaky reading never means "new"
import { uid } from './format.js'

export const MATCH_M = 150
export const NEARBY_M = 500
export const GOOD_ACCURACY_M = 100
export const NAME_MAX = 60

const R = 6371000
const rad = d => d * Math.PI / 180

/** Great-circle distance in metres (haversine). */
export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function cleanPlaceName(s) {
  if (typeof s !== 'string') return null
  const v = s.trim().slice(0, NAME_MAX).trim()
  return v || null
}

export function nearestPlace(places, point) {
  let best = null
  for (const place of places || []) {
    const m = distanceM(point, place)
    if (!best || m < best.m) best = { place, m }
  }
  return best
}

const usable = fix => !!fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lng) &&
  Number.isFinite(fix.accuracy) && fix.accuracy <= GOOD_ACCURACY_M

export function suggestPlace({ fix, places, lastPlaceId }) {
  if (!places || !places.length) return { kind: 'empty' }
  if (!usable(fix)) {
    return { kind: 'fallback', placeId: places.some(p => p.id === lastPlaceId) ? lastPlaceId : null }
  }
  const { place, m } = nearestPlace(places, fix)
  if (m <= MATCH_M) return { kind: 'match', placeId: place.id }
  if (m <= NEARBY_M) return { kind: 'nearby', placeId: place.id }
  return { kind: 'new' }
}

/** Fold a (possibly late) suggestion into the check-in's selection. A user's pick always wins. */
export function mergeSuggestion(current, s) {
  if (current.touched) return current
  const placeId = s.kind === 'match' || s.kind === 'fallback' ? s.placeId : null
  return { placeId, touched: false }
}

/* ---------- mutators: call inside useStore's update(s => …) ---------- */

const sessions = s => [...(s.workouts || []), ...(s.active ? [s.active] : [])]

export function addPlace(s, { name, lat, lng }) {
  const place = { id: uid(), name, lat, lng, created: Date.now() }
  s.places = [...(s.places || []), place]
  return place
}

export function renamePlace(s, id, name) {
  const p = (s.places || []).find(x => x.id === id)
  if (!p) return
  p.name = name
  sessions(s).forEach(w => { if (w.placeId === id) w.placeName = name })
}

export function movePlace(s, id, { lat, lng }) {
  const p = (s.places || []).find(x => x.id === id)
  if (p) { p.lat = lat; p.lng = lng }
}

export function deletePlace(s, id) {
  s.places = (s.places || []).filter(p => p.id !== id)
  sessions(s).forEach(w => { if (w.placeId === id) delete w.placeId })
  if (s.lastPlaceId === id) s.lastPlaceId = null
}

export function setWorkoutPlace(s, rec, placeId) {
  const p = placeId ? (s.places || []).find(x => x.id === placeId) : null
  if (!p) { delete rec.placeId; delete rec.placeName; return }
  rec.placeId = p.id
  rec.placeName = p.name
  s.lastPlaceId = p.id
}
