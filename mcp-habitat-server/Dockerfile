# Dockerfile para Servidor MCP de Habitat Pro (CU20 / CU21)
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src

ENV NODE_ENV=production
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=4100

EXPOSE 4100

CMD ["node", "src/index.js"]

