# Admin Service Tests

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

### Integration Tests (`__tests__/integration/`)
- **admin-api.test.js**: Tests for admin service endpoints

## Test Helpers (`__tests__/helpers/`)
- **test-helpers.js**: Utilities for mocking API service responses

## Notes

- Admin service tests use Fastify's `inject` method for testing (no HTTP server needed)
- Tests mock axios calls to the API service
- The `app` is exported from `server.js` for testing purposes

