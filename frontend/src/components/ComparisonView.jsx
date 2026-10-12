import {
  BriefcaseBusiness,
  BusFront,
  GraduationCap,
  HeartPulse,
  House,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import BarrierCallout from './BarrierCallout';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { comparisonDirections, comparisonWinner } from '../utils/comparisonRules';

const categories = [
  'Population & income',
  'Housing',
  'Employment',
  'Schools & services',
  'Safety & access',
  'Outlook',
];

const categoryIcons = {
  'Population & income': Users,
  Housing: House,
  Employment: BriefcaseBusiness,
  'Schools & services': GraduationCap,
  'Safety & access': ShieldCheck,
  Outlook: TrendingUp,
};

const percentage = value => `${Number(value).toFixed(1)}%`;
const signedPercentage = value => `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)}%`;
const weeklyCurrency = value => `${formatCurrency(value)}/wk`;
const monthlyCurrency = value => `${formatCurrency(value)}/month`;
const weekdayCallsPerStop = value => `${Number(value).toFixed(1)} calls/stop (weekday)`;
const ratio = value => `${Number(value).toFixed(1)}×`;
const decimal = value => Number(value).toFixed(1);

const comparisonRows = [
  { category: 'Population & income', key: 'population', label: 'Population', formatter: formatNumber },
  { category: 'Population & income', key: 'populationGrowth', label: 'Population growth', formatter: signedPercentage },
  { category: 'Population & income', key: 'childrenPercentage', label: 'Children', formatter: percentage },
  { category: 'Population & income', key: 'workingAgePercentage', label: 'Working-age residents', formatter: percentage },
  { category: 'Population & income', key: 'medianIncome', label: 'Median annual income', formatter: formatCurrency },
  { category: 'Population & income', key: 'medianHouseholdIncomeWeekly', label: 'Median household income', formatter: weeklyCurrency },
  { category: 'Population & income', key: 'seifaIrsdDecile2021', label: 'SEIFA relative disadvantage decile', formatter: formatNumber },

  { category: 'Housing', key: 'medianHousePrice', label: 'Median house price', formatter: formatCurrency },
  { category: 'Housing', key: 'medianRent', label: 'Median rent', formatter: weeklyCurrency },
  { category: 'Housing', key: 'medianMortgageRepaymentMonthly', label: 'Median mortgage repayment', formatter: monthlyCurrency },
  { category: 'Housing', key: 'priceToIncomeRatio', label: 'Price-to-income ratio', formatter: ratio },
  { category: 'Housing', key: 'rentToIncomeRatio', label: 'Rent-to-income ratio', formatter: percentage },
  { category: 'Housing', key: 'homeOwnershipPercentage', label: 'Home ownership', formatter: percentage },
  { category: 'Housing', key: 'rentingPercentage', label: 'Renting households', formatter: percentage },
  { category: 'Housing', key: 'affordableRentalShare', label: 'Affordable rental share', formatter: percentage },
  { category: 'Housing', key: 'medianRentGrowth2020To2025', label: 'Latest five-year rent growth', formatter: signedPercentage },
  { category: 'Housing', key: 'rentalListingsMarch2025', label: 'Latest rental lettings', formatter: formatNumber },

  { category: 'Employment', key: 'leadingEmploymentSectors', label: 'Leading industries' },
  { category: 'Employment', key: 'highestDemandOccupation', label: 'Highest-demand occupation' },
  { category: 'Employment', key: 'occupationVacancies', label: 'Top-five advertised vacancies', formatter: formatNumber },
  { category: 'Employment', key: 'vacanciesPerThousandEmployed', label: 'Top-five vacancies per 1,000 employed', formatter: decimal },
  { category: 'Employment', key: 'employmentGrowth', label: 'Employment growth', formatter: signedPercentage },
  { category: 'Employment', key: 'totalEmployment', label: 'SA4 total employment', formatter: formatNumber },

  { category: 'Schools & services', key: 'schoolCount', label: 'Schools', formatter: formatNumber },
  { category: 'Schools & services', key: 'primarySchoolCount', label: 'Primary schools', formatter: formatNumber },
  { category: 'Schools & services', key: 'secondarySchoolCount', label: 'Secondary schools', formatter: formatNumber },
  { category: 'Schools & services', key: 'schoolsPerTenThousandChildren', label: 'Schools per 10,000 children', formatter: decimal },
  { category: 'Schools & services', key: 'schoolAgePopulationShare', label: 'School-age population share', formatter: percentage },
  { category: 'Schools & services', key: 'year12CompletionYoungAdultsPercentage', label: 'Year 12 completion, young adults', formatter: percentage },
  { category: 'Schools & services', key: 'hospitalCount', label: 'Hospitals', formatter: formatNumber },
  { category: 'Schools & services', key: 'generalPracticeCount', label: 'General practices', formatter: formatNumber },
  { category: 'Schools & services', key: 'emergencyDepartmentCount', label: 'Emergency departments', formatter: formatNumber },
  { category: 'Schools & services', key: 'emergencyDepartmentMedianTimeRange', label: 'Median time in ED (hospital range)' },

  { category: 'Safety & access', key: 'crimeRate', label: 'Recorded offences per 1,000 residents', formatter: decimal },
  { category: 'Safety & access', key: 'publicTransportFrequency', label: 'Public transport frequency', formatter: weekdayCallsPerStop },
  { category: 'Safety & access', key: 'railAccess', label: 'Rail access' },

  { category: 'Outlook', key: 'projectedPopulation', label: 'Projected population', formatter: formatNumber },
  { category: 'Outlook', key: 'projectionYear', label: 'Projection year', formatter: formatNumber },
  { category: 'Outlook', key: 'projectedHouseholds', label: 'Projected households', formatter: formatNumber },
  { category: 'Outlook', key: 'projectedDwellings', label: 'Projected dwellings', formatter: formatNumber },
  { category: 'Outlook', key: 'populationGrowth2001To2025', label: 'Population growth, 2001–2025', formatter: signedPercentage },
  { category: 'Outlook', key: 'populationCagr2001To2025', label: 'Population CAGR, 2001–2025', formatter: signedPercentage },
  { category: 'Outlook', key: 'growthPressureIndicator', label: 'Growth pressure indicator', formatter: signedPercentage },
];

/* Treats null, blank, non-finite, and explicit unavailable values as missing while preserving meaningful numeric zeroes. */
function isAvailable(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value).trim().toLowerCase() !== 'not available';
}

/* Removes empty label fragments before joining reviewed values into one compact comparison description. */
function joinAvailable(parts) {
  return parts.filter(Boolean).join(' · ');
}

/* Six concise, data-backed decision categories sit above the complete detailed comparison. */
const alignedCategoryRows = [
  {
    id: 'job-demand',
    label: 'Job demand',
    Icon: BriefcaseBusiness,
    fields: ['vacanciesPerThousandEmployed', 'occupationVacancies', 'highestDemandOccupation'],
    direction: 'higher',
    resolve(region) {
      const value = region?.vacanciesPerThousandEmployed;
      return {
        numericValue: isAvailable(value) ? Number(value) : null,
        primary: isAvailable(value) ? `${decimal(value)} per 1,000 employed` : null,
        secondary: joinAvailable([
          isAvailable(region?.occupationVacancies) ? `${formatNumber(region.occupationVacancies)} advertised vacancies` : null,
          isAvailable(region?.highestDemandOccupation) ? `Highest demand: ${region.highestDemandOccupation}` : null,
        ]),
      };
    },
  },
  {
    id: 'housing-affordability',
    label: 'Housing affordability',
    Icon: House,
    fields: ['affordableRentalShare', 'medianRent', 'medianHousePrice'],
    direction: 'higher',
    resolve(region) {
      const value = region?.affordableRentalShare;
      return {
        numericValue: isAvailable(value) ? Number(value) : null,
        primary: isAvailable(value) ? `${percentage(value)} affordable rentals` : null,
        secondary: joinAvailable([
          isAvailable(region?.medianRent) ? `Median rent ${weeklyCurrency(region.medianRent)}` : null,
          isAvailable(region?.medianHousePrice) ? `Median house price ${formatCurrency(region.medianHousePrice)}` : null,
        ]),
      };
    },
  },
  {
    id: 'healthcare-access',
    label: 'Healthcare access',
    Icon: HeartPulse,
    fields: ['hospitalCount', 'generalPracticeCount', 'emergencyDepartmentCount', 'emergencyDepartmentMedianTimeRange'],
    resolve(region) {
      const hospitals = region?.hospitalCount;
      return {
        numericValue: null,
        primary: isAvailable(hospitals) ? `${formatNumber(hospitals)} hospitals` : null,
        secondary: joinAvailable([
          isAvailable(region?.generalPracticeCount) ? `${formatNumber(region.generalPracticeCount)} general practices` : null,
          isAvailable(region?.emergencyDepartmentCount) ? `${formatNumber(region.emergencyDepartmentCount)} emergency departments` : null,
          isAvailable(region?.emergencyDepartmentMedianTimeRange) ? `Median time in ED ${region.emergencyDepartmentMedianTimeRange}` : null,
        ]),
      };
    },
  },
  {
    id: 'population-income',
    label: 'Population & income',
    Icon: Users,
    fields: ['medianHouseholdIncomeWeekly', 'populationGrowth', 'seifaIrsdDecile2021'],
    direction: 'higher',
    resolve(region) {
      const income = region?.medianHouseholdIncomeWeekly;
      return {
        numericValue: isAvailable(income) ? Number(income) : null,
        primary: isAvailable(income) ? `${weeklyCurrency(income)} household income` : null,
        secondary: joinAvailable([
          isAvailable(region?.populationGrowth) ? `${signedPercentage(region.populationGrowth)} population growth` : null,
          isAvailable(region?.seifaIrsdDecile2021) ? `SEIFA decile ${formatNumber(region.seifaIrsdDecile2021)}` : null,
        ]),
      };
    },
  },
  {
    id: 'safety',
    label: 'Safety',
    Icon: ShieldCheck,
    fields: ['crimeRate', 'recordedOffences2025'],
    direction: 'lower',
    resolve(region) {
      const crimeRate = region?.crimeRate;
      return {
        numericValue: isAvailable(crimeRate) ? Number(crimeRate) : null,
        primary: isAvailable(crimeRate) ? `${decimal(crimeRate)} offences per 1,000 residents` : null,
        secondary: isAvailable(region?.recordedOffences2025)
          ? `${formatNumber(region.recordedOffences2025)} recorded offences in 2025`
          : '',
      };
    },
  },
  {
    id: 'transport-access',
    label: 'Transport access',
    Icon: BusFront,
    fields: ['publicTransportFrequency', 'publicTransportActiveStopCount', 'trainStationCount', 'railAccess'],
    direction: 'higher',
    resolve(region) {
      const frequency = region?.publicTransportFrequency;
      return {
        numericValue: isAvailable(frequency) ? Number(frequency) : null,
        primary: isAvailable(frequency) ? weekdayCallsPerStop(frequency) : null,
        secondary: joinAvailable([
          isAvailable(region?.publicTransportActiveStopCount) ? `${formatNumber(region.publicTransportActiveStopCount)} active stops` : null,
          isAvailable(region?.trainStationCount) ? `${formatNumber(region.trainStationCount)} train stations` : null,
          isAvailable(region?.railAccess) ? region.railAccess : null,
        ]),
      };
    },
  },
];

/* Reads a row field from the region and applies its unit-aware formatter before the value enters the comparison table. */
function displayValue(row, town) {
  const value = town?.[row.key];
  if (!isAvailable(value)) return 'Not available';
  return row.formatter ? row.formatter(value) : String(value);
}

/* Applies the audited direction allow-list; contextual or scale-dependent rows never receive a winner. */
function winningTown(row, townA, townB) {
  return comparisonWinner(comparisonDirections[row.key], townA?.[row.key], townB?.[row.key]);
}

/* Applies each overview row's preferred direction to finite, unequal values and leaves ties or unavailable evidence unranked. */
function winningAlignedCategory(row, valueA, valueB) {
  return comparisonWinner(row.direction, valueA.numericValue, valueB.numericValue);
}

/* Renders reviewed category content when present, otherwise distinguishes an unselected region from unavailable evidence. */
function CategoryValue({ value, hasRegion }) {
  if (!hasRegion) {
    return (
      <div className="aligned-category-value awaiting-selection">
        <strong>Select Region for Comparison</strong>
      </div>
    );
  }

  if (!value.primary) {
    return (
      <div className="aligned-category-value unavailable">
        <strong>Data not available</strong>
        <small>Awaiting reviewed data source</small>
      </div>
    );
  }

  return (
    <div className="aligned-category-value">
      <strong>{value.primary}</strong>
      {value.secondary && <small>{value.secondary}</small>}
    </div>
  );
}

/* Filters out evidence-free overview rows, formats both regions, and bolds only the better value under an explicit rule. */
function AlignedCategoryOverview({ townA, townB }) {
  const visibleRows = alignedCategoryRows
    .map(row => ({ row, valueA: row.resolve(townA), valueB: row.resolve(townB) }))
    .filter(({ valueA, valueB }) => valueA.primary || valueB.primary);

  if (!visibleRows.length) return null;

  return (
    <section className="aligned-category-section" aria-labelledby="aligned-category-heading">
      <div className="comparison-section-heading">
        <div>
          <p className="eyebrow">CATEGORY OVERVIEW</p>
          <h2 id="aligned-category-heading">Compare what matters</h2>
        </div>
      </div>
      <div className="comparison-data-shell aligned-category-shell">
        <table className="comparison-data-table aligned-category-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">{townA?.name ?? 'Select Region for Comparison'}</th>
              <th scope="col">{townB?.name ?? 'Select Region for Comparison'}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, valueA, valueB }) => {
              const winner = winningAlignedCategory(row, valueA, valueB);
              const Icon = row.Icon;
              return (
                <tr key={row.id} className="aligned-category-row">
                  <th scope="row">
                    <span className="aligned-category-icon" aria-hidden="true"><Icon size={20}/></span>
                    <span>
                      <strong>{row.label}</strong>
                    </span>
                  </th>
                  <td data-region={townA?.name ?? 'Region A'} className={winner === 'A' ? 'winning-cell' : ''}><CategoryValue value={valueA} hasRegion={Boolean(townA)}/></td>
                  <td data-region={townB?.name ?? 'Region B'} className={winner === 'B' ? 'winning-cell' : ''}><CategoryValue value={valueB} hasRegion={Boolean(townB)}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="comparison-help">Bold values indicate the stronger result for that individual category only. Job-demand figures may use the broader SA4 geography associated with each LGA.</p>
      </div>
    </section>
  );
}

/* Pairs each loaded region with its saved recommendation context so watch-outs remain specific to the user's earlier priorities. */
function WatchOutComparison({ townA, townB }) {
  const comparisonTowns = [townA, townB].filter(Boolean);
  if (!comparisonTowns.length) return null;

  return (
    <section className="comparison-watch-out-section" aria-labelledby="comparison-watch-out-heading">
      <div className="comparison-section-heading compact">
        <div>
          <p className="eyebrow">PERSONALISED CHECK</p>
          <h2 id="comparison-watch-out-heading">Potential barriers</h2>
        </div>
        <p>Warnings use the latest available scores for your current preferences and refresh when the comparison loads.</p>
      </div>
      <div className="comparison-watch-out-grid">
        {comparisonTowns.map(town => (
          <article className="comparison-watch-out-card" key={town.id}>
            <p className="comparison-watch-out-region">{town.name}</p>
            <h3>Watch out for</h3>
            <BarrierCallout region={town} recommendationContext={town.recommendationContext}/>
          </article>
        ))}
      </div>
    </section>
  );
}

/* Builds available category tabs and grouped rows, then coordinates aligned evidence, watch-outs, missing data, and removal actions. */
export default function ComparisonView({ townA, townB, activeCategory = 'All data', onCategoryChange, onRemoveA, onRemoveB }) {
  if (!townA && !townB) {
    return (
      <section className="comparison-awaiting-selection card">
        <h2>Select Region for Comparison</h2>
        <p>Choose one or two shortlisted regions above to see the available comparison data.</p>
      </section>
    );
  }

  const availableCategories = categories.filter(category => comparisonRows.some(row => (
    row.category === category && (isAvailable(townA?.[row.key]) || isAvailable(townB?.[row.key]))
  )));
  const effectiveCategory = activeCategory === 'All data' || availableCategories.includes(activeCategory)
    ? activeCategory
    : 'All data';
  const visibleCategories = effectiveCategory === 'All data' ? availableCategories : [effectiveCategory];
  const availableRows = comparisonRows.filter(row => (
    visibleCategories.includes(row.category)
    && (isAvailable(townA?.[row.key]) || isAvailable(townB?.[row.key]))
  ));

  return (
    <>
      <AlignedCategoryOverview townA={townA} townB={townB}/>
      <WatchOutComparison townA={townA} townB={townB}/>

      {availableRows.length > 0 && <section className="detailed-comparison-section" aria-labelledby="detailed-comparison-heading">
        <div className="comparison-section-heading compact">
          <div>
            <p className="eyebrow">DETAILED DATA</p>
            <h2 id="detailed-comparison-heading">Regional profile details</h2>
          </div>
        </div>
        <nav className="comparison-tabs" aria-label="Detailed comparison data categories">
          {['All data', ...availableCategories].map(category => (
            <button
              key={category}
              type="button"
              className={effectiveCategory === category ? 'active' : ''}
              aria-pressed={effectiveCategory === category}
              onClick={() => onCategoryChange?.(category)}
            >
              {category}
            </button>
          ))}
        </nav>
        <div className="comparison-product-shell">
          <div className="comparison-product-header" aria-label="Regions being compared">
            <article>
              <div className="comparison-town-heading">
                <span><strong>{townA?.name ?? 'Select Region for Comparison'}</strong><small>{townA?.state ?? ''}</small></span>
                {townA && onRemoveA && <button type="button" aria-label={`Remove ${townA.name} from comparison`} onClick={onRemoveA}><X size={20}/></button>}
              </div>
            </article>
            <article>
              <div className="comparison-town-heading">
                <span><strong>{townB?.name ?? 'Select Region for Comparison'}</strong><small>{townB?.state ?? ''}</small></span>
                {townB && onRemoveB && <button type="button" aria-label={`Remove ${townB.name} from comparison`} onClick={onRemoveB}><X size={20}/></button>}
              </div>
            </article>
          </div>

          <div className="comparison-feature-groups">
            {visibleCategories.map(category => {
              const categoryRows = availableRows.filter(row => row.category === category);
              const CategoryIcon = categoryIcons[category];
              if (!categoryRows.length) return null;
              return (
                <section className="comparison-feature-group" key={category} aria-labelledby={`comparison-${category.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
                  <div className="comparison-feature-group-heading">
                    {CategoryIcon && (
                      <CategoryIcon aria-hidden="true" size={32}/>
                    )}
                    <h3 id={`comparison-${category.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>{category}</h3>
                  </div>
                  <div className="comparison-feature-list">
                    {categoryRows.map(row => {
                      const winner = winningTown(row, townA, townB);
                      const valueA = townA ? displayValue(row, townA) : 'Select Region for Comparison';
                      const valueB = townB ? displayValue(row, townB) : 'Select Region for Comparison';
                      const availableA = Boolean(townA) && isAvailable(townA?.[row.key]);
                      const availableB = Boolean(townB) && isAvailable(townB?.[row.key]);
                      const numericA = availableA && typeof townA?.[row.key] === 'number';
                      const numericB = availableB && typeof townB?.[row.key] === 'number';
                      return (
                        <div className="comparison-feature-row" key={row.key}>
                          <article className={`comparison-feature-value ${numericA ? 'numeric' : ''} ${availableA ? '' : 'unavailable'} ${winner === 'A' ? 'winning-cell' : ''}`}>
                            <span className="comparison-feature-region">{townA?.name ?? 'Region A'}</span>
                            <strong>{valueA}</strong>
                            <h4>{row.label}</h4>
                          </article>
                          <article className={`comparison-feature-value ${numericB ? 'numeric' : ''} ${availableB ? '' : 'unavailable'} ${winner === 'B' ? 'winning-cell' : ''}`}>
                            <span className="comparison-feature-region">{townB?.name ?? 'Region B'}</span>
                            <strong>{valueB}</strong>
                            <h4>{row.label}</h4>
                          </article>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <p className="comparison-help">Bold values are limited to directly comparable prices, incomes, rates and percentages where a higher or lower result has a clear meaning. Raw totals and contextual growth figures are not ranked. Employment figures may use the broader SA4 geography associated with each LGA.</p>
        </div>
      </section>}
    </>
  );
}
