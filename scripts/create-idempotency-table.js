/**
 * Crea (una vez) la tabla DynamoDB de Idempotency-Key con borrado automático (TTL) a las 24 h.
 * Uso: node scripts/create-idempotency-table.js   (lee AWS_* e IDEMPOTENCY_TABLE del .env de la raíz)
 * Es idempotente: si la tabla ya existe, solo verifica que el TTL esté activo.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const {
  DynamoDBClient, CreateTableCommand, DescribeTableCommand, UpdateTimeToLiveCommand, DescribeTimeToLiveCommand, waitUntilTableExists,
} = require('@aws-sdk/client-dynamodb');

const TABLE = process.env.IDEMPOTENCY_TABLE || 'habitat_idempotency';
const db = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

(async () => {
  try {
    await db.send(new DescribeTableCommand({ TableName: TABLE }));
    console.log(`La tabla ${TABLE} ya existe.`);
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
    console.log(`Creando ${TABLE} (pago por uso)…`);
    await db.send(new CreateTableCommand({
      TableName: TABLE,
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      Tags: [{ Key: 'project', Value: 'habitat-pro' }],
    }));
    await waitUntilTableExists({ client: db, maxWaitTime: 120 }, { TableName: TABLE });
    console.log('Tabla creada.');
  }

  const ttl = await db.send(new DescribeTimeToLiveCommand({ TableName: TABLE }));
  if (ttl.TimeToLiveDescription?.TimeToLiveStatus === 'ENABLED') {
    console.log('TTL activo en el atributo "ttl".');
  } else {
    await db.send(new UpdateTimeToLiveCommand({ TableName: TABLE, TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true } }));
    console.log('TTL activado en el atributo "ttl" (los registros se borran solos a las 24 h).');
  }
})().catch((err) => {
  console.error(`Error: ${err.name}: ${err.message}`);
  process.exit(1);
});
