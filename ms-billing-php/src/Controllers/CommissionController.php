<?php

namespace PropTech\Billing\Controllers;

class CommissionController {

    /**
     * Calcula la comisión inmobiliaria:
     * - Venta: 3% del valor total (compartido o directo)
     * - Alquiler: 50% o 100% del primer canon de arrendamiento
     */
    public function calculate(array $input): array {
        $transactionType = strtoupper($input['transactionType'] ?? 'VENTA');
        $totalAmount = (float)($input['totalAmount'] ?? 0);
        $agentId = $input['agentId'] ?? 'BROKER-GENERAL';

        if ($totalAmount <= 0) {
            http_response_code(400);
            return ['success' => false, 'error' => 'El totalAmount debe ser mayor a cero'];
        }

        if ($transactionType === 'VENTA') {
            $percentage = 3.0; // 3% estándar de venta inmobiliaria
            $commissionAmount = $totalAmount * 0.03;
        } else {
            $percentage = 50.0; // 50% del primer mes de alquiler
            $commissionAmount = $totalAmount * 0.50;
        }

        $taxRetention = $commissionAmount * 0.13; // 13% impuesto / retención fiscal
        $netCommission = $commissionAmount - $taxRetention;

        http_response_code(200);
        return [
            'success' => true,
            'agentId' => $agentId,
            'transactionType' => $transactionType,
            'totalAmount' => $totalAmount,
            'commissionPercentage' => $percentage . '%',
            'grossCommission' => round($commissionAmount, 2),
            'taxRetention13Pct' => round($taxRetention, 2),
            'netCommissionToPay' => round($netCommission, 2),
            'currency' => $input['currency'] ?? 'USD',
            'calculatedAt' => date('c')
        ];
    }

    public function getAgentBalance(string $agentId): array {
        return [
            'success' => true,
            'agentId' => $agentId,
            'totalEarnedYTD' => 18450.00,
            'pendingPayout' => 3200.00,
            'completedDealsCount' => 7,
            'tier' => 'SENIOR_BROKER_GOLD',
            'lastUpdated' => date('c')
        ];
    }
}
