<?php

namespace PropTech\Billing\Domain;

/**
 * CLEAN — Regla de negocio o de caso de uso violada. No conoce HTTP: el adaptador (controlador)
 * la traduce a 400 / 404 / 409 con el mismo mensaje.
 */
class RuleViolation extends \DomainException {
    public const INVALID = 'INVALID';
    public const NOT_FOUND = 'NOT_FOUND';
    public const CONFLICT = 'CONFLICT';

    public function __construct(public readonly string $kind, string $message) {
        parent::__construct($message);
    }

    public static function invalid(string $message): self { return new self(self::INVALID, $message); }
    public static function notFound(string $message): self { return new self(self::NOT_FOUND, $message); }
    public static function conflict(string $message): self { return new self(self::CONFLICT, $message); }
}
