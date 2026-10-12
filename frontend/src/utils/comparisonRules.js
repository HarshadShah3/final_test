/*
 * Only metrics with a clear user-facing direction and a directly comparable
 * unit are eligible for bold "stronger result" treatment. Raw totals and
 * contextual growth measures are deliberately excluded because region or
 * source-geography size can make the larger value misleading.
 */
export const comparisonDirections = Object.freeze({
  medianIncome: 'higher',
  medianHouseholdIncomeWeekly: 'higher',
  seifaIrsdDecile2021: 'higher',
  medianHousePrice: 'lower',
  medianRent: 'lower',
  medianMortgageRepaymentMonthly: 'lower',
  priceToIncomeRatio: 'lower',
  rentToIncomeRatio: 'lower',
  affordableRentalShare: 'higher',
  medianRentGrowth2020To2025: 'lower',
  vacanciesPerThousandEmployed: 'higher',
  employmentGrowth: 'higher',
  schoolsPerTenThousandChildren: 'higher',
  year12CompletionYoungAdultsPercentage: 'higher',
  crimeRate: 'lower',
  publicTransportFrequency: 'higher',
});

/* Returns a winning side only for finite, unequal values under an approved direction. */
export function comparisonWinner(direction, valueA, valueB) {
  if (!direction || !Number.isFinite(valueA) || !Number.isFinite(valueB) || valueA === valueB) return null;
  if (direction === 'lower') return valueA < valueB ? 'A' : 'B';
  if (direction === 'higher') return valueA > valueB ? 'A' : 'B';
  return null;
}
