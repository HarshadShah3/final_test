import { regionalProfiles } from '../data/regions.js';

export function findRegions({ search = '', state = '', population = 'all', housePrice = 'all' }) {
  const normalisedSearch = search.trim().toLowerCase();
  const populationRanges = {
    all: () => true,
    under10k: value => value < 10000,
    '10kTo20k': value => value >= 10000 && value < 20000,
    '20kTo30k': value => value >= 20000 && value < 30000,
    '30kTo50k': value => value >= 30000 && value < 50000,
    '50kTo100k': value => value >= 50000 && value < 100000,
    over100k: value => value >= 100000,
    '10kTo50k': value => value >= 10000 && value < 50000,
    over50k: value => value >= 50000,
    small: value => value < 100000,
    large: value => value >= 100000,
  };
  const housePriceRanges = {
    all: () => true,
    under550k: value => Number.isFinite(value) && value < 550000,
    '550kTo700k': value => Number.isFinite(value) && value >= 550000 && value < 700000,
    over700k: value => Number.isFinite(value) && value >= 700000,
  };
  return regionalProfiles.filter(region => {
    const matchesSearch = `${region.name} ${region.postcode}`.toLowerCase().includes(normalisedSearch);
    const matchesState = !state || region.state === state.toUpperCase();
    const matchesPopulation = (populationRanges[population] ?? populationRanges.all)(region.population);
    const matchesHousePrice = (housePriceRanges[housePrice] ?? housePriceRanges.all)(region.medianHousePrice);
    return matchesSearch && matchesState && matchesPopulation && matchesHousePrice;
  });
}

export function findRegionById(regionId) {
  return regionalProfiles.find(region => region.id === regionId);
}
