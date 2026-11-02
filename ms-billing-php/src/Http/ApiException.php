<?php

namespace PropTech\Billing\Http;

// Error de negocio con su código HTTP; index.php lo traduce a { success: false, error, message }.
class ApiException extends \RuntimeException {
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message) {
        parent::__construct($message);
    }

    public static function badRequest(string $message): self { return new self(400, 'PARAMETROS_INVALIDOS', $message); }
    public static function forbidden(string $message): self { return new self(403, 'FORBIDDEN', $message); }
    public static function notFound(string $message): self { return new self(404, 'NOT_FOUND', $message); }
    public static function conflict(string $message): self { return new self(409, 'CONFLICT', $message); }
}
