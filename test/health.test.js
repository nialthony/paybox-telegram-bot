import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createHealthServer } from '../src/lib/health.js';

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('health server exposes liveness and readiness without sensitive data', async () => {
  const server = createHealthServer({
    port: 0,
    host: '127.0.0.1',
    getReadiness: async () => ({ ready: true, checks: { paymentIntents: true, transferGateway: true } }),
  });
  const address = await server.listen();
  try {
    const health = await getJson(address.port, '/healthz');
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.body, { status: 'ok' });

    const readiness = await getJson(address.port, '/readyz');
    assert.equal(readiness.statusCode, 200);
    assert.deepEqual(readiness.body, {
      status: 'ready',
      checks: { paymentIntents: true, transferGateway: true },
    });
  } finally {
    await server.close();
  }
});

test('health server returns 503 when readiness is false or throws', async () => {
  let shouldThrow = false;
  const server = createHealthServer({
    port: 0,
    host: '127.0.0.1',
    getReadiness: async () => {
      if (shouldThrow) throw new Error('database unavailable');
      return { ready: false, checks: { paymentIntents: false, transferGateway: true } };
    },
    logger: { error() {} },
  });
  const address = await server.listen();
  try {
    const notReady = await getJson(address.port, '/readyz');
    assert.equal(notReady.statusCode, 503);
    assert.equal(notReady.body.status, 'not_ready');
    assert.equal(notReady.body.checks.paymentIntents, false);

    shouldThrow = true;
    const failed = await getJson(address.port, '/readyz');
    assert.equal(failed.statusCode, 503);
    assert.deepEqual(failed.body, { status: 'not_ready', checks: { readiness: false } });
  } finally {
    await server.close();
  }
});
