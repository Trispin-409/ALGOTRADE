import * as fs from "fs";

const content = fs.readFileSync("./server.ts", "utf8");
const lines = content.split("\n");

console.log("Searching for fetchAccountRealContext definition...");

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("async function fetchAccountRealContext")) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
}
