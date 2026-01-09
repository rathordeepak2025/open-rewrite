
export type AgentRole = 'EXPLORER' | 'ARCHITECT' | 'MIGRATOR' | 'REVIEWER';

export interface AgentMessage {
  id: string;
  role: AgentRole;
  text: string;
  timestamp: number;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface ProjectFile {
  path: string;
  name: string;
  content: string;
  language: string;
  translatedContent?: string;
  status: 'pending' | 'analyzing' | 'translating' | 'completed' | 'error';
}

export interface MigrationState {
  sourceLang: string;
  targetLang: string;
  sourceFramework: string;
  targetFramework: string;
  files: ProjectFile[];
  isProcessing: boolean;
  activeAgent: AgentRole | null;
  progress: number;
}

export interface MigrationPlan {
  steps: string[];
  mappings: { [key: string]: string };
  dependencies: string[];
  runInstructions?: string;
}
