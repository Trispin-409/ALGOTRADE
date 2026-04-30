function sanitizeError(err: any): string {
  let msg = String(err?.message || err);
  if (msg.includes('failed to authenticate') || msg.includes('Invalid account') || msg.includes('Account disabled') || msg.includes('Validation failed')) {
    return "Failed to authenticate with the broker. Please check your MT4/MT5 login, password, and server. Note: MT4/MT5 accounts can only be connected if credentials are correct.";
  }
  msg = msg.replace(/https?:\/\/[^\s]+/g, '');
  msg = msg.replace(/metaapi/ig, 'cloud gateway');
  msg = msg.replace(/MetaApi/ig, 'Cloud Gateway');
  msg = msg.replace(/agiliumtrade/ig, 'cloud gateway');
  return msg.trim();
}

console.log(sanitizeError("HTTP 500: We failed to authenticate to your broker using credentials provided. This means that there is an \"Invalid account\" or \"Account disabled\" error on the trading terminal. Please check that your trading account platform version, login, password and server name are correct. metaapi (https://metaapi.cloud) reserves the right to apply charges for each excessive occurrence of this error according to applicable pricing rules. To prevent unexpected charges please follow the recommendations described in this document: https://metaapi.cloud/docs/provisioning/excessiveErrors/. Request URL: https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts"));
