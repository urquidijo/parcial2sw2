# Dockerfile para API Gateway & Frontend Shell
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js ./
COPY mfe-shell ./mfe-shell
COPY mfe-properties-react ./mfe-properties-react
COPY mfe-contracts-angular ./mfe-contracts-angular
COPY mfe-bi-next ./mfe-bi-next

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "server.js"]
