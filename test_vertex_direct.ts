import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || 'gen-lang-client-0062262253';
console.log("Using Project ID:", projectId);

const modelsToTest = [
  "gemini-1.5-pro-002",
  "gemini-1.5-pro-001",
  "gemini-1.5-pro"
];

async function run() {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: "europe-west2"
  });

  for (const model of modelsToTest) {
    console.log(`Testing model: ${model} in europe-west2...`);
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: "Hello, reply with 'OK' if you can read this."
      });
      console.log(`[SUCCESS] model: ${model}! Response:`, response.text);
    } catch (err: any) {
      console.error(`[FAILED] ${model}:`, err.message || err);
    }
  }
}

run();
