// Prometheus metrics for API Service
import { Registry, Counter, Gauge, Histogram } from 'prom-client';

// Create a registry to hold all metrics
const register = new Registry();

// Add default Node.js metrics
register.setDefaultLabels({
  app: 'api-service'
});

// --- COUNTERS (always incrementing) ---
const matchesCompleted = new Counter({
  name: 'firewall_matches_completed_total',
  help: 'Total number of matches completed',
  labelNames: ['difficulty'],
  registers: [register]
});

const leaderboardFlushes = new Counter({
  name: 'firewall_leaderboard_flushes_total',
  help: 'Total number of leaderboard flushes',
  registers: [register]
});

const motdBroadcasts = new Counter({
  name: 'firewall_motd_broadcasts_total',
  help: 'Total number of MOTD broadcasts',
  registers: [register]
});

const apiRequests = new Counter({
  name: 'firewall_api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['method', 'endpoint', 'status'],
  registers: [register]
});

// --- GAUGES (values that go up and down) ---
const activePlayers = new Gauge({
  name: 'firewall_active_players',
  help: 'Number of active players (players with profiles)',
  registers: [register]
});

const leaderboardSize = new Gauge({
  name: 'firewall_leaderboard_size',
  help: 'Number of players on the leaderboard',
  registers: [register]
});

const globalHealth = new Gauge({
  name: 'firewall_global_health',
  help: 'Current global firewall health',
  registers: [register]
});

const globalMaxHealth = new Gauge({
  name: 'firewall_global_max_health',
  help: 'Maximum global firewall health',
  registers: [register]
});

const playersEnrolled = new Counter({
  name: 'firewall_players_enrolled_total',
  help: 'Total number of players enrolled',
  registers: [register]
});

// --- HISTOGRAMS (for measuring distribution) ---
const matchScoreHistogram = new Histogram({
  name: 'firewall_match_score',
  help: 'Distribution of match scores',
  labelNames: ['difficulty'],
  buckets: [0, 10, 50, 100, 200, 500, 1000, 2000, 5000],
  registers: [register]
});

const matchSuccessRatioHistogram = new Histogram({
  name: 'firewall_match_success_ratio',
  help: 'Distribution of match success ratios (percentage of bugs prevented from reaching holes)',
  labelNames: ['difficulty'],
  buckets: [0, 25, 50, 60, 70, 80, 90, 95, 100],
  registers: [register]
});

const apiRequestDuration = new Histogram({
  name: 'firewall_api_request_duration_seconds',
  help: 'Duration of API requests in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Helper function to record API request
export function recordApiRequest(method, endpoint, status, duration) {
  apiRequests.inc({ method, endpoint, status });
  if (duration !== undefined) {
    apiRequestDuration.observe({ method, endpoint }, duration / 1000); // Convert to seconds
  }
}

// Export metrics functions and register
export {
  register,
  matchesCompleted,
  leaderboardFlushes,
  motdBroadcasts,
  activePlayers,
  leaderboardSize,
  globalHealth,
  globalMaxHealth,
  playersEnrolled,
  matchScoreHistogram,
  matchSuccessRatioHistogram
};

