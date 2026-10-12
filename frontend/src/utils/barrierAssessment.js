const priorityCopy = {
  population: {
    title: 'Population outlook may not match your preference',
    explanation: 'Population size or growth signals are weaker than those of higher-ranked regions.',
  },
  housing: {
    title: 'Housing may be less affordable',
    explanation: 'Available rent or purchase-price indicators are weaker than your preferred comparison threshold.',
  },
  jobs: {
    title: 'Job opportunities may be more limited',
    explanation: 'Advertised vacancies or recent employment growth are weaker than those of higher-ranked regions.',
  },
};

const housePriceUpperBounds = {
  under550k: 550000,
  '550kTo700k': 700000,
};

function roundedScore(score) {
  return Math.round(score * 10) / 10;
}

function hardConstraintBarriers(region, recommendationContext) {
  const constraints = recommendationContext?.constraints ?? {};
  const barriers = [];
  const maximumHousePrice = Number.isFinite(constraints.maxHousePrice)
    ? constraints.maxHousePrice
    : housePriceUpperBounds[constraints.housePrice];

  if (Number.isFinite(maximumHousePrice)
    && Number.isFinite(region?.medianHousePrice)
    && region.medianHousePrice > maximumHousePrice) {
    barriers.push({
      id: 'house-price-limit',
      severity: 'critical',
      title: 'Above your house-price limit',
      description: `The reviewed median house price is above the maximum selected when this region was saved.`,
    });
  }

  if (Number.isFinite(constraints.maxDistanceKm)
    && Number.isFinite(recommendationContext?.locationAdjustment?.distanceKm)
    && recommendationContext.locationAdjustment.distanceKm > constraints.maxDistanceKm) {
    barriers.push({
      id: 'distance-limit',
      severity: 'critical',
      title: 'Beyond your maximum distance',
      description: `This region is approximately ${recommendationContext.locationAdjustment.distanceKm} km from your starting area, beyond your saved ${constraints.maxDistanceKm} km limit.`,
    });
  }

  return barriers;
}

/**
 * Converts the recommendation scores already returned by the backend into UI
 * messages. This helper must stay pure: do not fetch data or calculate a new
 * recommendation score here. Future constraints can be added to the saved
 * recommendationContext and evaluated alongside the existing score snapshot.
 */
export function buildBarrierAssessment(region, recommendationContext, threshold = 60) {
  const priorityBreakdown = Array.isArray(recommendationContext?.priorityBreakdown)
    ? recommendationContext.priorityBreakdown
    : [];
  const scoredPriorities = priorityBreakdown.filter(item => (
    item?.scored !== false && Number.isFinite(item?.score)
  ));
  const barriers = [
    ...hardConstraintBarriers(region, recommendationContext),
    ...scoredPriorities
      .filter(item => item.score < threshold)
      .map(item => {
        const copy = priorityCopy[item.priority] ?? {
          title: 'A preference needs closer review',
          explanation: 'This category is weaker than your preferred comparison threshold.',
        };
        return {
          id: `priority-${item.priority}`,
          severity: 'warning',
          title: copy.title,
          description: `${copy.explanation} It scored ${roundedScore(item.score)}/100; the review threshold is ${threshold}/100.`,
          detail: typeof item.reason === 'string' ? item.reason : '',
        };
      }),
  ];

  if (!recommendationContext || (!scoredPriorities.length && !barriers.length)) {
    return {
      status: 'unavailable',
      barriers: [],
      title: 'Barrier assessment unavailable',
      description: 'A preference score could not be calculated for this region. Review the detailed indicators instead.',
    };
  }

  if (!barriers.length) {
    return {
      status: 'positive',
      barriers: [],
      title: 'No significant barriers identified',
      description: `All available preference scores meet the ${threshold}/100 comparison threshold. Review the detailed indicators before making a decision.`,
    };
  }

  return { status: 'barriers', barriers };
}
