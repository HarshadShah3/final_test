import { Router } from 'express';
import { regionalDataMeta } from '../data/regions.js';
import { findRegionById, findRegions } from '../services/regionService.js';
export const regionRouter = Router();
regionRouter.get('/', (request, response) => {
  const regions = findRegions(request.query);
  response.json({
    data: regions,
    meta: {
      count: regions.length,
      profileDelivery: regionalDataMeta.profileDelivery,
      sourceCatalog: regionalDataMeta.sourceCatalog,
    },
  });
});
regionRouter.get('/:regionId', (request, response) => {
  const region = findRegionById(request.params.regionId);
  if (!region) return response.status(404).json({ message: 'Regional profile not found.' });
  response.json({
    data: region,
    meta: {
      profileDelivery: regionalDataMeta.profileDelivery,
      sourceCatalog: regionalDataMeta.sourceCatalog,
    },
  });
});
