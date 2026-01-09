
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AgentRole, ProjectFile, MigrationPlan } from "../types";

export class CodeMorphService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async exploreProject(files: ProjectFile[]): Promise<{ language: string; framework: string }> {
    const fileSummary = files.slice(0, 50).map(f => f.path).join('\n');
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze these project files and identify the primary programming language and framework used. 
      Return the answer in JSON format with keys "language" and "framework".
      Files:\n${fileSummary}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            language: { type: Type.STRING },
            framework: { type: Type.STRING },
          },
          required: ['language', 'framework'],
        }
      }
    });

    try {
      return JSON.parse(response.text || '{}');
    } catch (e) {
      return { language: 'Unknown', framework: 'Unknown' };
    }
  }

  async createMigrationPlan(
    source: { lang: string; fw: string },
    target: { lang: string; fw: string }
  ): Promise<MigrationPlan> {
    const prompt = `Act as a Senior Software Architect. Create a detailed migration plan to move an application 
    from ${source.lang} (${source.fw}) to ${target.lang} (${target.fw}). 
    Include file mapping logic and specific run instructions for the target project.`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            mappings: { 
              type: Type.OBJECT, 
              properties: {
                logic: { type: Type.STRING },
                data: { type: Type.STRING }
              }
            },
            dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
            runInstructions: { type: Type.STRING, description: 'Markdown steps to build and run the target application.' }
          },
          required: ['steps', 'mappings', 'dependencies', 'runInstructions'],
        }
      }
    });

    try {
      return JSON.parse(response.text || '{"steps":[], "mappings":{}, "dependencies":[], "runInstructions":""}');
    } catch (e) {
      return { steps: [], mappings: {}, dependencies: [], runInstructions: "Run instructions not generated." };
    }
  }

  /**
   * Translates a file with streaming support for real-time UI updates.
   */
  async *translateFileStream(
    file: ProjectFile,
    source: { lang: string; fw: string },
    target: { lang: string; fw: string },
    plan: MigrationPlan
  ) {
    const responseStream = await this.ai.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: `Translate the following code from ${source.lang} (${source.fw}) to ${target.lang} (${target.fw}).
      Use this migration plan guidance: ${JSON.stringify(plan.mappings)}.
      Preserve logic but use idiomatic patterns for ${target.fw}.
      Return ONLY the translated code.
      
      File Path: ${file.path}
      Original Source Code:
      ${file.content}`,
      config: {
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    for await (const chunk of responseStream) {
      const c = chunk as GenerateContentResponse;
      yield c.text;
    }
  }

  async reviewCode(original: string, translated: string, target: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Review this translation to ${target}.
      Original: ${original}
      Translated: ${translated}`,
    });
    return response.text || 'Review complete.';
  }
}
