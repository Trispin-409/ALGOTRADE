import * as fs from "fs";

const content = fs.readFileSync("./server.ts", "utf8");
const lines = content.split("\n");

console.log("Searching for keywords in server.ts...");

const keywords = ["exhausted", "capacity", "Risk Desk Local", "getVertexClient", "chatradeController"];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (const keyword of keywords) {
    if (line.includes(keyword)) {
      console.log(`Line ${i + 1} [${keyword}]: ${line.trim().substring(0, 150)}`);
    }
  }
}
