import * as fs from "fs";

const content = fs.readFileSync("./server.ts", "utf8");

console.log("Searching for model name references...");

const modelNames = ["gemini-1.5-flash", "gemini-3.1-pro-preview", "gemini-3.5-flash"];

for (let i = 0; i < modelNames.length; i++) {
  const modelName = modelNames[i];
  let index = content.indexOf(modelName);
  while (index !== -1) {
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + modelName.length + 50);
    console.log(`Found ${modelName} at index ${index}: ...${content.substring(start, end).replace(/\n/g, ' ')}...`);
    index = content.indexOf(modelName, index + 1);
  }
}
