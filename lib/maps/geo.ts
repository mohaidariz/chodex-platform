/**
 * Lightweight geo helpers used by the field view: haversine distance and
 * nearest-point computation for line segments.
 */

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points, in meters.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Distance from a point to a line segment in meters.
 * Uses a planar approximation around the test point — fine for distances
 * under a few kilometers, which is all we ever check on a single map page.
 */
export function pointToSegmentMeters(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  // Convert all coords to local meters around the test point. Using the
  // small-angle approximation, 1 deg lat ≈ 111_320 m, 1 deg lng ≈
  // 111_320 * cos(lat) m.
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(toRad(pLat));

  const px = 0;
  const py = 0;
  const ax = (aLng - pLng) * mPerDegLng;
  const ay = (aLat - pLat) * mPerDegLat;
  const bx = (bLng - pLng) * mPerDegLng;
  const by = (bLat - pLat) * mPerDegLat;

  const abx = bx - ax;
  const aby = by - ay;
  const denom = abx * abx + aby * aby;
  let t = denom > 0 ? ((px - ax) * abx + (py - ay) * aby) / denom : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}
