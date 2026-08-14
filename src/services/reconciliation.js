const PENDING_PROVIDER_STATUSES = new Set([
  'pending_approval',
  'pending_signature',
  'pending_settlement',
  'pending_confirmation',
]);

export function mapProviderStatus(status) {
  if (status === 'success') return 'succeeded';
  if (status === 'denied' || status === 'error') return 'failed';
  if (PENDING_PROVIDER_STATUSES.has(status)) return 'pending_approval';
  throw new Error(`Unknown provider request status: ${String(status)}`);
}

export async function reconcilePendingPaymentIntents({ store, gateway, limit = 50, logger = console }) {
  if (!gateway || typeof gateway.getRequestStatus !== 'function') {
    return { skipped: true, inspected: 0, transitioned: 0, failed: 0 };
  }

  const intents = await store.listPendingReconciliation({ limit });
  let transitioned = 0;
  let failed = 0;

  for (const intent of intents) {
    try {
      const providerResponse = await gateway.getRequestStatus({ providerRequestId: intent.providerRequestId });
      if (providerResponse?.request_id && providerResponse.request_id !== intent.providerRequestId) {
        throw new Error('Provider request ID mismatch during reconciliation.');
      }
      const state = mapProviderStatus(providerResponse?.status);
      const next = await store.transition(intent.id, state, {
        providerRequestId: intent.providerRequestId,
        providerStatus: providerResponse.status,
        ...(state === 'failed' ? { lastErrorCode: providerResponse.error ? 'provider_error' : 'provider_rejected' } : {}),
      });
      if (next.state !== intent.state || providerResponse.status !== intent.providerStatus) transitioned += 1;
    } catch (error) {
      failed += 1;
      logger.warn?.('Payment intent reconciliation failed.', {
        intentId: intent.id,
        providerRequestId: intent.providerRequestId,
        errorCode: error?.message === 'Provider request ID mismatch during reconciliation.'
          ? 'provider_request_mismatch'
          : 'reconciliation_error',
      });
    }
  }

  return { skipped: false, inspected: intents.length, transitioned, failed };
}

export function startReconciliationLoop({ store, gateway, intervalMs = 30_000, logger = console }) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await store.expireStaleIntents();
      await reconcilePendingPaymentIntents({ store, gateway, logger });
    } catch (error) {
      logger.error?.('Payment intent reconciliation loop failed.', { errorCode: 'reconciliation_loop_error' });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  void run();
  return Object.freeze({ stop: () => clearInterval(timer), runNow: run });
}
