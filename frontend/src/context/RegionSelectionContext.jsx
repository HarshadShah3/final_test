import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const RegionSelectionContext = createContext(null);

/* Restores the selected region ID from localStorage, synchronises later changes, and falls back to session state if storage fails. */
export function RegionSelectionProvider({ children }) {
  const [selectedRegionId, setSelectedRegionId] = useState(() => {
    try {
      return localStorage.getItem('selectedRegionId');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (selectedRegionId) localStorage.setItem('selectedRegionId', selectedRegionId);
      else localStorage.removeItem('selectedRegionId');
    } catch {
      // The app still works when storage is blocked; selection then lasts for this session only.
    }
  }, [selectedRegionId]);

  const contextValue = useMemo(() => ({ selectedRegionId, setSelectedRegionId }), [selectedRegionId]);

  return <RegionSelectionContext.Provider value={contextValue}>{children}</RegionSelectionContext.Provider>;
}

/* Returns the cross-page region ID and setter, and rejects consumers mounted outside the selection provider. */
export function useRegionSelection() {
  const contextValue = useContext(RegionSelectionContext);
  if (!contextValue) throw new Error('useRegionSelection must be used inside RegionSelectionProvider.');
  return contextValue;
}
