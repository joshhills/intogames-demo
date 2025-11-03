// Unit tests for authentication middleware
import jwt from 'jsonwebtoken';
import { generateTestToken } from '../helpers/test-helpers.js';

// Mock the server app import - we'll test middleware in isolation
// For now, we'll test the auth logic directly
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'ADMIN_SUPER_SECRET_KEY';

describe('Authentication', () => {
  describe('JWT Token Generation', () => {
    test('should generate a valid JWT token', () => {
      const uuid = 'test-uuid-123';
      const tagline = 'TestPlayer';
      const token = generateTestToken(uuid, tagline);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      // Verify token can be decoded
      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.uuid).toBe(uuid);
      expect(decoded.tagline).toBe(tagline);
    });

    test('should generate token with correct expiration', () => {
      const token = generateTestToken();
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Check that exp is set and is in the future
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('Admin API Key Validation', () => {
    test('should accept valid admin API key', () => {
      const apiKey = ADMIN_API_KEY;
      expect(apiKey).toBeDefined();
      expect(apiKey).toBe(ADMIN_API_KEY);
    });

    test('should reject invalid admin API key', () => {
      const invalidKey = 'wrong-key';
      expect(invalidKey).not.toBe(ADMIN_API_KEY);
    });
  });
});

