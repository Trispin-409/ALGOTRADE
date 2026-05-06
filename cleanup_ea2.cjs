const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

// Replace all usages of getExecutionMode(accountId) with 'STRATEGY'
content = content.replace(/getExecutionMode\(accountId\)/g, "'STRATEGY'");
// Same for lease.account_id
content = content.replace(/getExecutionMode\(lease\.account_id\)/g, "'STRATEGY'");

fs.writeFileSync('server.ts', content, 'utf-8');
console.log('Cleanup completed.');
