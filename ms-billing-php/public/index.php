<?php

// Clean Architecture: Domain / Application / Infrastructure / Controllers. Carga automática por namespace.
spl_autoload_register(function (string $class): void {
    $prefix = 'PropTech\\Billing\\';
    if (str_starts_with($class, $prefix)) {
        $file = __DIR__ . '/../src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) require_once $file;
    }
});

require_once __DIR__ . '/../src/Http/ApiException.php';
require_once __DIR__ . '/../src/Http/AuthContext.php';
require_once __DIR__ . '/../src/Services/DynamoStorageService.php';
require_once __DIR__ . '/../src/Controllers/BillingController.php';
require_once __DIR__ . '/../src/Controllers/CommissionController.php';
require_once __DIR__ . '/../src/Security/KeycloakJwtVerifier.php';

use PropTech\Billing\Controllers\BillingController;
use PropTech\Billing\Controllers\CommissionController;
use PropTech\Billing\Http\ApiException;
use PropTech\Billing\Http\AuthContext;
use PropTech\Billing\Security\KeycloakJwtVerifier;
use PropTech\Billing\Services\DynamoException;

// Configuración CORS y Headers JSON
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, Idempotency-Key, idempotency-key");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$headers = function_exists('getallheaders') ? getallheaders() : [];

function respond(array $payload): void {
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// SSO: todas las rutas, salvo el health check, exigen un token válido de Keycloak.
$isHealthCheck = in_array($uri, ['/', '/health', '/api/v1/health', '/api/health'], true);
if ($isHealthCheck) {
    respond([
        'service' => 'ms-billing-php',
        'status' => 'UP',
        'database' => 'Amazon DynamoDB (AWS Cloud us-east-1)',
        'tables' => ['HabitatCharges', 'HabitatReservations', 'HabitatCommissions'],
        'timestamp' => date('c')
    ]);
}

$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? ($headers['Authorization'] ?? ($headers['authorization'] ?? ''));
try {
    if (!str_starts_with($authorization, 'Bearer ')) {
        throw new \RuntimeException('Falta el token de Keycloak (Authorization: Bearer ...)');
    }
    AuthContext::set((new KeycloakJwtVerifier())->verify(substr($authorization, 7)));
} catch (\RuntimeException $e) {
    http_response_code(401);
    respond(['success' => false, 'error' => 'UNAUTHORIZED', 'message' => $e->getMessage()]);
}

// Roles efectivos: CLIENTE, ADMIN o el sector del empleado (AGENTE, LEGAL, FINANZAS = Cajero, ATENCION).
// Los pasos de la saga de reserva llegan con el token del cliente que reserva.
const CASHIER = ['FINANZAS', 'ADMIN'];

try {
    $billing = new BillingController();
    $commissions = new CommissionController();

    if ($uri === '/api/v1/billing/charges' && $method === 'POST') {
        AuthContext::requireRole(['CLIENTE', 'ADMIN']);
        $response = $billing->charge($body, $headers);
    } elseif ($uri === '/api/v1/billing/refunds' && $method === 'POST') {
        AuthContext::requireRole(['CLIENTE', 'FINANZAS', 'ADMIN']);
        $response = $billing->refund($body);
    } elseif ($uri === '/api/v1/billing/reservations' && $method === 'POST') {
        AuthContext::requireRole(['CLIENTE', 'ADMIN']);
        $response = $billing->createReservation($body);
    } elseif ($uri === '/api/v1/billing/reservations' && $method === 'GET') {
        // El gateway filtra por titular cuando quien consulta es un cliente.
        $response = $billing->getReservations($_GET['userId'] ?? null);
    } elseif (preg_match('#^/api/v1/billing/reservations/([^/]+)$#', $uri, $m) && $method === 'GET') {
        $response = $billing->getReservation($m[1]);
    } elseif (preg_match('#^/api/v1/billing/reservations/([^/]+)/cancel$#', $uri, $m) && $method === 'POST') {
        AuthContext::requireRole(['CLIENTE', 'FINANZAS', 'ADMIN']); // CU15
        $response = $billing->cancelReservation($m[1], $body);
    } elseif (preg_match('#^/api/v1/billing/reservations/([^/]+)/(complete|buy)$#', $uri, $m) && $method === 'POST') {
        AuthContext::requireRole(CASHIER); // CU16
        $response = $billing->completeReservation($m[1], $m[2] === 'buy' ? ['outcome' => 'COMPRADA'] : $body);
    } elseif ($uri === '/api/v1/billing/payments' && $method === 'POST') {
        AuthContext::requireRole(CASHIER); // CU16
        $response = $billing->registerPayment($body);
    } elseif ($uri === '/api/v1/billing/payments' && $method === 'GET') {
        AuthContext::requireRole(CASHIER);
        $response = $billing->listPayments($_GET['contractNumber'] ?? null);
    } elseif ($uri === '/api/v1/commissions' && $method === 'GET') {
        AuthContext::requireRole(CASHIER); // CU17
        $response = $commissions->listAll();
    } elseif ($uri === '/api/v1/commissions/calculate' && $method === 'POST') {
        AuthContext::requireRole(CASHIER);
        $response = $commissions->calculate($body);
    } elseif (preg_match('#^/api/v1/commissions/([^/]+)/([^/]+)/pay$#', $uri, $m) && $method === 'POST') {
        AuthContext::requireRole(CASHIER); // CU17
        $response = $commissions->pay(urldecode($m[1]), urldecode($m[2]), $body);
    } elseif (preg_match('#^/api/v1/commissions/agent/([^/]+)$#', $uri, $m) && $method === 'GET') {
        AuthContext::requireRole(['AGENTE', 'FINANZAS', 'ADMIN']); // CU18
        $response = $commissions->getAgentBalance(urldecode($m[1]));
    } elseif ($uri === '/api/v1/architecture' && $method === 'GET') {
        // Descripción de la arquitectura interna (la muestra el modo demo del portal).
        $response = [
            'service' => 'ms-billing',
            'technology' => 'PHP 8.3 + Amazon DynamoDB',
            'architecture' => 'Clean Architecture',
            'boundedContext' => 'Cobros, reservas con arras y comisiones',
            'layers' => [
                ['name' => 'Entidades (reglas de empresa)', 'path' => 'src/Domain/', 'items' => ['BillingRules: arras, rechazo de la pasarela, saldo y cuotas, comisión 3 % − 13 %', 'RuleViolation (error de negocio sin HTTP)']],
                ['name' => 'Casos de uso', 'path' => 'src/Application/UseCase/', 'items' => ['ChargeArras', 'RefundCharge', 'ManageReservations', 'RegisterOperationPayment', 'ManageCommissions']],
                ['name' => 'Puertos', 'path' => 'src/Application/Port/', 'items' => ['BillingRepository (interfaz)', 'ConcurrentUpdate']],
                ['name' => 'Adaptadores de interfaz', 'path' => 'src/Controllers/', 'items' => ['BillingController y CommissionController: HTTP → caso de uso → JSON (mismas respuestas)']],
                ['name' => 'Frameworks y drivers', 'path' => 'src/Infrastructure/ y src/Services/', 'items' => ['DynamoBillingRepository implementa el puerto', 'DynamoStorageService: Amazon DynamoDB con firma SigV4']],
            ],
            'rule' => 'Regla de dependencia: las capas externas dependen de las internas; el dominio y los casos de uso no conocen HTTP ni DynamoDB.',
        ];
    } elseif ($uri === '/api/v1/finances' || $uri === '/api/v1/finances/summary') {
        AuthContext::requireRole(CASHIER); // CU19
        $response = $billing->getFinances();
    } else {
        throw new ApiException(404, 'NOT_FOUND', "Endpoint [{$method} {$uri}] no encontrado en ms-billing-php");
    }
    respond($response);
} catch (ApiException $e) {
    http_response_code($e->status);
    respond(['success' => false, 'error' => $e->errorCode, 'message' => $e->getMessage()]);
} catch (DynamoException $e) {
    http_response_code(502);
    respond(['success' => false, 'error' => 'DYNAMODB_ERROR', 'message' => 'Amazon DynamoDB no pudo procesar la operación. Intenta nuevamente.']);
}
