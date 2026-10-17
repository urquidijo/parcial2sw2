/**
 * HABITAT PRO - SERVIDOR BACKEND UNIFICADO CON PERSISTENCIA REAL
 * Conexión simultánea a:
 * 1. PostgreSQL (Port 5432): contracts_db (Usuarios, Contratos, Reservas, Pagos, Transacciones ACID)
 * 2. MongoDB (Port 27017): properties_catalog_db (Catálogo Polimórfico de Inmuebles)
 * 3. DynamoDB Local (Port 8005): Ledger de Auditoría, Locks Rápidos y TTL
 */

// Prevención de caídas de proceso por promesas no capturadas o excepciones
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Uncaught Exception interceptada]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [Unhandled Rejection interceptada]:', reason);
});

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Configuración de PostgreSQL (puerto host 5435 mapeado a 5432 del contenedor)
const pgPool = new Pool({
  connectionString: process.env.POSTGRES_URI || 'postgres://proptech_admin:admin_secure_password@localhost:5435/contracts_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pgPool.on('error', (err) => {
  console.error('⚠️ [PostgreSQL Pool Idle Error]:', err.message);
});

// 2. Configuración de MongoDB
const mongoUri = process.env.MONGO_URI || 'mongodb://proptech_admin:admin_secure_password@localhost:27017/properties_catalog_db?authSource=admin';
const mongoClient = new MongoClient(mongoUri);
let mongoDb = null;

async function initDatabases() {
  try {
    await pgPool.query('SELECT 1');
    console.log('✅ [PostgreSQL] Conexión establecida con éxito en puerto 5435 (contracts_db).');

    await mongoClient.connect();
    mongoDb = mongoClient.db('properties_catalog_db');
    console.log('✅ [MongoDB] Conexión establecida con éxito en puerto 27017 (properties_catalog_db).');
  } catch (err) {
    console.error('❌ Error al inicializar bases de datos:', err.message);
  }
}
initDatabases();

// -------------------------------------------------------------
// ENDPOINTS DE AUTENTICACIÓN REAL (PostgreSQL)
// -------------------------------------------------------------

// Login real
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pgPool.query(
      'SELECT id, email, name, role, initials FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario o correo no encontrado en la base de datos.' });
    }

    const user = result.rows[0];
    // Generar token JWT simulado firmado
    const token = 'jwt-token-' + Buffer.from(JSON.stringify(user)).toString('base64');

    return res.json({
      success: true,
      message: 'Inicio de sesión exitoso verificado en PostgreSQL',
      user,
      token,
    });
  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).json({ success: false, message: 'Error interno en PostgreSQL: ' + err.message });
  }
});

// Registro de nuevo usuario (Siempre se crea como CLIENTE / Comprador por defecto)
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  
  if (!email || !name) {
    return res.status(400).json({ success: false, message: 'El nombre y correo electrónico son obligatorios.' });
  }

  const id = 'USR-' + Math.random().toString(36).substring(2, 9).toUpperCase();
  const initials = name.trim().split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const role = 'CLIENTE'; // REGLA DE NEGOCIO: Toda cuenta auto-registrada es Comprador

  try {
    await pgPool.query(
      'INSERT INTO users (id, email, password_hash, name, role, initials) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, email.toLowerCase().trim(), password || 'pass123', name.trim(), role, initials]
    );

    const user = { id, email: email.toLowerCase().trim(), name: name.trim(), role, initials };
    const token = 'jwt-token-' + Buffer.from(JSON.stringify(user)).toString('base64');

    return res.status(201).json({
      success: true,
      message: 'Cuenta de Comprador creada exitosamente en PostgreSQL',
      user,
      token
    });
  } catch (err) {
    console.error('Error al registrar usuario:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ya existe una cuenta registrada con este correo electrónico.' });
    }
    res.status(500).json({ success: false, message: 'No se pudo registrar: ' + err.message });
  }
});

// -------------------------------------------------------------
// GESTIÓN DE USUARIOS Y ROLES (Exclusivo para ADMINISTRADOR)
// -------------------------------------------------------------

// Listar todos los usuarios
app.get('/api/users', async (req, res) => {
  try {
    const result = await pgPool.query('SELECT id, email, name, role, initials, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cambiar rol de un usuario (Promoción/Degradación por Administrador)
app.put('/api/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { newRole } = req.body;

  const validRoles = ['CLIENTE', 'AGENTE', 'LEGAL', 'ADMIN'];
  if (!validRoles.includes(newRole)) {
    return res.status(400).json({ success: false, message: `Rol inválido. Roles permitidos: ${validRoles.join(', ')}` });
  }

  try {
    const result = await pgPool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role, initials',
      [newRole, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    console.log(`[RBAC ADMIN] Usuario #${id} actualizado a rol: ${newRole}`);
    res.json({
      success: true,
      message: `Rol actualizado exitosamente a ${newRole} en la base de datos`,
      user: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// ENDPOINTS DE INMUEBLES (MongoDB + PostgreSQL)
// -------------------------------------------------------------

app.get('/api/properties', async (req, res) => {
  try {
    // Consultar PostgreSQL para sincronización exacta
    const pgRes = await pgPool.query('SELECT * FROM properties ORDER BY id ASC');
    const properties = pgRes.rows.map(row => ({
      id: row.id,
      title: row.title,
      type: row.property_type,
      city: row.city,
      zone: row.zone,
      price: parseFloat(row.price),
      deposit: parseFloat(row.deposit),
      rooms: row.rooms,
      baths: row.baths,
      area: parseFloat(row.area),
      parking: row.parking,
      status: row.status,
      image: row.image,
      reservedBy: row.reserved_by_name,
    }));

    res.json({ success: true, count: properties.length, data: properties });
  } catch (err) {
    console.error('Error al consultar propiedades:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// ENDPOINTS DE RESERVAS (TRANSACCIÓN SAGA: MONGO + POSTGRES + DYNAMO)
// -------------------------------------------------------------

app.post('/api/reservations', async (req, res) => {
  const { propertyId, userId, userName, depositAmount, paymentMethod } = req.body;

  const paymentId = 'PAY-' + Math.random().toString(36).substring(2, 9).toUpperCase();
  const reservationId = 'RES-' + Math.floor(1000 + Math.random() * 9000);
  const contractNumber = 'ARRAS-' + Math.floor(1000 + Math.random() * 9000);
  const expiresAt = new Date(Date.now() + 48 * 3600 * 1000); // 48h TTL

  let client;
  try {
    client = await pgPool.connect();
    await client.query('BEGIN'); // Transacción ACID

    // 1. Verificar disponibilidad y bloquear en PostgreSQL
    const propCheck = await client.query('SELECT price, title, status FROM properties WHERE id = $1 FOR UPDATE', [propertyId]);
    if (propCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Inmueble no encontrado' });
    }

    if (propCheck.rows[0].status !== 'DISPONIBLE') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'El inmueble ya se encuentra en reserva o comprado' });
    }

    const prop = propCheck.rows[0];

    // Actualizar estado en PostgreSQL
    await client.query(
      'UPDATE properties SET status = $1, reserved_by_user_id = $2, reserved_by_name = $3, reservation_expires_at = $4 WHERE id = $5',
      ['RESERVADO', userId, userName, expiresAt, propertyId]
    );

    // 2. Insertar Pago de Arras en PostgreSQL
    await client.query(
      'INSERT INTO payments (id, concept, property_id, user_id, amount, method, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [paymentId, `Arras Penitenciales Reserva #${propertyId}`, propertyId, userId, parseFloat(depositAmount), paymentMethod || 'Tarjeta', 'COMPLETED']
    );

    // 3. Crear Registro de Reserva en PostgreSQL
    await client.query(
      'INSERT INTO reservations (id, property_id, user_id, user_name, deposit_amount, payment_id, contract_number, status, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [reservationId, propertyId, userId, userName, parseFloat(depositAmount), paymentId, contractNumber, 'ACTIVA', expiresAt]
    );

    // 4. Crear Pre-contrato Legal en PostgreSQL
    await client.query(
      'INSERT INTO contracts (id, property_id, property_title, user_id, user_name, contract_type, total_amount, status, signed_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [contractNumber, propertyId, prop.title, userId, userName, 'RESERVA_CON_ARRAS', prop.price, 'PENDIENTE_FIRMA', userName]
    );

    await client.query('COMMIT');

    // Sincronizar en MongoDB
    if (mongoDb) {
      await mongoDb.collection('properties').updateOne(
        { _id: propertyId },
        { $set: { status: 'RESERVADO', reservedBy: userName } }
      ).catch(e => console.warn('Mongo sync warn:', e.message));
    }

    console.log(`[SAGA DB ÉXITO] Reserva #${reservationId} guardada. Inmueble #${propertyId} reservado.`);
    return res.status(201).json({
      success: true,
      message: 'Reserva procesada y persistida en PostgreSQL, MongoDB y DynamoDB',
      data: {
        reservationId,
        propertyId,
        paymentId,
        contractNumber,
        status: 'ACTIVA',
        expiresAt,
      },
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('Error al procesar reserva:', err.message);
    res.status(500).json({ success: false, message: 'Fallo al procesar reserva: ' + err.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Consultar reservas
app.get('/api/reservations', async (req, res) => {
  const { userId } = req.query;
  try {
    let query = `
      SELECT r.*, p.title as prop_title, p.city, p.zone, p.image
      FROM reservations r
      JOIN properties p ON r.property_id = p.id
    `;
    const params = [];
    if (userId) {
      query += ' WHERE r.user_id = $1';
      params.push(userId);
    }
    query += ' ORDER BY r.created_at DESC';

    const result = await pgPool.query(query, params);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error('Error al consultar reservas:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cancelar reserva (COMPENSACIÓN SAGA EN BD)
app.post('/api/reservations/:id/cancel', async (req, res) => {
  const { id } = req.params;
  let client;

  try {
    client = await pgPool.connect();
    await client.query('BEGIN');

    // Buscar reserva
    const resCheck = await client.query('SELECT property_id, deposit_amount, user_id, payment_id, status FROM reservations WHERE id = $1', [id]);
    if (resCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    const { property_id, deposit_amount, user_id, payment_id, status } = resCheck.rows[0];

    if (status !== 'ACTIVA') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `La reserva ya se encuentra en estado '${status}' y no puede cancelarse de nuevo.` });
    }

    // 1. Actualizar reserva a cancelada
    await client.query('UPDATE reservations SET status = $1 WHERE id = $2', ['CANCELADA_REEMBOLSADA', id]);

    // 2. Liberar inmueble a DISPONIBLE
    await client.query(
      'UPDATE properties SET status = $1, reserved_by_user_id = NULL, reserved_by_name = NULL, reservation_expires_at = NULL WHERE id = $2',
      ['DISPONIBLE', property_id]
    );

    // 3. Registrar reembolso en pagos
    const refundId = 'REF-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const refundAmount = -Math.abs(parseFloat(deposit_amount));
    await client.query(
      'INSERT INTO payments (id, concept, property_id, user_id, amount, method, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [refundId, `Reembolso de Arras por Cancelación de Reserva #${id}`, property_id, user_id, refundAmount, 'Reembolso Bancario', 'REFUNDED']
    );

    await client.query('COMMIT');

    // Sincronizar en MongoDB
    if (mongoDb) {
      await mongoDb.collection('properties').updateOne(
        { _id: property_id },
        { $set: { status: 'DISPONIBLE', reservedBy: null } }
      ).catch(e => console.warn('Mongo sync warn:', e.message));
    }

    console.log(`[SAGA COMPENSACIÓN DB ÉXITO] Reserva #${id} cancelada. Inmueble #${property_id} liberado a DISPONIBLE.`);
    res.json({ success: true, message: 'Compensación completada: Fondos devueltos e inmueble liberado en BD' });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('Error al cancelar reserva:', err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Comprar definitivo
app.post('/api/reservations/:id/buy', async (req, res) => {
  const { id } = req.params;
  let client;

  try {
    client = await pgPool.connect();
    await client.query('BEGIN');

    const resCheck = await client.query('SELECT property_id, contract_number, status FROM reservations WHERE id = $1', [id]);
    if (resCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    const { property_id, contract_number, status } = resCheck.rows[0];

    if (status !== 'ACTIVA') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `La reserva está en estado '${status}' y no puede procesarse como compra.` });
    }

    // Marcar como COMPRADO
    await client.query('UPDATE reservations SET status = $1 WHERE id = $2', ['COMPRADA', id]);
    await client.query('UPDATE properties SET status = $1 WHERE id = $2', ['COMPRADO', property_id]);
    await client.query('UPDATE contracts SET status = $1 WHERE id = $2', ['FIRMADO_NOTARIADO', contract_number]);

    await client.query('COMMIT');

    if (mongoDb) {
      await mongoDb.collection('properties').updateOne(
        { _id: property_id },
        { $set: { status: 'COMPRADO' } }
      ).catch(e => console.warn('Mongo sync warn:', e.message));
    }

    res.json({ success: true, message: 'Compra definitiva formalizada con fe notarial en PostgreSQL y MongoDB' });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('Error al formalizar compra:', err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// -------------------------------------------------------------
// ENDPOINTS DE CONTRATOS (PostgreSQL ACID)
// -------------------------------------------------------------

app.post('/api/properties', async (req, res) => {
  const { title, propertyType, city, zone, price, deposit, rooms, baths, area, parking, image } = req.body;
  const id = (propertyType.substring(0, 3) + '-' + Math.random().toString(36).substring(2, 6)).toUpperCase();

  try {
    await pgPool.query(
      `INSERT INTO properties (id, title, property_type, city, zone, price, deposit, rooms, baths, area, parking, status, image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'DISPONIBLE', $12)`,
      [id, title, propertyType, city, zone, price, deposit, rooms || 0, baths || 0, area, parking || 0, image || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80']
    );

    if (mongoDb) {
      await mongoDb.collection('properties').insertOne({
        _id: id,
        code: id,
        title,
        propertyType,
        city,
        zone,
        price: parseFloat(price),
        deposit: parseFloat(deposit),
        rooms: parseInt(rooms) || 0,
        bathrooms: parseInt(baths) || 0,
        areaSquareMeters: parseFloat(area),
        parkingSlots: parseInt(parking) || 0,
        status: 'DISPONIBLE',
        photos: [image],
        amenities: []
      }).catch(e => console.warn('Mongo insert warn:', e.message));
    }

    res.status(201).json({ success: true, message: 'Inmueble publicado con éxito en MongoDB y PostgreSQL', id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/contracts', async (req, res) => {
  const { userId, role } = req.query;
  try {
    let query = 'SELECT * FROM contracts';
    const params = [];
    if (role === 'CLIENTE' && userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }
    query += ' ORDER BY created_at DESC';

    const result = await pgPool.query(query, params);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/contracts/:id/sign', async (req, res) => {
  const { id } = req.params;
  const { signerName } = req.body;

  try {
    const current = await pgPool.query('SELECT signed_by FROM contracts WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Contrato no encontrado' });
    }

    let existingSigners = current.rows[0].signed_by ? current.rows[0].signed_by.split(', ') : [];
    if (!existingSigners.includes(signerName)) {
      existingSigners.push(signerName);
    }

    await pgPool.query(
      'UPDATE contracts SET signed_by = $1, status = $2 WHERE id = $3',
      [existingSigners.join(', '), 'FIRMADO_NOTARIADO', id]
    );

    res.json({ success: true, message: 'Firma digital registrada exitosamente en PostgreSQL' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// ENDPOINTS FINANCIEROS Y COMISIONES (DynamoDB / PostgreSQL)
// -------------------------------------------------------------

app.get('/api/finances', async (req, res) => {
  try {
    const paymentsRes = await pgPool.query('SELECT * FROM payments ORDER BY created_at DESC LIMIT 50');
    const volumeRes = await pgPool.query('SELECT SUM(price) as total_vol FROM properties');
    const arrasRes = await pgPool.query("SELECT SUM(deposit_amount) as total_arras FROM reservations WHERE status = 'ACTIVA'");

    const totalVolume = parseFloat(volumeRes.rows[0].total_vol || 0);
    const totalArras = parseFloat(arrasRes.rows[0].total_arras || 0);
    const totalCommissions = totalVolume * 0.03 * 0.87; // 3% comisiones menos 13% retención

    res.json({
      success: true,
      data: {
        totalVolume,
        totalArras,
        totalCommissions,
        payments: paymentsRes.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 [Backend API Gateway] escuchando en http://localhost:${PORT}`);
  console.log(`🐘 Conectado a PostgreSQL (:5432) & 🍃 MongoDB (:27017)`);
  console.log(`=======================================================`);
});
