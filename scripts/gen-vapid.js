/**
 * Genera el par de claves VAPID para las notificaciones push (CU06). Se corre UNA vez y las claves
 * se pegan en el .env de la raíz (gateway). Si se cambian, los dispositivos suscritos dejan de recibir avisos.
 * Uso: node scripts/gen-vapid.js
 */
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log('Pega estas 3 líneas en el .env de la raíz y reinicia el gateway:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:soporte@habitat.pro');
