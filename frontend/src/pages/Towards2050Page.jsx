import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useRegionSelection } from '../context/RegionSelectionContext';
import { useSavedRegions } from '../context/SavedRegionsContext';
import { useComparisonSelection } from '../context/ComparisonSelectionContext';
import { fetchRegionalProjections } from '../services/regionApi';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { parseComparisonRegionIds, selectOutlookRegionIds } from '../utils/outlookRegionScope';
import { classifyPopulationOutlook } from '../utils/populationOutlook';

const chartColours = ['#1f5f42', '#2f79a0', '#a6622d', '#74539a'];
const milestoneYears = [2031, 2036, 2050];
const lastObservedYear = 2026;
const maximumDisplayedRegions = 4;

/* Treats null, blank, non-finite, and explicit unavailable forecast values as missing while preserving valid zeroes. */
function isAvailable(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value).trim().toLowerCase() !== 'not available';
}

/* Towards 2050 uses whole-number estimates so counts, money, rates, and charts never imply false precision. */
function formatIndicatorValue(value, unit) {
  if (!isAvailable(value)) return 'Not available';
  if (typeof value === 'string') return value;
  const roundedValue = Math.round(Number(value));
  if (unit === 'AUD') return formatCurrency(roundedValue);
  if (unit === 'AUD/week') return `${formatCurrency(roundedValue)}/wk`;
  if (unit === 'percent') return `${roundedValue}%`;
  if (unit === 'per 1,000 residents') return `${formatNumber(roundedValue)} per 1,000`;
  return formatNumber(roundedValue);
}

function compactWholeNumber(value) {
  return new Intl.NumberFormat('en-AU', {
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(Math.round(Number(value)));
}

function getIndicator(forecast, indicatorId) {
  return forecast?.indicators.find(indicator => indicator.id === indicatorId) ?? null;
}

function projectedChange(indicator) {
  if (!Number.isFinite(indicator?.baseline) || indicator.baseline <= 0 || !Number.isFinite(indicator?.projected)) return null;
  return ((indicator.projected - indicator.baseline) / indicator.baseline) * 100;
}

function buildTimeSeriesData(forecasts, seriesKey, includeProjections) {
  const visiblePoint = point => includeProjections || point.year <= lastObservedYear;
  const years = [...new Set(forecasts.flatMap(forecast => (
    forecast.series?.[seriesKey] ?? []
  ).filter(visiblePoint).map(point => point.year)))]
    .filter(Number.isFinite)
    .sort((first, second) => first - second);

  return years.map(year => {
    const row = { year };
    forecasts.forEach(forecast => {
      const point = (forecast.series?.[seriesKey] ?? []).find(item => item.year === year);
      row[forecast.region.id] = Number.isFinite(point?.value) ? Math.round(point.value) : null;
    });
    return row;
  });
}

function latestObservedValue(forecast, seriesKey) {
  return (forecast.series?.[seriesKey] ?? [])
    .filter(point => point.year <= lastObservedYear && Number.isFinite(point.value))
    .at(-1)?.value ?? null;
}

function milestoneValue(forecast, seriesKey, year) {
  return (forecast.series?.[seriesKey] ?? []).find(point => point.year === year)?.value ?? null;
}

function ProjectionToggle({ checked, onChange }) {
  return (
    <label className="forecast-projection-toggle">
      <span>
        <strong>Forecast</strong>
        <small>{checked ? 'Observed + projected' : `Observed to ${lastObservedYear}`}</small>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)} />
    </label>
  );
}

function ForecastBand({ visible }) {
  if (!visible) return null;
  return (
    <>
      <ReferenceArea x1={lastObservedYear} x2={2050} fill="#e8f0e9" fillOpacity={0.55} />
      <ReferenceLine x={lastObservedYear} stroke="#78907f" strokeDasharray="4 4" />
      {milestoneYears.map(year => (
        <ReferenceLine key={year} x={year} stroke="#d39b55" strokeDasharray="3 5" />
      ))}
    </>
  );
}

function TrendDot({ cx, cy, payload, colour }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const highlighted = milestoneYears.includes(payload?.year);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={highlighted ? 6 : 3}
      fill={highlighted ? '#d39b55' : '#fffdf8'}
      stroke={colour}
      strokeWidth={highlighted ? 3 : 2}
    />
  );
}

function MilestoneHighlights({ forecasts, seriesKey, unit, visible }) {
  if (!visible) return null;
  return (
    <div className="forecast-milestones" aria-label="Highlighted projection years">
      {milestoneYears.map(year => (
        <article key={year}>
          <strong>{year}</strong>
          {forecasts.map((forecast, index) => (
            <span key={forecast.region.id}>
              <i style={{ backgroundColor: chartColours[index % chartColours.length] }} />
              <small>{forecast.region.name}</small>
              <b>{formatIndicatorValue(milestoneValue(forecast, seriesKey, year), unit)}</b>
            </span>
          ))}
        </article>
      ))}
    </div>
  );
}

/* Resolves up to four journey regions and presents independently explorable population, housing, and employment evidence. */
export default function Towards2050Page() {
  const { selectedRegionId } = useRegionSelection();
  const { savedRegions } = useSavedRegions();
  const { comparisonRegionIds } = useComparisonSelection();
  const [searchParams] = useSearchParams();
  const requestedRegionIds = searchParams.get('regions') ?? '';
  const [displayedRegionIds, setDisplayedRegionIds] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [requestStatus, setRequestStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [projectionVisibility, setProjectionVisibility] = useState({
    population: true,
    housing: true,
    employment: true,
  });

  const availableRegions = useMemo(() => {
    const regionsById = new Map(savedRegions.map(region => [region.id, {
      id: region.id,
      name: region.name,
      state: region.state,
      fromMap: false,
      fromShortlist: true,
    }]));

    if (selectedRegionId) {
      const existing = regionsById.get(selectedRegionId);
      regionsById.set(selectedRegionId, {
        id: selectedRegionId,
        name: existing?.name ?? '',
        state: existing?.state ?? '',
        fromMap: true,
        fromShortlist: Boolean(existing),
      });
    }

    const regions = [...regionsById.values()];
    return regions.sort((first, second) => {
      if (first.fromMap !== second.fromMap) return first.fromMap ? -1 : 1;
      return (first.name || first.id).localeCompare(second.name || second.id);
    });
  }, [savedRegions, selectedRegionId]);

  const availableRegionIdsKey = availableRegions.map(region => region.id).join('|');

  useEffect(() => {
    const availableIds = availableRegions.map(region => region.id);
    const comparisonIds = requestedRegionIds
      ? parseComparisonRegionIds(requestedRegionIds)
      : comparisonRegionIds;
    setDisplayedRegionIds(current => {
      const next = selectOutlookRegionIds(availableIds, comparisonIds, current, maximumDisplayedRegions);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [availableRegionIdsKey, requestedRegionIds, comparisonRegionIds]);

  const displayedRegionIdsKey = displayedRegionIds.join('|');

  useEffect(() => {
    const requestController = new AbortController();
    if (!displayedRegionIds.length) {
      setForecasts([]);
      setRequestStatus('idle');
      setErrorMessage('');
      return () => requestController.abort();
    }

    setRequestStatus('loading');
    setErrorMessage('');
    fetchRegionalProjections(displayedRegionIds, requestController.signal)
      .then(response => {
        setForecasts(response.data);
        setRequestStatus('success');
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setForecasts([]);
          setErrorMessage(error.message || 'Forecast data could not be loaded.');
          setRequestStatus('error');
        }
      });
    return () => requestController.abort();
  }, [displayedRegionIdsKey]);

  const forecastById = useMemo(() => Object.fromEntries(
    forecasts.map(forecast => [forecast.region.id, forecast]),
  ), [forecasts]);

  const populationChartData = useMemo(() => buildTimeSeriesData(
    forecasts,
    'population',
    projectionVisibility.population,
  ), [forecasts, projectionVisibility.population]);

  const housingChartData = useMemo(() => buildTimeSeriesData(
    forecasts,
    'housingCost',
    projectionVisibility.housing,
  ), [forecasts, projectionVisibility.housing]);

  const employmentChartData = useMemo(() => forecasts.map(forecast => {
    const current = latestObservedValue(forecast, 'employment');
    const employment2031 = milestoneValue(forecast, 'employment', 2031);
    const employment2036 = milestoneValue(forecast, 'employment', 2036);
    const employment2050 = milestoneValue(forecast, 'employment', 2050);
    return {
      id: forecast.region.id,
      name: forecast.region.name,
      current: Number.isFinite(current) ? Math.round(current) : null,
      2031: Number.isFinite(employment2031) ? Math.round(employment2031) : null,
      2036: Number.isFinite(employment2036) ? Math.round(employment2036) : null,
      2050: Number.isFinite(employment2050) ? Math.round(employment2050) : null,
    };
  }), [forecasts]);

  const indicatorGroups = useMemo(() => {
    const indicatorById = new Map();
    forecasts.forEach(forecast => forecast.indicators
      .filter(indicator => indicator.id !== 'schools')
      .forEach(indicator => {
        if (!indicatorById.has(indicator.id)) indicatorById.set(indicator.id, indicator);
      }));
    return [...indicatorById.values()].reduce((groups, indicator) => {
      const group = groups.get(indicator.category) ?? [];
      group.push(indicator);
      groups.set(indicator.category, group);
      return groups;
    }, new Map());
  }, [forecasts]);

  function toggleDisplayedRegion(regionId) {
    setDisplayedRegionIds(current => {
      if (current.includes(regionId)) return current.filter(id => id !== regionId);
      if (current.length >= maximumDisplayedRegions) return current;
      return [...current, regionId];
    });
  }

  function setProjection(section, visible) {
    setProjectionVisibility(current => ({ ...current, [section]: visible }));
  }

  return (
    <section className="page-shell towards-page">
      <div className="profile-page-actions">
        <Link className="back-link" to="/compare">&larr; Back to Compare</Link>
      </div>
      <div className="page-heading towards-heading">
        <p className="eyebrow">LONG-TERM OUTLOOK</p>
        <h1>Towards 2050</h1>
        <p>Explore observed regional trends and switch projections on when you want to see the path to 2050.</p>
      </div>

      {!availableRegions.length ? (
        <section className="forecast-empty card">
          <h2>Choose regions to build your outlook</h2>
          <p>Select a highlighted area on the Explore map or save regions to your shortlist. They will appear here automatically.</p>
          <div><Link className="button primary" to="/explore">Open Explore map</Link><Link className="button secondary" to="/shortlist">Open shortlist</Link></div>
        </section>
      ) : (
        <>
          <section className="forecast-scope card" aria-label="Regions included in the forecast dashboard">
            <div className="forecast-scope-heading">
              <div><h2>Regions in this outlook</h2><p>Select up to {maximumDisplayedRegions} regions to keep the analysis readable.</p></div>
              <strong>{displayedRegionIds.length}/{maximumDisplayedRegions} selected</strong>
            </div>
            <div className="forecast-region-options">
              {availableRegions.map(region => {
                const forecast = forecastById[region.id];
                const isSelected = displayedRegionIds.includes(region.id);
                return (
                  <label className={isSelected ? 'selected' : ''} key={region.id}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isSelected && displayedRegionIds.length >= maximumDisplayedRegions}
                      onChange={() => toggleDisplayedRegion(region.id)}
                    />
                    <span><strong>{forecast?.region.name || region.name || 'Map-selected region'}</strong><small>{region.fromMap ? 'Explore map selection' : 'Shortlist'}{region.fromMap && region.fromShortlist ? ' · Shortlist' : ''}</small></span>
                  </label>
                );
              })}
            </div>
          </section>

          {requestStatus === 'loading' && <p className="forecast-status">Loading regional outlooks…</p>}
          {requestStatus === 'error' && <p className="forecast-error" role="alert">{errorMessage}</p>}

          {requestStatus === 'success' && forecasts.length > 0 && (
            <>
              <section className="forecast-kpi-grid" aria-label="Core forecast indicators">
                {forecasts.map((forecast, index) => {
                  const population = getIndicator(forecast, 'population');
                  const employment = getIndicator(forecast, 'employment');
                  const rent = getIndicator(forecast, 'medianRent');
                  const growth = projectedChange(population);
                  const populationOutlook = classifyPopulationOutlook(population?.baseline, population?.projected);
                  return (
                    <article className="forecast-kpi-card card" key={forecast.region.id}>
                      <i style={{ backgroundColor: chartColours[index % chartColours.length] }} />
                      <small>{forecast.region.state} · OUTLOOK TO {forecast.projectionYear ?? 'TBC'}</small>
                      <h2>{forecast.region.name}</h2>
                      <dl>
                        <div><dt>Current population</dt><dd>{formatIndicatorValue(latestObservedValue(forecast, 'population'), 'people')}</dd></div>
                        <div><dt>Projected population ({population?.projectedYear ?? forecast.projectionYear})</dt><dd>{formatIndicatorValue(population?.projected, 'people')}</dd></div>
                        <div><dt>Population change</dt><dd>{Number.isFinite(growth) ? `${growth >= 0 ? '+' : ''}${Math.round(growth)}%` : 'Not available'}</dd></div>
                        <div><dt>Growth classification</dt><dd>{populationOutlook?.growthBand ?? 'Not available'}</dd></div>
                        <div><dt>Projected weekly rent</dt><dd>{formatIndicatorValue(rent?.projected, rent?.unit)}</dd></div>
                        <div><dt>Projected employment</dt><dd>{formatIndicatorValue(employment?.projected, employment?.unit)}</dd></div>
                      </dl>
                    </article>
                  );
                })}
              </section>

              <div className="forecast-analysis-grid">
                <section className="forecast-chart forecast-chart-wide card">
                  <div className="forecast-panel-heading">
                    <div><p className="eyebrow">POPULATION</p><h2>Population trend</h2><p>Observed population to 2026, with official and modelled projections available on demand.</p></div>
                    <ProjectionToggle checked={projectionVisibility.population} onChange={value => setProjection('population', value)} />
                  </div>
                  <div className="forecast-chart-canvas">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={populationChartData} margin={{ top: 18, right: 22, left: 10, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e4" />
                        <ForecastBand visible={projectionVisibility.population} />
                        <XAxis dataKey="year" type="number" domain={['dataMin', 'dataMax']} allowDecimals={false} tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={compactWholeNumber} />
                        <Tooltip formatter={(value, regionId) => [formatIndicatorValue(value, 'people'), forecastById[regionId]?.region.name ?? regionId]} labelFormatter={year => `Year ${year}`} />
                        <Legend formatter={regionId => forecastById[regionId]?.region.name ?? regionId} />
                        {forecasts.map((forecast, index) => {
                          const colour = chartColours[index % chartColours.length];
                          return <Line connectNulls dataKey={forecast.region.id} key={forecast.region.id} stroke={colour} strokeWidth={3} dot={props => <TrendDot {...props} colour={colour} />} type="monotone" />;
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <MilestoneHighlights forecasts={forecasts} seriesKey="population" unit="people" visible={projectionVisibility.population} />
                </section>

                <section className="forecast-chart card">
                  <div className="forecast-panel-heading">
                    <div><p className="eyebrow">HOUSING</p><h2>Weekly rent outlook</h2><p>Annual median rent history and projected weekly housing cost.</p></div>
                    <ProjectionToggle checked={projectionVisibility.housing} onChange={value => setProjection('housing', value)} />
                  </div>
                  <div className="forecast-chart-canvas">
                    {housingChartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={housingChartData} margin={{ top: 18, right: 22, left: 10, bottom: 4 }}>
                          <defs>
                            {forecasts.map((forecast, index) => (
                              <linearGradient id={`rent-${forecast.region.id}`} key={forecast.region.id} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={chartColours[index % chartColours.length]} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={chartColours[index % chartColours.length]} stopOpacity={0.02} />
                              </linearGradient>
                            ))}
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e4" />
                          <ForecastBand visible={projectionVisibility.housing} />
                          <XAxis dataKey="year" type="number" domain={['dataMin', 'dataMax']} allowDecimals={false} tick={{ fontSize: 12 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={value => `$${compactWholeNumber(value)}`} />
                          <Tooltip formatter={(value, regionId) => [formatIndicatorValue(value, 'AUD/week'), forecastById[regionId]?.region.name ?? regionId]} labelFormatter={year => `Year ${year}`} />
                          <Legend formatter={regionId => forecastById[regionId]?.region.name ?? regionId} />
                          {forecasts.map((forecast, index) => {
                            const colour = chartColours[index % chartColours.length];
                            return <Area connectNulls dataKey={forecast.region.id} key={forecast.region.id} stroke={colour} strokeWidth={3} fill={`url(#rent-${forecast.region.id})`} dot={props => <TrendDot {...props} colour={colour} />} type="monotone" />;
                          })}
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : <p className="forecast-chart-empty">Rent history is not available for the selected regions.</p>}
                  </div>
                  <MilestoneHighlights forecasts={forecasts} seriesKey="housingCost" unit="AUD/week" visible={projectionVisibility.housing} />
                </section>

                <section className="forecast-chart card">
                  <div className="forecast-panel-heading">
                    <div><p className="eyebrow">EMPLOYMENT</p><h2>Employment milestones</h2><p>Compare the latest observed employment with the highlighted forecast years.</p></div>
                    <ProjectionToggle checked={projectionVisibility.employment} onChange={value => setProjection('employment', value)} />
                  </div>
                  <div className="forecast-chart-canvas">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={employmentChartData} layout="vertical" margin={{ top: 12, right: 22, left: 24, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e4" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={compactWholeNumber} />
                        <YAxis dataKey="name" type="category" width={95} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value, key) => [formatIndicatorValue(value, 'persons'), key === 'current' ? `Observed to ${lastObservedYear}` : `Forecast ${key}`]} />
                        <Legend formatter={key => key === 'current' ? `Observed to ${lastObservedYear}` : key} />
                        <Bar dataKey="current" name="current" fill="#1f5f42" radius={[0, 5, 5, 0]} />
                        {projectionVisibility.employment && <Bar dataKey="2031" name="2031" fill="#82a58e" radius={[0, 5, 5, 0]} />}
                        {projectionVisibility.employment && <Bar dataKey="2036" name="2036" fill="#d39b55" radius={[0, 5, 5, 0]} />}
                        {projectionVisibility.employment && <Bar dataKey="2050" name="2050" fill="#74539a" radius={[0, 5, 5, 0]} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>

              <section className="forecast-indicators" aria-labelledby="forecast-indicator-heading">
                <div className="comparison-section-heading compact">
                  <div>
                    <p className="eyebrow">REGIONAL EVIDENCE</p>
                    <h2 id="forecast-indicator-heading">Indicator framework</h2>
                  </div>
                  <p>Each value uses the correct source year and the same region-by-region structure as Compare.</p>
                </div>
                <div className="comparison-data-shell towards-indicator-shell">
                  <table className="comparison-data-table towards-indicator-table">
                    <thead><tr><th>Indicator</th>{forecasts.map(forecast => <th key={forecast.region.id}>{forecast.region.name}</th>)}</tr></thead>
                    <tbody>
                      {[...indicatorGroups.entries()].map(([category, indicators]) => (
                        <IndicatorRows category={category} forecasts={forecasts} indicators={indicators} key={category} />
                      ))}
                    </tbody>
                  </table>
                  <p className="comparison-help">Observed values are shown with their source year. Forecast values are rounded to whole numbers and remain estimates, not guarantees.</p>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}

/* Uses the Compare page table pattern while labelling the baseline and projection years for every regional value. */
function IndicatorRows({ category, forecasts, indicators }) {
  return (
    <>
      <tr className="comparison-category-row"><th colSpan={forecasts.length + 1}>{category}</th></tr>
      {indicators.map(indicator => (
        <tr className="comparison-metric-row" key={indicator.id}>
          <th scope="row"><strong>{indicator.label}</strong><small>{indicator.unit === 'text' ? '' : indicator.unit}</small></th>
          {forecasts.map(forecast => {
            const value = getIndicator(forecast, indicator.id);
            const hasProjection = isAvailable(value?.projected);
            const isCurrentObservation = value?.status === 'current-observation';
            return (
              <td key={forecast.region.id} data-town={forecast.region.name}>
                {hasProjection ? (
                  <div className="forecast-value-pair">
                    <span><small>{value?.baselineYear ?? forecast.baselineYear ?? 'Baseline'}</small><strong>{formatIndicatorValue(value?.baseline, value?.unit)}</strong></span>
                    <b aria-hidden="true">→</b>
                    <span className="projected"><small>{value?.projectedYear ?? forecast.projectionYear ?? 'Forecast'}</small><strong>{formatIndicatorValue(value.projected, value.unit)}</strong></span>
                  </div>
                ) : isCurrentObservation ? (
                  <div className="forecast-value-single"><small>{value?.baselineYear ?? 'Current observation'}</small><strong>{formatIndicatorValue(value?.baseline, value?.unit)}</strong></div>
                ) : (
                  <div className="forecast-value-single unavailable"><small>Forecast pending</small><strong>{formatIndicatorValue(value?.baseline, value?.unit)}</strong></div>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
