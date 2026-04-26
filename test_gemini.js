import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function testGemini() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: No GEMINI_API_KEY found in .env");
    return;
  }
  
  try {
    console.log("Key found. Testing Gemini API connection...");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Say hello world'
    });
    console.log("SUCCESS! Gemini API replied with:");
    console.log("---");
    console.log(response.text);
    console.log("---");
  } catch (error) {
    console.error("ERROR testing Gemini API:");
    console.error(error.message);
  }
}

testGemini();
