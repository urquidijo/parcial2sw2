<?php

namespace PropTech\Billing\Application\UseCase;

use PropTech\Billing\Application\Port\BillingRepository;
use PropTech\Billing\Domain\BillingRules;

/**
 * CLEAN — Caso de uso: cobrar las arras de una reserva (saga paso 2).
 * Resultado: REJECTED (pasarela rechazó), REPLAY (misma Idempotency-Key: no se cobra otra vez) o CREATED.
 */
final class ChargeArras {
    public function __construct(private BillingRepository $repository) {}

    public function execute(array $input, ?string $idempotencyKey): array {
        BillingRules::validateArrasCharge($input);
        if (BillingRules::gatewayRejects((float) $input['amount'])) {
            return ['outcome' => 'REJECTED'];
        }

        $paymentId = BillingRules::arrasPaymentId($idempotencyKey);
        $charge = [
            'paymentId' => $paymentId,
            'propertyId' => (string) $input['propertyId'],
            'clientId' => (string) $input['clientId'],
            'amount' => (float) $input['amount'],
            'currency' => $input['currency'] ?? 'USD',
            'status' => 'PAID',
            'idempotencyKey' => (string) ($idempotencyKey ?: ''),
        ];

        if (!$this->repository->saveCharge($charge)) {
            $existing = $this->repository->getCharge($paymentId);
            return [
                'outcome' => 'REPLAY',
                'paymentId' => $paymentId,
                'status' => $existing['status'] ?? 'PAID',
                'amount' => $existing['amount'] ?? $charge['amount'],
                'currency' => $existing['currency'] ?? $charge['currency'],
            ];
        }
        return ['outcome' => 'CREATED', 'paymentId' => $paymentId, 'amount' => $charge['amount'], 'currency' => $charge['currency']];
    }
}
