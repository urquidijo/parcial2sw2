<?php

namespace PropTech\Billing\Controllers;

use PropTech\Billing\Http\ApiException;
use PropTech\Billing\Http\AuthContext;
use PropTech\Billing\Services\DynamoException;
use PropTech\Billing\Services\DynamoStorageService;

class BillingController {
    public const PAYMENT_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR'];

    private DynamoStorageService $storage;

    public function __construct() {
        $this->storage = new DynamoStorageService();
    }

    /**
     * SAGA PASO 2: cobro de arras. Con Idempotency-Key, repetir la petición devuelve el mismo cobro sin cobrar otra vez.
     */
    public function charge(array $input, array $headers): array {
        $idempotencyKey = $headers['idempotency-key'] ?? $headers['Idempotency-Key'] ?? ($input['idempotencyKey'] ?? null);

        if (empty($input['amount']) || empty($input['propertyId']) || empty($input['clientId'])) {
            throw ApiException::badRequest('Los campos amount, propertyId y clientId son obligatorios');
        }
        if (!is_numeric($input['amount']) || (float) $input['amount'] <= 0) {
            throw ApiException::badRequest('El monto de las arras debe ser mayor a 0');
        }

        // Simulación: un monto de prueba de 999999 simula fondos insuficientes para probar la compensación de la saga
        if ((float) $input['amount'] >= 999999) {
            http_response_code(402);
            return [
                'success' => false,
                'error' => 'FONDOS_INSUFICIENTES',
                'message' => 'La pasarela bancaria rechazó la transacción por límite o fondos insuficientes.'
            ];
        }

        $paymentId = $idempotencyKey
            ? 'PAY-' . strtoupper(substr(hash('sha256', (string) $idempotencyKey), 0, 10))
            : 'PAY-' . strtoupper(bin2hex(random_bytes(5)));

        $charge = [
            'paymentId' => $paymentId,
            'propertyId' => (string) $input['propertyId'],
            'clientId' => (string) $input['clientId'],
            'amount' => (float) $input['amount'],
            'currency' => $input['currency'] ?? 'USD',
            'status' => 'PAID',
            'idempotencyKey' => (string) ($idempotencyKey ?: ''),
        ];

        $created = $this->storage->saveCharge($charge);
        if (!$created) {
            $existing = $this->storage->getCharge($paymentId);
            http_response_code(200);
            return [
                'success' => true,
                'paymentId' => $paymentId,
                'status' => $existing['status'] ?? 'PAID',
                'amount' => $existing['amount'] ?? $charge['amount'],
                'currency' => $existing['currency'] ?? $charge['currency'],
                'idempotentReplay' => true,
                'message' => 'Cobro ya procesado con esta Idempotency-Key: no se volvió a cobrar.',
            ];
        }

        http_response_code(201);
        return [
            'success' => true,
            'paymentId' => $paymentId,
            'status' => 'PAID',
            'amount' => $charge['amount'],
            'currency' => $charge['currency'],
            'message' => 'Cobro de arras procesado con éxito y registrado en Amazon DynamoDB en la nube.',
            'ttlHours' => 48
        ];
    }

    /**
     * SAGA COMPENSACIÓN y CU15: reembolso de un cobro. Idempotente: reembolsar dos veces no falla ni duplica.
     */
    public function refund(array $input): array {
        $paymentId = trim((string) ($input['paymentId'] ?? ''));
        $reason = trim((string) ($input['reason'] ?? '')) ?: 'Compensación Saga: Rollback por fallo contractual';

        if ($paymentId === '') {
            throw ApiException::badRequest('paymentId es obligatorio para procesar el reembolso');
        }

        $result = $this->storage->refundCharge($paymentId, $reason);
        if ($result['charge'] === null) {
            throw ApiException::notFound("No existe el cobro {$paymentId}");
        }
        if ($result['charge']['status'] !== 'REFUNDED') {
            throw ApiException::conflict("El cobro {$paymentId} no se puede reembolsar (estado {$result['charge']['status']})");
        }

        return [
            'success' => true,
            'paymentId' => $paymentId,
            'status' => 'REFUNDED',
            'alreadyRefunded' => $result['alreadyRefunded'],
            'message' => $result['alreadyRefunded']
                ? 'El cobro ya estaba reembolsado.'
                : 'Compensación completada: fondos devueltos al cliente en DynamoDB.',
            'details' => $result['charge']
        ];
    }

    /**
     * Guarda una reserva en DynamoDB con TTL de 48 horas
     */
    public function createReservation(array $input): array {
        if (empty($input['propertyId']) || empty($input['userId']) || empty($input['paymentId'])) {
            throw ApiException::badRequest('propertyId, userId y paymentId son obligatorios');
        }
        $res = [
            'reservationId' => $input['reservationId'] ?? ('RES-' . strtoupper(bin2hex(random_bytes(4)))),
            'propertyId' => $input['propertyId'],
            'propertyTitle' => $input['propertyTitle'] ?? '',
            'userId' => $input['userId'],
            'userName' => $input['userName'] ?? 'Cliente',
            'userPhone' => $input['userPhone'] ?? '',
            'depositAmount' => (float) ($input['depositAmount'] ?? 5000),
            'paymentId' => $input['paymentId'],
            'contractNumber' => $input['contractNumber'] ?? '',
            'status' => 'ACTIVA'
        ];

        $saved = $this->storage->saveReservation($res);
        http_response_code(201);
        return [
            'success' => true,
            'message' => 'Reserva guardada con TTL de 48h en Amazon DynamoDB',
            'data' => $saved
        ];
    }

    public function getReservations(?string $userId = null): array {
        $list = $this->storage->getAllReservations($userId);
        return [
            'success' => true,
            'count' => count($list),
            'data' => $list
        ];
    }

    public function getReservation(string $id): array {
        $reservation = $this->storage->getReservation($id);
        if ($reservation === null) {
            throw ApiException::notFound("La reserva {$id} no existe o ya venció (las reservas sin cerrar se borran a las 48 h)");
        }
        return ['success' => true, 'data' => $reservation];
    }

    // CU15: marca la reserva como cancelada. El reembolso y la liberación del inmueble los orquesta el gateway.
    public function cancelReservation(string $id, array $input): array {
        $reason = trim((string) ($input['reason'] ?? '')) ?: 'Cancelada por el titular';
        $closed = $this->close($id, 'CANCELADA_REEMBOLSADA', $reason);
        return [
            'success' => true,
            'message' => "Reserva {$id} cancelada",
            'data' => $closed
        ];
    }

    // CU16: la operación se cerró (saldo pagado o primera cuota): la reserva pasa a COMPRADA o ALQUILADA.
    public function completeReservation(string $id, array $input): array {
        $outcome = strtoupper((string) ($input['outcome'] ?? 'COMPRADA'));
        if (!in_array($outcome, ['COMPRADA', 'ALQUILADA'], true)) {
            throw ApiException::badRequest('outcome debe ser COMPRADA o ALQUILADA');
        }
        $closed = $this->close($id, $outcome, null);
        return [
            'success' => true,
            'message' => "Reserva {$id} cerrada como {$outcome}",
            'data' => $closed
        ];
    }

    private function close(string $id, string $status, ?string $reason): array {
        try {
            $closed = $this->storage->closeReservation($id, $status, AuthContext::name(), $reason);
        } catch (DynamoException $e) {
            if (!$e->isConditionalFailure()) throw $e;
            $current = $this->storage->getReservation($id);
            throw ApiException::conflict("La reserva {$id} ya no está activa (estado " . ($current['status'] ?? '?') . ')');
        }
        if ($closed === null) {
            throw ApiException::notFound("La reserva {$id} no existe o ya venció");
        }
        return $closed;
    }

    /**
     * CU16: el Cajero registra el pago del saldo de una compra o una cuota mensual de alquiler.
     * El gateway valida contra el contrato firmado (tipo, titular y monto) antes de llamar aquí.
     */
    public function registerPayment(array $input): array {
        $kind = strtoupper(trim((string) ($input['kind'] ?? '')));
        $contractNumber = strtoupper(trim((string) ($input['contractNumber'] ?? '')));
        $period = trim((string) ($input['period'] ?? ''));
        $method = strtoupper(trim((string) ($input['method'] ?? '')));
        $amount = $input['amount'] ?? null;

        if (!in_array($kind, [DynamoStorageService::KIND_SALDO, DynamoStorageService::KIND_CUOTA], true)) {
            throw ApiException::badRequest('kind debe ser SALDO_COMPRA o CUOTA_ALQUILER');
        }
        if (!preg_match('/^[A-Z0-9-]{3,40}$/', $contractNumber)) {
            throw ApiException::badRequest('contractNumber es obligatorio');
        }
        foreach (['contractId', 'propertyId', 'clientId'] as $field) {
            if (trim((string) ($input[$field] ?? '')) === '') {
                throw ApiException::badRequest("{$field} es obligatorio");
            }
        }
        if (!is_numeric($amount) || (float) $amount <= 0) {
            throw ApiException::badRequest('El monto debe ser mayor a 0');
        }
        if (!in_array($method, self::PAYMENT_METHODS, true)) {
            throw ApiException::badRequest('Método de pago inválido. Usa: ' . implode(', ', self::PAYMENT_METHODS));
        }
        if ($kind === DynamoStorageService::KIND_CUOTA && !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period)) {
            throw ApiException::badRequest('El periodo de la cuota debe tener el formato AAAA-MM');
        }

        $paymentId = $kind === DynamoStorageService::KIND_SALDO
            ? "BAL-{$contractNumber}"
            : "RENT-{$contractNumber}-" . str_replace('-', '', $period);

        $payment = [
            'paymentId' => $paymentId,
            'kind' => $kind,
            'contractId' => (string) $input['contractId'],
            'contractNumber' => $contractNumber,
            'propertyId' => (string) $input['propertyId'],
            'propertyTitle' => mb_substr((string) ($input['propertyTitle'] ?? ''), 0, 200),
            'clientId' => (string) $input['clientId'],
            'clientName' => mb_substr((string) ($input['clientName'] ?? ''), 0, 150),
            'amount' => round((float) $amount, 2),
            'method' => $method,
            'reference' => mb_substr(trim((string) ($input['reference'] ?? '')), 0, 100),
            'period' => $kind === DynamoStorageService::KIND_CUOTA ? $period : null,
            'registeredBy' => AuthContext::name(),
        ];

        if (!$this->storage->savePayment($payment)) {
            throw ApiException::conflict($kind === DynamoStorageService::KIND_SALDO
                ? "El saldo del contrato {$contractNumber} ya está registrado"
                : "La cuota {$period} del contrato {$contractNumber} ya está registrada");
        }

        http_response_code(201);
        return [
            'success' => true,
            'message' => 'Pago registrado en Amazon DynamoDB',
            'data' => $payment + ['status' => 'PAID', 'createdAt' => date('c')]
        ];
    }

    // CU16: pagos de saldo y cuotas (opcionalmente de un contrato).
    public function listPayments(?string $contractNumber): array {
        $kinds = [DynamoStorageService::KIND_SALDO, DynamoStorageService::KIND_CUOTA];
        $list = array_values(array_filter(
            $this->storage->listCharges(),
            fn ($c) => in_array($c['kind'], $kinds, true) && (!$contractNumber || $c['contractNumber'] === strtoupper($contractNumber))
        ));
        return ['success' => true, 'count' => count($list), 'data' => $list];
    }

    public function getFinances(): array {
        return [
            'success' => true,
            'data' => $this->storage->getFinancialSummary()
        ];
    }
}
