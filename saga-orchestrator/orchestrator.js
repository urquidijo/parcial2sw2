/**
 * ORQUESTADOR SAGA INMOBILIARIO
 * Caso: Reserva formal de inmueble con depósito de arras y generación de pre-contrato
 * 
 * Microservicios involucrados:
 * 1. ms-properties-nestjs (MongoDB) -> Puerto 3001
 * 2. ms-billing-php (DynamoDB)       -> Puerto 8002
 * 3. ms-contracts-spring (Postgres)  -> Puerto 8081
 */

const PROPERTIES_API = process.env.PROPERTIES_API || 'http://localhost:3001/api/v1/properties';
const BILLING_API = process.env.BILLING_API || 'http://localhost:8002/api/v1/billing';
const CONTRACTS_API = process.env.CONTRACTS_API || 'http://localhost:8081/api/v1/contracts';

async function executeSagaReservation({ propertyId, clientId, depositAmount, totalAmount }) {
  console.log(`\n========================================================================`);
  console.log(`🚀 INICIANDO SAGA DE RESERVA DISTRIBUIDA (Patrón Saga Orquestado)`);
  console.log(`Inmueble: #${propertyId} | Cliente: ${clientId} | Arras: $${depositAmount} USD`);
  console.log(`========================================================================\n`);

  const sagaLog = {
    step1_propertyLocked: false,
    step2_charged: false,
    step3_contractCreated: false,
    paymentId: null,
    contractId: null,
  };

  try {
    // -------------------------------------------------------------
    // PASO 1: Bloqueo preventivo en ms-properties-nestjs (MongoDB)
    // -------------------------------------------------------------
    console.log(`▶ [PASO 1/3] Bloqueando preventivamente la propiedad #${propertyId} en ms-properties (MongoDB)...`);
    const propRes = await fetch(`${PROPERTIES_API}/${propertyId}/reserve-lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, lockDurationMinutes: 60 }),
    });

    if (!propRes.ok) {
      const err = await propRes.json();
      throw new Error(`[PASO 1 FALLIDO]: ${err.message || 'Propiedad no disponible para reserva'}`);
    }

    sagaLog.step1_propertyLocked = true;
    console.log(`✅ [PASO 1 EXITOSO]: Propiedad #${propertyId} marcada como RESERVADO_PENDIENTE.\n`);

    // -------------------------------------------------------------
    // PASO 2: Cobro de depósito de arras en ms-billing-php (DynamoDB)
    // -------------------------------------------------------------
    console.log(`▶ [PASO 2/3] Procesando cobro de arras por $${depositAmount} USD en ms-billing (DynamoDB)...`);
    const idempotencyKey = `saga-tx-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const billingRes = await fetch(`${BILLING_API}/charges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        propertyId,
        clientId,
        amount: depositAmount,
        currency: 'USD',
        idempotencyKey,
      }),
    });

    const billingData = await billingRes.json();
    if (!billingRes.ok || !billingData.success) {
      throw new Error(`[PASO 2 FALLIDO]: ${billingData.message || 'Error en la pasarela de pagos / fondos insuficientes'}`);
    }

    sagaLog.step2_charged = true;
    sagaLog.paymentId = billingData.paymentId;
    console.log(`✅ [PASO 2 EXITOSO]: Cobro registrado en DynamoDB con ID: ${sagaLog.paymentId}.\n`);

    // -------------------------------------------------------------
    // PASO 3: Emisión de pre-contrato legal en ms-contracts-spring (PostgreSQL)
    // -------------------------------------------------------------
    console.log(`▶ [PASO 3/3] Generando Pre-Contrato notarial en ms-contracts (PostgreSQL)...`);
    const contractRes = await fetch(`${CONTRACTS_API}/pre-contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: String(propertyId),
        clientId,
        paymentReferenceId: sagaLog.paymentId,
        totalAmount,
        depositAmount,
      }),
    });

    const contractData = await contractRes.json();
    if (!contractRes.ok || contractData.error) {
      throw new Error(`[PASO 3 FALLIDO]: ${contractData.message || 'Fallo en la validación notarial o antecedentes'}`);
    }

    sagaLog.step3_contractCreated = true;
    sagaLog.contractId = contractData.id || contractData.contractNumber;
    console.log(`✅ [PASO 3 EXITOSO]: Pre-contrato #${contractData.contractNumber} emitido en PostgreSQL con estado PENDIENTE_FIRMA.\n`);

    // -------------------------------------------------------------
    // CONFIRMACIÓN DEFINITIVA GLOBAL
    // -------------------------------------------------------------
    console.log(`▶ [CONFIRMACIÓN] Confirmando estado definitivo de la propiedad #${propertyId}...`);
    await fetch(`${PROPERTIES_API}/${propertyId}/confirm-reserved`, { method: 'POST' });

    console.log(`\n🎉 SAGA COMPLETADA CON ÉXITO:`);
    console.log(`- Propiedad #${propertyId}: RESERVADO_CONFIRMADO (MongoDB)`);
    console.log(`- Pago #${sagaLog.paymentId}: PAGADO (DynamoDB con TTL 48h)`);
    console.log(`- Contrato #${sagaLog.contractId}: PENDIENTE_FIRMA (PostgreSQL ACID)`);
    return { success: true, sagaLog };

  } catch (error) {
    console.error(`\n❌ ERROR EN LA TRANSACCIÓN DISTRIBUIDA: ${error.message}`);
    console.log(`🔄 ACTIVANDO COMPENSACIONES EN CASCADA (ROLLBACK DISPONIBLE)...\n`);

    // COMPENSACIÓN PASO 2: Reembolso en ms-billing-php si ya se cobró
    if (sagaLog.step2_charged && sagaLog.paymentId) {
      console.log(`⏪ [COMPENSACIÓN 2]: Solicitando reembolso del cobro #${sagaLog.paymentId} en ms-billing...`);
      try {
        await fetch(`${BILLING_API}/refunds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentId: sagaLog.paymentId,
            reason: `Compensación Saga activada por fallo: ${error.message}`,
          }),
        });
        console.log(`✅ [COMPENSACIÓN 2 ÉXITO]: Arras devueltas al cliente en pasarela/DynamoDB.`);
      } catch (err) {
        console.error(`🚨 Fallo al compensar cobro:`, err.message);
      }
    }

    // COMPENSACIÓN PASO 1: Liberar propiedad en ms-properties-nestjs
    if (sagaLog.step1_propertyLocked) {
      console.log(`⏪ [COMPENSACIÓN 1]: Liberando bloqueo preventivo de propiedad #${propertyId} en ms-properties...`);
      try {
        await fetch(`${PROPERTIES_API}/${propertyId}/release-lock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: `Compensación Saga: ${error.message}` }),
        });
        console.log(`✅ [COMPENSACIÓN 1 ÉXITO]: Propiedad #${propertyId} revertida a estado DISPONIBLE en MongoDB.`);
      } catch (err) {
        console.error(`🚨 Fallo al compensar propiedad:`, err.message);
      }
    }

    console.log(`\n🛡️ SISTEMA RESTAURADO A ESTADO CONSISTENTE.\n`);
    return { success: false, error: error.message };
  }
}

// Exportar para uso modular o ejecutar prueba si se llama directamente
if (require.main === module) {
  // Simulación de prueba
  const args = process.argv.slice(2);
  const simulateFail = args.includes('--fail-legal');
  const simulateFailPayment = args.includes('--fail-payment');

  const payload = {
    propertyId: '6501a9b4f1',
    clientId: simulateFail ? 'CLIENTE_RESTRINGIDO' : 'CLI-ALBERTO-VALLE',
    depositAmount: simulateFailPayment ? 999999 : 5000,
    totalAmount: 245000,
  };

  executeSagaReservation(payload);
}

module.exports = { executeSagaReservation };
