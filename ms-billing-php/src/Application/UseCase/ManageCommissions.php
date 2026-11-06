<?php

namespace PropTech\Billing\Application\UseCase;

use PropTech\Billing\Application\Port\BillingRepository;
use PropTech\Billing\Application\Port\ConcurrentUpdate;
use PropTech\Billing\Domain\BillingRules;
use PropTech\Billing\Domain\RuleViolation;

/** CLEAN — Casos de uso de comisiones: generarla, listarlas, liquidarla (CU17) y ver las de un agente (CU18). */
final class ManageCommissions {
    public function __construct(private BillingRepository $repository) {}

    public function generate(array $input): array {
        $commission = BillingRules::commission($input);
        $saved = $this->repository->saveCommission($commission);
        if ($saved === null) {
            throw RuleViolation::conflict("La comisión {$commission['commissionId']} ya fue generada");
        }
        return $saved;
    }

    public function listAll(): array {
        $list = $this->repository->listCommissions();
        return ['list' => $list, 'totals' => BillingRules::commissionTotals($list)];
    }

    public function pay(string $agentId, string $commissionId, string $cashierName, string $reference): array {
        try {
            $paid = $this->repository->payCommission($agentId, $commissionId, $cashierName, mb_substr(trim($reference), 0, 100));
        } catch (ConcurrentUpdate $e) {
            throw RuleViolation::conflict("La comisión {$commissionId} ya fue pagada");
        }
        if ($paid === null) {
            throw RuleViolation::notFound("No existe la comisión {$commissionId} del agente {$agentId}");
        }
        return $paid;
    }

    /** Un AGENTE solo ve las comisiones a su nombre (email); Cajero y Admin ven las de cualquiera. */
    public function ofAgent(string $agentId, string $callerRole, ?string $callerEmail): array {
        $list = $this->repository->getAgentCommissions($agentId);
        if ($callerRole === 'AGENTE') {
            $list = array_values(array_filter($list, fn ($c) => $c['agentEmail'] !== null && $c['agentEmail'] === $callerEmail));
        }
        return ['list' => $list, 'totals' => BillingRules::commissionTotals($list)];
    }
}
