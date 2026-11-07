# Dockerfile para BFF GraphQL Gateway (ERP)
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY schema.graphql ./
COPY src ./src

ENV NODE_ENV=production
ENV BFF_PORT=4000

EXPOSE 4000

CMD ["node", "src/index.js"]

