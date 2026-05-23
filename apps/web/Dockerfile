FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/llm/package.json packages/llm/package.json
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@olivechat/web"]
