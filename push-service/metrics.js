// Prometheus metrics for Push Service
import { Registry, Gauge, Counter } from 'prom-client';

// Create a registry to hold all metrics
const register = new Registry();

// Add default labels
register.setDefaultLabels({
  app: 'push-service'
});

// --- GAUGES (values that go up and down) ---
const activeWebSocketConnections = new Gauge({
  name: 'firewall_active_websocket_connections',
  help: 'Number of active WebSocket connections (proxy for active players)',
  registers: [register]
});

const websocketConnectionsTotal = new Counter({
  name: 'firewall_websocket_connections_total',
  help: 'Total number of WebSocket connections established',
  registers: [register]
});

const websocketDisconnectionsTotal = new Counter({
  name: 'firewall_websocket_disconnections_total',
  help: 'Total number of WebSocket disconnections',
  registers: [register]
});

const websocketMessagesReceived = new Counter({
  name: 'firewall_websocket_messages_received_total',
  help: 'Total number of WebSocket messages received',
  registers: [register]
});

// Function to update active connections metric
// This will be called with the activeConnections Set from redis-client
function updateMetrics(activeConnectionsSet) {
  // Get count of active connections
  let activeCount = 0;
  if (activeConnectionsSet) {
    // Count only open connections (readyState === 1)
    activeConnectionsSet.forEach((ws) => {
      if (ws && typeof ws === 'object' && ws.readyState === 1) {
        activeCount++;
      }
    });
  }
  activeWebSocketConnections.set(activeCount);
}

// Export metrics functions
export {
  register,
  activeWebSocketConnections,
  websocketConnectionsTotal,
  websocketDisconnectionsTotal,
  websocketMessagesReceived,
  updateMetrics
};

