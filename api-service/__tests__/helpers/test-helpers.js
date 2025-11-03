// Test helpers for API service tests
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'ADMIN_SUPER_SECRET_KEY';

/**
 * Generate a valid JWT token for testing
 */
export function generateTestToken(uuid = 'test-uuid-123', tagline = 'TestPlayer') {
  return jwt.sign({ uuid, tagline }, JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Create test headers with authentication
 */
export function authHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Create test headers with admin API key
 */
export function adminHeaders() {
  return {
    'X-Admin-API-Key': ADMIN_API_KEY,
    'Content-Type': 'application/json'
  };
}

/**
 * Generate a test UUID
 */
export function generateTestUUID() {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Wait for a promise or timeout
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

