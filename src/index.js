import config, { ensureDataDir, validateConfig } from './config.js';
import { logger } from './logger.js';
import { createBot, COMMAND_LIST } from './bot.js';
import { getClient } from './paybox/client.js';
import { stopAllPollers, pollerCount } from './utils/poll.js';
import { stopAllTxWatchers, txWatcherCount } from './utils/txconfirm.js';
import { stopConfirmCleaner } from './utils/confirm.js';
import { stopBackgroundWatchers } from './commands/transfer.js';
import { SessionStore } from './store/sessions.js';
import { Registry } from './store/registry.js';
import { Stats } from './store/stats.js';
import { PendingStore } from './store/pending.js';
import { SplitsStore } from './store/splits.js';
import { JobsStore, assertValidTimeZone } from './store/jobs.js';
import { resumePendingRequests } from './resume.js';
import { startScheduler, stopScheduler } from './scheduler.js';

/**
 * Paybox Telegram Bot — entrypoint.
 *
 * Launch modes:
 *  - Long polling (default, zero config)
 *  - Webhook (BOT_WEBHOOK_URL + BOT_PORT set); Telegraf serves the hook and a
 *    /healthz endpoint via the webhook `cb`.
 */

function makeHealthzHandler({ pending, jobs }) {
  return function healthzHandler(req, res) {
    if (req.url !== '/healthz') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        paybox: Boolean(getClient(config)),
        signing: config.canSign,
        agent: config.hasAgent,
        pollers: pollerCount(),
        txWatchers: txWatcherCount(),
        pending: pending ? pending.size() : 0,
        scheduledJobs: jobs ? jobs.size() : 0,
        uptime: process.uptime(),
      })
    );
  };
}

async function main() {
  const problems = validateConfig(config);
  for (const problem of problems) {
    logger.warn(`config: ${problem}`);
  }
  if (!config.telegramBotToken) {
    logger.error('FATAL: TELEGRAM_BOT_TOKEN is missing. Add it to .env and restart.');
    process.exit(1);
  }

  ensureDataDir(config);
  assertValidTimeZone(config.schedulerTz);

  // Runtime stores
  const sessions = new SessionStore();
  const registry = new Registry({ dir: config.dataDir });
  const stats = new Stats({ dir: config.dataDir });
  const pending = new PendingStore({ dir: config.dataDir });
  const splits = new SplitsStore({ dir: config.dataDir });
  const jobs = new JobsStore({ dir: config.dataDir, timeZone: config.schedulerTz });

  // Paybox client (null until configured — the bot degrades to setup mode)
  const paybox = getClient(config);

  const bot = createBot({ config, paybox, sessions, registry, stats, pending, splits, jobs });
  bot.catch((error, ctx) => {
    logger.error('telegraf catch:', error);
    ctx.reply('❌ An unexpected error occurred. Please try again later.').catch(() => {});
  });

  // Publish the command menu so / suggestions work in the Telegram client.
  bot.telegram
    .setMyCommands(COMMAND_LIST)
    .then(() => logger.info(`registered ${COMMAND_LIST.length} commands with Telegram`))
    .catch((error) => logger.warn(`setMyCommands failed: ${error.message}`));

  if (config.botWebhookUrl) {
    const domain = new URL(config.botWebhookUrl).host;
    await bot.launch({
      dropPendingUpdates: true,
      webhook: {
        domain,
        path: config.botWebhookPath,
        port: config.botPort,
        host: '0.0.0.0',
        cb: makeHealthzHandler({ pending, jobs }),
      },
    });
    logger.info(
      `webhook serving on :${config.botPort} (${config.botWebhookPath} + /healthz) → ${config.botWebhookUrl}${config.botWebhookPath}`
    );
  } else {
    logger.info('using long polling (set BOT_WEBHOOK_URL to switch to webhook mode)');
    await bot.launch({ dropPendingUpdates: true });
  }

  logger.info(
    `🤖 Paybox Telegram Bot online — paybox=${Boolean(paybox)} signing=${config.canSign} agent=${config.hasAgent} mode=${config.botWebhookUrl ? 'webhook' : 'polling'}`
  );

  // Crash-safe resume: pick in-flight requests back up after a restart.
  if (paybox) {
    const resumed = await resumePendingRequests({ config, paybox, telegram: bot.telegram, pending, stats }).catch(
      (error) => {
        logger.error(`resume failed: ${error.message}`);
        return { resumed: 0, failed: 0, pruned: 0 };
      }
    );
    if (resumed.resumed || resumed.failed || resumed.pruned) {
      logger.info(
        `resume: ${resumed.resumed} picked up, ${resumed.failed} failed, ${resumed.pruned} pruned`
      );
    }
  }

  // Command scheduler (recurring jobs; every run passes normal approvals).
  startScheduler({ config, bot, paybox, sessions, registry, stats, dispatcher: bot.context.dispatcher, jobs });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down…`);
    stopScheduler();
    stopAllPollers();
    stopAllTxWatchers();
    stopBackgroundWatchers();
    stopConfirmCleaner();
    sessions.stop();
    await bot.stop(signal).catch(() => {});
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('unhandledRejection:', reason));
  process.on('uncaughtException', (error) => {
    logger.error('uncaughtException:', error);
    shutdown('uncaughtException');
  });
}

main().catch((error) => {
  logger.error('fatal startup error:', error);
  process.exit(1);
});
