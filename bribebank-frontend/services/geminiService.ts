import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedPrize, PrizeType } from "../types";

// Initialize the client. API_KEY must be in environment variables
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generatePrizeIdeas = async (context: string): Promise<GeneratedPrize[]> => {
  if (!process.env.API_KEY) {
    console.error("API Key is missing");
    return [];
  }

  try {
    const modelId = 'gemini-2.5-flash';
    
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `Generate 3 creative, fun, and family-friendly prize card ideas based on this context: "${context}". 
      The prizes should be things a parent gives a child (e.g., stay up late, pick dinner, small cash, skip chore).
      Make them distinct from each other.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              emoji: { type: Type.STRING, description: "A single emoji character representing the prize" },
              type: { 
                type: Type.STRING, 
                enum: [
                  PrizeType.ACTIVITY, 
                  PrizeType.FOOD, 
                  PrizeType.PRIVILEGE, 
                  PrizeType.MONEY, 
                  PrizeType.CUSTOM
                ] 
              },
            },
            required: ["title", "description", "emoji", "type"],
          },
        },
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return data as GeneratedPrize[];
    }
    return [];
  } catch (error) {
    console.error("Error generating prize ideas:", error);
    return [];
  }
};
