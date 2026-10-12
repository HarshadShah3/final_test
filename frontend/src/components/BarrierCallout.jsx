import { AlertTriangle, CheckCircle2, DatabaseZap, ShieldAlert } from 'lucide-react';
import { buildBarrierAssessment } from '../utils/barrierAssessment';

/* Maps critical and warning assessments to distinct icons so barrier severity is not communicated by colour alone. */
const severityIcons = {
  critical: ShieldAlert,
  warning: AlertTriangle,
};

/* Builds a region-specific assessment, then renders unavailable, positive, or detailed barrier evidence with accessible status cues. */
export default function BarrierCallout({ region, recommendationContext }) {
  if (!region) return null;

  const assessment = buildBarrierAssessment(region, recommendationContext);

  if (assessment.status === 'unavailable') {
    return (
      <div className="watch-out-message watch-out-unavailable">
        <DatabaseZap aria-hidden="true" size={21}/>
        <div>
          <strong>{assessment.title}</strong>
          <p>{assessment.description}</p>
        </div>
      </div>
    );
  }

  if (assessment.status === 'positive') {
    return (
      <div className="watch-out-message watch-out-positive">
        <CheckCircle2 aria-hidden="true" size={21}/>
        <div>
          <strong>{assessment.title}</strong>
          <p>{assessment.description}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="watch-out-list">
      {assessment.barriers.map(barrier => {
        const Icon = severityIcons[barrier.severity] ?? AlertTriangle;
        return (
          <article key={barrier.id} className={`watch-out-message watch-out-${barrier.severity}`}>
            <Icon aria-hidden="true" size={21}/>
            <div>
              <strong>{barrier.title}</strong>
              <p>{barrier.description}</p>
              {barrier.detail && <small>{barrier.detail}</small>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
