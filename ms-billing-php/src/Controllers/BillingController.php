<?php

namespace PropTech\Billing\Controllers;

use PropTech\Billing\Services\DynamoStorageService;

class BillingController {
    private DynamoStorageService $storage;

    public function __construct() {
        $this->storage = new DynamoStorageService();
    }

    /**
     * SAGA PASO 2: Cobro de arras / depósito de reserva con Idempotencia
     */
    public function charge(array $input, array $headers): array {
        $idempotencyKey = $headers['idempotency-key'] ?? $headers['Idempotency-Key'] ?? ($input['idempotencyKey'] ?? null);

        if (empty($input['amount']) || empty($input['propertyId']) || empty($input['clientId'])) {
            http_response_code(400);
            return [
                'success' => false,
                'error' => 'PARAMETROS_INVALIDOS',
                'message' => 'Los campos amount, propertyId y clientId son obligatorios'
            ];
        }

        // Simulación: Si se solicita monto de prueba 999999, simular fondos insuficientes para probar compensación
        if ((float)$input['amount'] >= 999999) {
            http_response_code(402);
            return [
                'success' => false,
                'error' => 'FONDOS_INSUFICIENTES',
                'message' => 'La pasarela bancaria rechazó la transacción por límite o fondos insuficientes.'
            ];
        }

        $paymentId = 'PAY-' . strtoupper(substr(bin2hex(random_bytes(6)), 0, 10));

        $charge = [
            'paymentId' => $paymentId,
            'propertyId' => (string)$input['propertyId'],
            'clientId' => (string)$input['clientId'],
            'amount' => (float)$input['amount'],
            'currency' => $input['currency'] ?? 'USD',
            'status' => 'PAID',
            'idempotencyKey' => $idempotencyKey ?: 'auto-' . uniqid(),
            'description' => 'Depósito de Arras / Reserva para Inmueble #' . $input['propertyId']
        ];

        $this->storage->saveCharge($charge);

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
     * SAGA COMPENSACIÓN: Reembolso bancario automático (Refund)
     */
    public function refund(array $input): array {
        $paymentId = $input['paymentId'] ?? null;
        $reason = $input['reason'] ?? 'Compensación Saga: Rollback por fallo contractual';

        if (!$paymentId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'paymentId es obligatorio para procesar el reembolso'];
        }

        $refunded = $this->storage->refundCharge($paymentId, $reason);

        http_response_code(200);
        return [
            'success' => true,
            'paymentId' => $paymentId,
            'status' => 'REFUNDED',
            'message' => 'Compensación completada: Fondos devueltos al cliente exitosamente en DynamoDB.',
            'details' => $refunded
        ];
    }

    /**
     * Guarda una reserva en DynamoDB con TTL de 48 horas
     */
    public function createReservation(array $input): array {
        $reservationId = $input['reservationId'] ?? ('RES-' . rand(1000, 9999));
        $res = [
            'reservationId' => $reservationId,
            'propertyId' => $input['propertyId'],
            'userId' => $input['userId'],
            'userName' => $input['userName'] ?? 'Cliente',
            'userPhone' => $input['userPhone'] ?? '',
            'depositAmount' => (float)($input['depositAmount'] ?? 5000),
            'paymentId' => $input['paymentId'] ?? ('PAY-' . uniqid()),
            'contractNumber' => $input['contractNumber'] ?? ('ARRAS-' . rand(1000, 9999)),
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

    public function cancelReservation(string $id): array {
        $this->storage->updateReservationStatus($id, 'CANCELADA_REEMBOLSADA');
        return [
            'success' => true,
            'message' => "Reserva #$id cancelada y reembolsada en DynamoDB"
        ];
    }

    public function buyReservation(string $id): array {
        $this->storage->updateReservationStatus($id, 'COMPRADA');
        return [
            'success' => true,
            'message' => "Reserva #$id formalizada a COMPRADA en DynamoDB"
        ];
    }

    public function getFinances(): array {
        $fin = $this->storage->getFinancialSummary();
        return [
            'success' => true,
            'data' => $fin
        ];
    }
}
