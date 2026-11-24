// The map behind "set a place". Loaded lazily (PlaceSheets.jsx) so Leaflet never lands in the
// main bundle — most people open this a handful of times, ever.
//
// The pin is fixed in the middle and the map moves under it: easier to aim with a thumb than
// dragging a marker, and the centre is the answer. Tiles come from tileConfig (OpenStreetMap
// unless the server configured its own); if none load at all, onTilesFailed lets the sheet fall
// back to saving the current position without a map.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Icon from './Icon.jsx'

export default function PlaceMap({ center, zoom, tiles, onMove, onTilesFailed }) {
  const el = useRef(null)
  const cb = useRef({ onMove, onTilesFailed })
  cb.current = { onMove, onTilesFailed }

  useEffect(() => {
    const map = L.map(el.current, { zoomControl: false, attributionControl: true })
      .setView([center.lat, center.lng], zoom)
    let loaded = false
    let errors = 0
    L.tileLayer(tiles.tileUrl, { attribution: tiles.attribution, maxZoom: 19 })
      .on('tileload', () => { loaded = true })
      .on('tileerror', () => { if (!loaded && ++errors >= 4) cb.current.onTilesFailed?.() })
      .addTo(map)
    map.attributionControl.setPrefix(false)
    map.on('moveend', () => { const c = map.getCenter(); cb.current.onMove?.({ lat: c.lat, lng: c.lng }) })
    // The sheet animates in; Leaflet measured a container that was still moving.
    const fix = setTimeout(() => map.invalidateSize(), 350)
    return () => { clearTimeout(fix); map.remove() }
    // Mount once: the map owns its view from here, the parent only listens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="placemap">
    <div ref={el} className="placemap-map" />
    <Icon name="pin" className="placemap-pin" />
  </div>
}
