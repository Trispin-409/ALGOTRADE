
import MetaApiModule from "metaapi.cloud-sdk/esm-node";
const MetaApi = typeof MetaApiModule === "function" ? MetaApiModule : (MetaApiModule as any).default || MetaApiModule;
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const token = process.env.METAAPI_ADMIN_TOKEN;
  if (!token) return;
  const metaApi = new MetaApi(token);
  const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(metaApi.metatraderAccountApi));
  console.log("MetatraderAccountApi keys:", JSON.stringify(keys));
}
test();
