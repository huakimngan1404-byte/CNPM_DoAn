export function getTopSitesData(sites, listenStats) {
  if (listenStats === null) return null;

  const listenCountsBySite = new Map(
    (listenStats.top_sites ?? []).map((site) => [site.site_code, site.count]),
  );
  return sites
    .map((site) => ({
      id: site.code || site.id || site.name,
      title: site.name,
      listens: listenCountsBySite.get(site.code) ?? 0,
    }))
    .sort((first, second) => second.listens - first.listens)
    .map((site, index) => ({
      ...site,
      tone: ['orange', 'blue', 'green', 'violet'][index % 4],
    }));
}
