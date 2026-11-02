<?php

namespace PropTech\Billing\Controllers;

use PropTech\Billing\Http\ApiException;
use PropTech\Billing\Http\AuthContext;
use PropTech\Billing\Services\DynamoException;
use PropTech\Billing\Services\DynamoStorageService;

class CommissionController {
    private DynamoStorageService $storage;

    public function __construct() {
        $this->storage = new DynamoStorageService();
    }

    /**
     * Genera la comisión de un agente al cerrarse una operación: tasa sobre el monto base y 13% de retención.
     * Un commissionId por contrato: generarla dos veces devuelve 409.
     */
    public function calculate(array $input): array {
        $agentId = trim((string) ($input['agentId'] ?? ''));
        $baseAmount = (float) ($input['baseAmount'] ?? $input['propertyPrice'] ?? 0);
        $rate = isset($input['rate']) ? (float) $input['rate'] : 0.03;
        $commissionId = strtoupper(trim((string) ($input['commissionId'] ?? '')))
            ?: 'COM-' . strtoupper(bin2hex(random_bytes(4)));

        if ($agentId === '' || $baseAmount <= 0) {
            throw ApiException::badRequest('agentId y un monto base mayor a 0 son obligatorios');
        }
        if ($rate <= 0 || $rate > 1) {
            throw ApiException::badRequest('La tasa de comisión debe estar entre 0 y 1');
        }
        if (!preg_match('/^COM-[A-Z0-9-]{3,60}$/', $commissionId)) {
            throw ApiException::badRequest('commissionId inválido');
        }

        $saved = $this->storage->saveCommission([
            'commissionId' => $commissionId,
            'agentId' => $agentId,
            'agentName' => (string) ($input['agentName'] ?? ''),
            'agentEmail' => (string) ($input['agentEmail'] ?? ''),
            'propertyId' => (string) ($input['propertyId'] ?? ''),
            'contractNumber' => (string) ($input['contractNumber'] ?? ''),
            'operationType' => strtoupper((string) ($input['operationType'] ?? 'VENTA')),
            'baseAmount' => $baseAmount,
            'rate' => $rate,
        ]);
        if ($saved === null) {
            throw ApiException::conflict("La comisión {$commissionId} ya fue generada");
        }

        http_response_code(201);
        return [
            'success' => true,
            'message' => 'Comisión generada (tasa sobre el monto base, menos 13% de retención) en Amazon DynamoDB.',
            'data' => $saved
        ];
    }

    // CU17: todas las comisiones, para que el Cajero las liquide.
    public function listAll(): array {
        $list = $this->storage->listCommissions();
        return ['success' => true, 'count' => count($list), 'data' => $list, 'totals' => self::totals($list)];
    }

    // CU17: el Cajero paga la comisión (PENDIENTE_PAGO → PAGADA).
    public function pay(string $agentId, string $commissionId, array $input): array {
        $reference = mb_substr(trim((string) ($input['reference'] ?? '')), 0, 100);
        try {
            $paid = $this->storage->payCommission($agentId, $commissionId, AuthContext::name(), $reference);
        } catch (DynamoException $e) {
            if ($e->isConditionalFailure()) {
                throw ApiException::conflict("La comisión {$commissionId} ya fue pagada");
            }
            throw $e;
        }
        if ($paid === null) {
            throw ApiException::notFound("No existe la comisión {$commissionId} del agente {$agentId}");
        }
        return ['success' => true, 'message' => "Comisión {$commissionId} liquidada", 'data' => $paid];
    }

    /**
     * CU18: comisiones de un agente. Un AGENTE solo ve las que están a su nombre (email del token);
     * el Cajero y el Admin ven las de cualquiera.
     */
    public function getAgentBalance(string $agentId): array {
        $list = $this->storage->getAgentCommissions($agentId);
        if (AuthContext::role() === 'AGENTE') {
            $email = AuthContext::email();
            $list = array_values(array_filter($list, fn ($c) => $c['agentEmail'] !== null && $c['agentEmail'] === $email));
        }
        $totals = self::totals($list);
        return [
            'success' => true,
            'data' => [
                'agentId' => $agentId,
                'totalBalanceUSD' => $totals['net'],
                'pendingUSD' => $totals['pending'],
                'paidUSD' => $totals['paid'],
                'count' => count($list),
                'commissions' => $list
            ]
        ];
    }

    private static function totals(array $list): array {
        $sum = fn (?string $status) => round(array_sum(array_map(
            fn ($c) => $c['netAmount'],
            array_filter($list, fn ($c) => $status === null || $c['status'] === $status)
        )), 2);
        return ['net' => $sum(null), 'pending' => $sum('PENDIENTE_PAGO'), 'paid' => $sum('PAGADA')];
    }
}
