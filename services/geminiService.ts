
import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async analyzeData(dataSummary: string) {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze the following sales performance data for Shopify brand "Hydrict". 
        Provide 3 key actionable insights and a brief summary of the financial health.
        
        Data Summary:
        ${dataSummary}
        
        Format your response as a clean Markdown list.`,
        config: {
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      return response.text;
    } catch (error) {
      console.error("Gemini Analysis Error:", error);
      return "Failed to generate AI insights. Please check your data or try again later.";
    }
  }
}

export const geminiService = new GeminiService();
