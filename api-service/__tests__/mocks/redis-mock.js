// Mock Redis client for unit tests
// This creates a simple in-memory mock that mimics Redis behavior

class MockRedisClient {
  constructor() {
    this.data = new Map(); // key -> value
    this.hashes = new Map(); // key -> Map(field -> value)
    this.sortedSets = new Map(); // key -> Map(member -> score)
    this.status = 'ready';
  }

  // String operations
  async get(key) {
    return this.data.get(key) || null;
  }

  async set(key, value) {
    this.data.set(key, value);
    return 'OK';
  }

  async del(...keys) {
    let deleted = 0;
    for (const key of keys) {
      if (this.data.delete(key)) deleted++;
      if (this.hashes.delete(key)) deleted++;
      if (this.sortedSets.delete(key)) deleted++;
    }
    return deleted;
  }

  // Hash operations
  async hgetall(key) {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    const result = {};
    for (const [field, value] of hash.entries()) {
      result[field] = value;
    }
    return result;
  }

  async hset(key, fieldOrObject, value) {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    const hash = this.hashes.get(key);

    if (value !== undefined) {
      // Single field-value: hset(key, field, value)
      hash.set(fieldOrObject, String(value));
      return 1;
    } else if (typeof fieldOrObject === 'object') {
      // Multiple fields: hset(key, {field1: value1, field2: value2})
      let count = 0;
      for (const [field, val] of Object.entries(fieldOrObject)) {
        hash.set(field, String(val));
        count++;
      }
      return count;
    }
    return 0;
  }

  // Sorted set operations
  async zadd(key, score, member) {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, new Map());
    }
    const set = this.sortedSets.get(key);
    
    if (typeof score === 'object' && score.score !== undefined && score.value !== undefined) {
      // Format: zadd(key, {score: x, value: y})
      set.set(String(score.value), parseFloat(score.score));
      return 1;
    } else {
      // Format: zadd(key, score, member)
      set.set(String(member), parseFloat(score));
      return 1;
    }
  }

  async zrange(key, start, stop, ...options) {
    const set = this.sortedSets.get(key);
    if (!set) return [];

    const isRev = options.includes('REV');
    const withScores = options.includes('WITHSCORES');

    // Convert to array of [member, score] pairs and sort
    const entries = Array.from(set.entries())
      .sort((a, b) => isRev ? b[1] - a[1] : a[1] - b[1]);

    // Apply start/stop
    const sliced = entries.slice(
      start < 0 ? entries.length + start : start,
      stop < 0 ? entries.length + stop + 1 : stop + 1
    );

    if (withScores) {
      // Return flat array: [member1, score1, member2, score2, ...]
      const result = [];
      for (const [member, score] of sliced) {
        result.push(member, score.toString());
      }
      return result;
    } else {
      // Return just members
      return sliced.map(([member]) => member);
    }
  }

  // Pub/Sub operations
  async publish(channel, message) {
    // Mock publish - just return subscriber count
    return 0;
  }

  // Clear all data (useful for test cleanup)
  clear() {
    this.data.clear();
    this.hashes.clear();
    this.sortedSets.clear();
  }
}

export { MockRedisClient };

