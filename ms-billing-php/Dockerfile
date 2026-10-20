# Dockerfile para ms-billing-php (Amazon DynamoDB)
FROM php:8.2-cli

WORKDIR /app

COPY . /app

ENV PORT=8002
EXPOSE 8002

CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8002} -t public"]
