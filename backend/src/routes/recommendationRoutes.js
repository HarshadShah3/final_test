import { Router } from 'express';
import { regionalDataMeta } from '../data/regions.js';
import { recommendRegions, totalVictoriaRegions, validateRecommendationRequest } from '../services/recommendationService.js';

export const recommendationRouter = Router();

recommendationRouter.post('/', (request, response) => {
  const validation = validateRecommendationRequest(request.body);
  if (validation.errors.length) {
    return response.status(400).json({
      message: 'The recommendation request is invalid.',
      errors: validation.errors,
    });
  }

  const recommendations = recommendRegions(validation.value);
  const recommendationSourceIds = new Set(recommendations.flatMap(recommendation => (
    recommendation.priorityBreakdown.flatMap(priority => (
      priority.factors.flatMap(factor => factor.sourceIds)
    ))
  )));
  const recommendationSourceCatalog = Object.fromEntries([...recommendationSourceIds]
    .filter(sourceId => regionalDataMeta.sourceCatalog[sourceId])
    .map(sourceId => [sourceId, regionalDataMeta.sourceCatalog[sourceId]]));
  return response.json({
    data: recommendations,
    meta: {
      count: recommendations.length,
      totalAvailable: totalVictoriaRegions,
      resultLimit: validation.value.resultLimit,
      filters: {
        population: validation.value.population,
        housePrice: validation.value.housePrice,
      },
      stateScope: 'VIC',
      method: 'Transparent rule-based ranking with equal priority weights and geographic proximity',
      persistence: 'none',
      selectedPriorities: validation.value.priorities,
      priorityCount: validation.value.priorities.length,
      weightPerPriority: Math.round((100 / validation.value.priorities.length) * 100) / 100,
      overallWeightPerPriority: Math.round((70 / validation.value.priorities.length) * 100) / 100,
      locationWeightPercentage: 30,
      ranking: 'Each priority score is the equal-weight mean of its reported factor scores. Selected priorities share 70% of the final match score; geographic proximity to the selected Victorian area contributes 30%. Missing factor values receive a disclosed neutral score of 50.',
      outlookYear: 2036,
      dataIntegration: {
        ...regionalDataMeta,
        sourceCatalog: recommendationSourceCatalog,
      },
      limitations: [
        'All displayed profile metrics are assembled directly from Aiven MySQL source tables. Missing database values remain null and appear as unavailable.',
        'The latest verified regional projection horizon in the integrated data is 2036. The interface does not invent a 2050 forecast.',
        regionalDataMeta.geographicWarning,
        regionalDataMeta.periodWarning,
        'Geographic proximity to the selected regional area contributes 30% of the final score; all selected priorities share the remaining 70% equally.',
      ],
    },
  });
});
