import http from 'k6/http';
import { check, sleep } from 'k6';

// k6 options to simulate a load test for the national scale
export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp-up to 50 users over 30 seconds
    { duration: '1m', target: 50 },   // Stay at 50 users for 1 minute
    { duration: '30s', target: 0 },   // Ramp-down to 0 users
  ],
  thresholds: {
    // We want the 95th percentile of all HTTP request durations to be less than 500ms
    http_req_duration: ['p(95)<500'],
    // We want less than 1% of requests to fail
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // Assuming the backend is running on localhost:3001
  // We simulate a search for regions across Australia, returning a large payload
  const res = http.get('http://localhost:3001/api/regions?search=&population=all');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  // Wait 1 second before the next iteration
  sleep(1);
}
