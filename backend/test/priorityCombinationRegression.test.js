import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendRegions, supportedPriorities } from '../src/services/recommendationService.js';

function combinations(values, size, start = 0, current = [], result = []) {
  if (current.length === size) {
    result.push([...current]);
    return result;
  }

  for (let index = start; index <= values.length - (size - current.length); index += 1) {
    current.push(values[index]);
    combinations(values, size, index + 1, current, result);
    current.pop();
  }
  return result;
}

const selectionCases = [1, 2, 3].flatMap(size => combinations(supportedPriorities, size));

test('covers all 7 valid one, two and three priority selections', () => {
  assert.equal(selectionCases.length, 7);

  for (const priorities of selectionCases) {
    const recommendations = recommendRegions({ priorities, location: 'Ballarat', resultLimit: 'all' });
    assert.equal(recommendations.length, 56, priorities.join(', '));

    for (const recommendation of recommendations) {
      assert.deepEqual(recommendation.priorityBreakdown.map(item => item.priority), priorities);
      assert.equal(recommendation.priorityCount, priorities.length);
      assert.equal(recommendation.outlook.projectionYear, 2036);
      const hasScoredPriority = recommendation.priorityBreakdown.some(item => item.scored);
      if (hasScoredPriority) {
        assert.ok(Number.isInteger(recommendation.matchScore));
        assert.ok(recommendation.matchScore >= 0 && recommendation.matchScore <= 100);
      } else {
        assert.equal(recommendation.matchScore, null);
      }

      const totalWeight = recommendation.priorityBreakdown.reduce((total, item) => total + item.weight, 0);
      assert.ok(Math.abs(totalWeight - 1) < 0.000001);
      const averageScore = recommendation.priorityBreakdown.reduce((total, item) => total + item.score, 0) / priorities.length;
      assert.equal(recommendation.priorityMatchScore, Math.round(averageScore));
    }

    for (const priority of priorities) {
      const priorityResults = recommendations.map(item => item.priorityBreakdown.find(result => result.priority === priority));
      if (priorityResults[0].scored) {
        const ranks = priorityResults.map(item => item.rank).sort((first, second) => first - second);
        assert.deepEqual(ranks, Array.from({ length:56 }, (_, index) => index + 1));
      } else {
        assert.ok(priorityResults.every(item => item.rank === null));
      }
    }
  }
});

test('combined results do not depend on the order of selected priorities', () => {
  const forward = recommendRegions({ priorities: ['population', 'housing', 'jobs'], location: 'Ballarat' });
  const reverse = recommendRegions({ priorities: ['jobs', 'housing', 'population'], location: 'Ballarat' });

  assert.deepEqual(
    forward.map(item => [item.region.id, item.matchScore]),
    reverse.map(item => [item.region.id, item.matchScore]),
  );
});
