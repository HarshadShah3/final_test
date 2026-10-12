import { Router } from 'express';
import { regionalDataMeta, regionalProfiles } from '../data/regions.js';

export const dataSourceRouter = Router();

dataSourceRouter.get('/', (_request, response) => {
  response.json({
    data: {
      ...regionalDataMeta,
      referencePeriods: regionalProfiles.map(region => ({
        id: region.id,
        name: region.name,
        ...region.referencePeriods,
      })),
      availability: regionalProfiles.map(region => ({
        id: region.id,
        name: region.name,
        ...region.dataAvailability,
      })),
    },
  });
});
