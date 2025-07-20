export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export interface TestScript {
  id: string;
  name: string;
  description: string;
  script: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  status: 'draft' | 'ready' | 'running' | 'completed' | 'failed';
}

export interface UserIntent {
  action: 'navigate' | 'click' | 'type' | 'assert' | 'wait' | 'screenshot' | 'extract';
  target?: string;
  value?: string;
  selector?: string;
  url?: string;
  confidence: number;
}

export interface ScriptGenerationRequest {
  conversationId: string;
  userInput: string;
  context?: TestScript[];
}

export interface ScriptGenerationResponse {
  success: boolean;
  script?: string;
  error?: string;
  suggestions?: string[];
}