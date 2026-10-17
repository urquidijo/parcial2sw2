<?php

require_once __DIR__ . '/../src/Services/DynamoStorageService.php';
require_once __DIR__ . '/../src/Controllers/BillingController.php';
require_once __DIR__ . '/../src/Controllers/CommissionController.php';

use PropTech\Billing\Controllers\BillingController;
use PropTech\Billing\Controllers\CommissionController;

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
$headers = getallheaders();

$billingCtrl = new BillingController();
$commissionCtrl = new CommissionController();

$response = null;

// Routing básico y limpio
if ($uri === '/api/v1/billing/charges' && $method === 'POST') {
    $response = $billingCtrl->charge($body, $headers);
} elseif ($uri === '/api/v1/billing/refunds' && $method === 'POST') {
    $response = $billingCtrl->refund($body);
} elseif ($uri === '/api/v1/commissions/calculate' && $method === 'POST') {
    $response = $commissionCtrl->calculate($body);
} elseif (preg_match('#^/api/v1/commissions/agent/([^/]+)$#', $uri, $matches) && $method === 'GET') {
    $response = $commissionCtrl->getAgentBalance($matches[1]);
} elseif ($uri === '/' || $uri === '/health') {
    $response = [
        'service' => 'ms-billing-php',
        'status' => 'UP',
        'database' => 'Amazon DynamoDB (Local :8005)',
        'timestamp' => date('c')
    ];
} else {
    http_response_code(404);
    $response = [
        'success' => false,
        'error' => 'NOT_FOUND',
        'message' => "Endpoint [{$method} {$uri}] no encontrado en ms-billing-php"
    ];
}

echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
