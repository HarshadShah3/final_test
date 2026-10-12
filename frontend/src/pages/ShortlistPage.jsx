import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Trash2 } from 'lucide-react';
import DataSourceLabel from '../components/DataSourceLabel';
import { useComparisonSelection } from '../context/ComparisonSelectionContext';
import { useSavedRegions } from '../context/SavedRegionsContext';
import { fetchRegionById } from '../services/regionApi';
import { formatCurrency, formatNumber } from '../utils/formatters';

const imageFileAliases = {
  bendigo: 'greater-bendigo',
  geelong: 'greater-geelong',
  shepparton: 'greater-shepparton',
};

/* Formats only finite shortlist metrics as numbers so unavailable evidence is never displayed as a misleading zero. */
function availableNumber(value) {
  return Number.isFinite(value) ? formatNumber(value) : 'Not available';
}

/* Formats a housing value as currency only when it is finite, otherwise returning the shared unavailable label. */
function availableCurrency(value) {
  return Number.isFinite(value) ? formatCurrency(value) : 'Not available';
}

/* Refreshes all saved profiles in parallel, falls back to snapshots on partial failure, and requires exactly two IDs before comparison. */
export default function ShortlistPage() {
  const navigate = useNavigate();
  const { savedRegions, toggleRegion, shortlistLimit } = useSavedRegions();
  const { comparisonRegionIds: selectedRegionIds, setComparisonRegionIds: setSelectedRegionIds } = useComparisonSelection();
  const [regionDetails, setRegionDetails] = useState({});
  const [dataStatus, setDataStatus] = useState('idle');

  useEffect(() => {
    const availableIds = new Set(savedRegions.map(region => region.id));
    setSelectedRegionIds(current => current.filter(id => availableIds.has(id)));
  }, [savedRegions]);

  useEffect(() => {
    const controller = new AbortController();
    if (!savedRegions.length) {
      setRegionDetails({});
      setDataStatus('idle');
      return () => controller.abort();
    }
    setDataStatus('loading');
    Promise.all(savedRegions.map(async savedRegion => {
      try {
        const response = await fetchRegionById(savedRegion.id, controller.signal);
        return [savedRegion.id, response.data];
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        return [savedRegion.id, null];
      }
    })).then(results => {
      setRegionDetails(Object.fromEntries(results));
      setDataStatus(results.some(([, region]) => !region) ? 'partial' : 'success');
    }).catch(error => {
      if (error.name !== 'AbortError') setDataStatus('error');
    });
    return () => controller.abort();
  }, [savedRegions]);

  function toggleComparisonSelection(regionId) {
    setSelectedRegionIds(current => {
      if (current.includes(regionId)) return current.filter(id => id !== regionId);
      if (current.length >= 2) return current;
      return [...current, regionId];
    });
  }

  function compareSelectedRegions() {
    if (selectedRegionIds.length !== 2) return;
    navigate(`/compare?regions=${selectedRegionIds.map(encodeURIComponent).join(',')}`);
  }

  return (
    <section className="page-shell shortlist-page">
      <div className="profile-page-actions">
        <Link className="back-link" to="/explore">&larr; Back to Explore map</Link>
      </div>
      <div className="page-heading shortlist-heading">
        <p className="eyebrow">REVIEW &amp; COMPARE</p>
        <h1>Review your saved regions</h1>
        <p>Keep up to {shortlistLimit} regions here for later. Select exactly two to compare their population, housing, employment and services side by side.</p>
      </div>

      {!savedRegions.length ? (
        <section className="shortlist-empty card">
          <h2>No regions saved yet</h2>
          <p>Select a recommended area on the Explore map or open a regional profile to add it to your shortlist.</p>
          <Link className="button primary" to="/explore">Explore regional areas</Link>
        </section>
      ) : (
        <>
          <div className="shortlist-toolbar">
            <div>
              <strong>{savedRegions.length}/{shortlistLimit} shortlisted {savedRegions.length === 1 ? 'region' : 'regions'}</strong>
              <span>{selectedRegionIds.length}/2 selected — exactly two are required to compare</span>
            </div>
            <button
              className="button primary"
              type="button"
              disabled={selectedRegionIds.length !== 2}
              onClick={compareSelectedRegions}
              title={selectedRegionIds.length === 2 ? 'Open a side-by-side comparison of the selected regions' : 'Select exactly two regions first'}
            >
              Compare Selected Regions
            </button>
          </div>

          {dataStatus === 'loading' && <p className="comparison-data-note">Refreshing MySQL-backed regional profiles...</p>}
          {(dataStatus === 'partial' || dataStatus === 'error') && <p className="comparison-data-note">Some MySQL-backed profiles could not be loaded; their metrics are marked unavailable.</p>}

          <div className="saved-region-grid">
            {savedRegions.map(savedRegion => {
              const region = regionDetails[savedRegion.id] ?? { id: savedRegion.id, name: savedRegion.name, state: savedRegion.state };
              const isSelected = selectedRegionIds.includes(region.id);
              const selectionDisabled = !isSelected && selectedRegionIds.length >= 2;
              const imageFile = imageFileAliases[region.id] ?? region.id;
              return (
                <article className={`saved-region-card card ${isSelected ? 'selected' : ''}`} key={region.id}>
                  <img src={`/images/regions/${imageFile}.jpg`} alt={`${region.name} regional landscape`} loading="lazy" decoding="async" />
                  <div className="saved-region-content">
                    <div className="saved-region-heading">
                      <div><small>{region.state || 'VIC'}</small><h2>{region.name}</h2></div>
                      <button
                        className="shortlist-remove"
                        type="button"
                        aria-label={`Remove ${region.name} from shortlist`}
                        title="Remove from shortlist"
                        onClick={() => toggleRegion(savedRegion)}
                      >
                        <Trash2 aria-hidden="true" size={18}/>
                      </button>
                    </div>

                    <dl className="saved-region-stats">
                      <div><dt>Population</dt><dd>{availableNumber(region.population)}</dd></div>
                      <div><dt>Median price</dt><dd>{availableCurrency(region.medianHousePrice)}</dd></div>
                      <div><dt>Median rent</dt><dd>{Number.isFinite(region.medianRent) ? `${formatCurrency(region.medianRent)}/wk` : 'Not available'}</dd></div>
                      <div><dt>Advertised jobs</dt><dd>{availableNumber(region.occupationVacancies)}</dd></div>
                    </dl>
                    <DataSourceLabel region={region} fields={['population', 'medianHousePrice', 'medianRent', 'occupationVacancies']}/>

                    <div className="saved-region-actions">
                      <Link className="button secondary" to={`/regions/${region.id}`} title={`View detailed data, dates and limitations for ${region.name}`}>View Profile</Link>
                      <button
                        className={`shortlist-select ${isSelected ? 'selected' : ''}`}
                        type="button"
                        disabled={selectionDisabled}
                        aria-pressed={isSelected}
                        onClick={() => toggleComparisonSelection(region.id)}
                        title={selectionDisabled ? 'Two regions are already selected' : `${isSelected ? 'Remove' : 'Add'} ${region.name} ${isSelected ? 'from' : 'to'} this comparison`}
                      >
                        {isSelected && <Check aria-hidden="true" size={16}/>} {isSelected ? 'Selected' : 'Select to Compare'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
