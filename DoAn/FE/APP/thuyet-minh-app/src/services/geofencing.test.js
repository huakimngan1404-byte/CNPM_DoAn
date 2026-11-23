import { describe, expect, it } from 'vitest';
import { findGeofenceSite, getSiteGeofenceRadius } from './geofencing.js';

const sites = [
  { id: 'a', latitude: 0, longitude: 0, radius: 100 },
  { id: 'b', latitude: 0, longitude: 0.0005, radius: 100 },
];

describe('geofence site selection', () => {
  it('recognizes the nearest site on the initial location, including overlapping zones', () => {
    const result = findGeofenceSite(sites, { latitude: 0, longitude: 0.00049 }, null);

    expect(result.valid).toBe(true);
    expect(result.site.id).toBe('b');
  });

  it('switches to another site after it becomes clearly nearer', () => {
    const result = findGeofenceSite(sites, { latitude: 0, longitude: 0.00042 }, 'a');

    expect(result.site.id).toBe('b');
  });

  it('retains the active site while GPS drifts near a boundary or within the switch margin', () => {
    const nearOverlap = findGeofenceSite(sites, { latitude: 0, longitude: 0.00026 }, 'a');
    const site = [{ id: 'a', latitude: 0, longitude: 0, radius: 50 }];
    const boundaryDrift = findGeofenceSite(
      site,
      { latitude: 0, longitude: 50.5 / 111194.9 },
      'a'
    );
    const leftZone = findGeofenceSite(
      site,
      { latitude: 0, longitude: 66 / 111194.9 },
      'a'
    );

    expect(nearOverlap.site.id).toBe('a');
    expect(boundaryDrift.site.id).toBe('a');
    expect(leftZone.site).toBeNull();
  });

  it('uses a 100-meter default for invalid site radii and rejects invalid GPS coordinates', () => {
    expect(getSiteGeofenceRadius({ radius: 0 })).toBe(100);
    expect(getSiteGeofenceRadius({ radius: 'not-a-radius' })).toBe(100);
    expect(findGeofenceSite(sites, { latitude: 91, longitude: 0 }, null))
      .toEqual({ valid: false, site: null });
  });
});
