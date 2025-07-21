import { Router } from 'express';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../types';
import { ContextAwareNLPService } from '../services/ContextAwareNLPService';
import { ScriptGeneratorService } from '../services/ScriptGeneratorService';
import { ScriptStorageService } from '../services/ScriptStorageService';
import { generateTestName, generateTestDescription } from '../utils/testNameGenerator';

export class ChatController {
  private router = Router();
  private nlpService = new ContextAwareNLPService();
  private scriptGenerator = new ScriptGeneratorService();
  private storageService = new ScriptStorageService();
  private conversations: Map<string, ChatMessage[]> = new Map();
  private currentUrls: Map<string, string> = new Map();

  constructor(private io: Server) {
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  private setupRoutes() {
    // Analyze page endpoint
    this.router.post('/analyze-page', async (req, res) => {
      try {
        const { url } = req.body;
        
        if (!url) {
          return res.status(400).json({ error: 'URL is required' });
        }
        
        const pageContext = await this.nlpService.pageAnalyzer.analyzePage(url);
        res.json({
          success: true,
          pageContext,
          elementCount: pageContext.elements.length,
          formCount: pageContext.forms.length
        });
      } catch (error) {
        console.error('Page analysis error:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to analyze page'
        });
      }
    });
    
    // Get element suggestions endpoint
    this.router.post('/suggest-elements', async (req, res) => {
      try {
        const { url, action } = req.body;
        
        if (!url || !action) {
          return res.status(400).json({ error: 'URL and action are required' });
        }
        
        const pageContext = await this.nlpService.pageAnalyzer.analyzePage(url);
        const suggestions = pageContext.elements
          .filter(el => {
            if (action === 'click') {
              return el.tag === 'button' || el.tag === 'a' || el.type === 'submit';
            } else if (action === 'type' || action === 'fill') {
              return el.tag === 'input' || el.tag === 'textarea';
            }
            return true;
          })
          .slice(0, 10)
          .map(el => ({
            selector: el.selector,
            text: el.text || el.placeholder || el.id || el.testId,
            type: el.type,
            tag: el.tag
          }));
          
        res.json({
          success: true,
          suggestions
        });
      } catch (error) {
        console.error('Element suggestion error:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get suggestions'
        });
      }
    });
    
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

        // Parse intents and enhance with page context if URL is found
        const baseIntents = await this.nlpService.parseMultipleIntents(message);
        let intents;
        
        try {
          intents = await Promise.all(
            baseIntents.map(async (intent) => {
              if (intent.url) {
                return await this.nlpService.parseIntentWithContext(message, intent.url);
              }
              return intent;
            })
          );
        } catch (error) {
          // If page analysis fails, return error to user
          return res.status(400).json({ 
            error: error instanceof Error ? error.message : 'Failed to analyze page',
            suggestion: 'Please ensure the URL is accessible and try again.'
          });
        }
        
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
            const currentUrl = this.currentUrls.get(conversationId);
            
            // Check if message contains a navigation intent
            const navMatch = message.match(/(?:go to|navigate to|visit|open)\s+(\S+)/i);
            if (navMatch && navMatch[1]) {
              const url = navMatch[1].startsWith('http') ? navMatch[1] : `https://${navMatch[1]}`;
              this.currentUrls.set(conversationId, url);
            }
            
            // Parse intents first
            const baseIntents = await this.nlpService.parseMultipleIntents(message);
            
            // For each intent, check if it has a URL or if we should use current URL
            let intents;
            try {
              intents = await Promise.all(
                baseIntents.map(async (intent) => {
                  // If intent has its own URL (like navigation), use that
                  // Otherwise use current URL if available
                  const urlToAnalyze = intent.url || currentUrl;
                  
                  if (urlToAnalyze) {
                    // Always use context-aware parsing when we have a URL
                    return await this.nlpService.parseIntentWithContext(
                      message, 
                      urlToAnalyze
                    );
                  }
                  return intent;
                })
              );
            } catch (error) {
              // Send error message to user via socket
              const errorMessage: ChatMessage = {
                id: uuidv4(),
                content: `Error: ${error instanceof Error ? error.message : 'Failed to analyze page'}. Please ensure the URL is accessible and try again.`,
                role: 'assistant',
                timestamp: new Date()
              };
              this.io.to(conversationId).emit('message', errorMessage);
              return; // Stop processing
            }
            
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