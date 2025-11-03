// Test helpers for admin service tests
import axios from 'axios';

const API_SERVICE_URL = process.env.API_SERVICE_URL || 'http://api-service:3000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'ADMIN_SUPER_SECRET_KEY';

/**
 * Mock axios responses for testing
 */
export function mockAxiosResponse(data, status = 200) {
  return Promise.resolve({
    status,
    data,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {},
    config: {}
  });
}

/**
 * Mock axios error response
 */
export function mockAxiosError(message, status = 500) {
  return Promise.reject({
    message,
    response: {
      status,
      data: { error: message }
    }
  });
}

/**
 * Create test cookie for session auth
 */
export function createTestCookie() {
  return 'valid-admin-session';
}

/**
 * Mock API service responses
 */
export function createApiServiceMocks() {
  return {
    getGameConfig: { easy: {}, medium: {}, hard: {} },
    getMOTD: { motd: 'Test MOTD' },
    getHealth: { health: 1000, maxHealth: 5000 },
    getLeaderboard: [],
    getFlushInterval: { flushIntervalMinutes: 60 },
    getFlushInfo: { lastFlush: Date.now(), flushIntervalMinutes: 60 }
  };
}

