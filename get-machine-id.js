#!/usr/bin/env node

/**
 * Script để lấy Machine ID và hash cho license system
 * Chạy trên cả Windows và Mac để lấy machine ID
 */

const crypto = require('crypto');

try {
    const { machineIdSync } = require('node-machine-id');
    const rawMachineId = machineIdSync(false);

    // Hash machine ID bằng SHA-256
    const hashedId = crypto.createHash('sha256')
        .update(rawMachineId)
        .digest('hex');

    console.log('====================================');
    console.log('🔑 FBO EXTENSION LICENSE INFO');
    console.log('====================================');
    console.log('');
    console.log('Platform:', process.platform);
    console.log('');
    console.log('Raw Machine ID:');
    console.log(rawMachineId);
    console.log('');
    console.log('Hashed Machine ID (SHA-256):');
    console.log(hashedId);
    console.log('');
    console.log('====================================');
    console.log('📋 ADD THIS TO SERVER allowedIds:');
    console.log('====================================');
    console.log('');
    console.log(`["Your Name - ${process.platform}", "${hashedId}"]`);
    console.log('');

} catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('💡 Make sure you have installed dependencies:');
    console.log('   npm install');
    process.exit(1);
}
