import { Router } from 'express';
import { getMapRegion, getMapRegions, supportedMapMetrics } from '../services/mapService.js';

export const mapRouter = Router();

function validMetric(request, response) {
  const metric = request.query.metric ?? 'population';
  if (!supportedMapMetrics[metric]) {
    response.status(400).json({
      message: `Unsupported map metric: ${metric}.`,
      supportedMetrics: Object.keys(supportedMapMetrics),
    });
    return null;
  }
  return metric;
}

mapRouter.get('/regions', (request, response) => {
  const metric = validMetric(request, response);
  if (!metric) return;
  response.type('application/geo+json').json(getMapRegions({ regionIds: request.query.regionIds, metric }));
});

mapRouter.get('/regions/:regionId', (request, response) => {
  const metric = validMetric(request, response);
  if (!metric) return;
  const feature = getMapRegion(request.params.regionId, metric);
  if (!feature) return response.status(404).json({ message: 'Map region not found.' });
  response.type('application/geo+json').json(feature);
});
