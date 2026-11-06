<?php

namespace PropTech\Billing\Application\UseCase;

use PropTech\Billing\Application\Port\BillingRepository;
use PropTech\Billing\Domain\BillingRules;
use PropTech\Billing\Domain\RuleViolation;

/**
 * CLEAN — Caso de uso (CU16): el Cajero registra el saldo de una compra o una cuota de alquiler.
 * El mismo saldo o la misma cuota no se registran dos veces (id determinista).
 */
final class RegisterOperationPayment {
    public function __construct(private BillingRepository $repository) {}

    public function execute(array $input, string $cashierName): array {
        $payment = BillingRules::operationPayment($input, $cashierName);
        if (!$this->repository->savePayment($payment)) {
            throw RuleViolation::conflict(BillingRules::duplicatePaymentMessage($payment['kind'], $payment['contractNumber'], $payment['period']));
        }
        return $payment + ['status' => 'PAID', 'createdAt' => date('c')];
    }

    /** Pagos de saldo y cuotas (opcionalmente de un contrato). */
    public function list(?string $contractNumber): array {
        $kinds = [BillingRules::KIND_SALDO, BillingRules::KIND_CUOTA];
        return array_values(array_filter(
            $this->repository->listCharges(),
            fn ($c) => in_array($c['kind'], $kinds, true) && (!$contractNumber || $c['contractNumber'] === strtoupper($contractNumber))
        ));
    }
}
