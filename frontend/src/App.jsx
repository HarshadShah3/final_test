import { lazy, Suspense, useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import PreferencesPage from './pages/PreferencesPage';
import ExplorePage from './pages/ExplorePage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';
import AccessGate from './components/AccessGate';
import { PreferenceProvider, usePreferences } from './context/PreferenceContext';
import { SavedRegionsProvider } from './context/SavedRegionsContext';
import { RegionSelectionProvider } from './context/RegionSelectionContext';
import { ComparisonSelectionProvider } from './context/ComparisonSelectionContext';

const ComparePage = lazy(() => import('./pages/ComparePage'));
const Towards2050Page = lazy(() => import('./pages/Towards2050Page'));
const ShortlistPage = lazy(() => import('./pages/ShortlistPage'));

/* Blocks protected routes until the session has a start location and priority, replacing invalid navigation with /preferences. */
function PreferenceRequiredRoute({ children }) {
  const { preferences } = usePreferences();
  const hasPreferences = preferences.location.trim() && preferences.priorities.length > 0;

  return hasPreferences ? children : <Navigate to="/preferences" replace />;
}

/* Wraps each code-split page in Suspense and shows a shared fallback until its lazy bundle resolves. */
function LazyPage({ children }) {
  return <Suspense fallback={<p className="empty">Loading page…</p>}>{children}</Suspense>;
}

const navigationItems = [
  { to: '/', label: 'Home', end: true },
  { to: '/preferences', label: 'Find my region' },
  { to: '/explore', label: 'Explore' },
  { to: '/profile', label: 'Profile' },
  { to: '/shortlist', label: 'Shortlist' },
  { to: '/compare', label: 'Compare' },
  { to: '/towards-2050', label: 'Towards 2050' },
];

/* Closes responsive navigation after route changes or Escape, and treats region-detail URLs as part of the Profile journey. */
function Header() {
  const location = useLocation();
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);

  useEffect(() => {
    setIsNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function closeNavigationOnEscape(event) {
      if (event.key === 'Escape') setIsNavigationOpen(false);
    }
    window.addEventListener('keydown', closeNavigationOnEscape);
    return () => window.removeEventListener('keydown', closeNavigationOnEscape);
  }, []);

  return (
    <header className={`site-header ${isNavigationOpen ? 'navigation-open' : ''}`}>
      <NavLink className="brand" to="/" aria-label="Australia 2050 home">
        <span className="brand-name">Australia <strong>2050</strong></span>
      </NavLink>
      <button
        className="navigation-toggle"
        type="button"
        aria-label={isNavigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-controls="primary-navigation"
        aria-expanded={isNavigationOpen}
        onClick={() => setIsNavigationOpen(current => !current)}
      >
        {isNavigationOpen ? <X aria-hidden="true" size={22}/> : <Menu aria-hidden="true" size={22}/>}
      </button>
      <nav className="primary-navigation" id="primary-navigation" aria-label="Primary navigation">
        {navigationItems.map(item => (
          <NavLink
            end={item.end}
            key={item.to}
            to={item.to}
            className={({ isActive }) => {
              const isRegionalProfile = item.to === '/profile' && location.pathname.startsWith('/regions/');
              return isActive || isRegionalProfile ? 'active' : undefined;
            }}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <NavLink to="/preferences" className="avatar" title="Your regional preferences" aria-label="Open your regional preferences">AU</NavLink>
    </header>
  );
}

/* Declares public, preference-gated, lazy, parameterised, and wildcard routes in one independently testable route tree. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/preferences" element={<PreferencesPage />} />
      <Route
        path="/explore"
        element={(
          <PreferenceRequiredRoute>
            <ExplorePage />
          </PreferenceRequiredRoute>
        )}
      />
      <Route
        path="/profile"
        element={(
          <PreferenceRequiredRoute>
            <ProfilePage />
          </PreferenceRequiredRoute>
        )}
      />
      <Route
        path="/regions/:regionId"
        element={(
          <PreferenceRequiredRoute>
            <ProfilePage />
          </PreferenceRequiredRoute>
        )}
      />
      <Route
        path="/compare"
        element={(
          <PreferenceRequiredRoute>
            <LazyPage><ComparePage /></LazyPage>
          </PreferenceRequiredRoute>
        )}
      />
      <Route
        path="/towards-2050"
        element={(
          <PreferenceRequiredRoute>
            <LazyPage><Towards2050Page /></LazyPage>
          </PreferenceRequiredRoute>
        )}
      />
      <Route
        path="/shortlist"
        element={(
          <PreferenceRequiredRoute>
            <LazyPage><ShortlistPage /></LazyPage>
          </PreferenceRequiredRoute>
        )}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/* Gates preview access, then nests preference, region, shortlist, and comparison state around the shared header and routes. */
export default function App() {
  return (
    <AccessGate>
      <PreferenceProvider>
        <SavedRegionsProvider>
          <ComparisonSelectionProvider>
            <RegionSelectionProvider>
              <Header />
              <main>
                <AppRoutes />
              </main>
            </RegionSelectionProvider>
          </ComparisonSelectionProvider>
        </SavedRegionsProvider>
      </PreferenceProvider>
    </AccessGate>
  );
}
