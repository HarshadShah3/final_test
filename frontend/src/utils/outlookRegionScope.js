export function parseComparisonRegionIds(value) {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').map(id => id.trim()).filter(Boolean))];
}

export function selectOutlookRegionIds(availableIds, requestedIds, currentIds, limit = 4) {
  const available = new Set(availableIds);
  const requested = requestedIds.filter(id => available.has(id)).slice(0, limit);
  if (requested.length) return requested;

  const selected = [...new Set(currentIds.filter(id => available.has(id)))].slice(0, limit);
  for (const id of availableIds) {
    if (selected.length >= limit) break;
    if (!selected.includes(id)) selected.push(id);
  }
  return selected;
}
