import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePreferences } from '../context/PreferenceContext';
import { housePriceOptions, populationOptions, priorityOptions } from '../data/preferenceOptions';
import { fetchRegions } from '../services/regionApi';

/* Refines an already selected population or housing priority with one pressed-state range without creating another priority. */
function PreferenceFilterGroup({ label, name, options, value, onChange }) {
  return (
    <fieldset className="preference-filter-group">
      <legend>{label}</legend>
      <div className="preference-filter-options">
        {options.map(([optionValue, optionLabel]) => (
          <button
            type="button"
            key={optionValue}
            className={value === optionValue ? 'selected' : ''}
            aria-pressed={value === optionValue}
            onClick={() => onChange(name, optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/* Loads regional suggestions, provides keyboard autocomplete, validates an exact start region and one-to-three priorities, then opens Explore. */
export default function PreferencesPage() {
  const navigate = useNavigate();
  const { preferences, setPreferences } = usePreferences();
  const [draft, setDraft] = useState(preferences);
  const [errorMessage, setErrorMessage] = useState('');
  const [regionOptions, setRegionOptions] = useState([]);
  const [regionLoadError, setRegionLoadError] = useState(false);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  useEffect(() => {
    const requestController = new AbortController();
    fetchRegions({ search: '', state: 'VIC', population: 'all' }, requestController.signal)
      .then(response => setRegionOptions(response.data.map(region => ({
        id: region.id,
        name: region.name,
        dataProvenance: region.dataProvenance,
      }))))
      .then(() => setRegionLoadError(false))
      .catch(error => {
        if (error.name !== 'AbortError') {
          setRegionOptions([]);
          setRegionLoadError(true);
        }
      });
    return () => requestController.abort();
  }, []);

  const matchingRegions = useMemo(() => {
    const searchTerm = draft.location.trim().toLowerCase();
    if (!searchTerm) return [];
    return regionOptions
      .filter(region => region.name.toLowerCase().includes(searchTerm))
      .sort((first, second) => {
        const firstStartsWithSearch = first.name.toLowerCase().startsWith(searchTerm);
        const secondStartsWithSearch = second.name.toLowerCase().startsWith(searchTerm);
        if (firstStartsWithSearch !== secondStartsWithSearch) return firstStartsWithSearch ? -1 : 1;
        return first.name.localeCompare(second.name);
      });
  }, [draft.location, regionOptions]);

  function selectRegion(regionName) {
    setDraft(current => ({ ...current, location: regionName }));
    setErrorMessage('');
    setIsSuggestionOpen(false);
    setActiveSuggestionIndex(-1);
  }

  function handleRegionKeyDown(event) {
    if (event.key === 'Escape') {
      setIsSuggestionOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }
    if (!matchingRegions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex(current => (current + 1) % matchingRegions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex(current => (current <= 0 ? matchingRegions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && isSuggestionOpen) {
      event.preventDefault();
      selectRegion(matchingRegions[Math.max(activeSuggestionIndex, 0)].name);
    }
  }

  function togglePriority(priority) {
    setErrorMessage('');
    setDraft(current => {
      if (current.priorities.includes(priority)) {
        return { ...current, priorities: current.priorities.filter(item => item !== priority) };
      }
      if (current.priorities.length === 3) {
        setErrorMessage('Choose up to three priorities so the recommendations stay focused.');
        return current;
      }
      return { ...current, priorities: [...current.priorities, priority] };
    });
  }

  function setRecommendationFilter(name, value) {
    setDraft(current => ({ ...current, [name]: value }));
  }

  function submitPreferences(event) {
    event.preventDefault();
    if (regionLoadError) return;
    if (!draft.location.trim()) {
      setErrorMessage('Enter a regional area name.');
      return;
    }
    const selectedRegion = regionOptions.find(region => region.name.toLowerCase() === draft.location.trim().toLowerCase());
    if (regionOptions.length && !selectedRegion) {
      setErrorMessage('Choose a regional area from the suggestions.');
      return;
    }
    if (!draft.priorities.length) {
      setErrorMessage('Choose at least one priority.');
      return;
    }
    setPreferences({ ...draft, location: selectedRegion?.name ?? draft.location.trim() });
    navigate('/explore');
  }

  return (
    <section className="preference-page page-shell">
      <div className="preference-stage">
        <figure className="preference-visual">
          <img src="/images/grampians-national-park.jpg" alt="Mountain and forest landscape in Grampians National Park, Victoria" />
          <figcaption>
            Photo by <a href="https://commons.wikimedia.org/wiki/File:Grampians_National_Park_Scenary.jpg" target="_blank" rel="noreferrer">Swongsy</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
          </figcaption>
          <div className="preference-visual-copy">
            <p className="eyebrow">YOUR MOVE, YOUR PRIORITIES</p>
            <h1>
              <span>Every move has dealbreakers.</span>
              <span>What are yours?</span>
            </h1>
            <p>Pick what you can&apos;t compromise on, and we&apos;ll show you which regions clear the bar.</p>
          </div>
        </figure>

        <form className="preference-form" onSubmit={submitPreferences}>
          <div className="mobile-back-navigation">
            <Link className="back-link" to="/">&larr; Back to home</Link>
          </div>
          <div className="preference-form-heading">
            <p className="eyebrow">PERSONALISED START</p>
            <h2>Tell us what you&apos;re looking for</h2>
            <p>Your answers stay in this browser tab only. Refreshing the page clears them.</p>
          </div>

          <label className="location-field">
            Got a town in mind?
            <input
              role="combobox"
              value={draft.location}
              onChange={event => {
                setDraft({ ...draft, location: event.target.value });
                setErrorMessage('');
                setIsSuggestionOpen(Boolean(event.target.value.trim()));
                setActiveSuggestionIndex(-1);
              }}
              onFocus={() => setIsSuggestionOpen(Boolean(draft.location.trim()))}
              onBlur={() => setIsSuggestionOpen(false)}
              onKeyDown={handleRegionKeyDown}
              placeholder="e.g. Ballarat or Bendigo"
              maxLength="80"
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls="regional-area-suggestions"
              aria-expanded={isSuggestionOpen && Boolean(draft.location.trim())}
              aria-activedescendant={activeSuggestionIndex >= 0 ? `regional-area-option-${matchingRegions[activeSuggestionIndex]?.id}` : undefined}
            />
            {isSuggestionOpen && draft.location.trim() && (
              <ul className="region-suggestions" id="regional-area-suggestions" role="listbox">
                {matchingRegions.length ? matchingRegions.map((region, index) => (
                  <li
                    id={`regional-area-option-${region.id}`}
                    key={region.id}
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                  >
                    <button
                      type="button"
                      className={index === activeSuggestionIndex ? 'active' : ''}
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => selectRegion(region.name)}
                    >
                      {region.name}
                    </button>
                  </li>
                )) : <li className="no-region-match">No matching regional areas</li>}
              </ul>
            )}
          </label>
          {regionLoadError && <p className="form-error" role="alert">Regional areas could not be loaded. Check the data service, then refresh the page to try again.</p>}

          <fieldset className="priority-picker" aria-describedby="priority-picker-guidance">
            <legend>What matters most to you? <span>Choose 1–3 categories</span></legend>
            <p className="priority-picker-guidance" id="priority-picker-guidance">
              Select one, two or all three priority categories below. Filters inside a category only refine that category and do not count as extra priorities.
            </p>
            <div className="priority-grid">
              {priorityOptions.map(([value, label, description]) => {
                const isSelected = draft.priorities.includes(value);
                const relatedFilter = value === 'population'
                  ? {
                      label: 'Population range',
                      name: 'population',
                      options: populationOptions,
                      currentValue: draft.population,
                    }
                  : value === 'housing'
                    ? {
                        label: 'House price range',
                        name: 'housePrice',
                        options: housePriceOptions,
                        currentValue: draft.housePrice,
                      }
                    : null;

                return (
                  <article className={`priority-choice ${isSelected ? 'selected' : ''}`} key={value}>
                    <button
                      type="button"
                      className="priority-option"
                      aria-pressed={isSelected}
                      onClick={() => togglePriority(value)}
                    >
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </button>
                    {relatedFilter && (
                      <PreferenceFilterGroup
                        label={relatedFilter.label}
                        name={relatedFilter.name}
                        options={relatedFilter.options}
                        value={relatedFilter.currentValue}
                        onChange={setRecommendationFilter}
                      />
                    )}
                  </article>
                );
              })}
            </div>
          </fieldset>

          {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
          <button className="button primary preference-submit" type="submit" title="Use these preferences to find matching Victorian regions">Show my regional matches</button>
          <p className="memory-note">No account, cookie or local storage is used for these answers.</p>
        </form>
      </div>
    </section>
  );
}
