const request = require('supertest');
const { createApp } = require('./server');

describe('content-api', () => {
  const app = createApp();

  test('GET /aam/health returns ok', async () => {
    const res = await request(app).get('/aam/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('GET /aam/content returns full catalog', async () => {
    const res = await request(app).get('/aam/content');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /aam/content/:id returns matching item', async () => {
    const list = await request(app).get('/aam/content');
    const target = list.body[0];
    const res = await request(app).get(`/aam/content/${target.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(target);
  });

  test('GET /aam/content/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/aam/content/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
