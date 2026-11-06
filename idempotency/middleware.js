/**
 * Idempotency-Key en el gateway (Fase 3, ARCHITECTURE.md §9.3).
 *
 * Un celular con mala señal puede mandar la misma reserva o visita dos veces: por doble toque, o porque
 * reintenta cuando no le llegó la respuesta. Si la petición trae `Idempotency-Key`, la primera se ejecuta
 * y las repeticiones reciben la MISMA respuesta guardada, sin volver a ejecutar nada (sin doble cobro de arras).
 *
 * Registro en DynamoDB (tabla con TTL de 24 h), clave = usuario + Idempotency-Key:
 *  - no existe            → se crea en PROCESSING (escritura condicional), se ejecuta la ruta y se guarda la respuesta
 *  - existe COMPLETED     → se devuelve la respuesta guardada con `Idempotent-Replayed: true`
 *  - existe PROCESSING    → 409 (la primera todavía se está ejecutando)
 *  - misma clave, otro pedido → 422
 * Si la ruta falla por algo que se puede reintentar (5xx, sesión vencida, 409, 429), se borra la clave.
 * Si DynamoDB no responde, la petición sigue sin idempotencia: que falle la deduplicación no frena las ventas.
 */
const crypto = require('crypto');
const {
  DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, DeleteItemCommand,
} = require('@aws-sdk/client-dynamodb');

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const RETRYABLE = new Set([401, 403, 408, 409, 425, 429]);
const MAX_STORED_BODY = 300 * 1024; // DynamoDB admite 400 KB por ítem

function createIdempotency({ table, ttlHours = 24, region = process.env.AWS_REGION || 'us-east-1', client, log = console } = {}) {
  const db = client || new DynamoDBClient({ region, ...(process.env.IDEMPOTENCY_DYNAMO_ENDPOINT ? { endpoint: process.env.IDEMPOTENCY_DYNAMO_ENDPOINT } : {}) });
  let warned = false;
  const warn = (msg) => {
    if (!warned) log.warn(`[idempotencia] ${msg} — las peticiones siguen sin deduplicar.`);
    warned = true;
  };

  return async function idempotency(req, res, next) {
    const key = req.get('Idempotency-Key');
    if (!key) return next();
    if (!KEY_PATTERN.test(key)) {
      return res.status(400).json({ success: false, message: 'Idempotency-Key inválida (8 a 100 caracteres: letras, números, - o _).' });
    }

    const owner = req.user?.sub || 'anonimo';
    const pk = `${owner}#${key}`;
    const route = `${req.method} ${req.baseUrl}${req.path}`;
    const requestHash = crypto.createHash('sha256').update(`${route}\n${JSON.stringify(req.body ?? null)}`).digest('hex');
    const now = Math.floor(Date.now() / 1000);

    try {
      await db.send(new PutItemCommand({
        TableName: table,
        Item: {
          pk: { S: pk }, status: { S: 'PROCESSING' }, route: { S: route }, requestHash: { S: requestHash },
          createdAt: { N: String(now) }, ttl: { N: String(now + ttlHours * 3600) },
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      }));
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') {
        warn(`DynamoDB no disponible (${err.name || err.message})`);
        return next();
      }
      // Ya existe: es una repetición.
      let item;
      try {
        item = (await db.send(new GetItemCommand({ TableName: table, Key: { pk: { S: pk } }, ConsistentRead: true }))).Item;
      } catch (e) {
        warn(`DynamoDB no disponible (${e.name || e.message})`);
        return next();
      }
      if (!item) return next(); // venció justo ahora
      if (item.requestHash?.S !== requestHash) {
        return res.status(422).json({ success: false, message: 'Esta Idempotency-Key ya se usó con otro pedido.' });
      }
      if (item.status?.S === 'COMPLETED') {
        res.set('Idempotent-Replayed', 'true');
        const body = item.body?.S;
        res.status(Number(item.statusCode?.N) || 200);
        return body ? res.type('application/json').send(body) : res.end();
      }
      res.set('Retry-After', '2');
      return res.status(409).json({ success: false, message: 'Esta operación ya se está procesando. Espera unos segundos.' });
    }

    // Primera vez: se ejecuta la ruta y se guarda lo que responda.
    let captured;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      captured = body;
      return originalJson(body);
    };
    res.on('finish', async () => {
      try {
        const code = res.statusCode;
        if (code >= 500 || RETRYABLE.has(code)) {
          await db.send(new DeleteItemCommand({ TableName: table, Key: { pk: { S: pk } } }));
          return;
        }
        let body = captured === undefined ? '' : JSON.stringify(captured);
        if (body.length > MAX_STORED_BODY) body = JSON.stringify({ success: true, message: 'Operación ya registrada.' });
        await db.send(new UpdateItemCommand({
          TableName: table,
          Key: { pk: { S: pk } },
          UpdateExpression: 'SET #s = :c, statusCode = :code, body = :b, completedAt = :t',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':c': { S: 'COMPLETED' }, ':code': { N: String(code) }, ':b': { S: body }, ':t': { N: String(Math.floor(Date.now() / 1000)) } },
        }));
      } catch (e) {
        log.warn(`[idempotencia] No se pudo guardar la respuesta de ${route}: ${e.message}`);
      }
    });
    return next();
  };
}

module.exports = { createIdempotency };
