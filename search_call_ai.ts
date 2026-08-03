import * as fs from "fs";

const content = fs.readFileSync("./server.ts", "utf8");
const lines = content.split("\n");

console.log("Searching for callAIWithFallback references...");

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("callAIWithFallback")) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
}
