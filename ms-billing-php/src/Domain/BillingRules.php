<?php

namespace PropTech\Billing\Domain;

/**
 * CLEAN — Capa de entidades (reglas de empresa): cobros, pagos de operación y comisiones.
 * PHP puro: no conoce HTTP, Keycloak ni DynamoDB, así que estas reglas se pueden probar solas.
 */
final class BillingRules {
    public const KIND_ARRAS = 'ARRAS';
    public const KIND_SALDO = 'SALDO_COMPRA';
    public const KIND_CUOTA = 'CUOTA_ALQUILER';
    public const PAYMENT_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR'];
    public const RESERVATION_OUTCOMES = ['COMPRADA', 'ALQUILADA'];
    public const DEFAULT_COMMISSION_RATE = 0.03;

    /** Monto de prueba con el que la pasarela simulada rechaza el cobro (para probar la compensación de la saga). */
    public const GATEWAY_REJECTION_AMOUNT = 999999;

    // ---------------- Arras (saga paso 2) ----------------

    public static function validateArrasCharge(array $input): void {
        if (empty($input['amount']) || empty($input['propertyId']) || empty($input['clientId'])) {
            throw RuleViolation::invalid('Los campos amount, propertyId y clientId son obligatorios');
        }
        if (!is_numeric($input['amount']) || (float) $input['amount'] <= 0) {
            throw RuleViolation::invalid('El monto de las arras debe ser mayor a 0');
        }
    }

    public static function gatewayRejects(float $amount): bool {
        return $amount >= self::GATEWAY_REJECTION_AMOUNT;
    }

    /** Con Idempotency-Key el id es determinista: repetir el pedido apunta al mismo cobro y no cobra dos veces. */
    public static function arrasPaymentId(?string $idempotencyKey): string {
        return $idempotencyKey
            ? 'PAY-' . strtoupper(substr(hash('sha256', $idempotencyKey), 0, 10))
            : 'PAY-' . strtoupper(bin2hex(random_bytes(5)));
    }

    // ---------------- Pagos de la operación (CU16) ----------------

    /** Valida y normaliza el pago del saldo de compra o de una cuota de alquiler. */
    public static function operationPayment(array $input, string $registeredBy): array {
        $kind = strtoupper(trim((string) ($input['kind'] ?? '')));
        $contractNumber = strtoupper(trim((string) ($input['contractNumber'] ?? '')));
        $period = trim((string) ($input['period'] ?? ''));
        $method = strtoupper(trim((string) ($input['method'] ?? '')));
        $amount = $input['amount'] ?? null;

        if (!in_array($kind, [self::KIND_SALDO, self::KIND_CUOTA], true)) {
            throw RuleViolation::invalid('kind debe ser SALDO_COMPRA o CUOTA_ALQUILER');
        }
        if (!preg_match('/^[A-Z0-9-]{3,40}$/', $contractNumber)) {
            throw RuleViolation::invalid('contractNumber es obligatorio');
        }
        foreach (['contractId', 'propertyId', 'clientId'] as $field) {
            if (trim((string) ($input[$field] ?? '')) === '') {
                throw RuleViolation::invalid("{$field} es obligatorio");
            }
        }
        if (!is_numeric($amount) || (float) $amount <= 0) {
            throw RuleViolation::invalid('El monto debe ser mayor a 0');
        }
        if (!in_array($method, self::PAYMENT_METHODS, true)) {
            throw RuleViolation::invalid('Método de pago inválido. Usa: ' . implode(', ', self::PAYMENT_METHODS));
        }
        if ($kind === self::KIND_CUOTA && !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period)) {
            throw RuleViolation::invalid('El periodo de la cuota debe tener el formato AAAA-MM');
        }

        return [
            'paymentId' => self::operationPaymentId($kind, $contractNumber, $period),
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
            'period' => $kind === self::KIND_CUOTA ? $period : null,
            'registeredBy' => $registeredBy,
        ];
    }

    /** Id determinista: el mismo saldo o la misma cuota no se pueden registrar dos veces. */
    public static function operationPaymentId(string $kind, string $contractNumber, string $period): string {
        return $kind === self::KIND_SALDO
            ? "BAL-{$contractNumber}"
            : "RENT-{$contractNumber}-" . str_replace('-', '', $period);
    }

    public static function duplicatePaymentMessage(string $kind, string $contractNumber, ?string $period): string {
        return $kind === self::KIND_SALDO
            ? "El saldo del contrato {$contractNumber} ya está registrado"
            : "La cuota {$period} del contrato {$contractNumber} ya está registrada";
    }

    public static function reservationOutcome(string $outcome): string {
        $outcome = strtoupper($outcome);
        if (!in_array($outcome, self::RESERVATION_OUTCOMES, true)) {
            throw RuleViolation::invalid('outcome debe ser COMPRADA o ALQUILADA');
        }
        return $outcome;
    }

    // ---------------- Comisiones (CU17 / CU18) ----------------

    /** Comisión del agente: tasa (3 % por defecto) sobre el monto base; la retención del 13 % la aplica el registro. */
    public static function commission(array $input): array {
        $agentId = trim((string) ($input['agentId'] ?? ''));
        $baseAmount = (float) ($input['baseAmount'] ?? $input['propertyPrice'] ?? 0);
        $rate = isset($input['rate']) ? (float) $input['rate'] : self::DEFAULT_COMMISSION_RATE;
        $commissionId = strtoupper(trim((string) ($input['commissionId'] ?? '')))
            ?: 'COM-' . strtoupper(bin2hex(random_bytes(4)));

        if ($agentId === '' || $baseAmount <= 0) {
            throw RuleViolation::invalid('agentId y un monto base mayor a 0 son obligatorios');
        }
        if ($rate <= 0 || $rate > 1) {
            throw RuleViolation::invalid('La tasa de comisión debe estar entre 0 y 1');
        }
        if (!preg_match('/^COM-[A-Z0-9-]{3,60}$/', $commissionId)) {
            throw RuleViolation::invalid('commissionId inválido');
        }
        return [
            'commissionId' => $commissionId,
            'agentId' => $agentId,
            'agentName' => (string) ($input['agentName'] ?? ''),
            'agentEmail' => (string) ($input['agentEmail'] ?? ''),
            'propertyId' => (string) ($input['propertyId'] ?? ''),
            'contractNumber' => (string) ($input['contractNumber'] ?? ''),
            'operationType' => strtoupper((string) ($input['operationType'] ?? 'VENTA')),
            'baseAmount' => $baseAmount,
            'rate' => $rate,
        ];
    }

    /** Totales neto / pendiente / pagado de una lista de comisiones. */
    public static function commissionTotals(array $list): array {
        $sum = fn (?string $status) => round(array_sum(array_map(
            fn ($c) => $c['netAmount'],
            array_filter($list, fn ($c) => $status === null || $c['status'] === $status)
        )), 2);
        return ['net' => $sum(null), 'pending' => $sum('PENDIENTE_PAGO'), 'paid' => $sum('PAGADA')];
    }
}
