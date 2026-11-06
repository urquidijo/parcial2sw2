<?php

namespace PropTech\Billing\Controllers;

use PropTech\Billing\Application\UseCase\ChargeArras;
use PropTech\Billing\Application\UseCase\ManageReservations;
use PropTech\Billing\Application\UseCase\RefundCharge;
use PropTech\Billing\Application\UseCase\RegisterOperationPayment;
use PropTech\Billing\Domain\BillingRules;
use PropTech\Billing\Domain\RuleViolation;
use PropTech\Billing\Http\ApiException;
use PropTech\Billing\Http\AuthContext;
use PropTech\Billing\Infrastructure\DynamoBillingRepository;
use PropTech\Billing\Services\DynamoStorageService;

/**
 * CLEAN — Adaptador de interfaz (controlador): convierte la petición HTTP en datos simples, llama al caso de
 * uso y arma la respuesta JSON (la misma que antes del refactor). No contiene reglas de negocio.
 */
class BillingController {
    public const PAYMENT_METHODS = BillingRules::PAYMENT_METHODS;

    private ChargeArras $chargeArras;
    private RefundCharge $refundCharge;
    private ManageReservations $reservations;
    private RegisterOperationPayment $payments;
    private DynamoBillingRepository $repository;

    public function __construct() {
        // Raíz de composición: aquí se elige la implementación del puerto (DynamoDB).
        $this->repository = new DynamoBillingRepository(new DynamoStorageService());
        $this->chargeArras = new ChargeArras($this->repository);
        $this->refundCharge = new RefundCharge($this->repository);
        $this->reservations = new ManageReservations($this->repository);
        $this->payments = new RegisterOperationPayment($this->repository);
    }

    /** SAGA PASO 2: cobro de arras. Con Idempotency-Key, repetir la petición devuelve el mismo cobro sin cobrar otra vez. */
    public function charge(array $input, array $headers): array {
        $idempotencyKey = $headers['idempotency-key'] ?? $headers['Idempotency-Key'] ?? ($input['idempotencyKey'] ?? null);
        $result = self::run(fn () => $this->chargeArras->execute($input, $idempotencyKey !== null ? (string) $idempotencyKey : null));

        if ($result['outcome'] === 'REJECTED') {
            http_response_code(402);
            return [
                'success' => false,
                'error' => 'FONDOS_INSUFICIENTES',
                'message' => 'La pasarela bancaria rechazó la transacción por límite o fondos insuficientes.'
            ];
        }
        if ($result['outcome'] === 'REPLAY') {
            http_response_code(200);
            return [
                'success' => true,
                'paymentId' => $result['paymentId'],
                'status' => $result['status'],
                'amount' => $result['amount'],
                'currency' => $result['currency'],
                'idempotentReplay' => true,
                'message' => 'Cobro ya procesado con esta Idempotency-Key: no se volvió a cobrar.',
            ];
        }
        http_response_code(201);
        return [
            'success' => true,
            'paymentId' => $result['paymentId'],
            'status' => 'PAID',
            'amount' => $result['amount'],
            'currency' => $result['currency'],
            'message' => 'Cobro de arras procesado con éxito y registrado en Amazon DynamoDB en la nube.',
            'ttlHours' => 48
        ];
    }

    /** SAGA COMPENSACIÓN y CU15: reembolso de un cobro. Idempotente: reembolsar dos veces no falla ni duplica. */
    public function refund(array $input): array {
        $paymentId = trim((string) ($input['paymentId'] ?? ''));
        $result = self::run(fn () => $this->refundCharge->execute($paymentId, (string) ($input['reason'] ?? '')));
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

    /** Guarda una reserva en DynamoDB con TTL de 48 horas. */
    public function createReservation(array $input): array {
        $saved = self::run(fn () => $this->reservations->create($input));
        http_response_code(201);
        return [
            'success' => true,
            'message' => 'Reserva guardada con TTL de 48h en Amazon DynamoDB',
            'data' => $saved
        ];
    }

    public function getReservations(?string $userId = null): array {
        $list = $this->reservations->list($userId);
        return ['success' => true, 'count' => count($list), 'data' => $list];
    }

    public function getReservation(string $id): array {
        return ['success' => true, 'data' => self::run(fn () => $this->reservations->get($id))];
    }

    // CU15: marca la reserva como cancelada. El reembolso y la liberación del inmueble los orquesta el gateway.
    public function cancelReservation(string $id, array $input): array {
        $closed = self::run(fn () => $this->reservations->cancel($id, (string) ($input['reason'] ?? ''), AuthContext::name()));
        return ['success' => true, 'message' => "Reserva {$id} cancelada", 'data' => $closed];
    }

    // CU16: la operación se cerró (saldo pagado o primera cuota): la reserva pasa a COMPRADA o ALQUILADA.
    public function completeReservation(string $id, array $input): array {
        $outcome = strtoupper((string) ($input['outcome'] ?? 'COMPRADA'));
        $closed = self::run(fn () => $this->reservations->complete($id, $outcome, AuthContext::name()));
        return ['success' => true, 'message' => "Reserva {$id} cerrada como {$outcome}", 'data' => $closed];
    }

    /** CU16: el Cajero registra el pago del saldo de una compra o una cuota mensual de alquiler. */
    public function registerPayment(array $input): array {
        $payment = self::run(fn () => $this->payments->execute($input, AuthContext::name()));
        http_response_code(201);
        return ['success' => true, 'message' => 'Pago registrado en Amazon DynamoDB', 'data' => $payment];
    }

    // CU16: pagos de saldo y cuotas (opcionalmente de un contrato).
    public function listPayments(?string $contractNumber): array {
        $list = $this->payments->list($contractNumber);
        return ['success' => true, 'count' => count($list), 'data' => $list];
    }

    public function getFinances(): array {
        return ['success' => true, 'data' => $this->repository->getFinancialSummary()];
    }

    /** Traduce una regla violada (dominio / caso de uso) al error HTTP que espera el gateway. */
    public static function run(callable $useCase): mixed {
        try {
            return $useCase();
        } catch (RuleViolation $e) {
            throw match ($e->kind) {
                RuleViolation::NOT_FOUND => ApiException::notFound($e->getMessage()),
                RuleViolation::CONFLICT => ApiException::conflict($e->getMessage()),
                default => ApiException::badRequest($e->getMessage()),
            };
        }
    }
}
