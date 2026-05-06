const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

// The replacement was:
// 'STRATEGY' === 'EA' ? 'NODE_STRATEGY' : 'NODE_STRATEGY'
content = content.replace(/'STRATEGY' === 'EA' \? 'NODE_STRATEGY' : 'NODE_STRATEGY'/g, "'NODE_STRATEGY'");
content = content.replace(/mode === 'EA' \? 'NODE_STRATEGY' : 'NODE_STRATEGY'/g, "'NODE_STRATEGY'");
content = content.replace(/if \('STRATEGY' === 'EA'\) continue;/g, '');
content = content.replace(/if \(mode === 'EA'\) continue;/g, '');
content = content.replace(/if \('STRATEGY' === 'EA'\) \{[^}]*\}/g, '');
content = content.replace(/if \(mode === 'EA'\) \{[\s\S]*?\} else \{([\s\S]*?)\}/g, '$1');

content = content.replace(/const source = mode === 'EA' \? 'NODE_STRATEGY' : 'NODE_STRATEGY';/g, "const source = 'NODE_STRATEGY';");
content = content.replace(/const hSource = hMode === 'EA' \? 'NODE_STRATEGY' : 'NODE_STRATEGY';/g, "const hSource = 'NODE_STRATEGY';");

fs.writeFileSync('server.ts', content, 'utf-8');
console.log('Fixed TS errors.');
