<?php

namespace PropTech\Billing\Application\UseCase;

use PropTech\Billing\Application\Port\BillingRepository;
use PropTech\Billing\Domain\RuleViolation;

/** CLEAN — Caso de uso: reembolsar un cobro (compensación de la saga y CU15). Idempotente. */
final class RefundCharge {
    public function __construct(private BillingRepository $repository) {}

    /** @return array{charge: array, alreadyRefunded: bool} */
    public function execute(string $paymentId, string $reason): array {
        $paymentId = trim($paymentId);
        $reason = trim($reason) ?: 'Compensación Saga: Rollback por fallo contractual';
        if ($paymentId === '') {
            throw RuleViolation::invalid('paymentId es obligatorio para procesar el reembolso');
        }
        $result = $this->repository->refundCharge($paymentId, $reason);
        if ($result['charge'] === null) {
            throw RuleViolation::notFound("No existe el cobro {$paymentId}");
        }
        if ($result['charge']['status'] !== 'REFUNDED') {
            throw RuleViolation::conflict("El cobro {$paymentId} no se puede reembolsar (estado {$result['charge']['status']})");
        }
        return $result;
    }
}
