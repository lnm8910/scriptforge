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
  action: 'navigate' | 'click' | 'type' | 'fill' | 'assert' | 'wait' | 'screenshot' | 'extract';
  target?: string;
  value?: string;
  selector?: string;
  url?: string;
  confidence: number;
  pageContext?: PageContext;
}

export interface PageContext {
  url: string;
  title: string;
  elements: ElementInfo[];
  forms: FormInfo[];
  domContent?: string;
  timestamp: Date;
}

export interface ElementInfo {
  tag: string;
  id?: string;
  classes: string[];
  testId?: string;
  text?: string;
  placeholder?: string;
  type?: string;
  name?: string;
  href?: string;
  selector: string;
  xpath?: string;
  isVisible: boolean;
  isInteractive: boolean;
}

export interface FormInfo {
  id?: string;
  name?: string;
  fields: ElementInfo[];
  submitButton?: ElementInfo;
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