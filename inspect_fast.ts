
import MetaApiModule from "metaapi.cloud-sdk/esm-node";
const MetaApi = typeof MetaApiModule === "function" ? MetaApiModule : (MetaApiModule as any).default || MetaApiModule;

const dummyToken = 'dummy';
const metaApi = new MetaApi(dummyToken);

console.log("MetaApi keys:", Object.getOwnPropertyNames(metaApi));
console.log("MetatraderAccountApi items:", Object.getOwnPropertyNames(Object.getPrototypeOf(metaApi.metatraderAccountApi)));
