# 🚀 Deployment Guide - Paybox Telegram Bot

This guide covers deploying the Paybox Telegram Bot to production.

## 📋 Prerequisites

- Node.js 18+ installed

- Telegram Bot Token from [@BotFather](https://t.me/botfather)

- Paybox account with API key ([https://app.paybox.sh](https://app.paybox.sh) )

- A server or hosting platform (Heroku, Railway, Fly.io, etc.)

- Domain name (optional, for webhook)

## 🏠 Local Development

### 1. Setup

```bash
# Clone repository
git clone https://github.com/yourusername/paybox-telegram-bot.git
cd paybox-telegram-bot

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

### 2. Configure .env

```
TELEGRAM_BOT_TOKEN=your_token_from_botfather
PAYBOX_API_KEY=pbx_live_your_api_key
PAYBOX_SIGNING_KEY=pbxk1.your_signing_key_optional
BOT_PORT=3000
```

### 3. Run Locally

```bash
npm start
```

The bot will start polling for messages. You can now interact with it on Telegram.

## ☁️ Production Deployment

### Option 1: Heroku (Easiest )

1. **Create Heroku app**

   ```bash
   heroku create paybox-telegram-bot
   ```

1. **Add environment variables**

   ```python
   heroku config:set TELEGRAM_BOT_TOKEN=your_token
   heroku config:set PAYBOX_API_KEY=your_api_key
   heroku config:set PAYBOX_SIGNING_KEY=your_signing_key
   ```

1. **Deploy**

   ```python
   git push heroku main
   ```

1. **View logs**

   ```bash
   heroku logs --tail
   ```

### Option 2: Railway

1. **Connect GitHub repository to Railway**

1. **Add environment variables in Railway dashboard**

1. **Deploy automatically**

### Option 3: Fly.io

1. **Install Fly CLI**

   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

1. **Create app**

   ```python
   fly launch
   ```

1. **Set secrets**

   ```bash
   fly secrets set TELEGRAM_BOT_TOKEN=your_token
   fly secrets set PAYBOX_API_KEY=your_api_key
   ```

1. **Deploy**

   ```bash
   fly deploy
   ```

### Option 4: Docker

1. **Create Dockerfile**

   ```
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY src ./src
   CMD ["node", "src/index.js"]
   ```

1. **Build image**

   ```bash
   docker build -t paybox-telegram-bot .
   ```

1. **Run container**

   ```bash
   docker run -e TELEGRAM_BOT_TOKEN=your_token \
     -e PAYBOX_API_KEY=your_api_key \
     paybox-telegram-bot
   ```

## 🔄 Webhook Setup (Advanced )

For better performance at scale, use webhooks instead of polling:

### 1. Update index.js

```python
import express from 'express';

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Setup commands and middleware...

app.use(bot.webhookCallback('/telegram'));

bot.telegram.setWebhook(`${process.env.BOT_WEBHOOK_URL}/telegram`);

app.listen(process.env.BOT_PORT || 3000, () => {
  console.log('Bot listening on webhook');
});
```

### 2. Configure webhook URL

```python
heroku config:set BOT_WEBHOOK_URL=https://your-app.herokuapp.com
```

## 📊 Monitoring

### Heroku Metrics

```python
heroku metrics
```

### Application Monitoring

Consider using:

- **Sentry** for error tracking

- **LogRocket** for session replay

- **New Relic** for performance monitoring

## 🔒 Security Best Practices

1. **Environment Variables**: Never commit `.env` file

1. **API Keys**: Rotate regularly

1. **Rate Limiting**: Implement to prevent abuse

1. **Input Validation**: Sanitize all user inputs

1. **HTTPS Only**: Always use HTTPS for webhooks

1. **Secrets Management**: Use platform-specific secret managers

## 📈 Scaling

### Database for Sessions

For production, replace in-memory sessions with Redis:

```javascript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL );

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  ctx.session = await redis.get(`session:${userId}`);
  await next();
  await redis.set(`session:${userId}`, JSON.stringify(ctx.session));
});
```

### Load Balancing

- Use multiple bot instances with the same token

- Implement session persistence with Redis

- Use webhook mode for better scalability

## 🐛 Troubleshooting

### Bot not responding

1. Check `TELEGRAM_BOT_TOKEN` is correct

1. Verify bot is running: `npm start`

1. Check logs for errors

### Paybox API errors

1. Verify `PAYBOX_API_KEY` is valid

1. Check Paybox API status

1. Ensure credentials are granted in Paybox app

### Memory leaks

1. Monitor memory usage: `node --inspect src/index.js`

1. Use Chrome DevTools for profiling

1. Check for event listener leaks

## 📝 Logging

Add structured logging:

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

bot.use((ctx, next) => {
  logger.info(`${ctx.from?.username}: ${ctx.message?.text}`);
  return next();
});
```

## 🔄 CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy to Heroku

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: akhileshns/heroku-deploy@v3.12.12
        with:
          heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
          heroku_app_name: paybox-telegram-bot
          heroku_email: your-email@example.com
```

## 📞 Support

- **Paybox Issues**: [https://docs.paybox.sh](https://docs.paybox.sh)

- **Telegram Bot Issues**: [https://telegraf.js.org](https://telegraf.js.org)

- **Hosting Issues**: Check platform-specific documentation

---

**Happy deploying! 🚀**

