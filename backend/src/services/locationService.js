import { boundaryCollection } from '../data/regions.js';
const centreByLgaCode = new Map(boundaryCollection.features.map(feature => [
  `LGA${feature.properties.lgaCode}`,
  geometryCentre(feature.geometry),
]));

function ringArea(ring) {
  return ring.reduce((area, [x1, y1], index) => {
    const [x2, y2] = ring[(index + 1) % ring.length];
    return area + x1 * y2 - x2 * y1;
  }, 0) / 2;
}

function ringCentre(ring) {
  const area = ringArea(ring);
  if (Math.abs(area) < Number.EPSILON) {
    return ring.reduce(([longitude, latitude], [x, y]) => [longitude + x / ring.length, latitude + y / ring.length], [0, 0]);
  }
  const [longitudeTotal, latitudeTotal] = ring.reduce(([longitude, latitude], [x1, y1], index) => {
    const [x2, y2] = ring[(index + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    return [longitude + (x1 + x2) * cross, latitude + (y1 + y2) * cross];
  }, [0, 0]);
  return [longitudeTotal / (6 * area), latitudeTotal / (6 * area)];
}

function geometryCentre(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const largestExteriorRing = polygons
    .map(polygon => polygon[0])
    .sort((first, second) => Math.abs(ringArea(second)) - Math.abs(ringArea(first)))[0];
  return ringCentre(largestExteriorRing);
}

function distanceKm([longitude1, latitude1], [longitude2, latitude2]) {
  const toRadians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const firstLatitude = toRadians(latitude1);
  const secondLatitude = toRadians(latitude2);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function findLocationRegion(regions, location) {
  const normalisedLocation = location.trim().toLowerCase();
  return regions.find(region => {
    const fullName = region.name.toLowerCase();
    return normalisedLocation === fullName || normalisedLocation === fullName.replace('greater ', '');
  }) ?? null;
}

export function scoreRegionProximity(region, referenceRegion) {
  const regionCentre = centreByLgaCode.get(region.lgaCode);
  const referenceCentre = centreByLgaCode.get(referenceRegion.lgaCode);
  if (!regionCentre || !referenceCentre) return { distanceKm: null, score: 0 };
  const kilometres = distanceKm(regionCentre, referenceCentre);
  return {
    distanceKm: Math.round(kilometres),
    score: Math.round(100 * Math.exp(-kilometres / 200) * 100) / 100,
  };
}
