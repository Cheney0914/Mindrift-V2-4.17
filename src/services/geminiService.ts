import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: [text],
    });
    return result.embeddings[0].values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
};

export interface ConnectionAnalysis {
  reasoning: string;
  strength: number;
}

export const analyzeConnection = async (
  fragmentA: string,
  fragmentB: string
): Promise<ConnectionAnalysis | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the semantic connection between these two thoughts. 
      Thought A: "${fragmentA}"
      Thought B: "${fragmentB}"
      
      If they are related, provide a brief reasoning (max 15 words) and a strength score from 0 to 1.
      If they are not related, return strength 0.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reasoning: { type: Type.STRING },
            strength: { type: Type.NUMBER },
          },
          required: ["reasoning", "strength"],
        },
      },
    });

    const result = JSON.parse(response.text);
    return result.strength > 0.3 ? result : null;
  } catch (error) {
    console.error('Error analyzing connection:', error);
    return null;
  }
};

export interface SynthesisResult {
  text: string;
  keywords: string[];
}

export const synthesizeThoughts = async (thoughts: string[]): Promise<SynthesisResult | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Here are all the user's thought records for this week: ${JSON.stringify(thoughts)}
      
      Please analyze the underlying connection logic of these records:
      1. How are these thoughts connected?
      2. Which keywords link the different thoughts together?
      3. What is the core theme of this week's thinking?
      
      Please output in two formats:
      - Text version: 2-3 fluent paragraphs
      - Keyword version: 5-8 core tags`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "2-3 fluent paragraphs analyzing the thoughts" },
            keywords: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "5-8 core tags"
            },
          },
          required: ["text", "keywords"],
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error('Error synthesizing thoughts:', error);
    return null;
  }
};

export interface ClusterResult {
  clusters: {
    theme: string;          // Theme word, 3-5 characters
    theme_en: string;       // English theme word
    theme_zh: string;       // Chinese theme word
    reasoning: string;      // Why these thoughts belong to the same theme
    fragment_ids: string[]; // List of fragment IDs belonging to this theme
    sub_themes: {           // Sub-theme labels
      label: string;
      label_en: string;
      label_zh: string;
    }[];
  }[];
  connections: {
    theme_a: string;        // theme_en of Theme A
    theme_b: string;        // theme_en of Theme B
    bridge: string;         // Underlying connection, max 15 characters
  }[];
  thought_path?: {
    fragment_ids: string[];
    evolution_summary: string;
  };
}

export const clusterThoughts = async (
  fragments: { id: string; content: string }[]
): Promise<ClusterResult | null> => {
  if (fragments.length < 2) return null;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are analyzing a user's stream of consciousness notes.
      
Here are all their thought fragments:
${fragments.map(f => `ID: ${f.id}\nContent: ${f.content}`).join('\n---\n')}

Your task:
1. Group these fragments into 6-10 distinct thematic clusters (main branches of a tree) based on underlying meaning and psychological patterns.
2. For each cluster, provide a high-level theme (3-5 words in English) and a Chinese translation.
3. For each cluster, identify 3-4 specific "sub-themes" (petals) that further refine the thoughts within that cluster.
4. Identify which 3-4 clusters have the deepest underlying connection.
5. For connected clusters, write an insightful bridge sentence explaining the hidden psychological or logical link.
6. Create a "Thought Path" (Evolutionary Trace) for the 5-7 most recent fragments. This path should show a logical progression or "chain of focus" from one idea to the next, explaining how the user's attention evolved from point A to B to C.

Rules:
- Themes must reveal unconscious patterns and core motivations, not just surface categories.
- The Thought Path must be a sequential narrative of core recent thoughts, demonstrating the growth of ideas.
- Bridge connections must represent a "leap" in insight.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clusters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  theme: { type: Type.STRING },
                  theme_en: { type: Type.STRING },
                  theme_zh: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                  fragment_ids: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING } 
                  },
                  sub_themes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        label_en: { type: Type.STRING },
                        label_zh: { type: Type.STRING }
                      },
                      required: ["label", "label_en", "label_zh"]
                    }
                  }
                },
                required: ["theme", "theme_en", "theme_zh", "reasoning", "fragment_ids", "sub_themes"]
              }
            },
            connections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  theme_a: { type: Type.STRING },
                  theme_b: { type: Type.STRING },
                  bridge: { type: Type.STRING }
                },
                required: ["theme_a", "theme_b", "bridge"]
              }
            },
            thought_path: {
              type: Type.OBJECT,
              properties: {
                fragment_ids: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING } 
                },
                evolution_summary: { type: Type.STRING }
              },
              required: ["fragment_ids", "evolution_summary"]
            }
          },
          required: ["clusters", "connections", "thought_path"]
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error('Error clustering thoughts:', error);
    return null;
  }
};
