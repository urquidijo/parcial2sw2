<?php

namespace PropTech\Billing\Application\Port;

/**
 * CLEAN — Puerto (interfaz) que los casos de uso necesitan para guardar y leer cobros, reservas y comisiones.
 * Lo implementa la capa de infraestructura (DynamoDB); los casos de uso nunca conocen la base de datos.
 * Los métodos marcados con @throws ConcurrentUpdate fallan si el registro ya no está en el estado esperado.
 */
interface BillingRepository {
    /** false si ya existía (misma Idempotency-Key). */
    public function saveCharge(array $charge): bool;
    public function getCharge(string $paymentId): ?array;
    /** @return array{charge: ?array, alreadyRefunded: bool} */
    public function refundCharge(string $paymentId, string $reason): array;
    /** false si el pago ya estaba registrado. */
    public function savePayment(array $payment): bool;
    public function listCharges(): array;

    public function saveReservation(array $reservation): array;
    public function getReservation(string $reservationId): ?array;
    public function getAllReservations(?string $userId = null): array;
    /** @throws ConcurrentUpdate si la reserva ya no estaba ACTIVA. */
    public function closeReservation(string $reservationId, string $newStatus, string $closedBy, ?string $reason = null): ?array;

    /** null si la comisión ya existía. */
    public function saveCommission(array $commission): ?array;
    public function listCommissions(): array;
    public function getAgentCommissions(string $agentId): array;
    /** @throws ConcurrentUpdate si ya estaba pagada. */
    public function payCommission(string $agentId, string $commissionId, string $paidBy, string $reference): ?array;

    public function getFinancialSummary(): array;
}
