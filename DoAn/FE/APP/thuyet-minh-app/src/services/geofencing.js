const DEFAULT_GEOFENCE_RADIUS_METERS = 100;
const GEOFENCE_SWITCH_MARGIN_METERS = 15;

export function getSiteGeofenceRadius(site) {
  const radius = Number(site?.radius ?? site?.geofence_radius ?? DEFAULT_GEOFENCE_RADIUS_METERS);
  return Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_GEOFENCE_RADIUS_METERS;
}

function validCoordinate(value, minimum, maximum) {
  if (value == null || value === '') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

export function findGeofenceSite(sitesToCheck, location, activeSiteId) {
  const latitude = validCoordinate(location?.latitude, -90, 90);
  const longitude = validCoordinate(location?.longitude, -180, 180);
  if (latitude == null || longitude == null) return { valid: false, site: null };

  const measuredSites = sitesToCheck
    .map((site) => {
      const siteLatitude = validCoordinate(site?.latitude, -90, 90);
      const siteLongitude = validCoordinate(site?.longitude, -180, 180);
      if (siteLatitude == null || siteLongitude == null || site?.id == null) return null;
      const distance = calculateDistance(latitude, longitude, siteLatitude, siteLongitude);
      return { site, distance, radius: getSiteGeofenceRadius(site) };
    })
    .filter(Boolean)
    .sort((left, right) => left.distance - right.distance);
  const candidates = measuredSites.filter(({ distance, radius }) => distance <= radius);

  if (candidates.length === 0) {
    const active = measuredSites.find(({ site }) => site.id === activeSiteId);
    return {
      valid: true,
      site: active && active.distance <= active.radius + GEOFENCE_SWITCH_MARGIN_METERS
        ? active.site
        : null,
    };
  }

  const nearest = candidates[0];
  const active = candidates.find(({ site }) => site.id === activeSiteId);
  const selected = active && active.site.id !== nearest.site.id
    && active.distance - nearest.distance <= GEOFENCE_SWITCH_MARGIN_METERS
    ? active
    : nearest;
  return { valid: true, site: selected.site };
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(value))) return 99999;
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad)
    * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
