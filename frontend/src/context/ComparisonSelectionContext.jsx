import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const MAX_COMPARISON_REGIONS = 2;
const STORAGE_KEY = 'comparisonRegionIds';
const ComparisonSelectionContext = createContext(null);

/* Accepts only non-empty string IDs, removes duplicates, and caps every comparison selection at exactly two slots. */
function normaliseRegionIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(id => typeof id === 'string' && id.trim())
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .slice(0, MAX_COMPARISON_REGIONS);
}

/* Restores and persists the two-ID selection in localStorage while avoiding redundant state updates and tolerating storage failure. */
export function ComparisonSelectionProvider({ children }) {
  const [comparisonRegionIds, setComparisonRegionIdsState] = useState(() => {
    try {
      return normaliseRegionIds(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(comparisonRegionIds));
    } catch {
      // Selection still works for this session when browser storage is unavailable.
    }
  }, [comparisonRegionIds]);

  const setComparisonRegionIds = useCallback(nextValue => {
    setComparisonRegionIdsState(current => {
      const next = normaliseRegionIds(typeof nextValue === 'function' ? nextValue(current) : nextValue);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, []);

  const contextValue = useMemo(() => ({
    comparisonRegionIds,
    setComparisonRegionIds,
  }), [comparisonRegionIds, setComparisonRegionIds]);

  return (
    <ComparisonSelectionContext.Provider value={contextValue}>
      {children}
    </ComparisonSelectionContext.Provider>
  );
}

/* Returns the shared comparison IDs and setter, and fails fast when a consumer is mounted outside the provider. */
export function useComparisonSelection() {
  const contextValue = useContext(ComparisonSelectionContext);
  if (!contextValue) throw new Error('useComparisonSelection must be used inside ComparisonSelectionProvider.');
  return contextValue;
}
