<?php

namespace PropTech\Billing\Services;

class DynamoStorageService {
    private string $endpoint;
    private string $fallbackFile;

    public function __construct(string $endpoint = 'http://localhost:8000') {
        $this->endpoint = $endpoint;
        $this->fallbackFile = __DIR__ . '/../../storage/dynamo_fallback.json';
        if (!is_dir(dirname($this->fallbackFile))) {
            @mkdir(dirname($this->fallbackFile), 0777, true);
        }
    }

    /**
     * Envía una petición HTTP a DynamoDB Local usando la API JSON de AWS
     */
    public function sendDynamoRequest(string $target, array $payload): array {
        $ch = curl_init($this->endpoint);
        $json = json_encode($payload);

        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "POST");
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 2);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/x-amz-json-1.0',
            'X-Amz-Target: DynamoDB_20120810.' . $target,
            'Authorization: AWS4-HMAC-SHA256 Credential=dummy/20261017/us-east-1/dynamodb/aws4_request, SignedHeaders=content-type;host;x-amz-target, Signature=dummy'
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err || $httpCode >= 400 || !$response) {
            // Si DynamoDB local no responde aún, usamos persistencia de respaldo local
            return $this->handleFallback($target, $payload);
        }

        return json_decode($response, true) ?? [];
    }

    private function handleFallback(string $target, array $payload): array {
        $data = file_exists($this->fallbackFile) ? json_decode(file_get_contents($this->fallbackFile), true) : [];
        if (!is_array($data)) $data = [];

        if ($target === 'PutItem') {
            $table = $payload['TableName'] ?? 'default';
            $item = $payload['Item'] ?? [];
            $pk = $item['paymentId']['S'] ?? $item['id']['S'] ?? uniqid();
            $data[$table][$pk] = $item;
            file_put_contents($this->fallbackFile, json_encode($data, JSON_PRETTY_PRINT));
            return ['Attributes' => $item];
        }

        if ($target === 'GetItem') {
            $table = $payload['TableName'] ?? 'default';
            $pk = $payload['Key']['paymentId']['S'] ?? $payload['Key']['id']['S'] ?? '';
            return ['Item' => $data[$table][$pk] ?? null];
        }

        if ($target === 'Scan') {
            $table = $payload['TableName'] ?? 'default';
            return ['Items' => array_values($data[$table] ?? [])];
        }

        return [];
    }

    /**
     * Guarda un cobro o transacción en la tabla 'charges' con TTL
     */
    public function saveCharge(array $charge): array {
        $ttl = time() + (48 * 3600); // 48 horas de vigencia de reserva
        $payload = [
            'TableName' => 'charges',
            'Item' => [
                'paymentId' => ['S' => $charge['paymentId']],
                'propertyId' => ['S' => (string)$charge['propertyId']],
                'clientId' => ['S' => (string)$charge['clientId']],
                'amount' => ['N' => (string)$charge['amount']],
                'currency' => ['S' => $charge['currency'] ?? 'USD'],
                'status' => ['S' => $charge['status']],
                'idempotencyKey' => ['S' => $charge['idempotencyKey'] ?? ''],
                'createdAt' => ['S' => date('c')],
                'ttl' => ['N' => (string)$ttl] // TTL nativo de DynamoDB
            ]
        ];

        $this->sendDynamoRequest('PutItem', $payload);
        return $charge;
    }

    /**
     * Actualiza el estado a REEMBOLSADO (Saga Compensation)
     */
    public function refundCharge(string $paymentId, string $reason): ?array {
        $payload = [
            'TableName' => 'charges',
            'Key' => [
                'paymentId' => ['S' => $paymentId]
            ]
        ];
        $res = $this->sendDynamoRequest('GetItem', $payload);
        if (empty($res['Item'])) {
            return null;
        }

        $charge = [
            'paymentId' => $paymentId,
            'propertyId' => $res['Item']['propertyId']['S'] ?? '',
            'clientId' => $res['Item']['clientId']['S'] ?? '',
            'amount' => (float)($res['Item']['amount']['N'] ?? 0),
            'currency' => $res['Item']['currency']['S'] ?? 'USD',
            'status' => 'REFUNDED',
            'refundReason' => $reason,
            'refundedAt' => date('c'),
            'idempotencyKey' => $res['Item']['idempotencyKey']['S'] ?? ''
        ];

        $this->saveCharge($charge);
        return $charge;
    }
}
