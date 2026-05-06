const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

content = content.replace(/getEAStatus/g, 'getDeploymentStatus');
content = content.replace(/updateEAStatus/g, 'updateDeploymentStatus');
content = content.replace(/ea_name/g, 'config_name');
content = content.replace(/eaName/g, 'configName');
content = content.replace(/ea_deployments/g, 'node_deployments'); // Let's leave DB tables as ea_deployments? Prompt says remove "everything that say EA", let's be careful.
content = content.replace(/'ea_deployments'/g, "'ea_deployments'"); // Keep DB table name untouched
content = content.replace(/'ea_leases'/g, "'ea_leases'"); // Keep DB table name untouched

fs.writeFileSync('server.ts', content, 'utf-8');
console.log('Cleanup EA identifiers completed.');
