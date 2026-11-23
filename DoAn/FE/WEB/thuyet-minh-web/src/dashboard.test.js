import { describe, expect, it } from 'vitest';

import { getTopSitesData } from './dashboard.js';

describe('Dashboard top sites', () => {
  it('marks rankings unavailable when listen statistics are unavailable', () => {
    expect(getTopSitesData([{ code: 'site-a', name: 'Site A' }], null)).toBeNull();
  });

  it('shows zero counts only when the API returned successful empty statistics', () => {
    expect(getTopSitesData(
      [{ code: 'site-a', name: 'Site A' }],
      { total: 0, top_sites: [] },
    )).toEqual([
      {
        id: 'site-a',
        title: 'Site A',
        listens: 0,
        tone: 'orange',
      },
    ]);
  });
});
