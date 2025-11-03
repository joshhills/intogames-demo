// Setup file to handle Redis connection for tests
// Set test environment
process.env.NODE_ENV = 'test';
process.env.REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6379';

