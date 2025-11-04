// Integration tests for API endpoints
import request from 'supertest';
import { app } from '../../server.js';
import { 
  generateTestToken, 
  authHeaders, 
  adminHeaders,
  generateTestUUID 
} from '../helpers/test-helpers.js';
import { redisClient } from '../../../shared/redis-client.js';

describe('API Service Integration Tests', () => {
  // Cleanup Redis connection after all tests
  afterAll(async () => {
    if (redisClient && redisClient.status !== 'end') {
      await redisClient.quit();
    }
    // Give it a moment to close
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  describe('POST /api/auth/enroll', () => {
    test('should enroll new player and return token', async () => {
      const uuid = generateTestUUID();
      
      const response = await request(app)
        .post('/api/auth/enroll')
        .send({ local_uuid: uuid })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('player');
      expect(response.body.player.uuid).toBe(uuid);
      expect(response.body.player.tagline).toMatch(/^Defender-/);
    });

    test('should return 400 if local_uuid is missing', async () => {
      await request(app)
        .post('/api/auth/enroll')
        .send({})
        .expect(400);
    });

    test('should return existing player if already enrolled', async () => {
      const uuid = generateTestUUID();
      
      // First enrollment
      await request(app)
        .post('/api/auth/enroll')
        .send({ local_uuid: uuid });

      // Second enrollment
      const secondResponse = await request(app)
        .post('/api/auth/enroll')
        .send({ local_uuid: uuid })
        .expect(200);

      expect(secondResponse.body.player.uuid).toBe(uuid);
    });
  });

  describe('GET /api/game-config', () => {
    test('should return game configuration', async () => {
      const response = await request(app)
        .get('/api/game-config')
        .expect(200);

      expect(response.body).toHaveProperty('easy');
      expect(response.body).toHaveProperty('medium');
      expect(response.body).toHaveProperty('hard');
      
      expect(response.body.easy).toHaveProperty('holeCount');
      expect(response.body.easy).toHaveProperty('spawnRate');
      expect(response.body.easy).toHaveProperty('maxSpeed');
      expect(response.body.easy).toHaveProperty('penalty');
      expect(response.body.easy).toHaveProperty('defenseBonus');
      expect(response.body.easy).toHaveProperty('gameTimeSeconds');
    });
  });

  describe('POST /api/player/setup', () => {
    test('should return 401 without authentication', async () => {
      await request(app)
        .post('/api/player/setup')
        .send({ tagline: 'TestPlayer', color: '#FF0000' })
        .expect(401);
    });

    test('should update player profile with valid token', async () => {
      const uuid = generateTestUUID();
      
      // First enroll
      const enrollResponse = await request(app)
        .post('/api/auth/enroll')
        .send({ local_uuid: uuid });
      
      const token = enrollResponse.body.token;

      // Update profile
      await request(app)
        .post('/api/player/setup')
        .set(authHeaders(token))
        .send({ productName: 'TestProduct', tagline: 'MyTagline', color: '#00FF00' })
        .expect(200);

      // Verify profile was updated
      const profileResponse = await request(app)
        .get('/api/player/profile')
        .set(authHeaders(token))
        .expect(200);

      expect(profileResponse.body.productName).toBe('TestProduct');
      expect(profileResponse.body.tagline).toBe('MyTagline');
      expect(profileResponse.body.color).toBe('#00FF00');
    });

    test('should return 400 if tagline or color missing', async () => {
      const uuid = generateTestUUID();
      const enrollResponse = await request(app)
        .post('/api/auth/enroll')
        .send({ local_uuid: uuid });
      const token = enrollResponse.body.token;

      await request(app)
        .post('/api/player/setup')
        .set(authHeaders(token))
        .send({ tagline: 'Test' })
        .expect(400);
    });
  });

  describe('GET /api/leaderboard', () => {
    test('should return leaderboard with flush info', async () => {
      const response = await request(app)
        .get('/api/leaderboard')
        .expect(200);

      expect(response.body).toHaveProperty('leaderboard');
      expect(response.body).toHaveProperty('lastFlush');
      expect(response.body).toHaveProperty('flushIntervalMinutes');
      expect(Array.isArray(response.body.leaderboard)).toBe(true);
    });
  });

  describe('POST /api/match/complete', () => {
    test('should return 401 without authentication', async () => {
      await request(app)
        .post('/api/match/complete')
        .send({ score: 100, difficulty: 'medium' })
        .expect(401);
    });

    test('should submit match score and return total score', async () => {
      const uuid = generateTestUUID();
      
      // Enroll
      const enrollResponse = await request(app)
        .post('/api/auth/enroll')
        .send({ local_uuid: uuid });
      const token = enrollResponse.body.token;

      // Submit match
      const response = await request(app)
        .post('/api/match/complete')
        .set(authHeaders(token))
        .send({ score: 150, difficulty: 'medium' })
        .expect(200);

      expect(response.body).toHaveProperty('totalScore');
      expect(response.body.totalScore).toBe(150);
    });

    test('should accumulate scores across multiple matches', async () => {
      const uuid = generateTestUUID();
      
      const enrollResponse = await request(app)
        .post('/api/auth/enroll')
        .send({ local_uuid: uuid });
      const token = enrollResponse.body.token;

      // First match
      await request(app)
        .post('/api/match/complete')
        .set(authHeaders(token))
        .send({ score: 100, difficulty: 'easy' })
        .expect(200);

      // Second match
      const secondMatch = await request(app)
        .post('/api/match/complete')
        .set(authHeaders(token))
        .send({ score: 50, difficulty: 'medium' })
        .expect(200);

      expect(secondMatch.body.totalScore).toBe(150);
    });
  });

  describe('Admin Endpoints', () => {
    describe('POST /api/admin/broadcast-motd', () => {
      test('should return 401 without admin API key', async () => {
        await request(app)
          .post('/api/admin/broadcast-motd')
          .send({ message: 'Test MOTD' })
          .expect(401);
      });

      test('should update MOTD with valid admin key', async () => {
        await request(app)
          .post('/api/admin/broadcast-motd')
          .set(adminHeaders())
          .send({ message: 'Test MOTD Message' })
          .expect(200);
      });

      test('should return 400 if message is missing', async () => {
        await request(app)
          .post('/api/admin/broadcast-motd')
          .set(adminHeaders())
          .send({})
          .expect(400);
      });
    });

    describe('GET /api/admin/health', () => {
      test('should return 401 without admin API key', async () => {
        await request(app)
          .get('/api/admin/health')
          .expect(401);
      });

      test('should return health values with valid admin key', async () => {
        const response = await request(app)
          .get('/api/admin/health')
          .set(adminHeaders())
          .expect(200);

        expect(response.body).toHaveProperty('health');
        expect(response.body).toHaveProperty('maxHealth');
      });
    });

    describe('GET /api/admin/leaderboard', () => {
      test('should return full leaderboard with admin key', async () => {
        const response = await request(app)
          .get('/api/admin/leaderboard')
          .set(adminHeaders())
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });
    });
  });
});
