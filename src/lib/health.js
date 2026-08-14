import { createServer } from 'node:http';

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

export function createHealthServer({ port = 3000, host = '0.0.0.0', getReadiness, logger = console } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Health server port must be an integer between 0 and 65535.');
  }
  if (typeof getReadiness !== 'function') {
    throw new Error('Health server requires a readiness function.');
  }

  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;

    if (request.method !== 'GET' || !['/healthz', '/readyz'].includes(pathname)) {
      sendJson(response, 404, { error: 'not_found' });
      return;
    }

    if (pathname === '/healthz') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    try {
      const readiness = await getReadiness();
      const ready = readiness?.ready === true;
      sendJson(response, ready ? 200 : 503, {
        status: ready ? 'ready' : 'not_ready',
        checks: readiness?.checks || {},
      });
    } catch (error) {
      logger.error({ event: 'readiness_check_failed', errorName: error?.name });
      sendJson(response, 503, { status: 'not_ready', checks: { readiness: false } });
    }
  });

  return Object.freeze({
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
      return server.address();
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  });
}

export async function checkStoreReadiness(store) {
  if (typeof store?.checkHealth !== 'function') return true;
  await store.checkHealth();
  return true;
}
