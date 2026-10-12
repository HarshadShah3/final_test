/** Shared, display-only classification for the reviewed profile projection. */
export function classifyPopulationOutlook(baseline, projected) {
  if (!Number.isFinite(baseline) || baseline <= 0 || !Number.isFinite(projected)) return null;
  const growthPercent = ((projected - baseline) / baseline) * 100;
  const growthBand = growthPercent >= 20
    ? 'High growth'
    : growthPercent >= 5
      ? 'Moderate growth'
      : 'Stable or declining';
  return { growthPercent, growthBand };
}
