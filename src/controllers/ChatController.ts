import { Router } from 'express';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, ScriptGenerationRequest } from '../types';
import { NLPService } from '../services/NLPService';
import { ScriptGeneratorService } from '../services/ScriptGeneratorService';
import { ScriptStorageService } from '../services/ScriptStorageService';
import { generateTestName, generateTestDescription } from '../utils/testNameGenerator';

export class ChatController {
  private router = Router();
  private nlpService = new NLPService();
  private scriptGenerator = new ScriptGeneratorService();
  private storageService = new ScriptStorageService();
  private conversations: Map<string, ChatMessage[]> = new Map();

  constructor(private io: Server) {
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  private setupRoutes() {
    this.router.post('/message', async (req, res) => {
      try {
        const { message, conversationId } = req.body;
        
        if (!message || !conversationId) {
          return res.status(400).json({ error: 'Message and conversationId are required' });
        }

        const userMessage: ChatMessage = {
          id: uuidv4(),
          content: message,
          role: 'user',
          timestamp: new Date()
        };

        if (!this.conversations.has(conversationId)) {
          this.conversations.set(conversationId, []);
        }

        this.conversations.get(conversationId)!.push(userMessage);

        const intents = await this.nlpService.parseMultipleIntents(message);
        let response;
        if (intents.length > 1) {
          response = await this.scriptGenerator.generateFromMultipleIntents(intents, message);
        } else {
          response = await this.scriptGenerator.generateFromIntent(intents[0], message);
        }

        const assistantMessage: ChatMessage = {
          id: uuidv4(),
          content: response.script || response.error || 'I need more information to generate a test script.',
          role: 'assistant',
          timestamp: new Date()
        };

        this.conversations.get(conversationId)!.push(assistantMessage);

        this.io.emit('message', { conversationId, message: assistantMessage });

        res.json({ 
          message: assistantMessage,
          script: response.script,
          suggestions: response.suggestions,
          testName: generateTestName(message),
          testDescription: generateTestDescription(message)
        });
      } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.router.get('/conversation/:id', (req, res) => {
      const conversationId = req.params.id;
      const messages = this.conversations.get(conversationId) || [];
      res.json({ messages });
    });
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      socket.on('join-conversation', (conversationId: string) => {
        socket.join(conversationId);
      });

      socket.on('send-message', async (data: { message: string; conversationId: string; selectedScriptId?: string }) => {
        const { message, conversationId, selectedScriptId } = data;
        
        const userMessage: ChatMessage = {
          id: uuidv4(),
          content: message,
          role: 'user',
          timestamp: new Date()
        };

        if (!this.conversations.has(conversationId)) {
          this.conversations.set(conversationId, []);
        }

        this.conversations.get(conversationId)!.push(userMessage);
        
        socket.to(conversationId).emit('message', userMessage);

        try {
          let response;
          let isModification = false;
          let existingScript = null;

          if (selectedScriptId) {
            // Load existing script for modification
            const scripts = await this.storageService.loadScripts();
            existingScript = scripts.get(selectedScriptId);
            
            if (existingScript) {
              isModification = true;
              const intent = await this.nlpService.parseIntent(message);
              response = await this.scriptGenerator.addStepsToScript(existingScript, intent, message);
            } else {
              // Script not found, fall back to new script generation
              const intent = await this.nlpService.parseIntent(message);
              response = await this.scriptGenerator.generateFromIntent(intent, message);
            }
          } else {
            // Generate new script - check for multiple instructions
            const intents = await this.nlpService.parseMultipleIntents(message);
            if (intents.length > 1) {
              response = await this.scriptGenerator.generateFromMultipleIntents(intents, message);
            } else {
              response = await this.scriptGenerator.generateFromIntent(intents[0], message);
            }
          }

          const assistantMessage: ChatMessage = {
            id: uuidv4(),
            content: response.script || response.error || 'I need more information to generate a test script.',
            role: 'assistant',
            timestamp: new Date()
          };

          this.conversations.get(conversationId)!.push(assistantMessage);
          this.io.to(conversationId).emit('message', assistantMessage);
          
          if (response.script) {
            if (isModification && existingScript) {
              // Update existing script
              const updatedScript = {
                ...existingScript,
                script: response.script,
                description: `${existingScript.description} + Additional steps: ${generateTestDescription(message)}`,
                updatedAt: new Date(),
                status: 'ready' as const
              };
              
              await this.storageService.saveScript(updatedScript);
              
              this.io.to(conversationId).emit('script-updated', {
                script: response.script,
                scriptId: selectedScriptId,
                suggestions: response.suggestions,
                updatedScript: updatedScript
              });
            } else {
              // New script generation
              this.io.to(conversationId).emit('script-generated', {
                script: response.script,
                suggestions: response.suggestions,
                testName: generateTestName(message),
                testDescription: generateTestDescription(message)
              });
            }
          }
        } catch (error) {
          console.error('Socket message error:', error);
          const errorMessage: ChatMessage = {
            id: uuidv4(),
            content: 'Sorry, I encountered an error processing your request.',
            role: 'assistant',
            timestamp: new Date()
          };
          this.io.to(conversationId).emit('message', errorMessage);
        }
      });
    });
  }

  public getRouter() {
    return this.router;
  }
}