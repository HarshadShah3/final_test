import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  BriefcaseBusiness,
  Database,
  GraduationCap,
  HeartPulse,
  House,
  MapPin,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useRegionSelection } from '../context/RegionSelectionContext';
import { useSavedRegions } from '../context/SavedRegionsContext';
import { priorityLabels } from '../data/preferenceOptions';
import { fetchRegionById } from '../services/regionApi';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { describeRegionProximity } from '../utils/proximityCopy';

const unavailable = 'Not available';
const defaultProfileRegionId = 'ballarat';
const imageFileAliases = {
  bendigo: 'greater-bendigo',
  geelong: 'greater-geelong',
  shepparton: 'greater-shepparton',
};

const profileDataLinks = {
  population: [
    { label: 'ABS Regional population', url: 'https://www.abs.gov.au/statistics/people/population/regional-population/latest-release' },
    { label: 'ABS 2021 Census DataPacks', url: 'https://www.abs.gov.au/census/find-census-data/datapacks' },
  ],
  housing: [
    { label: 'Valuer-General Victoria property sales', url: 'https://www.land.vic.gov.au/valuations/resources-and-reports/property-sales-statistics' },
    { label: 'Homes Victoria Rental Report', url: 'https://www.dffh.vic.gov.au/publications/rental-report' },
    { label: 'ABS 2021 Census DataPacks', url: 'https://www.abs.gov.au/census/find-census-data/datapacks' },
  ],
  employment: [
    { label: 'Jobs and Skills Australia NERO', url: 'https://www.jobsandskills.gov.au/data/nero' },
    { label: 'Jobs and Skills Australia vacancy data', url: 'https://www.jobsandskills.gov.au/data/internet-vacancy-index' },
  ],
  education: [
    { label: 'DataVic School Locations 2025', url: 'https://discover.data.vic.gov.au/dataset/school-locations-2025' },
    { label: 'ABS 2021 Census DataPacks', url: 'https://www.abs.gov.au/census/find-census-data/datapacks' },
  ],
  health: [
    { label: 'HealthDirect facilities dataset', url: 'https://pid.geoscience.gov.au/dataset/ga/149331' },
    { label: 'AIHW MyHospitals API', url: 'https://myhospitalsapi.aihw.gov.au/' },
  ],
  access: [
    { label: 'Crime Statistics Victoria data', url: 'https://www.crimestatistics.vic.gov.au/crime-statistics/latest-victorian-crime-data/download-data' },
    { label: 'DataVic GTFS Schedule', url: 'https://discover.data.vic.gov.au/dataset/gtfs-schedule' },
    { label: 'Victoria in Future projections', url: 'https://www.planning.vic.gov.au/guides-and-resources/Data-spatial-and-insights/discover-and-access-planning-open-data/victoria-in-future' },
  ],
};

/* Formats finite profile values as Australian numbers, currency, percentages, and travel time while preserving unavailable evidence. */
const isNumber = value => Number.isFinite(value);
const availableNumber = value => isNumber(value) ? formatNumber(value) : unavailable;
const availableCurrency = value => isNumber(value) ? formatCurrency(value) : unavailable;
const availableText = value => typeof value === 'string' && value.trim() ? value : unavailable;
const availablePercentage = (value, signed = false) => {
  if (!isNumber(value)) return unavailable;
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('en-AU', { maximumFractionDigits: 1 })}%`;
};
const availableTransportFrequency = value => isNumber(value)
  ? `${value.toLocaleString('en-AU', { maximumFractionDigits: 1 })} calls/stop (weekday)`
  : unavailable;

const creditField = (record, label) => record.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';

/* Parses structured image-credit records from the licence inventory and returns the entry matching the active region name. */
function findImageCredit(inventory, regionName) {
  return inventory
    .split(/^-{20,}\s*$/m)
    .map(record => ({
      region: creditField(record, 'REGION'),
      author: creditField(record, 'AUTHOR'),
      sourcePage: creditField(record, 'SOURCE PAGE'),
      licence: creditField(record, 'LICENCE'),
      licenceUrl: creditField(record, 'LICENCE URL'),
    }))
    .find(record => record.region === regionName) ?? null;
}

/* Renders a compact source disclosure for each profile card and closes the details panel when focus moves elsewhere. */
function ProfileDataLinks({ title, links }) {
  const detailsRef = useRef(null);

  useEffect(() => {
    function closeWhenClickingOutside(event) {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target)) details.open = false;
    }

    document.addEventListener('pointerdown', closeWhenClickingOutside);
    return () => document.removeEventListener('pointerdown', closeWhenClickingOutside);
  }, []);

  return (
    <details className="profile-data-links" ref={detailsRef}>
      <summary aria-label={`View data sources for ${title}`}>
        <Database aria-hidden="true" size={14}/>
        Data sources
      </summary>
      <div className="profile-data-links-panel">
        <strong>Data used in this card</strong>
        <nav aria-label={`${title} external data sources`}>
          {links.map(link => (
            <a href={link.url} key={link.url} target="_blank" rel="noreferrer">
              {link.label} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </nav>
      </div>
    </details>
  );
}

/* Removes unavailable metrics, hides empty sections, and keeps each visible card's reference period and official sources attached. */
function ProfileSection({ title, items, icon: Icon, tone, period, sourceLinks }) {
  const visibleItems = items.filter(item => item.value !== unavailable);
  if (!visibleItems.length) return null;

  return (
    <article className={`profile-card profile-card-${tone}`}>
      <header className="profile-card-heading">
        <span className="profile-card-icon"><Icon aria-hidden="true" size={25}/></span>
        <div>
          <h2>{title}</h2>
          {period && <p>{period}</p>}
        </div>
      </header>
      <div className="stat-grid">
        {visibleItems.map(item => (
          <div className="stat" key={item.label}>
            <small>{item.label}</small>
            <strong className={`${item.value === unavailable ? 'unavailable-value' : ''} ${item.compact ? 'profile-stat-compact' : ''}`.trim()}>
              {item.value}
            </strong>
          </div>
        ))}
      </div>
      <ProfileDataLinks title={title} links={sourceLinks}/>
    </article>
  );
}

/* Explains a saved recommendation snapshot without recalculating or inventing unavailable evidence. */
function WhyThisRegion({ regionName, recommendationContext }) {
  const priorityBreakdown = Array.isArray(recommendationContext?.priorityBreakdown)
    ? recommendationContext.priorityBreakdown.filter(item => item?.scored !== false)
    : [];
  const locationAdjustment = recommendationContext?.locationAdjustment;
  const distanceKm = locationAdjustment?.distanceKm;
  const isEnteredRegion = distanceKm !== null && distanceKm !== undefined && Number(distanceKm) === 0;
  const hasExplanation = priorityBreakdown.length > 0 || locationAdjustment?.applied;

  return (
    <section className="profile-why-region card" aria-labelledby="why-this-region-heading">
      <header className="profile-why-region-heading">
        <div>
          <p className="eyebrow">PERSONALISED EXPLANATION</p>
          <h2 id="why-this-region-heading">Why this region?</h2>
          <p>See how {regionName} relates to the priorities and starting region used for your recommendation.</p>
        </div>
        {Number.isFinite(recommendationContext?.matchScore) && (
          <div className="profile-match-score" aria-label={`Overall match ${recommendationContext.matchScore}%`}>
            <span>{recommendationContext.matchStrength || 'Overall match'}</span>
            <strong>{recommendationContext.matchScore}%</strong>
          </div>
        )}
      </header>

      {hasExplanation ? (
        <div className="profile-why-region-grid">
          {priorityBreakdown.map(item => {
            const neutralFactorCount = Array.isArray(item.factors)
              ? item.factors.filter(factor => factor.neutralFallback).length
              : 0;
            return (
              <article className="profile-why-reason" key={item.priority}>
                <div>
                  <span className="profile-why-icon" aria-hidden="true"><Sparkles size={18}/></span>
                  <h3>{priorityLabels[item.priority] ?? item.priority}</h3>
                  {Number.isFinite(item.score) && <strong>{Math.round(item.score)}%</strong>}
                </div>
                <p>{item.reason || 'A detailed explanation is not available for this priority.'}</p>
                {neutralFactorCount > 0 && (
                  <small>{neutralFactorCount} unavailable {neutralFactorCount === 1 ? 'factor uses' : 'factors use'} a neutral score and does not count as positive evidence.</small>
                )}
              </article>
            );
          })}
          {locationAdjustment?.applied && (
            <article className="profile-why-reason profile-why-location">
              <div>
                <span className="profile-why-icon" aria-hidden="true"><MapPin size={18}/></span>
                <h3>Starting-region proximity</h3>
                {isEnteredRegion
                  ? <strong>The region you entered</strong>
                  : Number.isFinite(locationAdjustment.distanceKm) && <strong>{locationAdjustment.distanceKm} km</strong>}
              </div>
              <p>{describeRegionProximity(locationAdjustment)}</p>
            </article>
          )}
        </div>
      ) : (
        <div className="profile-why-empty">
          <p>A personalised explanation is not available for this visit. Choose your priorities, then select this region from the recommendation map.</p>
          <Link className="button secondary" to="/preferences">Choose my priorities</Link>
        </div>
      )}

      <footer className="profile-why-footer">
        {hasExplanation && <p className="profile-why-note">Match scores are relative rule-based explanations, not probabilities or guarantees.</p>}
        <p className="profile-scroll-hint">
          <ArrowDown size={15} aria-hidden="true" />
          Scroll down for a simple overview of key regional information.
        </p>
      </footer>
    </section>
  );
}

/* Resolves the active region, loads its profile and optional image credit, handles not-found or service states, and manages shortlist actions. */
export default function ProfilePage() {
  const { regionId: routeRegionId } = useParams();
  const location = useLocation();
  const { selectedRegionId, setSelectedRegionId } = useRegionSelection();
  const { savedRegions, isSaved, toggleRegion, canAddRegion, shortlistLimit } = useSavedRegions();
  const effectiveRegionId = routeRegionId || selectedRegionId || savedRegions[0]?.id || defaultProfileRegionId;
  const [region, setRegion] = useState(null);
  const [requestStatus, setRequestStatus] = useState('loading');
  const [imageCredit, setImageCredit] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (routeRegionId) setSelectedRegionId(routeRegionId);
  }, [routeRegionId, setSelectedRegionId]);

  useEffect(() => {
    const controller = new AbortController();
    setRegion(null);
    setRequestStatus('loading');

    fetchRegionById(effectiveRegionId, controller.signal)
      .then(response => {
        setRegion(response.data);
        setRequestStatus('success');
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          const isNotFound = error.message.includes('not found');
          if (isNotFound) setSelectedRegionId(null);
          setRequestStatus(isNotFound ? 'not-found' : 'error');
        }
      });
    return () => controller.abort();
  }, [effectiveRegionId, setSelectedRegionId]);

  useEffect(() => {
    setImageCredit(null);
    if (!region?.name) return undefined;
    const controller = new AbortController();
    fetch('/images/regions/image_sources_and_licences.txt', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Image credit inventory unavailable.');
        return response.text();
      })
      .then(inventory => setImageCredit(findImageCredit(inventory, region.name)))
      .catch(error => {
        if (error.name !== 'AbortError') setImageCredit(null);
      });
    return () => controller.abort();
  }, [region?.name]);

  const sections = useMemo(() => region ? [
    {
      tone: 'population',
      title: 'Population & income',
      icon: UsersRound,
      sourceLinks: profileDataLinks.population,
      period: `Population ${region.referencePeriods?.populationProfile ?? region.year ?? 'latest'}; income and age structure ${region.referencePeriods?.census ?? 'latest'}`,
      items: [
        { field: 'population', label: 'Population', value: availableNumber(region.population) },
        { field: 'populationGrowth', label: 'Population growth', value: availablePercentage(region.populationGrowth, true) },
        { field: 'childrenPercentage', label: 'Children', value: availablePercentage(region.childrenPercentage) },
        { field: 'medianIncome', label: 'Median annual income', value: availableCurrency(region.medianIncome) },
      ],
    },
    {
      tone: 'housing',
      title: 'Housing',
      icon: House,
      sourceLinks: profileDataLinks.housing,
      period: `House price ${region.referencePeriods?.housePrice ?? 'latest'}; rent ${region.referencePeriods?.rentQuarter ?? 'latest'}; tenure ${region.referencePeriods?.census ?? 'latest'}`,
      items: [
        { field: 'medianHousePrice', label: 'Median price', value: availableCurrency(region.medianHousePrice) },
        { field: 'medianRent', label: 'Median rent', value: isNumber(region.medianRent) ? `${formatCurrency(region.medianRent)}/wk` : unavailable },
        { field: 'priceToIncomeRatio', label: 'Price to income', value: isNumber(region.priceToIncomeRatio) ? `${region.priceToIncomeRatio.toFixed(1)}×` : unavailable },
        { field: 'homeOwnershipPercentage', label: 'Home ownership', value: availablePercentage(region.homeOwnershipPercentage) },
      ],
    },
    {
      tone: 'employment',
      title: 'Employment',
      icon: BriefcaseBusiness,
      sourceLinks: profileDataLinks.employment,
      period: `Employment ${region.referencePeriods?.employment ?? 'latest'}; vacancies ${region.referencePeriods?.vacancies ?? 'latest'}`,
      items: [
        { field: 'highestDemandOccupation', label: 'Highest-demand occupation', value: availableText(region.highestDemandOccupation), compact: true },
        { field: 'occupationVacancies', label: 'Top-five advertised vacancies', value: availableNumber(region.occupationVacancies) },
        { field: 'employmentGrowth', label: 'Employment growth', value: availablePercentage(region.employmentGrowth, true) },
        { field: 'totalEmployment', label: 'Total employment', value: availableNumber(region.totalEmployment) },
      ],
    },
    {
      tone: 'education',
      title: 'Education',
      icon: GraduationCap,
      sourceLinks: profileDataLinks.education,
      period: region.referencePeriods?.education,
      items: [
        { field: 'schoolCount', label: 'Schools', value: availableNumber(region.schoolCount) },
        { field: 'primarySchoolCount', label: 'Primary schools', value: availableNumber(region.primarySchoolCount) },
        { field: 'secondarySchoolCount', label: 'Secondary schools', value: availableNumber(region.secondarySchoolCount) },
        { field: 'year12CompletionYoungAdultsPercentage', label: 'Year 12 completion (young adults)', value: availablePercentage(region.year12CompletionYoungAdultsPercentage) },
      ],
    },
    {
      tone: 'health',
      title: 'Health & services',
      icon: HeartPulse,
      sourceLinks: profileDataLinks.health,
      period: region.referencePeriods?.healthcare,
      items: [
        { field: 'hospitalCount', label: 'Hospitals', value: availableNumber(region.hospitalCount) },
        { field: 'generalPracticeCount', label: 'General practices', value: availableNumber(region.generalPracticeCount) },
        { field: 'emergencyDepartmentCount', label: 'Emergency departments', value: availableNumber(region.emergencyDepartmentCount) },
        { field: 'emergencyDepartmentMedianTimeRange', label: 'Median time in ED (hospital range)', value: availableText(region.emergencyDepartmentMedianTimeRange), compact: true },
      ],
    },
    {
      tone: 'access',
      title: 'Safety & access',
      icon: ShieldCheck,
      sourceLinks: profileDataLinks.access,
      period: `${region.referencePeriods?.safety ?? 'Latest safety period'}; ${region.referencePeriods?.transport ?? 'latest transport period'}`,
      items: [
        { field: 'crimeRate', label: 'Offences per 1,000 residents', value: isNumber(region.crimeRate) ? region.crimeRate.toLocaleString('en-AU', { maximumFractionDigits: 1 }) : unavailable },
        { field: 'publicTransportFrequency', label: 'Public transport frequency', value: availableTransportFrequency(region.publicTransportFrequency), compact: true },
        { field: 'railAccess', label: 'Rail access', value: availableText(region.railAccess), compact: true },
        { field: 'growthPressureIndicator', label: 'Growth pressure indicator', value: availablePercentage(region.growthPressureIndicator, true) },
      ],
    },
  ] : [], [region]);

  if (requestStatus === 'not-found') return <Navigate to="/profile" replace/>;
  if (requestStatus === 'loading') return <p className="empty">Loading regional profile...</p>;
  if (requestStatus === 'error') return <p className="empty">The regional profile could not be loaded.</p>;

  const imageFile = imageFileAliases[region.id] ?? region.id;
  const imageUrl = `/images/regions/${imageFile}.jpg`;
  const saved = isSaved(region.id);
  const savedRegion = savedRegions.find(savedRegionItem => savedRegionItem.id === region.id);
  const navigationRecommendationContext = location.state?.regionId === region.id
    ? location.state.recommendationContext
    : null;
  const recommendationContext = navigationRecommendationContext ?? savedRegion?.recommendationContext ?? null;

  function handleShortlistToggle() {
    if (!saved && !canAddRegion) {
      setSaveMessage(`Your shortlist is full. Remove one of the ${shortlistLimit} saved regions before adding another.`);
      return;
    }
    toggleRegion({ ...region, recommendationContext });
    setSaveMessage(saved
      ? `${region.name} was removed from your shortlist.`
      : `${region.name} was added. Open Shortlist to choose exactly two regions to compare.`);
  }

  return (
    <section className="profile-page page-shell">
      <div className="profile-page-actions">
        <Link className="back-link" to="/explore">&larr; Back to regional areas</Link>
        <button
          className="button secondary"
          type="button"
          onClick={handleShortlistToggle}
          title={saved ? 'Remove this region from your shortlist' : `Save this region for later comparison (maximum ${shortlistLimit})`}
        >
          {saved ? 'Remove from Shortlist' : 'Add to Shortlist'}
        </button>
      </div>
      {saveMessage && <p className="profile-next-step" role="status">{saveMessage}</p>}
      <figure className="profile-photo-slot">
        <img src={imageUrl} alt={`${region.name} regional landscape`}/>
        <div className="profile-photo-overlay">
          <span>REGIONAL PROFILE</span>
          <strong>{region.name}</strong>
        </div>
        {imageCredit && (
          <figcaption>
            <details className="photo-credit">
              <summary>Photo credits</summary>
              <div>
                <span>Photo by {imageCredit.author}</span>
                <span>Licensed under {imageCredit.licence}</span>
                <nav aria-label="External image credit links">
                  <a href={imageCredit.sourcePage} target="_blank" rel="noreferrer">View source <span aria-hidden="true">↗</span></a>
                  <a href={imageCredit.licenceUrl} target="_blank" rel="noreferrer">View licence <span aria-hidden="true">↗</span></a>
                </nav>
              </div>
            </details>
          </figcaption>
        )}
      </figure>
      <WhyThisRegion regionName={region.name} recommendationContext={recommendationContext}/>
      <div className="profile-grid">
        {sections.map(section => <ProfileSection key={section.tone} {...section}/>)}
      </div>
      <details className="profile-further-information card">
        <summary>Further information, dates and limitations</summary>
        <div className="profile-further-information-content">
          <section>
            <h2>Reference periods</h2>
            <dl className="profile-reference-periods">
              {Object.entries(region.referencePeriods ?? {}).map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replace(/([A-Z])/g, ' $1').replace(/^./, character => character.toUpperCase())}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h2>How to interpret the figures</h2>
            <ul>
              <li>Population, housing, employment, health and safety figures use different reference periods; compare the date shown for each dataset.</li>
              <li>Employment and vacancy figures may use the broader SA4 area associated with this LGA.</li>
              <li>Service counts show facilities located in the LGA, not service quality, capacity, eligibility or travel time.</li>
              <li>Published regional projections currently end in 2036. The Towards 2050 page does not present an unverified 2050 forecast.</li>
            </ul>
            <nav className="official-data-links" aria-label="Official external data resources">
              <a href="https://www.data.vic.gov.au/" target="_blank" rel="noreferrer">Data.Vic <span aria-hidden="true">↗</span></a>
              <a href="https://www.abs.gov.au/" target="_blank" rel="noreferrer">Australian Bureau of Statistics <span aria-hidden="true">↗</span></a>
              <a href="https://www.jobsandskills.gov.au/" target="_blank" rel="noreferrer">Jobs and Skills Australia <span aria-hidden="true">↗</span></a>
            </nav>
          </section>
        </div>
      </details>
      <aside className="profile-journey-next-step">
        <strong>Ready to compare?</strong>
        <span>Add up to four regions to your shortlist, then select exactly two for a side-by-side comparison.</span>
        <Link className="button primary" to="/shortlist">Open Shortlist</Link>
      </aside>
    </section>
  );
}
