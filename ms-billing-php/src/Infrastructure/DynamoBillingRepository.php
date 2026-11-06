<?php

namespace PropTech\Billing\Infrastructure;

use PropTech\Billing\Application\Port\BillingRepository;
use PropTech\Billing\Application\Port\ConcurrentUpdate;
use PropTech\Billing\Services\DynamoException;
use PropTech\Billing\Services\DynamoStorageService;

/**
 * CLEAN — Capa de frameworks y drivers: implementa el puerto BillingRepository sobre Amazon DynamoDB
 * (DynamoStorageService firma las peticiones con SigV4). Traduce los fallos de condición de DynamoDB a
 * ConcurrentUpdate, así los casos de uso nunca conocen DynamoDB.
 */
final class DynamoBillingRepository implements BillingRepository {
    public function __construct(private DynamoStorageService $dynamo) {}

    public function saveCharge(array $charge): bool { return $this->dynamo->saveCharge($charge); }
    public function getCharge(string $paymentId): ?array { return $this->dynamo->getCharge($paymentId); }
    public function refundCharge(string $paymentId, string $reason): array { return $this->dynamo->refundCharge($paymentId, $reason); }
    public function savePayment(array $payment): bool { return $this->dynamo->savePayment($payment); }
    public function listCharges(): array { return $this->dynamo->listCharges(); }

    public function saveReservation(array $reservation): array { return $this->dynamo->saveReservation($reservation); }
    public function getReservation(string $reservationId): ?array { return $this->dynamo->getReservation($reservationId); }
    public function getAllReservations(?string $userId = null): array { return $this->dynamo->getAllReservations($userId); }

    public function closeReservation(string $reservationId, string $newStatus, string $closedBy, ?string $reason = null): ?array {
        return $this->conditional(fn () => $this->dynamo->closeReservation($reservationId, $newStatus, $closedBy, $reason));
    }

    public function saveCommission(array $commission): ?array { return $this->dynamo->saveCommission($commission); }
    public function listCommissions(): array { return $this->dynamo->listCommissions(); }
    public function getAgentCommissions(string $agentId): array { return $this->dynamo->getAgentCommissions($agentId); }

    public function payCommission(string $agentId, string $commissionId, string $paidBy, string $reference): ?array {
        return $this->conditional(fn () => $this->dynamo->payCommission($agentId, $commissionId, $paidBy, $reference));
    }

    public function getFinancialSummary(): array { return $this->dynamo->getFinancialSummary(); }

    private function conditional(callable $write): mixed {
        try {
            return $write();
        } catch (DynamoException $e) {
            if ($e->isConditionalFailure()) throw new ConcurrentUpdate('El registro ya no está en el estado esperado', 0, $e);
            throw $e;
        }
    }
}
