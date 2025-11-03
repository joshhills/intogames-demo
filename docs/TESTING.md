# Testing Guide

This project includes unit and integration tests for the API service and admin service.

## Test Structure

### API Service Tests (`api-service/__tests__/`)

#### Unit Tests
- **`unit/auth.test.js`**: Tests for JWT token generation and validation

#### Integration Tests
- **`integration/api.test.js`**: Full HTTP endpoint testing covering:
  - Player authentication and enrollment
  - Player profile management
  - Game configuration
  - Leaderboard operations
  - Match score submission
  - Admin endpoints

### Admin Service Tests (`admin-service/__tests__/`)

#### Integration Tests
- **`integration/admin-api.test.js`**: Tests for admin panel endpoints:
  - Login authentication
  - Protected endpoint access
  - Session management

## Running Tests

### API Service

```bash
cd api-service
npm install  # Install dependencies including test dependencies
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

### Admin Service

```bash
cd admin-service
npm install  # Install dependencies including test dependencies
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Test Requirements

### Redis for Integration Tests

Integration tests require a Redis instance. You have two options:

1. **Use Docker Redis** (Recommended for CI/CD):
   ```bash
   docker run -d -p 6379:6379 redis:latest
   ```

2. **Use Local Redis**:
   - Install Redis locally
   - Ensure it's running on `localhost:6379`

3. **Use Test Redis via Docker Compose**:
   The existing `docker-compose.yml` includes a Redis service that can be used for testing.

### Environment Variables

Tests use default values for:
- `JWT_SECRET`: `'your-super-secret-key'`
- `ADMIN_API_KEY`: `'ADMIN_SUPER_SECRET_KEY'`
- `REDIS_URI`: `'redis://localhost:6379'`

You can override these via environment variables if needed:
```bash
REDIS_URI=redis://localhost:6379 npm test
```

## Test Coverage

After running tests with coverage (`npm run test:coverage`), you can view the coverage report in:
- `api-service/coverage/index.html`
- `admin-service/coverage/index.html`

## Writing New Tests

### API Service Test Example

```javascript
import request from 'supertest';
import { app } from '../../server.js';
import { generateTestToken, authHeaders } from '../helpers/test-helpers.js';

describe('My New Endpoint', () => {
  test('should do something', async () => {
    const response = await request(app)
      .get('/api/my-endpoint')
      .expect(200);
    
    expect(response.body).toHaveProperty('data');
  });
});
```

### Admin Service Test Example

```javascript
import { app } from '../../server.js';

describe('My New Admin Endpoint', () => {
  test('should require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/my-endpoint'
    });
    
    expect(response.statusCode).toBe(401);
  });
});
```

## Notes

- Tests run with `NODE_ENV=test` to prevent servers from starting during test execution
- Both services export their app instances for testing
- Integration tests make real HTTP requests but don't start actual servers
- Unit tests can use mocks (see `__tests__/mocks/`)

## CI/CD Integration

For continuous integration, ensure:
1. Redis service is available (via Docker Compose or test Redis container)
2. All dependencies are installed (`npm install` in both service directories)
3. Tests run with: `npm test` in each service directory

Example CI script:
```bash
# Start test Redis
docker run -d -p 6379:6379 redis:latest

# Run API service tests
cd api-service && npm install && npm test

# Run admin service tests
cd ../admin-service && npm install && npm test
```

