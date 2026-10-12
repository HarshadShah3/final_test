import { Database } from 'lucide-react';

/* Collects field-level sources across one or more regions and deduplicates them by source ID before disclosure. */
function uniqueSources(regions, fields) {
  const sources = new Map();
  regions.filter(Boolean).forEach(region => {
    const provenance = region.dataProvenance;
    if (!provenance) return;
    const sourceById = new Map((provenance.sources ?? []).map(source => [source.id, source]));
    const sourceIds = fields.length
      ? fields.map(field => provenance.fieldSources?.[field]).filter(Boolean)
      : provenance.sourceIds ?? [];
    sourceIds.forEach(sourceId => {
      const source = sourceById.get(sourceId);
      if (source) sources.set(source.id, source);
    });
  });
  return [...sources.values()];
}

/* Shows the reviewed source names and exposes table or file locations in a tooltip for the displayed fields. */
export default function DataSourceLabel({ region, regions = [], fields = [], className = '' }) {
  const resolvedRegions = region ? [region, ...regions] : regions;
  const sources = uniqueSources(resolvedRegions, fields);
  if (!sources.length) return null;
  const sourceNames = sources.map(source => source.label).join(' + ');
  const sourceLocations = sources.map(source => source.table ?? source.file).filter(Boolean).join(', ');

  return (
    <span className={`data-source-label ${className}`.trim()} title={`Data locations: ${sourceLocations}`}>
      <Database aria-hidden="true" size={13}/>
      Data source: {sourceNames}
    </span>
  );
}
