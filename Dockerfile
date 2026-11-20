# اجرا روی هر سرور یا هاست داکری (VPS، هم‌روش، پارس‌پک، داربست و…)
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
# دیتابیس و عکس‌ها؛ حتماً به یک volume وصل شود تا با هر دیپلوی پاک نشود
VOLUME ["/app/data"]
CMD ["node", "server/index.js"]
