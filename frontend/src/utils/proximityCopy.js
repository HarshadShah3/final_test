const nearbyDistanceKm = 50;
const moderateDistanceKm = 150;

/** Converts the recommendation distance into plain-language guidance for the profile. */
export function describeRegionProximity(locationAdjustment) {
  const rawDistance = locationAdjustment?.distanceKm;
  const distance = rawDistance === null || rawDistance === undefined || rawDistance === ''
    ? Number.NaN
    : Number(rawDistance);
  if (!Number.isFinite(distance) || distance < 0) {
    return 'The distance from your starting region is not available.';
  }

  if (distance === 0) {
    return 'This is the region you entered as your starting point.';
  }

  const referenceRegion = typeof locationAdjustment?.referenceRegion === 'string'
    && locationAdjustment.referenceRegion.trim()
    ? locationAdjustment.referenceRegion.trim()
    : 'your starting region';
  const roundedDistance = Math.round(distance);

  if (distance <= nearbyDistanceKm) {
    return `This region is close to ${referenceRegion}, approximately ${roundedDistance} km away.`;
  }

  if (distance <= moderateDistanceKm) {
    return `This region is a moderate distance from ${referenceRegion}, approximately ${roundedDistance} km away.`;
  }

  return `This region is far from ${referenceRegion}, approximately ${roundedDistance} km away.`;
}
