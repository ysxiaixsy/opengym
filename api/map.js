// Map tiles for the "set a place" map. Unset ⇒ the app uses OpenStreetMap's public tiles
// (frontend/src/lib/places.js DEFAULT_TILES). Self-hosters who'd rather not send map views to
// OSM, or who run their own tile server, point MAP_TILE_URL at it.
export function mapConfig(env = process.env) {
  const tileUrl = (env.MAP_TILE_URL || '').trim();
  if (!tileUrl) return null;
  return { tileUrl, attribution: (env.MAP_TILE_ATTRIBUTION || '').trim() };
}
