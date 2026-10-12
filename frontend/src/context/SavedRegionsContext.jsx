import { createContext, useContext, useState, useMemo, useEffect } from 'react';

const SavedRegionsContext = createContext(null);
export const MAX_SAVED_REGIONS = 4;

/* Restores a validated shortlist from localStorage, truncates legacy data to four regions, and ignores additions beyond capacity. */
export function SavedRegionsProvider({ children }) {
  const [savedRegions, setSavedRegions] = useState(() => {
    try {
      const stored = localStorage.getItem('savedRegions');
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.slice(0, MAX_SAVED_REGIONS) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('savedRegions', JSON.stringify(savedRegions));
  }, [savedRegions]);

  const toggleRegion = (region) => {
    setSavedRegions(prev => {
      if (prev.some(r => r.id === region.id)) {
        return prev.filter(r => r.id !== region.id);
      }
      if (prev.length >= MAX_SAVED_REGIONS) {
        return prev;
      }
      return [...prev, region];
    });
  };

  const isSaved = (regionId) => savedRegions.some(r => r.id === regionId);

  const contextValue = useMemo(() => ({
    savedRegions,
    toggleRegion,
    isSaved,
    canAddRegion: savedRegions.length < MAX_SAVED_REGIONS,
    shortlistLimit: MAX_SAVED_REGIONS,
  }), [savedRegions]);

  return <SavedRegionsContext.Provider value={contextValue}>{children}</SavedRegionsContext.Provider>;
}

/* Returns shortlist contents, capacity state, and toggle helpers, failing fast when used outside the provider. */
export function useSavedRegions() {
  const ctx = useContext(SavedRegionsContext);
  if (!ctx) throw new Error('useSavedRegions must be used inside SavedRegionsProvider');
  return ctx;
}
