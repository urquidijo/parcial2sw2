<?php

namespace PropTech\Billing\Application\UseCase;

use PropTech\Billing\Application\Port\BillingRepository;
use PropTech\Billing\Application\Port\ConcurrentUpdate;
use PropTech\Billing\Domain\BillingRules;
use PropTech\Billing\Domain\RuleViolation;

/**
 * CLEAN — Casos de uso de la reserva con arras: registrarla (saga), consultarla, cancelarla (CU15)
 * y cerrarla como compra o alquiler (CU16).
 */
final class ManageReservations {
    public function __construct(private BillingRepository $repository) {}

    public function create(array $input): array {
        if (empty($input['propertyId']) || empty($input['userId']) || empty($input['paymentId'])) {
            throw RuleViolation::invalid('propertyId, userId y paymentId son obligatorios');
        }
        return $this->repository->saveReservation([
            'reservationId' => $input['reservationId'] ?? ('RES-' . strtoupper(bin2hex(random_bytes(4)))),
            'propertyId' => $input['propertyId'],
            'propertyTitle' => $input['propertyTitle'] ?? '',
            'userId' => $input['userId'],
            'userName' => $input['userName'] ?? 'Cliente',
            'userPhone' => $input['userPhone'] ?? '',
            'depositAmount' => (float) ($input['depositAmount'] ?? 5000),
            'paymentId' => $input['paymentId'],
            'contractNumber' => $input['contractNumber'] ?? '',
            'status' => 'ACTIVA',
        ]);
    }

    public function list(?string $userId): array {
        return $this->repository->getAllReservations($userId);
    }

    public function get(string $id): array {
        $reservation = $this->repository->getReservation($id);
        if ($reservation === null) {
            throw RuleViolation::notFound("La reserva {$id} no existe o ya venció (las reservas sin cerrar se borran a las 48 h)");
        }
        return $reservation;
    }

    public function cancel(string $id, string $reason, string $actor): array {
        return $this->close($id, 'CANCELADA_REEMBOLSADA', $actor, trim($reason) ?: 'Cancelada por el titular');
    }

    public function complete(string $id, string $outcome, string $actor): array {
        return $this->close($id, BillingRules::reservationOutcome($outcome), $actor, null);
    }

    private function close(string $id, string $status, string $actor, ?string $reason): array {
        try {
            $closed = $this->repository->closeReservation($id, $status, $actor, $reason);
        } catch (ConcurrentUpdate $e) {
            $current = $this->repository->getReservation($id);
            throw RuleViolation::conflict("La reserva {$id} ya no está activa (estado " . ($current['status'] ?? '?') . ')');
        }
        if ($closed === null) {
            throw RuleViolation::notFound("La reserva {$id} no existe o ya venció");
        }
        return $closed;
    }
}
