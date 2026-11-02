<?php

namespace PropTech\Billing\Security;

class KeycloakJwtVerifier {
    private const JWKS_CACHE_SECONDS = 600;

    private string $issuer;
    private string $jwksUri;
    private string $cacheFile;

    public function __construct(?string $issuer = null) {
        $this->issuer = $issuer ?: (getenv('KEYCLOAK_ISSUER_URI') ?: 'http://localhost:8080/realms/habitat');
        $this->jwksUri = $this->issuer . '/protocol/openid-connect/certs';
        $this->cacheFile = sys_get_temp_dir() . '/habitat_jwks_' . md5($this->jwksUri) . '.json';
    }

    // Devuelve los claims del token; lanza RuntimeException si el token no es válido.
    public function verify(string $token): array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new \RuntimeException('Formato de token inválido');
        }
        [$headerB64, $payloadB64, $signatureB64] = $parts;
        $header = json_decode(self::base64UrlDecode($headerB64), true);
        $payload = json_decode(self::base64UrlDecode($payloadB64), true);
        if (!is_array($header) || !is_array($payload) || ($header['alg'] ?? '') !== 'RS256') {
            throw new \RuntimeException('Token inválido');
        }

        $publicKey = $this->publicKeyFor($header['kid'] ?? '');
        $valid = openssl_verify("{$headerB64}.{$payloadB64}", self::base64UrlDecode($signatureB64), $publicKey, OPENSSL_ALGO_SHA256);
        if ($valid !== 1) {
            throw new \RuntimeException('Firma del token inválida');
        }
        if (($payload['iss'] ?? '') !== $this->issuer) {
            throw new \RuntimeException('El token no fue emitido por Keycloak (realm habitat)');
        }
        if (($payload['exp'] ?? 0) < time()) {
            throw new \RuntimeException('Token expirado');
        }
        return $payload;
    }

    private function publicKeyFor(string $kid): string {
        $key = self::findKey($this->loadJwks(false), $kid)
            ?? self::findKey($this->loadJwks(true), $kid); // Keycloak pudo rotar sus claves
        if ($key === null) {
            throw new \RuntimeException('Clave de firma desconocida');
        }
        return self::rsaJwkToPem($key['n'], $key['e']);
    }

    private function loadJwks(bool $forceRefresh): array {
        if (!$forceRefresh && is_file($this->cacheFile) && filemtime($this->cacheFile) > time() - self::JWKS_CACHE_SECONDS) {
            $cached = json_decode((string) file_get_contents($this->cacheFile), true);
            if (is_array($cached) && isset($cached['keys'])) {
                return $cached;
            }
        }
        $raw = @file_get_contents($this->jwksUri, false, stream_context_create(['http' => ['timeout' => 5]]));
        $jwks = $raw === false ? null : json_decode($raw, true);
        if (!is_array($jwks) || !isset($jwks['keys'])) {
            throw new \RuntimeException('No se pudieron obtener las claves públicas de Keycloak');
        }
        @file_put_contents($this->cacheFile, $raw);
        return $jwks;
    }

    private static function findKey(array $jwks, string $kid): ?array {
        foreach ($jwks['keys'] as $key) {
            if (($key['kid'] ?? '') === $kid && ($key['kty'] ?? '') === 'RSA' && ($key['use'] ?? 'sig') === 'sig') {
                return $key;
            }
        }
        return null;
    }

    private static function base64UrlDecode(string $data): string {
        return (string) base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
    }

    // Arma la clave pública PEM (SubjectPublicKeyInfo en DER) a partir del módulo y exponente del JWK.
    private static function rsaJwkToPem(string $modulusB64, string $exponentB64): string {
        $rsaPublicKey = self::der(0x30, self::derInteger(self::base64UrlDecode($modulusB64)) . self::derInteger(self::base64UrlDecode($exponentB64)));
        $rsaAlgorithm = self::der(0x30, "\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00");
        $spki = self::der(0x30, $rsaAlgorithm . self::der(0x03, "\x00" . $rsaPublicKey));
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function derInteger(string $bytes): string {
        if ($bytes !== '' && ord($bytes[0]) > 0x7f) {
            $bytes = "\x00" . $bytes;
        }
        return self::der(0x02, $bytes);
    }

    private static function der(int $tag, string $value): string {
        $length = strlen($value);
        if ($length < 0x80) {
            return chr($tag) . chr($length) . $value;
        }
        $lengthBytes = ltrim(pack('N', $length), "\x00");
        return chr($tag) . chr(0x80 | strlen($lengthBytes)) . $lengthBytes . $value;
    }
}
