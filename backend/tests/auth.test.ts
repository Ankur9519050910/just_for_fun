import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('Auth & User Foundation APIs', () => {
  const testUser = {
    name: 'Test Traveler',
    email: `traveler_${Date.now()}@example.com`,
    password: 'Password123!'
  };

  let authToken = '';

  it('should reject registration when email is invalid', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Invalid User',
        email: 'not-an-email',
        password: 'Password123!'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject registration when password is too short or missing complexity', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Short Password',
        email: 'test_short@example.com',
        password: 'simple'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should register a new user successfully and return JWT', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.name).toBe(testUser.name);
    authToken = res.body.data.token;
  });

  it('should prevent duplicate registration with the same email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('should fail login with incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'WrongPassword999!'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should successfully log in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(testUser.email);
    authToken = res.body.data.token;
  });

  it('should reject access to protected /api/auth/me without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should allow access to /api/auth/me with valid Bearer token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email);
  });

  it('should update and retrieve user travel preferences', async () => {
    const newPrefs = {
      homeAirport: 'CCU',
      preferredAirlines: ['6E', 'AI'],
      hotelMinRating: 4.5,
      dietaryPref: ['Local Goan', 'Seafood'],
      travelPace: 'BALANCED',
      currency: 'INR'
    };

    const updateRes = await request(app)
      .put('/api/preferences')
      .set('Authorization', `Bearer ${authToken}`)
      .send(newPrefs);

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.data.preferences.homeAirport).toBe('CCU');
    expect(updateRes.body.data.preferences.hotelMinRating).toBe(4.5);

    const getRes = await request(app)
      .get('/api/preferences')
      .set('Authorization', `Bearer ${authToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.preferences.homeAirport).toBe('CCU');
    expect(getRes.body.data.preferences.travelPace).toBe('BALANCED');
  });

  it('should return healthcheck status including provider configuration states', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('ai-travel-companion-backend');
    expect(res.body.providers).toBeDefined();
  });
});
