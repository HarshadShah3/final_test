import { createContext, useContext, useMemo, useState } from 'react';

const PreferenceContext = createContext(null);

const initialPreferences = {
  priorities: [],
  location: '',
  population: 'all',
  housePrice: 'all',
};

/* Keeps location, priorities, population, and house-price answers in memory and restores all fields when preferences are cleared. */
export function PreferenceProvider({ children }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const contextValue = useMemo(
    () => ({ preferences, setPreferences, clearPreferences: () => setPreferences(initialPreferences) }),
    [preferences],
  );

  return <PreferenceContext.Provider value={contextValue}>{children}</PreferenceContext.Provider>;
}

/* Returns the session-scoped preference value and update actions, failing fast when used outside the provider. */
export function usePreferences() {
  const contextValue = useContext(PreferenceContext);
  if (!contextValue) throw new Error('usePreferences must be used inside PreferenceProvider.');
  return contextValue;
}
