import { GoogleGenAI } from "@google/genai";
import { Category } from "../types";

const apiKey = process.env.API_KEY || "";

let aiInstance: GoogleGenAI | null = null;
const getAi = () => {
  if (!apiKey) return null;
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

export const suggestCategory = async (
  url: string,
  title: string,
  existingCategories: Category[]
): Promise<string> => {
  const ai = getAi();
  if (!ai || existingCategories.length === 0) return "";

  try {
    const categoriesList = existingCategories.map((c) => c.title).join(", ");
    
    const prompt = `
      Tengo un enlace con el Título: "${title}" y URL: "${url}".
      
      Debes clasificarlo en una de las siguientes categorías existentes: [${categoriesList}].
      
      Reglas:
      1. Elige la categoría que mejor encaje.
      2. Devuelve EXACTAMENTE el nombre de la categoría elegida de la lista proporcionada.
      3. Si ninguna encaja en absoluto, devuelve una cadena vacía.
      4. SOLO devuelve el nombre, nada más.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }, // Fast response
      }
    });

    const text = response.text?.trim();
    return text?.replace(/['".]/g, "") || "";
  } catch (error) {
    console.error("Gemini categorization failed:", error);
    return "";
  }
};