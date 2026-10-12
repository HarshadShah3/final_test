import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import Filters from '../components/Filters';
import RegionalMap from '../components/RegionalMap';
import SelectedRegionCard from '../components/SelectedRegionCard';
import { usePreferences } from '../context/PreferenceContext';
import { useRegionSelection } from '../context/RegionSelectionContext';
import { housePriceOptions, populationOptions, priorityLabels } from '../data/preferenceOptions';
import { fetchMapRegions, fetchPriorityRecommendations } from '../services/regionApi';

const priorityMetrics = {
  population: 'population',
  housing: 'medianRent',
  jobs: 'jobVacancies',
};

const populationLabels = Object.fromEntries(populationOptions);
const housePriceLabels = Object.fromEntries(housePriceOptions);

/* Derives the initial population, housing, priority, and sort filters from submitted preferences before draft editing begins. */
function createDefaultFilters(preferences) {
  return {
    population: preferences.population ?? 'all',
    housePrice: preferences.housePrice ?? 'all',
    priority: preferences.priorities[0] ?? '',
    sortDirection: 'highToLow',
  };
}

/* Applies explicit lower and upper population boundaries so every regional value belongs to a predictable filter range. */
function matchesPopulation(population, range) {
  const ranges = {
    all: () => true,
    under10k: value => value < 10000,
    '10kTo20k': value => value >= 10000 && value < 20000,
    '20kTo30k': value => value >= 20000 && value < 30000,
    '30kTo50k': value => value >= 30000 && value < 50000,
    '50kTo100k': value => value >= 50000 && value < 100000,
    over100k: value => value >= 100000,
  };
  return (ranges[range] ?? ranges.all)(population);
}

/* Applies the selected house-price interval only to finite values so missing prices never pass as zero-cost housing. */
function matchesHousePrice(housePrice, range) {
  if (range === 'all') return true;
  if (!Number.isFinite(housePrice)) return false;
  const ranges = {
    under550k: value => value < 550000,
    '550kTo700k': value => value >= 550000 && value < 700000,
    over700k: value => value >= 700000,
  };
  return (ranges[range] ?? (() => true))(housePrice);
}

/* Requests map and recommendation data together, filters the eligible top four, and coordinates selection, source notes, and retry states. */
export default function ExplorePage() {
  const { preferences } = usePreferences();
  const { selectedRegionId, setSelectedRegionId } = useRegionSelection();
  const selectedPriorities = preferences.priorities;
  const selectedPrioritiesKey = selectedPriorities.join('|');
  const hasPreferences = selectedPriorities.length > 0 && preferences.location.length > 0;
  const initialFilters = useMemo(
    () => createDefaultFilters(preferences),
    [selectedPrioritiesKey, preferences.population, preferences.housePrice],
  );
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [mapCollection, setMapCollection] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [requestStatus, setRequestStatus] = useState('loading');
  const [serviceNote, setServiceNote] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const selectedRegionCardRef = useRef(null);
  const filterButtonRef = useRef(null);

  const mapMetric = priorityMetrics[appliedFilters.priority] ?? 'population';

  useEffect(() => {
    const requestController = new AbortController();
    setRequestStatus('loading');
    setServiceNote('');
    setSelectedRegionId(null);
    const recommendationRequest = selectedPriorities.length && preferences.location
      ? fetchPriorityRecommendations({
        priorities: selectedPriorities,
        location: preferences.location,
        population: appliedFilters.population,
        housePrice: appliedFilters.housePrice,
      }, requestController.signal)
      : Promise.resolve({ data: [], meta: null });

    Promise.all([
      fetchMapRegions({ metric: mapMetric }, requestController.signal),
      recommendationRequest,
    ])
      .then(([mapResponse, recommendationResponse]) => {
        setMapCollection(mapResponse);
        setRecommendations(recommendationResponse.data);
        const recommendationSources = Object.values(recommendationResponse.meta?.dataIntegration?.sourceCatalog ?? {})
          .map(source => source.label);
        const notes = [
          mapResponse.metadata?.note,
          recommendationResponse.meta ? 'Highlighted regions reflect your selected priorities and starting area.' : '',
          recommendationSources.length ? `Recommendation data sources: ${recommendationSources.join(' + ')}.` : '',
        ].filter(Boolean);
        setServiceNote(notes.join(' '));
        setRequestStatus('success');
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setServiceNote('');
          setRequestStatus('error');
        }
      });
    return () => requestController.abort();
  }, [selectedPrioritiesKey, appliedFilters.population, appliedFilters.housePrice, mapMetric, preferences.location, requestVersion]);

  const eligibleRegionIds = useMemo(() => new Set((mapCollection?.features ?? [])
    .filter(feature => (
      matchesPopulation(feature.properties.population, appliedFilters.population)
      && matchesHousePrice(feature.properties.medianHousePrice, appliedFilters.housePrice)
    ))
    .map(feature => feature.id)), [mapCollection, appliedFilters.population, appliedFilters.housePrice]);

  const inputRegion = useMemo(() => {
    const normalisedLocation = preferences.location.trim().toLowerCase();
    if (!normalisedLocation) return null;
    return mapCollection?.features.find(feature => (
      feature.properties.name.trim().toLowerCase() === normalisedLocation
    )) ?? null;
  }, [mapCollection, preferences.location]);

  const highlightedRecommendations = useMemo(() => recommendations
    .filter(recommendation => (
      eligibleRegionIds.has(recommendation.region.id)
      && recommendation.region.id !== inputRegion?.id
    ))
    .slice(0, 4)
    .map((recommendation, index) => ({
      id: recommendation.region.id,
      name: recommendation.region.name,
      score: recommendation.matchScore,
      rank: index + 1,
    })), [recommendations, eligibleRegionIds, inputRegion]);

  const orderedRecommendations = useMemo(() => (
    appliedFilters.sortDirection === 'lowToHigh'
      ? [...highlightedRecommendations].reverse()
      : highlightedRecommendations
  ), [highlightedRecommendations, appliedFilters.sortDirection]);

  const selectedFeature = mapCollection?.features.find(feature => feature.id === selectedRegionId) ?? null;
  const selectedRecommendation = recommendations.find(recommendation => (
    recommendation.region.id === selectedRegionId
  )) ?? null;

  const selectedPriorityLabel = priorityLabels[appliedFilters.priority] ?? 'Choose a priority';

  useEffect(() => {
    if (!selectedRegionId || !window.matchMedia('(max-width: 760px)').matches) return undefined;

    const animationFrame = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      selectedRegionCardRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedRegionId]);

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setSelectedRegionId(null);
  }

  function clearFilters() {
    const clearedFilters = createDefaultFilters({ ...preferences, population: 'all', housePrice: 'all' });
    setDraftFilters(clearedFilters);
    setAppliedFilters(clearedFilters);
    setSelectedRegionId(null);
  }

  const closeFilters = useCallback(() => {
    setIsFilterOpen(false);
    window.requestAnimationFrame(() => filterButtonRef.current?.focus());
  }, []);

  return (
    <section className="page-shell explore-page">
      <div className="mobile-back-navigation">
        <Link className="back-link" to="/preferences">&larr; Back to preferences</Link>
      </div>
      <div className="page-heading">
        <p className="eyebrow">FIND YOUR REGION</p>
        <h1>Find a Victorian region that fits your priorities</h1>
        <p>Compare the four regions that best match your preferences. Select a highlighted area to review its match, open the full profile, or save it for comparison. Your starting region remains visible for context.</p>
      </div>

      {hasPreferences ? (
        <section className="preference-summary" aria-label="Your saved preferences">
          <div><small>Regional area</small><strong>{preferences.location}</strong></div>
          <div className="summary-priorities">
            <small>Priorities and filters</small>
            <p>{selectedPriorities.map(priority => priorityLabels[priority]).join(' · ')}</p>
            <p>{populationLabels[appliedFilters.population]} · {housePriceLabels[appliedFilters.housePrice]}</p>
          </div>
          <Link to="/preferences">Change preferences</Link>
        </section>
      ) : (
        <section className="preference-invitation">
          <div><strong>Choose priorities to control the map display.</strong><p>Your answers stay in memory and disappear when the page refreshes.</p></div>
          <Link className="button primary" to="/preferences">Choose my priorities</Link>
        </section>
      )}

      <div className="explore-layout map-explore-layout">
        <section className="map-section card" aria-live="polite">
          <div className="map-section-heading">
            <div><h2>Victoria recommendation map</h2><p>{eligibleRegionIds.size} of {mapCollection?.features.length ?? 0} regions match · {highlightedRecommendations.length} recommended areas + your region highlighted</p></div>
            <div className="map-heading-actions">
              <span>Map ranking: {selectedPriorityLabel}</span>
              <button ref={filterButtonRef} className="filter-trigger" type="button" aria-haspopup="dialog" aria-expanded={isFilterOpen} onClick={() => setIsFilterOpen(true)}>
                <SlidersHorizontal aria-hidden="true" size={16}/>
                Filters
              </button>
            </div>
          </div>
          {highlightedRecommendations.length > 0 && <p className="map-score-note">Select a highlighted region on the map to view its details and match factors. Match percentages are relative rule-based scores, not probabilities or guarantees.</p>}
          {requestStatus === 'loading' && <p className="map-status">Loading regional map…</p>}
          {requestStatus === 'error' ? (
            <div className="map-error-state" role="alert">
              <h3>Regional map could not be loaded</h3>
              <p>The regional data service did not respond. Try again or adjust your preferences.</p>
              <div>
                <button className="button primary" type="button" onClick={() => setRequestVersion(current => current + 1)}>
                  <RotateCcw aria-hidden="true" size={15}/>
                  Retry
                </button>
                <Link className="button secondary" to="/preferences">Change preferences</Link>
              </div>
            </div>
          ) : (
            <div className="map-and-detail">
              <RegionalMap
                featureCollection={mapCollection}
                rankedRegions={highlightedRecommendations}
                orderedRecommendations={orderedRecommendations}
                priority={appliedFilters.priority}
                priorityLabel={selectedPriorityLabel}
                sortDirection={appliedFilters.sortDirection}
                inputRegion={inputRegion}
                selectedRegionId={selectedRegionId}
                onSelect={regionId => setSelectedRegionId(currentRegionId => currentRegionId === regionId ? null : regionId)}
                onClearSelection={() => setSelectedRegionId(null)}
              >
                {selectedFeature && (
                  <SelectedRegionCard
                    ref={selectedRegionCardRef}
                    feature={selectedFeature}
                    recommendation={selectedRecommendation}
                    constraints={{ housePrice: appliedFilters.housePrice }}
                    onDeselect={() => setSelectedRegionId(null)}
                  />
                )}
              </RegionalMap>
            </div>
          )}
          {requestStatus === 'success' && serviceNote && <p className="map-source-note">{serviceNote}</p>}
        </section>
        <Filters
          draftFilters={draftFilters}
          selectedPriorities={selectedPriorities}
          priorityLabels={priorityLabels}
          isOpen={isFilterOpen}
          onDraftChange={setDraftFilters}
          onApply={applyFilters}
          onClear={clearFilters}
          onClose={closeFilters}
        />
      </div>
    </section>
  );
}
