const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf-8');

// Replace occurrences
content = content.replace(/import \{ ExpertAdvisorDeployer \} from '\.\/components\/ExpertAdvisorDeployer';/g, '');
content = content.replace(/activeTab === 'ea-deployer'/g, 'false'); // Disable EA deployer tab
content = content.replace(/setActiveTab\('ea-deployer'\)/g, 'setActiveTab("market")');

fs.writeFileSync('App.tsx', content, 'utf-8');
console.log('App.tsx cleaned');
