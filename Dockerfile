FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src
COPY db ./db
COPY scripts ./scripts

USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
