import { useEffect, useRef, useState } from 'react';
import { Database, Maximize2, Minus, Plus } from 'lucide-react';

const MAP_WIDTH = 900;
const MAP_HEIGHT = 620;
const MAP_PADDING = 24;

const priorityColours = {
  population: ['#a84b0a', '#cf6812', '#ed8d20', '#f6bd62'],
  housing: ['#9f3f24', '#c75d35', '#e88558', '#f3b08d'],
  jobs: ['#8b5a06', '#b77b0d', '#dca21f', '#f2ca63'],
};

const INPUT_REGION_COLOUR = '#6f3d1f';
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/* Converts a geographic bounding box into a padded SVG projection while guarding empty or zero-sized geometry. */
function createProjection(bbox) {
  if (!bbox) return () => [0, 0];
  const [minimumLongitude, minimumLatitude, maximumLongitude, maximumLatitude] = bbox;
  const longitudeRange = Math.max(maximumLongitude - minimumLongitude, 0.0001);
  const latitudeRange = Math.max(maximumLatitude - minimumLatitude, 0.0001);
  const scale = Math.min(
    (MAP_WIDTH - MAP_PADDING * 2) / longitudeRange,
    (MAP_HEIGHT - MAP_PADDING * 2) / latitudeRange,
  );
  const drawingWidth = longitudeRange * scale;
  const drawingHeight = latitudeRange * scale;
  const horizontalOffset = (MAP_WIDTH - drawingWidth) / 2;
  const verticalOffset = (MAP_HEIGHT - drawingHeight) / 2;

  return ([longitude, latitude]) => [
    horizontalOffset + (longitude - minimumLongitude) * scale,
    verticalOffset + (maximumLatitude - latitude) * scale,
  ];
}

/* Converts Polygon and MultiPolygon rings into closed SVG path commands using the shared projection. */
function geometryPath(geometry, project) {
  if (!geometry) return '';
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map(polygon => polygon.map(ring => {
    const points = ring.map(coordinate => project(coordinate));
    return `${points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('')}Z`;
  }).join('')).join('');
}

/* Formats finite map metrics with Australian separators while leaving absent values explicitly unavailable. */
function formatMetric(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-AU').format(value) : 'Not available';
}

/* Recursively projects every geometry point and returns the bounding-box centre used to focus a selected region. */
function geometryCentre(geometry, project) {
  if (!geometry) return null;
  const points = [];

  function collect(coordinates) {
    if (typeof coordinates?.[0] === 'number' && typeof coordinates?.[1] === 'number') {
      points.push(project(coordinates));
      return;
    }
    coordinates?.forEach(collect);
  }

  collect(geometry.coordinates);
  if (!points.length) return null;
  const bounds = points.reduce((result, [x, y]) => ({
    minX: Math.min(result.minX, x),
    maxX: Math.max(result.maxX, x),
    minY: Math.min(result.minY, y),
    maxY: Math.max(result.maxY, y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

/* Renders ranked and starting regions, limits pan and zoom, exposes reviewed sources, and supports mouse, keyboard and touch interaction. */
export default function RegionalMap({
  featureCollection,
  rankedRegions,
  orderedRecommendations,
  priority,
  priorityLabel,
  sortDirection,
  inputRegion,
  selectedRegionId,
  onSelect,
  onClearSelection,
  children,
}) {
  const features = featureCollection?.features ?? [];
  const project = createProjection(featureCollection?.bbox);
  const [viewport, setViewport] = useState({ zoom: 1, centreX: MAP_WIDTH / 2, centreY: MAP_HEIGHT / 2 });
  const viewportRef = useRef(viewport);
  const activePointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    const selectedFeature = features.find(feature => feature.id === selectedRegionId);
    const centre = geometryCentre(selectedFeature?.geometry, project);
    if (!centre) return;
    setViewport(current => ({ ...current, zoom: Math.max(current.zoom, 2), centreX: centre.x, centreY: centre.y }));
  }, [selectedRegionId]);

  if (!features.length) return <div className="map-empty">The Victoria map is not available.</div>;

  const palette = priorityColours[priority] ?? priorityColours.population;
  const rankById = new Map(rankedRegions.map(region => [region.id, region]));
  const metricSources = [...new Map(features
    .map(feature => feature.properties.metric?.source)
    .filter(Boolean)
    .map(source => [source.id, source])).values()];
  const viewportWidth = MAP_WIDTH / viewport.zoom;
  const viewportHeight = MAP_HEIGHT / viewport.zoom;
  const viewportX = Math.min(Math.max(viewport.centreX - viewportWidth / 2, 0), MAP_WIDTH - viewportWidth);
  const viewportY = Math.min(Math.max(viewport.centreY - viewportHeight / 2, 0), MAP_HEIGHT - viewportHeight);

  function changeZoom(amount) {
    setViewport(current => ({ ...current, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom + amount)) }));
  }

  function resetViewport() {
    setViewport({ zoom: 1, centreX: MAP_WIDTH / 2, centreY: MAP_HEIGHT / 2 });
  }

  function startTouchGesture() {
    const points = [...activePointersRef.current.values()];
    const currentViewport = viewportRef.current;
    if (points.length === 1) {
      gestureRef.current = { type: 'pan', startPoint: points[0], viewport: currentViewport };
      return;
    }
    if (points.length >= 2) {
      const [first, second] = points;
      gestureRef.current = {
        type: 'pinch',
        startDistance: Math.max(Math.hypot(second.x - first.x, second.y - first.y), 1),
        startMidpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        viewport: currentViewport,
      };
    }
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse') return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointersRef.current.size === 1) suppressClickRef.current = false;
    startTouchGesture();
  }

  function handlePointerMove(event) {
    if (!activePointersRef.current.has(event.pointerId)) return;
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...activePointersRef.current.values()];
    const gesture = gestureRef.current;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!gesture || !bounds.width || !bounds.height) return;

    if (points.length === 1 && gesture.type === 'pan') {
      const movementX = gesture.startPoint.x - points[0].x;
      const movementY = gesture.startPoint.y - points[0].y;
      if (Math.hypot(movementX, movementY) > 5) suppressClickRef.current = true;
      setViewport({
        ...gesture.viewport,
        centreX: gesture.viewport.centreX + movementX * (MAP_WIDTH / gesture.viewport.zoom) / bounds.width,
        centreY: gesture.viewport.centreY + movementY * (MAP_HEIGHT / gesture.viewport.zoom) / bounds.height,
      });
      return;
    }

    if (points.length >= 2 && gesture.type === 'pinch') {
      const [first, second] = points;
      const distance = Math.max(Math.hypot(second.x - first.x, second.y - first.y), 1);
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gesture.viewport.zoom * distance / gesture.startDistance));
      suppressClickRef.current = true;
      setViewport({
        zoom,
        centreX: gesture.viewport.centreX + (gesture.startMidpoint.x - midpoint.x) * (MAP_WIDTH / gesture.viewport.zoom) / bounds.width,
        centreY: gesture.viewport.centreY + (gesture.startMidpoint.y - midpoint.y) * (MAP_HEIGHT / gesture.viewport.zoom) / bounds.height,
      });
    }
  }

  function handlePointerEnd(event) {
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size) startTouchGesture();
    else gestureRef.current = null;
  }

  function preventClickAfterTouchDrag(event) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  return (
    <div className={`regional-map-frame priority-${priority || 'none'}`}>
      <div className="regional-map-canvas">
        <svg
          className="regional-map"
          viewBox={`${viewportX} ${viewportY} ${viewportWidth} ${viewportHeight}`}
          role="group"
          aria-label={`Complete map of Victoria with recommendations for ${priorityLabel}. Zoom ${viewport.zoom.toFixed(1)} times.`}
          onClickCapture={preventClickAfterTouchDrag}
          onClick={event => event.target === event.currentTarget && onClearSelection?.()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <path className="victoria-state-background" d={geometryPath(featureCollection.stateBoundary?.geometry, project)} />
          {features.map(feature => {
          const ranking = rankById.get(feature.id);
          const isInputRegion = feature.id === inputRegion?.id;
          const isInteractive = Boolean(ranking) || isInputRegion;
          const isSelected = feature.id === selectedRegionId;
          const metric = feature.properties.metric;
          const rankingText = ranking ? `, backend recommendation rank ${ranking.rank} of 4` : ', not in the current top four';
          const inputRegionText = isInputRegion ? ', your entered regional area' : '';
          return (
            <path
              className={`map-region-shape ${ranking ? 'recommended' : ''} ${isInputRegion ? 'input-region' : ''} ${!isInteractive ? 'map-background-region' : ''} ${isSelected ? 'selected' : ''}`}
              d={geometryPath(feature.geometry, project)}
              fill={isInputRegion ? INPUT_REGION_COLOUR : ranking ? palette[ranking.rank - 1] : '#ffe4ac'}
              key={feature.id}
              role={isInteractive ? 'button' : undefined}
              tabIndex={isInteractive ? 0 : -1}
              aria-hidden={!isInteractive || undefined}
              aria-pressed={isSelected}
              aria-label={isInteractive ? `${feature.properties.name}${inputRegionText}${rankingText}. ${metric.label}: ${formatMetric(metric.value)}` : undefined}
              onClick={isInteractive ? () => onSelect(feature.id) : undefined}
              onKeyDown={event => {
                if (isInteractive && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onSelect(feature.id);
                }
              }}
            >
              <title>{feature.properties.name} — {ranking ? `Rank #${ranking.rank}, ${Number.isFinite(ranking.score) ? `${ranking.score}% match` : 'match score unavailable'}` : 'Background area'}</title>
            </path>
          );
          })}
        </svg>
        <div className="map-controls" aria-label="Map zoom controls">
          <button type="button" aria-label="Zoom in" disabled={viewport.zoom >= MAX_ZOOM} onClick={() => changeZoom(0.5)}><Plus aria-hidden="true" size={18}/></button>
          <button type="button" aria-label="Zoom out" disabled={viewport.zoom <= MIN_ZOOM} onClick={() => changeZoom(-0.5)}><Minus aria-hidden="true" size={18}/></button>
          <button type="button" aria-label="Reset map zoom" onClick={resetViewport}><Maximize2 aria-hidden="true" size={16}/></button>
          <span aria-live="polite">{viewport.zoom.toFixed(1)}×</span>
        </div>
        {children}
      </div>
      <section className="recommendation-legend" aria-label={`${priorityLabel} recommendation ranking`}>
        <div className="recommendation-legend-heading">
          <strong>{rankedRegions.length ? `Top ${rankedRegions.length}: ${priorityLabel}` : 'No recommendation highlighted'}</strong>
          <small>{sortDirection === 'lowToHigh' ? 'Lowest of the top four shown first' : 'Highest-ranked area shown first'}</small>
        </div>
        {orderedRecommendations.length ? (
          <ol>
            {orderedRecommendations.map(region => (
              <li key={region.id}>
                <i style={{ backgroundColor: palette[region.rank - 1] }} />
                <span><b>#{region.rank}</b> {region.name}</span>
                <small>{Number.isFinite(region.score) ? `${region.score}% match` : 'Score unavailable'}</small>
              </li>
            ))}
          </ol>
        ) : <p>Choose a preference on Find My Region to show the four backend-ranked areas.</p>}
        <div className="map-legend-keys">
          {inputRegion && <div className="input-region-key"><i /> Your region: {inputRegion.properties.name}</div>}
          <div className="background-key"><i /> Other Victorian areas (map background only)</div>
        </div>
      </section>
      {metricSources.length > 0 && (
        <p className="map-data-source" title={metricSources.map(source => source.table ?? source.file).filter(Boolean).join(', ')}>
          <Database aria-hidden="true" size={13}/>
          Data source: {metricSources.map(source => source.label).join(' + ')}
        </p>
      )}
    </div>
  );
}
