const path = require('path');
const EntityResolverChecking = require('../src/ReadXMLByJS/CheckingError/entityResolverChecking');
async function test() {
    const checker = new EntityResolverChecking();
    const filePath = '\\\\172.168.5.14\\CustomerPro\\FBO\\OMG\\R2SP2254\\App_Data\\Controllers\\Grid\\InputInvoice.f';
    const errors = await checker.checkMissingEntityFiles(filePath);
    console.log("Errors:", JSON.stringify(errors, null, 2));
}
test();
