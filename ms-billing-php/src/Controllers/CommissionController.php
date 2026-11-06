<?php

namespace PropTech\Billing\Controllers;

use PropTech\Billing\Application\UseCase\ManageCommissions;
use PropTech\Billing\Http\AuthContext;
use PropTech\Billing\Infrastructure\DynamoBillingRepository;
use PropTech\Billing\Services\DynamoStorageService;

/** CLEAN — Adaptador de interfaz para las comisiones (CU17 / CU18). Mismas respuestas que antes del refactor. */
class CommissionController {
    private ManageCommissions $commissions;

    public function __construct() {
        $this->commissions = new ManageCommissions(new DynamoBillingRepository(new DynamoStorageService()));
    }

    /** Genera la comisión de un agente al cerrarse una operación (tasa sobre el monto base y 13 % de retención). */
    public function calculate(array $input): array {
        $saved = BillingController::run(fn () => $this->commissions->generate($input));
        http_response_code(201);
        return [
            'success' => true,
            'message' => 'Comisión generada (tasa sobre el monto base, menos 13% de retención) en Amazon DynamoDB.',
            'data' => $saved
        ];
    }

    // CU17: todas las comisiones, para que el Cajero las liquide.
    public function listAll(): array {
        $r = $this->commissions->listAll();
        return ['success' => true, 'count' => count($r['list']), 'data' => $r['list'], 'totals' => $r['totals']];
    }

    // CU17: el Cajero paga la comisión (PENDIENTE_PAGO → PAGADA).
    public function pay(string $agentId, string $commissionId, array $input): array {
        $paid = BillingController::run(fn () => $this->commissions->pay($agentId, $commissionId, AuthContext::name(), (string) ($input['reference'] ?? '')));
        return ['success' => true, 'message' => "Comisión {$commissionId} liquidada", 'data' => $paid];
    }

    /** CU18: comisiones de un agente (un AGENTE solo ve las suyas). */
    public function getAgentBalance(string $agentId): array {
        $r = $this->commissions->ofAgent($agentId, AuthContext::role(), AuthContext::email());
        return [
            'success' => true,
            'data' => [
                'agentId' => $agentId,
                'totalBalanceUSD' => $r['totals']['net'],
                'pendingUSD' => $r['totals']['pending'],
                'paidUSD' => $r['totals']['paid'],
                'count' => count($r['list']),
                'commissions' => $r['list']
            ]
        ];
    }
}
