import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { housePriceOptions, populationOptions } from '../data/preferenceOptions';

/* Shows an initial subset of filter tags, expands on demand, and reports every selected value with pressed-button semantics. */
function TagGroup({ label, options, selectedValues, onToggle, visibleCount = 3 }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleOptions = isExpanded ? options : options.slice(0,visibleCount);
  const hiddenCount = options.length-visibleCount;
  return <fieldset><legend>{label}</legend><div className="choice-row">{visibleOptions.map(([value,text])=><button type="button" key={value} className={`chip ${selectedValues.includes(value)?'active':''}`} onClick={()=>onToggle(value)}>{text}</button>)}</div>{hiddenCount>0&&<button type="button" className="expand-tags" onClick={()=>setIsExpanded(current=>!current)}>{isExpanded?'Show less':`Show ${hiddenCount} more`}</button>}</fieldset>;
}

/* Edits draft filters in a modal that locks background scroll, traps focus, handles Escape, and applies changes explicitly. */
export default function Filters({
  draftFilters,
  selectedPriorities,
  priorityLabels,
  isOpen,
  onDraftChange,
  onApply,
  onClear,
  onClose,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('button, select')?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;

      const focusableElements = [...dialogRef.current.querySelectorAll('button:not(:disabled), select:not(:disabled)')];
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function applyAndClose() {
    onApply();
    onClose();
  }

  return (
    <div className="filter-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside ref={dialogRef} className="filters filter-dialog card" role="dialog" aria-modal="true" aria-labelledby="filter-dialog-title">
        <div className="filter-dialog-heading">
          <div>
            <p className="eyebrow">REFINE THE MAP</p>
            <h2 id="filter-dialog-title">Filter Victoria</h2>
          </div>
          <button className="filter-dialog-close" type="button" aria-label="Close filters" onClick={onClose}>
            <X aria-hidden="true" size={20}/>
          </button>
        </div>
        <p className="filter-intro">Limit the recommendation candidates while keeping the full Victoria map visible.</p>
        <TagGroup label="Population range" options={populationOptions} selectedValues={[draftFilters.population]} onToggle={population=>onDraftChange({...draftFilters,population})}/>
        <TagGroup label="House price range" options={housePriceOptions} selectedValues={[draftFilters.housePrice]} onToggle={housePrice=>onDraftChange({...draftFilters,housePrice})} visibleCount={4}/>
        <small className="filter-data-note">Regions without an available house-price value are excluded when a price range is selected.</small>
        <label>Map priority
          <select value={draftFilters.priority} disabled={!selectedPriorities.length} onChange={event=>onDraftChange({...draftFilters,priority:event.target.value})}>
            {selectedPriorities.length
              ? selectedPriorities.map(priority=><option key={priority} value={priority}>{priorityLabels[priority]}</option>)
              : <option value="">Choose priorities first</option>}
          </select>
        </label>
        <label>Ranking order
          <select value={draftFilters.sortDirection} onChange={event=>onDraftChange({...draftFilters,sortDirection:event.target.value})}>
            <option value="highToLow">Highest match first</option>
            <option value="lowToHigh">Lowest of top four first</option>
          </select>
        </label>
        <div className="filter-dialog-actions">
          <button className="button primary" type="button" onClick={applyAndClose}>Apply filters</button>
          <button className="button secondary" type="button" onClick={onClear}>Clear filters</button>
        </div>
      </aside>
    </div>
  );
}
