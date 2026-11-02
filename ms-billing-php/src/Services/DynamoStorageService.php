<?php

namespace PropTech\Billing\Services;

require_once __DIR__ . '/DynamoException.php';

/**
 * Acceso a Amazon DynamoDB (us-east-1) firmando cada petición con AWS SigV4.
 * Tablas:
 *  - HabitatCharges       (paymentId)               libro de cobros: arras, saldos de compra y cuotas de alquiler
 *  - HabitatReservations  (reservationId)           reservas; el TTL las borra a las 48 h si siguen ACTIVA
 *  - HabitatCommissions   (agentId, commissionId)   comisiones de los agentes
 */
class DynamoStorageService {
    public const KIND_ARRAS = 'ARRAS';
    public const KIND_SALDO = 'SALDO_COMPRA';
    public const KIND_CUOTA = 'CUOTA_ALQUILER';

    private string $accessKey;
    private string $secretKey;
    private string $region;
    private string $host;
    private string $endpoint;

    public function __construct() {
        // Cargar variables de entorno desde .env si no están presentes en el sistema
        if (!getenv('AWS_ACCESS_KEY_ID')) {
            $envPaths = [__DIR__ . '/../../.env', __DIR__ . '/../../../.env'];
            foreach ($envPaths as $envPath) {
                if (file_exists($envPath)) {
                    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                    foreach ($lines as $line) {
                        $line = trim($line);
                        if (str_starts_with($line, '#') || !str_contains($line, '=')) continue;
                        [$k, $v] = explode('=', $line, 2);
                        $k = trim($k);
                        $v = trim($v, " \t\n\r\0\x0B\"'");
                        if (!getenv($k)) {
                            putenv("{$k}={$v}");
                            $_ENV[$k] = $v;
                        }
                    }
                    break;
                }
            }
        }

        $this->accessKey = getenv('AWS_ACCESS_KEY_ID') ?: '';
        $this->secretKey = getenv('AWS_SECRET_ACCESS_KEY') ?: '';
        $this->region = getenv('AWS_REGION') ?: 'us-east-1';
        $this->host = "dynamodb.{$this->region}.amazonaws.com";
        $this->endpoint = "https://{$this->host}/";
    }

    /**
     * Envía una petición firmada con AWS Signature Version 4 (SigV4) a AWS DynamoDB
     */
    public function sendDynamoRequest(string $target, array $payload): array {
        $fullTarget = "DynamoDB_20120810." . $target;
        $date = gmdate('Ymd');
        $time = gmdate('Ymd\THis\Z');
        $body = json_encode($payload);
        $payloadHash = hash('sha256', $body);

        $canonicalHeaders = "content-type:application/x-amz-json-1.0\nhost:{$this->host}\nx-amz-date:{$time}\nx-amz-target:{$fullTarget}\n";
        $signedHeaders = "content-type;host;x-amz-date;x-amz-target";
        $canonicalRequest = "POST\n/\n\n{$canonicalHeaders}\n{$signedHeaders}\n{$payloadHash}";

        $scope = "{$date}/{$this->region}/dynamodb/aws4_request";
        $stringToSign = "AWS4-HMAC-SHA256\n{$time}\n{$scope}\n" . hash('sha256', $canonicalRequest);

        $kDate = hash_hmac('sha256', $date, 'AWS4' . $this->secretKey, true);
        $kRegion = hash_hmac('sha256', $this->region, $kDate, true);
        $kService = hash_hmac('sha256', 'dynamodb', $kRegion, true);
        $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true);
        $signature = hash_hmac('sha256', $stringToSign, $kSigning);

        $authHeader = "AWS4-HMAC-SHA256 Credential={$this->accessKey}/{$scope}, SignedHeaders={$signedHeaders}, Signature={$signature}";

        $ch = curl_init($this->endpoint);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/x-amz-json-1.0',
            'x-amz-date: ' . $time,
            'x-amz-target: ' . $fullTarget,
            'Authorization: ' . $authHeader
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if (!$response || $httpCode >= 400) {
            error_log("❌ [AWS DynamoDB Error $httpCode]: $response");
            return ['error' => true, 'code' => $httpCode, 'raw' => $response];
        }

        return json_decode($response, true) ?? [];
    }

    // Igual que sendDynamoRequest, pero un error de DynamoDB lanza DynamoException en vez de perderse en silencio.
    private function call(string $target, array $payload): array {
        $res = $this->sendDynamoRequest($target, $payload);
        if (($res['error'] ?? false) === true) {
            throw new DynamoException((int) $res['code'], (string) $res['raw']);
        }
        return $res;
    }

    // Scan completo de una tabla (sigue LastEvaluatedKey si la respuesta viene paginada).
    private function scanAll(string $table): array {
        $items = [];
        $payload = ['TableName' => $table];
        do {
            $res = $this->call('Scan', $payload);
            array_push($items, ...($res['Items'] ?? []));
            if (isset($res['LastEvaluatedKey'])) {
                $payload['ExclusiveStartKey'] = $res['LastEvaluatedKey'];
            }
        } while (isset($res['LastEvaluatedKey']));
        return $items;
    }

    private static function s(array $item, string $key, string $default = ''): string {
        return $item[$key]['S'] ?? $default;
    }

    private static function n(array $item, string $key): float {
        return (float) ($item[$key]['N'] ?? 0);
    }

    private static function str(mixed $value): array {
        return ['S' => (string) $value];
    }

    private static function num(float|int $value): array {
        return ['N' => (string) round((float) $value, 2)];
    }

    // ------------------------------------------------------------------
    // Cobros (HabitatCharges)
    // ------------------------------------------------------------------

    /**
     * SAGA PASO 2: guarda el cobro de arras. Con condición: un mismo paymentId (misma Idempotency-Key) no se cobra dos veces.
     * Devuelve false si ya existía.
     */
    public function saveCharge(array $charge): bool {
        try {
            $this->call('PutItem', [
                'TableName' => 'HabitatCharges',
                'Item' => [
                    'paymentId' => self::str($charge['paymentId']),
                    'kind' => self::str(self::KIND_ARRAS),
                    'propertyId' => self::str($charge['propertyId']),
                    'clientId' => self::str($charge['clientId']),
                    'amount' => self::num($charge['amount']),
                    'currency' => self::str($charge['currency'] ?? 'USD'),
                    'status' => self::str($charge['status']),
                    'idempotencyKey' => self::str($charge['idempotencyKey'] ?? ''),
                    'createdAt' => self::str(date('c')),
                ],
                'ConditionExpression' => 'attribute_not_exists(paymentId)',
            ]);
            return true;
        } catch (DynamoException $e) {
            if ($e->isConditionalFailure()) return false;
            throw $e;
        }
    }

    public function getCharge(string $paymentId): ?array {
        $res = $this->call('GetItem', ['TableName' => 'HabitatCharges', 'Key' => ['paymentId' => self::str($paymentId)]]);
        return isset($res['Item']) ? $this->mapCharge($res['Item']) : null;
    }

    /**
     * SAGA COMPENSACIÓN / CU15: marca el cobro como REFUNDED. Solo si existe y está PAID.
     * Devuelve el cobro y si ya estaba reembolsado (idempotente).
     */
    public function refundCharge(string $paymentId, string $reason): array {
        try {
            $res = $this->call('UpdateItem', [
                'TableName' => 'HabitatCharges',
                'Key' => ['paymentId' => self::str($paymentId)],
                'UpdateExpression' => 'SET #st = :refunded, refundReason = :reason, refundedAt = :now',
                'ConditionExpression' => 'attribute_exists(paymentId) AND #st = :paid',
                'ExpressionAttributeNames' => ['#st' => 'status'],
                'ExpressionAttributeValues' => [
                    ':refunded' => self::str('REFUNDED'),
                    ':paid' => self::str('PAID'),
                    ':reason' => self::str(mb_substr($reason, 0, 300)),
                    ':now' => self::str(date('c')),
                ],
                'ReturnValues' => 'ALL_NEW',
            ]);
            return ['charge' => $this->mapCharge($res['Attributes'] ?? []), 'alreadyRefunded' => false];
        } catch (DynamoException $e) {
            if (!$e->isConditionalFailure()) throw $e;
            $current = $this->getCharge($paymentId);
            if ($current === null) return ['charge' => null, 'alreadyRefunded' => false];
            return ['charge' => $current, 'alreadyRefunded' => $current['status'] === 'REFUNDED'];
        }
    }

    /**
     * CU16: pago de saldo de compra o cuota de alquiler. El paymentId es determinista
     * (BAL-<contrato> / RENT-<contrato>-<AAAAMM>), así la condición impide registrar dos veces el mismo pago.
     * Devuelve false si ya estaba registrado.
     */
    public function savePayment(array $p): bool {
        $item = [
            'paymentId' => self::str($p['paymentId']),
            'kind' => self::str($p['kind']),
            'contractId' => self::str($p['contractId']),
            'contractNumber' => self::str($p['contractNumber']),
            'propertyId' => self::str($p['propertyId']),
            'propertyTitle' => self::str($p['propertyTitle'] ?? ''),
            'clientId' => self::str($p['clientId']),
            'clientName' => self::str($p['clientName'] ?? ''),
            'amount' => self::num($p['amount']),
            'currency' => self::str($p['currency'] ?? 'USD'),
            'method' => self::str($p['method']),
            'reference' => self::str($p['reference'] ?? ''),
            'status' => self::str('PAID'),
            'registeredBy' => self::str($p['registeredBy'] ?? ''),
            'createdAt' => self::str(date('c')),
        ];
        if (!empty($p['period'])) {
            $item['period'] = self::str($p['period']);
        }
        try {
            $this->call('PutItem', [
                'TableName' => 'HabitatCharges',
                'Item' => $item,
                'ConditionExpression' => 'attribute_not_exists(paymentId)',
            ]);
            return true;
        } catch (DynamoException $e) {
            if ($e->isConditionalFailure()) return false;
            throw $e;
        }
    }

    /** Todos los cobros, del más reciente al más antiguo. */
    public function listCharges(): array {
        $list = array_map(fn ($it) => $this->mapCharge($it), $this->scanAll('HabitatCharges'));
        usort($list, fn ($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
        return $list;
    }

    private function mapCharge(array $it): array {
        $kind = self::s($it, 'kind', self::KIND_ARRAS);
        return [
            'paymentId' => self::s($it, 'paymentId'),
            'kind' => $kind,
            'contractId' => self::s($it, 'contractId') ?: null,
            'contractNumber' => self::s($it, 'contractNumber') ?: null,
            'propertyId' => self::s($it, 'propertyId'),
            'propertyTitle' => self::s($it, 'propertyTitle') ?: null,
            'clientId' => self::s($it, 'clientId'),
            'clientName' => self::s($it, 'clientName') ?: null,
            'amount' => self::n($it, 'amount'),
            'currency' => self::s($it, 'currency', 'USD'),
            'method' => self::s($it, 'method') ?: ($kind === self::KIND_ARRAS ? 'PASARELA' : ''),
            'reference' => self::s($it, 'reference') ?: null,
            'period' => self::s($it, 'period') ?: null,
            'status' => self::s($it, 'status', 'PAID'),
            'registeredBy' => self::s($it, 'registeredBy') ?: null,
            'refundReason' => self::s($it, 'refundReason') ?: null,
            'createdAt' => self::s($it, 'createdAt'),
        ];
    }

    // ------------------------------------------------------------------
    // Reservas (HabitatReservations)
    // ------------------------------------------------------------------

    /**
     * Guarda una reserva en 'HabitatReservations' con TTL de 48 h
     */
    public function saveReservation(array $res): array {
        $ttl = time() + (48 * 3600);
        $this->call('PutItem', [
            'TableName' => 'HabitatReservations',
            'Item' => [
                'reservationId' => self::str($res['reservationId']),
                'propertyId' => self::str($res['propertyId']),
                'propertyTitle' => self::str($res['propertyTitle'] ?? ''),
                'userId' => self::str($res['userId']),
                'userName' => self::str($res['userName']),
                'userPhone' => self::str($res['userPhone'] ?? ''),
                'depositAmount' => self::num($res['depositAmount']),
                'paymentId' => self::str($res['paymentId']),
                'contractNumber' => self::str($res['contractNumber']),
                'status' => self::str($res['status'] ?? 'ACTIVA'),
                'createdAt' => self::str(date('c')),
                'expiresAt' => self::str(date('c', $ttl)),
                'ttl' => ['N' => (string) $ttl],
            ],
        ]);
        return $res;
    }

    public function getReservation(string $reservationId): ?array {
        $res = $this->call('GetItem', ['TableName' => 'HabitatReservations', 'Key' => ['reservationId' => self::str($reservationId)]]);
        return isset($res['Item']) ? $this->mapReservation($res['Item']) : null;
    }

    /**
     * Obtiene todas las reservas de DynamoDB
     */
    public function getAllReservations(?string $userId = null): array {
        $list = [];
        foreach ($this->scanAll('HabitatReservations') as $item) {
            $r = $this->mapReservation($item);
            if ($userId && $r['userId'] !== $userId) continue;
            $list[] = $r;
        }
        usort($list, fn ($a, $b) => strcmp($b['created_at'], $a['created_at']));
        return $list;
    }

    private function mapReservation(array $item): array {
        $created = self::s($item, 'createdAt', date('c'));
        return [
            'id' => self::s($item, 'reservationId'),
            'reservationId' => self::s($item, 'reservationId'),
            'property_id' => self::s($item, 'propertyId'),
            'propertyId' => self::s($item, 'propertyId'),
            'propertyTitle' => self::s($item, 'propertyTitle') ?: null,
            'user_id' => self::s($item, 'userId'),
            'userId' => self::s($item, 'userId'),
            'user_name' => self::s($item, 'userName'),
            'userName' => self::s($item, 'userName'),
            'user_phone' => self::s($item, 'userPhone'),
            'userPhone' => self::s($item, 'userPhone'),
            'deposit_amount' => self::n($item, 'depositAmount'),
            'depositAmount' => self::n($item, 'depositAmount'),
            'payment_id' => self::s($item, 'paymentId'),
            'paymentId' => self::s($item, 'paymentId'),
            'contract_number' => self::s($item, 'contractNumber'),
            'status' => self::s($item, 'status', 'ACTIVA'),
            'cancelReason' => self::s($item, 'cancelReason') ?: null,
            'closedBy' => self::s($item, 'closedBy') ?: null,
            'created_at' => $created,
            'expires_at' => self::s($item, 'expiresAt', date('c', strtotime($created) + 172800)),
        ];
    }

    /**
     * Cierra una reserva ACTIVA (cancelada, comprada o alquilada). Quita el TTL para conservar el historial.
     * Devuelve null si no existe; lanza la DynamoException condicional si ya no estaba ACTIVA.
     */
    public function closeReservation(string $reservationId, string $newStatus, string $closedBy, ?string $reason = null): ?array {
        $names = ['#st' => 'status', '#ttl' => 'ttl'];
        $values = [
            ':status' => self::str($newStatus),
            ':active' => self::str('ACTIVA'),
            ':now' => self::str(date('c')),
            ':by' => self::str($closedBy),
        ];
        $set = 'SET #st = :status, updatedAt = :now, closedBy = :by';
        if ($reason !== null) {
            $set .= ', cancelReason = :reason';
            $values[':reason'] = self::str(mb_substr($reason, 0, 300));
        }
        try {
            $res = $this->call('UpdateItem', [
                'TableName' => 'HabitatReservations',
                'Key' => ['reservationId' => self::str($reservationId)],
                'UpdateExpression' => "{$set} REMOVE #ttl",
                'ConditionExpression' => 'attribute_exists(reservationId) AND #st = :active',
                'ExpressionAttributeNames' => $names,
                'ExpressionAttributeValues' => $values,
                'ReturnValues' => 'ALL_NEW',
            ]);
            return $this->mapReservation($res['Attributes'] ?? []);
        } catch (DynamoException $e) {
            if ($e->isConditionalFailure() && $this->getReservation($reservationId) === null) return null;
            throw $e;
        }
    }

    // ------------------------------------------------------------------
    // Comisiones (HabitatCommissions)
    // ------------------------------------------------------------------

    /**
     * Registra la comisión de un agente: tasa sobre el monto base y 13% de retención impositiva.
     * Con condición: el mismo commissionId (uno por contrato) no se genera dos veces. Devuelve null si ya existía.
     */
    public function saveCommission(array $c): ?array {
        $gross = $c['baseAmount'] * $c['rate'];
        $tax = $gross * 0.13;
        $commission = [
            'commissionId' => $c['commissionId'],
            'agentId' => $c['agentId'],
            'agentName' => $c['agentName'] ?? '',
            'agentEmail' => strtolower($c['agentEmail'] ?? ''),
            'propertyId' => $c['propertyId'] ?? '',
            'contractNumber' => $c['contractNumber'] ?? '',
            'operationType' => $c['operationType'] ?? 'VENTA',
            'baseAmount' => round($c['baseAmount'], 2),
            'rate' => $c['rate'],
            'grossAmount' => round($gross, 2),
            'taxRetention' => round($tax, 2),
            'netAmount' => round($gross - $tax, 2),
            'status' => 'PENDIENTE_PAGO',
            'createdAt' => date('c'),
        ];
        try {
            $this->call('PutItem', [
                'TableName' => 'HabitatCommissions',
                'Item' => [
                    'agentId' => self::str($commission['agentId']),
                    'commissionId' => self::str($commission['commissionId']),
                    'agentName' => self::str($commission['agentName']),
                    'agentEmail' => self::str($commission['agentEmail']),
                    'propertyId' => self::str($commission['propertyId']),
                    'contractNumber' => self::str($commission['contractNumber']),
                    'operationType' => self::str($commission['operationType']),
                    'propertyPrice' => self::num($commission['baseAmount']),
                    'rate' => ['N' => (string) $commission['rate']],
                    'grossAmount' => self::num($commission['grossAmount']),
                    'taxRetention' => self::num($commission['taxRetention']),
                    'netAmount' => self::num($commission['netAmount']),
                    'status' => self::str($commission['status']),
                    'createdAt' => self::str($commission['createdAt']),
                ],
                'ConditionExpression' => 'attribute_not_exists(commissionId)',
            ]);
            return $commission;
        } catch (DynamoException $e) {
            if ($e->isConditionalFailure()) return null;
            throw $e;
        }
    }

    /** Comisiones de un agente (Query por la clave de partición). */
    public function getAgentCommissions(string $agentId): array {
        $res = $this->call('Query', [
            'TableName' => 'HabitatCommissions',
            'KeyConditionExpression' => 'agentId = :aid',
            'ExpressionAttributeValues' => [':aid' => self::str($agentId)],
        ]);
        return $this->sortByDate(array_map(fn ($it) => $this->mapCommission($it), $res['Items'] ?? []));
    }

    public function listCommissions(): array {
        return $this->sortByDate(array_map(fn ($it) => $this->mapCommission($it), $this->scanAll('HabitatCommissions')));
    }

    /**
     * CU17: el Cajero liquida (paga) una comisión PENDIENTE_PAGO. Devuelve null si no existe;
     * lanza la DynamoException condicional si ya estaba pagada.
     */
    public function payCommission(string $agentId, string $commissionId, string $paidBy, string $reference): ?array {
        $key = ['agentId' => self::str($agentId), 'commissionId' => self::str($commissionId)];
        try {
            $res = $this->call('UpdateItem', [
                'TableName' => 'HabitatCommissions',
                'Key' => $key,
                'UpdateExpression' => 'SET #st = :paid, paidAt = :now, paidBy = :by, paymentReference = :ref',
                'ConditionExpression' => 'attribute_exists(commissionId) AND #st = :pending',
                'ExpressionAttributeNames' => ['#st' => 'status'],
                'ExpressionAttributeValues' => [
                    ':paid' => self::str('PAGADA'),
                    ':pending' => self::str('PENDIENTE_PAGO'),
                    ':now' => self::str(date('c')),
                    ':by' => self::str($paidBy),
                    ':ref' => self::str($reference),
                ],
                'ReturnValues' => 'ALL_NEW',
            ]);
            return $this->mapCommission($res['Attributes'] ?? []);
        } catch (DynamoException $e) {
            if ($e->isConditionalFailure()) {
                $exists = $this->call('GetItem', ['TableName' => 'HabitatCommissions', 'Key' => $key]);
                if (!isset($exists['Item'])) return null;
            }
            throw $e;
        }
    }

    private function mapCommission(array $it): array {
        return [
            'commissionId' => self::s($it, 'commissionId'),
            'agentId' => self::s($it, 'agentId'),
            'agentName' => self::s($it, 'agentName') ?: null,
            'agentEmail' => self::s($it, 'agentEmail') ?: null,
            'propertyId' => self::s($it, 'propertyId'),
            'contractNumber' => self::s($it, 'contractNumber') ?: null,
            'operationType' => self::s($it, 'operationType', 'VENTA'),
            'baseAmount' => self::n($it, 'propertyPrice'),
            'grossAmount' => self::n($it, 'grossAmount'),
            'taxRetention' => self::n($it, 'taxRetention'),
            'netAmount' => self::n($it, 'netAmount'),
            'status' => self::s($it, 'status', 'PENDIENTE_PAGO'),
            'paidAt' => self::s($it, 'paidAt') ?: null,
            'paidBy' => self::s($it, 'paidBy') ?: null,
            'paymentReference' => self::s($it, 'paymentReference') ?: null,
            'createdAt' => self::s($it, 'createdAt'),
        ];
    }

    private function sortByDate(array $list): array {
        usort($list, fn ($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
        return $list;
    }

    // ------------------------------------------------------------------
    // Resumen financiero (CU19): calculado con los datos reales de DynamoDB
    // ------------------------------------------------------------------
    public function getFinancialSummary(): array {
        $charges = $this->listCharges();
        $commissions = $this->listCommissions();

        $sum = fn (array $list, callable $filter, string $field = 'amount') =>
            round(array_sum(array_map(fn ($x) => $x[$field], array_filter($list, $filter))), 2);
        $paid = fn ($kind) => fn ($c) => $c['kind'] === $kind && $c['status'] === 'PAID';

        $totalArras = $sum($charges, $paid(self::KIND_ARRAS));
        $totalSales = $sum($charges, $paid(self::KIND_SALDO));
        $totalRent = $sum($charges, $paid(self::KIND_CUOTA));
        $concepts = [
            self::KIND_ARRAS => 'Arras de reserva',
            self::KIND_SALDO => 'Saldo de compra',
            self::KIND_CUOTA => 'Cuota de alquiler',
        ];

        return [
            'totalVolume' => round($totalArras + $totalSales + $totalRent, 2),
            'totalArras' => $totalArras,
            'totalSales' => $totalSales,
            'totalRent' => $totalRent,
            'totalRefunded' => $sum($charges, fn ($c) => $c['status'] === 'REFUNDED'),
            'totalCommissions' => $sum($commissions, fn ($c) => true, 'netAmount'),
            'pendingCommissions' => $sum($commissions, fn ($c) => $c['status'] === 'PENDIENTE_PAGO', 'netAmount'),
            'paidCommissions' => $sum($commissions, fn ($c) => $c['status'] === 'PAGADA', 'netAmount'),
            'payments' => array_map(fn ($c) => [
                'id' => $c['paymentId'],
                'kind' => $c['kind'],
                'concept' => ($concepts[$c['kind']] ?? $c['kind'])
                    . ($c['period'] ? " {$c['period']}" : '')
                    . ' · ' . ($c['propertyTitle'] ?: 'Inmueble ' . $c['propertyId']),
                'property_id' => $c['propertyId'],
                'contractNumber' => $c['contractNumber'],
                'clientName' => $c['clientName'],
                'amount' => $c['amount'],
                'method' => $c['method'],
                'status' => $c['status'],
                'created_at' => $c['createdAt'],
            ], $charges),
        ];
    }
}
