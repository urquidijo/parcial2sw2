<?php

namespace PropTech\Billing\Application\Port;

/** CLEAN — El registro cambió de estado antes de la escritura (ya cerrado, ya pagado). Sin detalles de la base. */
class ConcurrentUpdate extends \RuntimeException {}
