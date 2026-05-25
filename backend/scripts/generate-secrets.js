#!/usr/bin/env node
/**
 * Genera secretos seguros para producción
 * Ejecutar: node scripts/generate-secrets.js
 */

const crypto = require('crypto');

function generateSecret(bytes = 48) {
    return crypto.randomBytes(bytes).toString('base64');
}

function generateHex(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

console.log('\n🔐 fut.invest - Generador de Secretos de Producción');
console.log('='.repeat(55));
console.log('\n📋 Agrega estas líneas a tu .env de producción:\n');

const secrets = [
    { name: 'JWT_SECRET', value: generateSecret(48), desc: 'Clave para firmar tokens JWT' },
    { name: 'TOTP_SECRET', value: generateSecret(32), desc: 'Clave para verificación TOTP 2FA' },
    { name: 'APP_SECRET', value: generateHex(32), desc: 'Clave HMAC para webhooks' },
];

secrets.forEach(s => {
    console.log(`# ${s.desc}`);
    console.log(`${s.name}=${s.value}\n`);
});

console.log('⚠️  IMPORTANTE:');
console.log('  - NUNCA commitees estos secretos en git');
console.log('  - Guárdalos en un gestor de contraseñas o Vault');
console.log('  - Rótalos cada 90 días en producción');
console.log('  - Usa variables de entorno del servidor, no archivos .env\n');
