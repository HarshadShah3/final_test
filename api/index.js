import { releaseInfo } from '../backend/src/releaseInfo.js';
import {
  clearAccessCookie,
  createAccessCookie,
  createAccessToken,
  hasValidAccess,
  isAccessConfigured,
  isPasswordValid,
} from '../backend/src/accessControl.js';

let servicesPromise;

const apiSecurityHeaders = {
  'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'cross-origin',
  'origin-agent-cluster': '?1',
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-dns-prefetch-control': 'off',
  'x-download-options': 'noopen',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
  'x-xss-protection': '0',
};

function loadServices() {
  servicesPromise ??= Promise.all([
    import('../backend/src/data/regions.js'),
    import('../backend/src/services/mapService.js'),
    import('../backend/src/services/recommendationService.js'),
    import('../backend/src/services/regionService.js'),
    import('../backend/src/services/forecastService.js'),
    import('../backend/src/database/aivenClient.js'),
  ]).then(([regionData, mapService, recommendationService, regionService, forecastService, aivenClient]) => ({
    ...regionData,
    ...mapService,
    ...recommendationService,
    ...regionService,
    ...forecastService,
    ...aivenClient,
  }));
  return servicesPromise;
}

function json(data, status = 200, contentType = 'application/json; charset=utf-8', headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...apiSecurityHeaders, 'content-type': contentType, ...headers },
  });
}

function dataSources(services) {
  return {
    data: {
      ...services.regionalDataMeta,
      referencePeriods: services.regionalProfiles.map(region => ({
        id: region.id,
        name: region.name,
        ...region.referencePeriods,
      })),
      availability: services.regionalProfiles.map(region => ({
        id: region.id,
        name: region.name,
        ...region.dataAvailability,
      })),
    },
  };
}

function recommendationResponse(services, input) {
  const validation = services.validateRecommendationRequest(input);
  if (validation.errors.length) {
    return json({
      message: 'The recommendation request is invalid.',
      errors: validation.errors,
    }, 400);
  }

  const recommendations = services.recommendRegions(validation.value);
  const recommendationSourceIds = new Set(recommendations.flatMap(recommendation => (
    recommendation.priorityBreakdown.flatMap(priority => (
      priority.factors.flatMap(factor => factor.sourceIds)
    ))
  )));
  const recommendationSourceCatalog = Object.fromEntries([...recommendationSourceIds]
    .filter(sourceId => services.regionalDataMeta.sourceCatalog[sourceId])
    .map(sourceId => [sourceId, services.regionalDataMeta.sourceCatalog[sourceId]]));
  return json({
    data: recommendations,
    meta: {
      count: recommendations.length,
      totalAvailable: services.totalVictoriaRegions,
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
        ...services.regionalDataMeta,
        sourceCatalog: recommendationSourceCatalog,
      },
      limitations: [
        'All displayed profile metrics are assembled directly from Aiven MySQL source tables. Missing database values remain null and appear as unavailable.',
        'The latest verified regional projection horizon in the integrated data is 2036. The interface does not invent a 2050 forecast.',
        services.regionalDataMeta.geographicWarning,
        services.regionalDataMeta.periodWarning,
        'Geographic proximity to the selected regional area contributes 30% of the final score; all selected priorities share the remaining 70% equally.',
      ],
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return json({ status: 'ok', ...releaseInfo });
      }

      if (request.method === 'GET' && url.pathname === '/api/auth/status') {
        if (!isAccessConfigured()) {
          return json({ authenticated: false, message: 'Site access is not configured.' }, 503);
        }
        return json({ authenticated: hasValidAccess(request.headers.get('cookie')) });
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        if (!isAccessConfigured()) {
          return json({ authenticated: false, message: 'Site access is not configured.' }, 503);
        }
        const body = await request.json().catch(() => ({}));
        if (!isPasswordValid(body.password)) {
          return json({ authenticated: false, message: 'Incorrect password.' }, 401);
        }
        return json(
          { authenticated: true },
          200,
          'application/json; charset=utf-8',
          { 'set-cookie': createAccessCookie(createAccessToken(), url.protocol === 'https:') },
        );
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        return json(
          { authenticated: false },
          200,
          'application/json; charset=utf-8',
          { 'set-cookie': clearAccessCookie(url.protocol === 'https:') },
        );
      }

      if (!hasValidAccess(request.headers.get('cookie'))) {
        return json({ message: 'Password required.' }, 401);
      }

      const services = await loadServices();

      if (request.method === 'GET' && url.pathname === '/api/data-sources') {
        return json(dataSources(services));
      }

      if (request.method === 'GET' && url.pathname === '/api/forecasts/health') {
        try {
          const health = await services.getAivenHealth();
          return json(health, health.connected ? 200 : 503);
        } catch (error) {
          if (error instanceof services.DatabaseUnavailableError) {
            return json({ configured: true, connected: false, message: error.message }, 503);
          }
          throw error;
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/forecasts/regions') {
        try {
          return json(await services.getRegionalForecasts(url.searchParams.get('regionIds')));
        } catch (error) {
          if (error instanceof services.ForecastRequestError) {
            return json({ message: error.message }, 400);
          }
          if (error instanceof services.DatabaseUnavailableError) {
            return json({ message: error.message }, 503);
          }
          throw error;
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/regions') {
        const regions = services.findRegions(Object.fromEntries(url.searchParams));
        return json({
          data: regions,
          meta: {
            count: regions.length,
            profileDelivery: services.regionalDataMeta.profileDelivery,
            sourceCatalog: services.regionalDataMeta.sourceCatalog,
          },
        });
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/regions/')) {
        const regionId = decodeURIComponent(url.pathname.slice('/api/regions/'.length));
        const region = services.findRegionById(regionId);
        return region
          ? json({
            data: region,
            meta: {
              profileDelivery: services.regionalDataMeta.profileDelivery,
              sourceCatalog: services.regionalDataMeta.sourceCatalog,
            },
          })
          : json({ message: 'Regional profile not found.' }, 404);
      }

      if (request.method === 'GET' && url.pathname === '/api/map/regions') {
        const metric = url.searchParams.get('metric') ?? 'population';
        if (!services.supportedMapMetrics[metric]) {
          return json({
            message: `Unsupported map metric: ${metric}.`,
            supportedMetrics: Object.keys(services.supportedMapMetrics),
          }, 400);
        }
        return json(services.getMapRegions({
          regionIds: url.searchParams.get('regionIds') ?? '',
          metric,
        }), 200, 'application/geo+json; charset=utf-8');
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/map/regions/')) {
        const metric = url.searchParams.get('metric') ?? 'population';
        if (!services.supportedMapMetrics[metric]) {
          return json({
            message: `Unsupported map metric: ${metric}.`,
            supportedMetrics: Object.keys(services.supportedMapMetrics),
          }, 400);
        }
        const regionId = decodeURIComponent(url.pathname.slice('/api/map/regions/'.length));
        const feature = services.getMapRegion(regionId, metric);
        return feature
          ? json(feature, 200, 'application/geo+json; charset=utf-8')
          : json({ message: 'Map region not found.' }, 404);
      }

      if (request.method === 'POST' && url.pathname === '/api/recommendations') {
        return recommendationResponse(services, await request.json());
      }

      return json({ message: 'API route not found.' }, 404);
    } catch {
      return json({ message: 'Internal server error.' }, 500);
    }
  },
};
