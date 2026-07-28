FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY content-api ./content-api
EXPOSE 8080
CMD ["node", "content-api/server.js"]
