export const priorityOptions = [
  ['population', 'Population and growth', 'Compare current population and the latest available regional growth outlook.'],
  ['housing', 'Housing affordability', 'Compare home prices or weekly rent with other Victorian regions.'],
  ['jobs', 'Employment opportunities', 'See places with stronger advertised-job and employment signals.'],
];

export const priorityLabels = Object.fromEntries(priorityOptions.map(([value, label]) => [value, label]));

export const populationOptions = [
  ['all', 'Any size'],
  ['under10k', 'Under 10k'],
  ['10kTo20k', '10k–20k'],
  ['20kTo30k', '20k–30k'],
  ['30kTo50k', '30k–50k'],
  ['50kTo100k', '50k–100k'],
  ['over100k', '100k+'],
];

export const housePriceOptions = [
  ['all', 'Any price'],
  ['under550k', 'Under $550k'],
  ['550kTo700k', '$550k–$700k'],
  ['over700k', '$700k+'],
];
