const path = require('path');
const fs = require('fs');
const level = require('level-rocksdb');

async function testLock() {
    const dbPath = path.join(__dirname, '..', 'src', 'Database', 'entity-cache-leveldb');
    console.log('Opening DB 1 at', dbPath);
    
    let db1 = null;
    let disabled = false;
    try {
        db1 = level(dbPath);
        
        db1.on('error', (err) => {
            console.warn('[DB1 ERROR EVENT CAUGHT]', err.message);
            disabled = true;
        });

        await new Promise((resolve, reject) => {
            db1.once('ready', () => resolve());
            db1.once('error', (err) => reject(err));
        });
        
        console.log('DB 1 opened successfully!');
    } catch (err) {
        console.warn('[DB1 CATCH]', err.message);
        disabled = true;
    }
    
    console.log('Test finished. DB1 Disabled?', disabled);
}

testLock().catch(console.error);
