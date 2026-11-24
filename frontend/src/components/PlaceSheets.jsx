// Workout places UI: the map sheet for setting / moving a place, the picker used at check-in
// and on workouts, and the Places list in Settings. Logic lives in lib/places.js.
import { lazy, Suspense, useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { getFix } from '../lib/geo.js'
import { addPlace, movePlace, renamePlace, deletePlace, nearestPlace, cleanPlaceName, tileConfig, suggestPlace, mergeSuggestion, MATCH_M, NAME_MAX } from '../lib/places.js'
import { Button, TextField } from './ui.jsx'
import Icon from './Icon.jsx'

const PlaceMap = lazy(() => import('./PlaceMap.jsx'))

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()

/* ---------- a two-answer question (ConfirmDialog's cancel can't carry an action) ---------- */
function Ask({ title, message, yes, no, onYes, onNo, close }) {
  return <div style={{ textAlign: 'center', padding: '4px 0' }}>
    <h3 style={{ marginBottom: 8 }}>{title}</h3>
    {message && <div className="muted" style={{ marginBottom: 18, lineHeight: 1.5 }}>{message}</div>}
    <Button variant="primary" onClick={() => { close(); onYes() }}>{yes}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" onClick={() => { close(); onNo() }}>{no}</Button>
  </div>
}
const ask = opts => ui().openSheet(close => <Ask {...opts} close={close} />, { kind: 'center' })

/* ---------- set a new place, or move / rename an existing one ---------- */
function PlaceMapSheet({ placeId, onDone, close }) {
  const st = useStore(s => s.S)
  const config = useStore(s => s.config)
  const editing = placeId ? (st.places || []).find(p => p.id === placeId) : null
  const [name, setName] = useState(editing ? editing.name : '')
  const [err, setErr] = useState('')
  // null = still locating; then { lat, lng } | false (no fix)
  const [fix, setFix] = useState(null)
  const [start, setStart] = useState(editing ? { lat: editing.lat, lng: editing.lng } : null)
  const [center, setCenter] = useState(start)
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false)

  useEffect(() => {
    let live = true
    // Create mode asks for location here — this is where the permission prompt first appears.
    getFix().then(f => {
      if (!live) return
      setFix(f || false)
      if (!editing) {
        const last = (S().places || []).find(p => p.id === S().lastPlaceId)
        const c = f ? { lat: f.lat, lng: f.lng } : last ? { lat: last.lat, lng: last.lng } : null
        setStart(c); setCenter(c)
      }
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const locating = !editing && fix === null
  const point = offline ? (fix || null) : center
  const finish = id => { close(); onDone && onDone(id) }

  const save = () => {
    const n = cleanPlaceName(name)
    if (!n) { setErr(t('Give this place a name.')); return }
    if (!point) { setErr(t('Can’t tell where you are right now.')); return }
    const at = { lat: point.lat, lng: point.lng }
    if (editing) {
      update(s => { movePlace(s, editing.id, at); if (n !== editing.name) renamePlace(s, editing.id, n) })
      return finish(editing.id)
    }
    const create = () => { let id; update(s => { id = addPlace(s, { name: n, ...at }).id }); finish(id) }
    const near = nearestPlace(S().places, at)
    if (near && near.m <= MATCH_M) {
      return ask({
        title: t('Is this {0}?', near.place.name),
        message: t('You already saved a place right here.'),
        yes: t('Yes, use {0}', near.place.name), no: t('No, save a new place'),
        onYes: () => finish(near.place.id), onNo: create
      })
    }
    create()
  }

  return <>
    <h3>{editing ? t('Edit place') : t('New place')}</h3>
    {offline ? (
      <div className="muted small" style={{ margin: '6px 0 14px', lineHeight: 1.5 }}>
        {fix ? t('The map can’t load right now. Save this place at your current position — you can fix the pin later in Settings.')
          : fix === false ? t('The map can’t load and your location isn’t available, so this place can’t be saved yet.')
            : t('Finding your location…')}
      </div>
    ) : locating ? (
      <div className="placemap placemap-wait muted small">{t('Finding your location…')}</div>
    ) : (
      <>
        <Suspense fallback={<div className="placemap placemap-wait muted small">{t('Loading map…')}</div>}>
          <PlaceMap center={start || { lat: 20, lng: 0 }} zoom={start ? 17 : 2} tiles={tileConfig(config)}
            onMove={setCenter} onTilesFailed={() => setOffline(true)} />
        </Suspense>
        <div className="muted small" style={{ margin: '6px 0 12px' }}>{t('Drag the map so the pin sits on the place.')}</div>
      </>
    )}
    <TextField value={name} maxLength={NAME_MAX} placeholder={t('Name — e.g. Home, Gold’s Gym BGC')}
      onChange={e => { setName(e.target.value); setErr('') }} />
    {err && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>{err}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={offline && !fix} onClick={save}>
      {offline ? t('Save at my current position') : t('Save place')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

/** Set a new place (no placeId) or move/rename one. onDone(placeId) after saving or picking a duplicate. */
export function placeMapSheet({ placeId, onDone } = {}) {
  return ui().openSheet(close => <PlaceMapSheet placeId={placeId} onDone={onDone} close={close} />)
}

/* ---------- pick a place: check-in, a running workout, a past workout ---------- */
function PlacePicker({ selected, nearbyId, onPick, close }) {
  const places = useStore(s => s.S.places) || []
  const list = nearbyId ? [...places.filter(p => p.id === nearbyId), ...places.filter(p => p.id !== nearbyId)] : places
  const pick = id => { close(); onPick(id) }
  return <>
    <h3>{t('Where are you training?')}</h3>
    <div className="list" style={{ margin: '12px 0' }}>
      {list.map(p => <div key={p.id} className="item" onClick={() => pick(p.id)}>
        <Icon name="pin" />
        <div className="grow"><div className="tt">{p.name}</div>
          {p.id === nearbyId && <div className="ss">{t('nearby?')}</div>}</div>
        {p.id === selected && <Icon name="check" style={{ color: 'var(--acc)' }} />}
      </div>)}
      <div className="item" onClick={() => { close(); placeMapSheet({ onDone: onPick }) }}>
        <Icon name="plus" /><div className="grow"><div className="tt">{t('New place (set on map)')}</div></div>
      </div>
    </div>
    <Button variant="ghost" className="dim" onClick={() => pick(null)}>{selected ? t('No place') : t('Skip')}</Button>
  </>
}

/** onPick(placeId | null). nearbyId is listed first and tagged "nearby?". */
export function placePickerSheet({ selected = null, nearbyId, onPick }) {
  return ui().openSheet(close => <PlacePicker selected={selected} nearbyId={nearbyId} onPick={onPick} close={close} />)
}

/**
 * The place row in the Quick check-in. `place` is { placeId, touched } owned by the check-in;
 * this reads location once (only when places exist) and folds the suggestion in, never over a
 * pick the user made. Unmounting with the sheet drops a late answer on the floor.
 */
export function CheckinPlaceRow({ place, setPlace }) {
  const places = useStore(s => s.S.places) || []
  const lastPlaceId = useStore(s => s.S.lastPlaceId)
  const has = places.length > 0
  const [sug, setSug] = useState(null)

  useEffect(() => {
    if (!has) return
    let live = true
    getFix().then(fix => {
      if (!live) return
      const s = suggestPlace({ fix, places: S().places, lastPlaceId })
      setSug(s)
      setPlace(cur => mergeSuggestion(cur, s))
    })
    return () => { live = false }
    // Once per check-in: a place added mid-sheet arrives as a pick, not a new suggestion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [has])

  const picked = id => setPlace({ placeId: id, touched: true })
  const openMap = () => placeMapSheet({ onDone: picked })
  const nearbyId = sug && sug.kind === 'nearby' ? sug.placeId : undefined
  const openPicker = () => placePickerSheet({ selected: place.placeId, nearbyId, onPick: picked })
  const sel = place.placeId && places.find(p => p.id === place.placeId)

  if (!has && !sel) return <PlaceLine icon="pin" text={t('Add a place')} dim onClick={openMap} />
  if (sel) return <PlaceLine icon="pin" text={sel.name} onClick={openPicker} />
  if (!sug) return <PlaceLine icon="pin" text={t('Finding your place…')} dim onClick={openPicker} />
  if (sug.kind === 'new' && !place.touched) return <div style={{ marginTop: 12 }}>
    <Button variant="tinted" icon="pin" onClick={openMap}>{t('New place — set it on the map')}</Button>
    <Button variant="ghost" className="dim" size="sm" onClick={openPicker}>{t('or pick a saved place')}</Button>
  </div>
  if (nearbyId && !place.touched) {
    const n = places.find(p => p.id === nearbyId)
    return <PlaceLine icon="pin" text={t('Near {0}?', n ? n.name : '')} onClick={openPicker} />
  }
  return <PlaceLine icon="pin" text={t('Choose a place')} dim onClick={openPicker} />
}

function PlaceLine({ icon, text, dim, onClick }) {
  return <button className="placeline" onClick={onClick}>
    <Icon name={icon} /><span className={dim ? 'dim' : ''}>{text}</span><Icon name="chevronRight" className="chev" />
  </button>
}

/* ---------- Settings → Places ---------- */
function RenamePlace({ place, close }) {
  const [name, setName] = useState(place.name)
  const [err, setErr] = useState('')
  const save = () => {
    const n = cleanPlaceName(name)
    if (!n) { setErr(t('Give this place a name.')); return }
    update(s => renamePlace(s, place.id, n))
    close()
  }
  return <>
    <h3>{t('Rename place')}</h3>
    <div style={{ height: 10 }} />
    <TextField value={name} maxLength={NAME_MAX} autoFocus onChange={e => { setName(e.target.value); setErr('') }} />
    {err && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>{err}</div>}
    <div className="muted small" style={{ marginTop: 6 }}>{t('Past workouts at this place show the new name.')}</div>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

function PlaceActions({ place, close }) {
  const after = fn => () => { close(); fn() }
  return <>
    <h3>{place.name}</h3>
    <div className="list" style={{ margin: '12px 0' }}>
      <div className="item" onClick={after(() => ui().openSheet(c => <RenamePlace place={place} close={c} />))}>
        <Icon name="pencil" /><div className="grow"><div className="tt">{t('Rename')}</div></div></div>
      <div className="item" onClick={after(() => placeMapSheet({ placeId: place.id }))}>
        <Icon name="pin" /><div className="grow"><div className="tt">{t('Move pin')}</div></div></div>
      <div className="item" style={{ color: 'var(--red)' }} onClick={after(() => ask({
        title: t('Delete {0}?', place.name), message: t('Past workouts keep this name.'),
        yes: t('Delete'), no: t('Cancel'), onYes: () => update(s => deletePlace(s, place.id)), onNo: () => {}
      }))}>
        <Icon name="trash" /><div className="grow"><div className="tt">{t('Delete')}</div></div></div>
    </div>
    <Button variant="ghost" className="dim" onClick={close}>{t('Close')}</Button>
  </>
}

function PlacesList({ close }) {
  const places = useStore(s => s.S.places) || []
  return <>
    <h3>{t('Places')}</h3>
    <div className="muted small" style={{ marginTop: 4 }}>{t('Where you train. A workout is tagged with the place you’re at when it starts.')}</div>
    <div className="list" style={{ margin: '12px 0' }}>
      {places.map(p => <div key={p.id} className="item" onClick={() => ui().openSheet(c => <PlaceActions place={p} close={c} />)}>
        <Icon name="pin" /><div className="grow"><div className="tt">{p.name}</div></div>
        <Icon name="chevronRight" className="chev" /></div>)}
      <div className="item" onClick={() => placeMapSheet()}>
        <Icon name="plus" /><div className="grow"><div className="tt">{t('Add place')}</div></div></div>
    </div>
    <Button variant="ghost" className="dim" onClick={close}>{t('Done')}</Button>
  </>
}

export function placesSheet() {
  return ui().openSheet(close => <PlacesList close={close} />)
}
