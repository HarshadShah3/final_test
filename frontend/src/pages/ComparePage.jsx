import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ComparisonView from '../components/ComparisonView';
import { useComparisonSelection } from '../context/ComparisonSelectionContext';
import { usePreferences } from '../context/PreferenceContext';
import { useSavedRegions } from '../context/SavedRegionsContext';
import { fetchPriorityRecommendations, fetchRegionById } from '../services/regionApi';

/* Normalises two shortlisted IDs from URL or shared state, loads both profiles and recommendations in parallel, and exposes retryable errors. */
export default function ComparePage() {
  const { savedRegions } = useSavedRegions();
  const { comparisonRegionIds, setComparisonRegionIds } = useComparisonSelection();
  const { preferences } = usePreferences();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('All data');
  const [regionDetails, setRegionDetails] = useState({});
  const [requestStatus, setRequestStatus] = useState('idle');
  const [dataNote, setDataNote] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const requestedRegionIds = searchParams.get('regions') ?? '';

  useEffect(() => {
    const availableIds = savedRegions.map(region => region.id);
    const requestedIds = requestedRegionIds
      .split(',')
      .map(id => id.trim())
      .filter((id, index, ids) => id && availableIds.includes(id) && ids.indexOf(id) === index)
      .slice(0, 2);
    setComparisonRegionIds(current => requestedIds.length
      ? requestedIds
      : current.filter(id => availableIds.includes(id)));
  }, [requestedRegionIds, savedRegions, setComparisonRegionIds]);

  const selectedForCompare = [comparisonRegionIds[0] ?? null, comparisonRegionIds[1] ?? null];

  const selectedIds = useMemo(() => selectedForCompare.filter(Boolean), [selectedForCompare]);
  const selectedIdsKey = selectedIds.join('|');
  const preferenceRequestKey = [
    preferences.location,
    preferences.priorities.join('|'),
    preferences.housePrice,
  ].join('|');
  const outlookLink = selectedIds.length
    ? `/towards-2050?${new URLSearchParams({ regions: selectedIds.join(',') })}`
    : '/towards-2050';

  useEffect(() => {
    const requestController = new AbortController();

    if (selectedIds.length !== 2) {
      setRegionDetails({});
      setRequestStatus('idle');
      setDataNote('');
      return () => requestController.abort();
    }

    setRegionDetails({});
    setRequestStatus('loading');
    setDataNote('');

    const profileRequests = Promise.all(selectedIds.map(async id => {
      try {
        const response = await fetchRegionById(id, requestController.signal);
        return {
          id,
          region: response.data,
          isLive: true,
        };
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        return { id, region: null, isLive: false };
      }
    }));

    const recommendationRequest = fetchPriorityRecommendations({
      priorities: preferences.priorities,
      location: preferences.location,
      population: 'all',
      housePrice: 'all',
    }, requestController.signal)
      .then(response => ({ recommendations: response.data, failed: false }))
      .catch(error => {
        if (error.name === 'AbortError') throw error;
        return { recommendations: [], failed: true };
      });

    Promise.all([profileRequests, recommendationRequest])
      .then(([results, recommendationResult]) => {
        const currentRecommendations = new Map(recommendationResult.recommendations.map(recommendation => [
          recommendation.region.id,
          recommendation,
        ]));
        const details = Object.fromEntries(results.map(result => {
          if (!result.region) return [result.id, null];
          const savedRegion = savedRegions.find(region => region.id === result.id);
          const currentRecommendation = currentRecommendations.get(result.id);
          const recommendationContext = currentRecommendation
            ? {
                matchScore: currentRecommendation.matchScore,
                priorityBreakdown: currentRecommendation.priorityBreakdown,
                locationAdjustment: currentRecommendation.locationAdjustment,
                constraints: { housePrice: preferences.housePrice },
              }
            : savedRegion?.recommendationContext ?? null;
          return [result.id, { ...result.region, recommendationContext }];
        }));
        setRegionDetails(details);
        const failedRequestCount = results.filter(result => !result.isLive).length
          + Number(recommendationResult.failed);
        setDataNote(failedRequestCount
          ? ''
          : 'Complete regional profiles and preference assessments loaded from the Aiven MySQL regional data service.');
        setRequestStatus(failedRequestCount ? 'error' : 'success');
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setRequestStatus('error');
          setDataNote('');
        }
      });

    return () => requestController.abort();
  }, [selectedIdsKey, preferenceRequestKey, savedRegions, requestVersion]);

  function updateSelection(index, regionId) {
    setComparisonRegionIds(current => {
      const next = [current[0] ?? null, current[1] ?? null];
      next[index] = regionId || null;
      return next.filter(Boolean);
    });
  }

  const townA = selectedForCompare[0]
    ? regionDetails[selectedForCompare[0]] ?? null
    : null;
  const townB = selectedForCompare[1]
    ? regionDetails[selectedForCompare[1]] ?? null
    : null;

  return (
    <section className="page-shell compare-page">
      <div className="profile-page-actions">
        <Link className="back-link" to="/shortlist">&larr; Back to Shortlist</Link>
      </div>
      <div className="page-heading">
        <p className="eyebrow">SHORTLIST & COMPARE</p>
        <h1>Compare regional areas</h1>
        <p>Select exactly two shortlisted regions. The same selections stay available as you move between Shortlist, Compare and Towards 2050.</p>
      </div>

      {!savedRegions.length ? (
        <section className="compare-empty card">
          <h2>Your shortlist is empty</h2>
          <p>Open a recommended region on the Explore map and save it to begin a detailed comparison.</p>
          <Link className="button primary" to="/explore">Explore regional areas</Link>
        </section>
      ) : (
        <>
          <section className="compare-region-selectors card" aria-label="Regions selected for comparison">
            {[0, 1].map(index => {
              const otherSelectedId = selectedForCompare[index === 0 ? 1 : 0];
              return (
                <label key={index}>
                  Region {index === 0 ? 'A' : 'B'}
                  <select value={selectedForCompare[index] ?? ''} onChange={event => updateSelection(index, event.target.value)}>
                    <option value="">Select a region</option>
                    {savedRegions
                      .filter(region => region.id !== otherSelectedId)
                      .map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
                  </select>
                </label>
              );
            })}
            <Link to="/shortlist">Manage your shortlist</Link>
          </section>

          {selectedIds.length === 2 && (
            <p className="comparison-outlook-link">
              <Link to={outlookLink} title="Carry these two regions into the published projection view">View the same regions in Towards 2050 &rarr;</Link>
            </p>
          )}

          {selectedIds.length !== 2 && (
            <section className="comparison-awaiting-selection card" aria-live="polite">
              <h2>Select exactly two regions</h2>
              <p>{selectedIds.length}/2 selected. Choose both Region A and Region B to open the side-by-side comparison.</p>
            </section>
          )}

          {requestStatus === 'loading' && <p className="comparison-loading">Refreshing complete regional profiles…</p>}
          {dataNote && <p className="comparison-data-note">{dataNote}</p>}
          {requestStatus === 'error' && (
            <div className="comparison-load-error" role="alert">
              <span>Some regional profiles or preference assessments could not be loaded.</span>
              <button type="button" onClick={() => setRequestVersion(current => current + 1)}>Retry</button>
            </div>
          )}

          {selectedIds.length === 2 && (
            <>
              <ComparisonView
                townA={townA}
                townB={townB}
                activeCategory={activeTab}
                onCategoryChange={setActiveTab}
                onRemoveA={townA ? () => updateSelection(0, null) : undefined}
                onRemoveB={townB ? () => updateSelection(1, null) : undefined}
              />
              <div className="comparison-outlook-footer">
                <Link to={outlookLink} title="Carry these two regions into the published projection view">
                  View the same regions in Towards 2050 <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
