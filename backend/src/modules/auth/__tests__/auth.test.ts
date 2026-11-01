import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../db/prisma.js';

describe('Auth Module API Tests', () => {
  const userAData = {
    name: 'Alice User',
    email: 'alice.test@uptimehub.local',
    password: 'password123',
  };

  const userBData = {
    name: 'Bob User',
    email: 'bob.test@uptimehub.local',
    password: 'securepassword456',
  };

  let tokenA = '';
  let tokenB = '';

  beforeAll(async () => {
    // Clean test users if they exist
    await prisma.user.deleteMany({
      where: {
        email: { in: [userAData.email, userBData.email] },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [userAData.email, userBData.email] },
      },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(userAData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(userAData.email);
      expect(res.body.data.user.name).toBe(userAData.name);
      expect(res.body.data.token).toBeDefined();

      tokenA = res.body.data.token;
    });

    it('should reject registration with duplicate email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(userAData);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should reject registration with invalid input (password too short)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Short Pass',
          email: 'short@uptimehub.local',
          password: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: userAData.email,
          password: userAData.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: userAData.email,
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/v1/auth/me and Data Isolation', () => {
    beforeAll(async () => {
      // Register user B as well
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(userBData);
      tokenB = res.body.data.token;
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid token with 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-string');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should return User A data for User A token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(userAData.email);
      expect(res.body.data.name).toBe(userAData.name);
    });

    it('should return User B data for User B token and ensure strict isolation', async () => {
      const resB = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.success).toBe(true);
      expect(resB.body.data.email).toBe(userBData.email);

      // Verify User A cannot get User B's identity
      const resA = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(resA.body.data.id).not.toBe(resB.body.data.id);
      expect(resA.body.data.email).not.toBe(resB.body.data.email);
    });
  });
});

