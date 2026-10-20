<?php

namespace PropTech\Billing\Controllers;

use PropTech\Billing\Services\DynamoStorageService;

class CommissionController {
    private DynamoStorageService $storage;

    public function __construct() {
        $this->storage = new DynamoStorageService();
    }

    /**
     * Calcula y liquida la comisión de un agente por una venta inmobiliaria
     */
    public function calculate(array $input): array {
        $agentId = $input['agentId'] ?? null;
        $propertyPrice = (float)($input['propertyPrice'] ?? 0);
        $propertyId = (string)($input['propertyId'] ?? 'PROP-UNKNOWN');

        if (!$agentId || $propertyPrice <= 0) {
            http_response_code(400);
            return [
                'success' => false,
                'error' => 'PARAMETROS_INVALIDOS',
                'message' => 'agentId y propertyPrice mayor a 0 son obligatorios'
            ];
        }

        $res = $this->storage->saveCommission($agentId, $propertyPrice, $propertyId);

        http_response_code(201);
        return [
            'success' => true,
            'message' => 'Comisión calculada con éxito (3% menos 13% retención) y persistida en Amazon DynamoDB.',
            'data' => $res
        ];
    }

    /**
     * Obtiene el balance de comisiones de un agente
     */
    public function getAgentBalance(string $agentId): array {
        $data = $this->storage->getAgentCommissions($agentId);
        return [
            'success' => true,
            'data' => $data
        ];
    }
}
