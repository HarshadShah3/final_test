import { regionalProfiles } from '../data/regions.js';
import { findRegions } from './regionService.js';
import { findLocationRegion, scoreRegionProximity } from './locationService.js';

export const supportedPriorities = [
  'population',
  'housing',
  'jobs',
];
const supportedPopulationFilters = ['all', 'under10k', '10kTo20k', '20kTo30k', '30kTo50k', '50kTo100k', 'over100k'];
const supportedHousePriceFilters = ['all', 'under550k', '550kTo700k', 'over700k'];

const victoriaRegions = regionalProfiles.filter(region => region.state === 'VIC');
export const totalVictoriaRegions = victoriaRegions.length;
const locationWeight = 0.3;

export function validateRecommendationRequest(input) {
  const errors = [];
  const requestBody = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const priorities = Array.isArray(requestBody.priorities) ? requestBody.priorities : [];
  const location = typeof requestBody.location === 'string' ? requestBody.location.trim() : '';
  const resultLimit = requestBody.resultLimit ?? 4;
  const population = requestBody.population ?? 'all';
  const housePrice = requestBody.housePrice ?? 'all';

  if (!Array.isArray(requestBody.priorities)) {
    errors.push({ field: 'priorities', message: 'Priorities must be an array.' });
  } else {
    if (priorities.length < 1 || priorities.length > 3) {
      errors.push({ field: 'priorities', message: 'Choose between one and three priorities.' });
    }
    const unsupportedPriority = priorities.find(priority => !supportedPriorities.includes(priority));
    if (unsupportedPriority) {
      errors.push({ field: 'priorities', message: `Unsupported priority: ${unsupportedPriority}.` });
    }
    if (new Set(priorities).size !== priorities.length) {
      errors.push({ field: 'priorities', message: 'Each priority can only be selected once.' });
    }
  }

  if (location.length < 2 || location.length > 80) {
    errors.push({ field: 'location', message: 'Enter a regional area name between 2 and 80 characters.' });
  } else if (!findLocationRegion(victoriaRegions, location)) {
    errors.push({ field: 'location', message: 'Choose a Victorian regional area from the available regions.' });
  }
  if (resultLimit !== 'all' && (!Number.isInteger(resultLimit) || resultLimit < 1 || resultLimit > totalVictoriaRegions)) {
    errors.push({ field: 'resultLimit', message: `Result limit must be all or an integer between 1 and ${totalVictoriaRegions}.` });
  }
  if (!supportedPopulationFilters.includes(population)) {
    errors.push({ field: 'population', message: `Unsupported population filter: ${population}.` });
  }
  if (!supportedHousePriceFilters.includes(housePrice)) {
    errors.push({ field: 'housePrice', message: `Unsupported house price filter: ${housePrice}.` });
  }

  return {
    errors,
    value: { priorities, location, resultLimit, population, housePrice },
  };
}

function scaleScore(region, metric, higherIsBetter = true) {
  const values = victoriaRegions.map(metric).filter(Number.isFinite);
  const value = metric(region);
  if (!Number.isFinite(value) || !values.length) return 50;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (maximum === minimum) return 50;
  const score = ((value - minimum) / (maximum - minimum)) * 100;
  return higherIsBetter ? score : 100 - score;
}

function average(...values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value);
}

function scoreFactors(region, definitions) {
  return definitions.map(({ key, label, sourceFields, metric, higherIsBetter = true }) => {
    const value = metric(region);
    return {
      key,
      label,
      value: Number.isFinite(value) ? value : null,
      score: scaleScore(region, metric, higherIsBetter),
      weight: 1 / definitions.length,
      weightPercentage: Math.round(10000 / definitions.length) / 100,
      neutralFallback: !Number.isFinite(value),
      sourceFields,
      sourceIds: [...new Set(sourceFields
        .map(field => region.dataProvenance?.fieldSources?.[field])
        .filter(Boolean))],
    };
  });
}

function scorePriority(region, priority) {
  switch (priority) {
    case 'population': {
      const projectedGrowth = Number.isFinite(region.projectedPopulation) && Number.isFinite(region.population) && region.population > 0
        ? ((region.projectedPopulation - region.population) / region.population) * 100
        : null;
      const factors = scoreFactors(region, [
        { key: 'population', label: 'Current population', sourceFields: ['population'], metric: item => item.population },
        { key: 'populationGrowth', label: 'Recent annual population growth', sourceFields: ['populationGrowth'], metric: item => item.populationGrowth },
        { key: 'projectedGrowth', label: 'Growth to the reviewed projection year', sourceFields: ['population', 'projectedPopulation'], metric: item => Number.isFinite(item.projectedPopulation) && item.population > 0
          ? ((item.projectedPopulation - item.population) / item.population) * 100
          : null },
      ]);
      return {
        score: average(...factors.map(factor => factor.score)),
        factors,
        reason: `${region.name} has ${region.population.toLocaleString('en-AU')} residents, ${region.populationGrowth}% recent annual growth and ${Number.isFinite(projectedGrowth) ? `${projectedGrowth.toFixed(1)}%` : 'no available'} projected growth to ${region.projectionYear}.`,
      };
    }
    case 'jobs': {
      const factors = scoreFactors(region, [
        { key: 'occupationVacancies', label: 'Advertised occupation vacancies', sourceFields: ['occupationVacancies'], metric: item => item.occupationVacancies },
        { key: 'employmentGrowth', label: 'Annual employment growth', sourceFields: ['employmentGrowth'], metric: item => item.employmentGrowth },
      ]);
      return {
        score: average(...factors.map(factor => factor.score)),
        factors,
        reason: `${region.vacancyGeography.name} recorded ${region.occupationVacancies.toLocaleString('en-AU')} advertised vacancies, while ${region.employmentGeography.name} SA4 recorded ${region.employmentGrowth}% annual employment growth.`,
      };
    }
    case 'housing': {
      const buyAvailable = Number.isFinite(region.medianHousePrice);
      const factors = scoreFactors(region, [
        { key: 'medianRent', label: 'Median weekly rent', sourceFields: ['medianRent'], metric: item => item.medianRent, higherIsBetter: false },
        ...(buyAvailable ? [{ key: 'medianHousePrice', label: 'Reviewed median house price', sourceFields: ['medianHousePrice'], metric: item => item.medianHousePrice, higherIsBetter: false }] : []),
      ]);
      return {
        score: average(...factors.map(factor => factor.score)),
        factors,
        reason: buyAvailable
          ? `Aiven MySQL reports median rent of ${formatMoney(region.medianRent)} per week and a median house price of ${formatMoney(region.medianHousePrice)}.`
          : `Aiven MySQL reports median rent of ${formatMoney(region.medianRent)} per week for ${region.referencePeriods.rentQuarter}; no verified house price is available.`,
      };
    }
    default:
      return { score: 0, scored: false, reason: 'This preference is not yet supported.' };
  }
}

function matchStrength(score) {
  if (score >= 75) return 'Strong match';
  if (score >= 55) return 'Good match';
  return 'Worth exploring';
}

export function recommendRegions({ priorities, location, resultLimit = 4, population = 'all', housePrice = 'all' }) {
  const candidateRegions = findRegions({ state: 'VIC', population, housePrice });
  const referenceRegion = findLocationRegion(victoriaRegions, location);
  const weight = 1 / priorities.length;
  const priorityRankings = Object.fromEntries(priorities.map(priority => {
    const rankedRegions = candidateRegions
      .map(region => ({ region, ...scorePriority(region, priority) }))
      .sort((first, second) => second.score - first.score || first.region.name.localeCompare(second.region.name));

    return [priority, Object.fromEntries(rankedRegions.map((result, index) => [
      result.region.id,
      {
        score: Math.round(result.score * 100) / 100,
        rank: result.scored === false ? null : index + 1,
        scored: result.scored !== false,
        reason: result.reason,
        factors: result.factors ?? [],
      },
    ]))];
  }));

  const rankedRecommendations = candidateRegions
    .map(region => {
      const locationResult = referenceRegion ? scoreRegionProximity(region, referenceRegion) : null;
      const priorityShare = locationResult ? 1 - locationWeight : 1;
      const priorityBreakdown = priorities.map(priority => {
        const ranking = priorityRankings[priority][region.id];
        return {
          priority,
          weight,
          weightPercentage: Math.round(weight * 10000) / 100,
          overallWeightPercentage: Math.round(weight * priorityShare * 10000) / 100,
          ...ranking,
          factors: ranking.factors?.map(factor => ({
            ...factor,
            overallWeightPercentage: Math.round(factor.weight * weight * priorityShare * 10000) / 100,
          })) ?? [],
        };
      });
      const priorityScore = average(...priorityBreakdown.map(result => result.score));
      const hasScoredPriority = priorityBreakdown.some(result => result.scored);
      const score = hasScoredPriority
        ? Math.round(locationResult
          ? priorityScore * (1 - locationWeight) + locationResult.score * locationWeight
          : priorityScore)
        : null;
      const reasons = priorityBreakdown.map(result => result.reason);
      if (locationResult) reasons.unshift(`${region.name} is approximately ${locationResult.distanceKm} km from ${referenceRegion.name}, based on LGA geographic centres.`);
      return {
        region,
        matchScore: score,
        priorityMatchScore: Math.round(priorityScore),
        matchStrength: score === null ? 'Not ranked' : matchStrength(score),
        priorityCount: priorities.length,
        priorityBreakdown,
        locationAdjustment: {
          applied: Boolean(locationResult),
          referenceRegion: referenceRegion?.name ?? null,
          distanceKm: locationResult?.distanceKm ?? null,
          proximityScore: locationResult?.score ?? null,
          weightPercentage: locationResult ? locationWeight * 100 : 0,
          reason: locationResult
            ? `Geographic proximity to ${referenceRegion.name} contributes ${locationWeight * 100}% of the final score.`
            : 'No matching reference region was available for geographic proximity scoring.',
        },
        outlook: {
          projectionYear: region.projectionYear,
          projectedPopulation: region.projectedPopulation,
          projectedHouseholds: region.projectedHouseholds,
          projectedDwellings: region.projectedDwellings,
        },
        reasons: reasons.slice(0, 4),
      };
    })
    .sort((first, second) => {
      if (first.matchScore === null && second.matchScore !== null) return 1;
      if (first.matchScore !== null && second.matchScore === null) return -1;
      return (second.matchScore ?? 0) - (first.matchScore ?? 0) || first.region.name.localeCompare(second.region.name);
    });

  return resultLimit === 'all' ? rankedRecommendations : rankedRecommendations.slice(0, resultLimit);
}
