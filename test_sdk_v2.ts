
import MetaApiModule from "metaapi.cloud-sdk/esm-node";
const MetaApi = typeof MetaApiModule === "function" ? MetaApiModule : (MetaApiModule as any).default || MetaApiModule;
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const token = process.env.METAAPI_ADMIN_TOKEN;
  if (!token) {
    console.log("Token missing");
    return;
  }
  const metaApi = new MetaApi(token);
  console.log("MetatraderAccountApi methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(metaApi.metatraderAccountApi)));
  
  const response = await metaApi.metatraderAccountApi.getAccountsWithClassicPagination();
  const accounts = Array.isArray(response) ? response : (response.items || []);
  if (accounts.length > 0) {
    const acc = await metaApi.metatraderAccountApi.getAccount(accounts[0].id || accounts[0]._id);
    console.log("Account prototype methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(acc)));
  }
}

test();
