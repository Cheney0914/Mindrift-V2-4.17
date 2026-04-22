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
    theme: string;          // 主题词，3-5个字
    theme_en: string;       // 英文主题词
    reasoning: string;      // 为什么这些想法属于同一主题，一句话
    fragment_ids: string[]; // 属于这个主题的 fragment id 列表
    sub_themes: {           // 子话题标注
      label: string;
      label_en: string;
    }[];
  }[];
  connections: {
    theme_a: string;        // 主题A的 theme_en
    theme_b: string;        // 主题B的 theme_en
    bridge: string;         // 两个主题的底层连接，最多15个字
  }[];
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
1. Group these fragments into 5-8 thematic clusters based on underlying meaning.
2. For each cluster, give a short theme label (3-5 words in English).
3. For each cluster, identify 2-3 specific "sub-themes" or "key aspects" that further summarize the thoughts in that cluster.
4. Identify which 2-3 clusters have the deepest underlying connection.
5. For connected clusters, write one bridge sentence explaining WHY they connect at a deeper level.

Rules:
- Every fragment must belong to exactly one cluster.
- Cluster themes should reveal unconscious patterns, not just surface topics.
- Bridge connections should be insightful, not obvious.`,
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
                        label_en: { type: Type.STRING }
                      },
                      required: ["label", "label_en"]
                    }
                  }
                },
                required: ["theme", "theme_en", "reasoning", "fragment_ids", "sub_themes"]
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
            }
          },
          required: ["clusters", "connections"]
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error('Error clustering thoughts:', error);
    return null;
  }
};
