const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf-8');

// Replace logEA with logSystem
content = content.replace(/logEA/g, 'logMessage');
content = content.replace(/EA_JOURNAL/g, 'TRADING_JOURNAL');
content = content.replace(/EA_CLOUD/g, 'NODE_STRATEGY');

// Remove EA execution modes and lock it to STRATEGY
content = content.replace(/const source = getExecutionMode\(accountId\) === 'EA' \? 'EA_CLOUD' : 'NODE_STRATEGY';/g, 'const source = "NODE_STRATEGY";');
content = content.replace(/const source = mode === 'EA' \? 'EA_CLOUD' : 'NODE_STRATEGY';/g, 'const source = "NODE_STRATEGY";');

fs.writeFileSync('server.ts', content, 'utf-8');
console.log('Replacements completed.');
