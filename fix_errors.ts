import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /String\(err\?\.message\s*\|\|\s*err\)\.replace\(\/metaapi\/ig,\s*'cloud gateway'\)\.replace\(\/MetaApi\/ig,\s*'Cloud Gateway'\)/g;

code = code.replace(regex, 'sanitizeError(err)');

// Add the sanitizeError function if not there
if (!code.includes('function sanitizeError')) {
  const sanitizeFunc = `
function sanitizeError(err: any): string {
  let msg = String(err?.message || err);
  if (msg.includes('failed to authenticate') || msg.includes('Invalid account') || msg.includes('Account disabled') || msg.includes('Validation failed')) {
    return "Failed to authenticate with the broker. Please check your MT4/MT5 login, password, and server. Note: MT4/MT5 accounts can only be connected if credentials are correct.";
  }
  msg = msg.replace(/https?:\\/\\/[^\\s]+/g, '');
  msg = msg.replace(/metaapi/ig, 'cloud gateway');
  msg = msg.replace(/MetaApi/ig, 'Cloud Gateway');
  msg = msg.replace(/agiliumtrade/ig, 'cloud gateway');
  return msg.trim();
}
`;
  code = code.replace('const app = express();', sanitizeFunc + '\nconst app = express();');
}

// replace the manual ones in /api/accounts
code = code.replace(/msg = msg.replace\(\/metaapi\/ig, 'cloud gateway'\);\s*msg = msg.replace\(\/MetaApi\/ig, 'Cloud Gateway'\);/g, 'msg = sanitizeError(msg);');
code = code.replace(/errMsg = errMsg.replace\(\/metaapi\/ig, 'cloud gateway'\)\.replace\(\/MetaApi\/ig, 'Cloud Gateway'\);/g, 'errMsg = sanitizeError(errMsg);');

fs.writeFileSync('server.ts', code);
console.log('Fixed errors!');
