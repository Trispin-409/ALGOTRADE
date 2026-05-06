const fs = require('fs');
let content = fs.readFileSync('components/MarketData.tsx', 'utf-8');

// Replace references
content = content.replace(/import \{ \w+, \w+, \w+, \w+, \w+, \w+, \w+, \w+, \w+, \w+, \w+, \w+, \w+, \w+, \w+, \w+ \} from 'lucide-react';/, "import { Activity, Clock, RefreshCw, TrendingUp, TrendingDown, AlertCircle, Play, X, Zap, Shield, Layers, History, Settings, Square, Workflow, Lock } from 'lucide-react';");

// Remove EA mode references
// "executionMode: 'EA' | 'STRATEGY';" -> ""
content = content.replace(/executionMode(?:=|:)[^;,\n]+[;,\n]/g, '');
content = content.replace(/eaStatus\?:[^;,\n]+[;,\n]/g, '');
content = content.replace(/onSwitchMode(?:=|:)[^;,\n]+[;,\n]/g, '');

content = content.replace(/eaStatus,\n/g, '');
content = content.replace(/executionMode,\n/g, '');
content = content.replace(/onSwitchMode,\n/g, '');


fs.writeFileSync('components/MarketData.tsx', content, 'utf-8');
console.log('Cleaned MarketData');
