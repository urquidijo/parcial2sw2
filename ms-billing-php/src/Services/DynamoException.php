<?php

namespace PropTech\Billing\Services;

// Error devuelto por DynamoDB. isConditionalFailure(): falló la condición de la escritura (duplicado o estado distinto).
class DynamoException extends \RuntimeException {
    public function __construct(public readonly int $httpCode, public readonly string $raw) {
        parent::__construct("DynamoDB respondió HTTP {$httpCode}");
    }

    public function isConditionalFailure(): bool {
        return str_contains($this->raw, 'ConditionalCheckFailedException');
    }
}
