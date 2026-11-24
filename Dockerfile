# اجرا روی هر سرور یا هاست داکری (VPS، هم‌روش، پارس‌پک، داربست و…)
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
# عکس‌های آپلودی؛ حتماً به یک volume وصل شود تا با هر دیپلوی پاک نشود (دیتابیس روی MongoDB Atlas است)
VOLUME ["/app/data"]
CMD ["node", "server/index.js"]
