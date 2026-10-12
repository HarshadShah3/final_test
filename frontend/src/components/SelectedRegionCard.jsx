import { forwardRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSavedRegions } from '../context/SavedRegionsContext';
import { priorityLabels } from '../data/preferenceOptions';
import { fetchRegionById } from '../services/regionApi';

/* Explains the selected map region, fetches its full profile before saving, enforces shortlist capacity, and reports save failures. */
const SelectedRegionCard = forwardRef(function SelectedRegionCard({ feature, recommendation, constraints, onDeselect }, ref) {
  const region = feature.properties;
  const { isSaved, toggleRegion, canAddRegion, shortlistLimit } = useSavedRegions();
  const saved = isSaved(region.id);
  const [saveStatus, setSaveStatus] = useState('idle');

  const scoreBreakdown = recommendation?.priorityBreakdown ?? [];
  const recommendationContext = recommendation ? {
    matchScore: recommendation.matchScore,
    matchStrength: recommendation.matchStrength,
    priorityBreakdown: recommendation.priorityBreakdown,
    locationAdjustment: recommendation.locationAdjustment,
    reasons: recommendation.reasons,
    constraints,
  } : null;

  async function handleToggleSaved() {
    if (saved) {
      toggleRegion(region);
      setSaveStatus('idle');
      return;
    }

    if (!canAddRegion) {
      setSaveStatus('limit');
      return;
    }

    setSaveStatus('saving');
    try {
      const response = await fetchRegionById(region.id);
      toggleRegion({
        ...response.data,
        recommendationContext,
      });
      setSaveStatus('idle');
    } catch {
      setSaveStatus('error');
    }
  }

  return (
    <aside ref={ref} className="selected-map-region" aria-label={`Selected regional area: ${region.name}`}>
      <button className="map-card-close" type="button" aria-label="Deselect regional area" onClick={onDeselect}>×</button>
      <p className="eyebrow">SELECTED REGION</p>
      <h2>{region.name}</h2>

      {recommendation && (
        <section className="region-score-explanation" aria-label="Recommendation score explanation">
          <div className="overall-match-score">
            <span>Overall match</span>
            <strong>{Number.isFinite(recommendation.matchScore) ? `${recommendation.matchScore}%` : 'Not scored'}</strong>
          </div>
          <h3>Priority scores</h3>
          <ul className="region-score-list">
            {scoreBreakdown.map(({ priority, score, scored }) => (
              <li key={priority}>
                <span>{priorityLabels[priority] ?? priority}</span>
                <strong>{scored !== false && Number.isFinite(score) ? `${Math.round(score)}%` : 'Not scored'}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!recommendation && <p className="starting-region-note">This is your starting region. A recommendation score is not available.</p>}

      <div className="selected-region-actions">
        <Link
          className="button primary"
          to={region.profilePath}
          state={{ regionId: region.id, recommendationContext }}
          title="Open this region's detailed population, housing, employment and services data"
        >
          View Profile
        </Link>
        <button
          className="button secondary"
          type="button"
          disabled={saveStatus === 'saving'}
          onClick={handleToggleSaved}
          title={saved ? 'Remove this region from your shortlist' : `Save this region for later comparison (maximum ${shortlistLimit})`}
        >
          {saveStatus === 'saving' ? 'Saving…' : saved ? 'Remove from Shortlist' : 'Add to Shortlist'}
        </button>
      </div>
      {saveStatus === 'error' && <p className="save-region-error" role="alert">This region could not be saved. Please try again.</p>}
      {saveStatus === 'limit' && <p className="save-region-error" role="alert">Your shortlist is full. Remove one of the {shortlistLimit} saved regions before adding another.</p>}
      <p className="selected-region-next-step">Next: view the full profile, add this region to your shortlist, then compare exactly two shortlisted regions.</p>
    </aside>
  );
});

export default SelectedRegionCard;
