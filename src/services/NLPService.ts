import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { UserIntent } from '../types';

type AIProvider = 'anthropic' | 'gemini';

export class NLPService {
  protected genAI: GoogleGenerativeAI | null = null;
  protected anthropic: Anthropic | null = null;
  protected provider!: AIProvider;
  protected model: any;

  constructor() {
    // Check for API keys and set up the appropriate provider
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    
    if (!anthropicKey && !geminiKey) {
      throw new Error('No AI provider API key found. Please set either ANTHROPIC_API_KEY or GEMINI_API_KEY in your .env file');
    }
    
    // Prefer Anthropic as default if available
    if (anthropicKey) {
      this.anthropic = new Anthropic({
        apiKey: anthropicKey
      });
      this.provider = 'anthropic';
      console.log('Using Anthropic AI provider');
    } else if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      this.provider = 'gemini';
      console.log('Using Google Gemini AI provider');
    }
  }

  async parseMultipleIntents(userInput: string): Promise<UserIntent[]> {
    try {
      // Ask AI to parse ALL intents at once
      const prompt = `You are a test automation assistant. Parse this user instruction into one or more JSON objects for Playwright automation.

User instruction: "${userInput}"

Analyze the instruction and identify ALL actions requested. Common patterns:
- "navigate to X and click Y" = 2 actions: [{"action":"navigate"}, {"action":"click"}]
- "go to X, fill form with Y, and submit" = 3 actions
- "type X in field Y" = 1 action
- "click A then click B" = 2 actions

Each JSON object must have these exact fields:
- action: Must be EXACTLY one of: navigate, click, type, fill, assert, wait, screenshot
- target: Description of element (required for click, type, fill, assert)
- value: Text to type or expected value (required for type, fill, text assertions)
- selector: CSS or text selector (optional but recommended)
- url: URL to navigate to (required only for navigate)
- confidence: Number between 0 and 1

IMPORTANT: Return a JSON array containing ALL actions found in the instruction.
Example: [{"action":"navigate","url":"https://example.com","confidence":0.9},{"action":"click","target":"login button","confidence":0.8}]

Return ONLY the JSON array, no markdown, no explanation.`;

      let content: string;
      
      if (this.provider === 'anthropic' && this.anthropic) {
        const response = await this.anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        content = response.content[0].type === 'text' ? response.content[0].text : '';
        console.log('Raw Anthropic multi-intent response:', content);
      } else if (this.provider === 'gemini' && this.genAI) {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        content = response.text();
        console.log('Raw Gemini multi-intent response:', content);
      } else {
        throw new Error('No AI provider configured');
      }

      // Clean and parse response
      let cleanContent = content.trim();
      cleanContent = cleanContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      
      // Handle case where AI returns multiple objects separated by commas but not in array
      if (cleanContent.startsWith('{') && cleanContent.includes('},{')) {
        cleanContent = '[' + cleanContent + ']';
      }
      
      let intents: any[];
      try {
        intents = JSON.parse(cleanContent);
        if (!Array.isArray(intents)) {
          // If single object returned, wrap in array
          intents = [intents];
        }
      } catch (parseError) {
        console.error('Failed to parse multi-intent response:', parseError);
        console.error('Content:', cleanContent);
        // Fallback to single intent
        const singleIntent = await this.parseIntent(userInput);
        return [singleIntent];
      }
      
      // Validate each intent has required fields
      return intents.filter(intent => intent && intent.action).map(intent => ({
        action: intent.action,
        confidence: intent.confidence || 0.5,
        target: intent.target,
        value: intent.value,
        selector: intent.selector,
        url: intent.url
      } as UserIntent));
    } catch (error) {
      console.error('Multiple intents parsing error:', error);
      // Fallback to single intent parsing
      const fallbackIntent = await this.parseIntent(userInput);
      return [fallbackIntent];
    }
  }

  private extractInstructions(userInput: string): string[] {
    // Extract quoted strings first
    const quotedMatches = userInput.match(/"([^"]*)"/g);
    if (quotedMatches && quotedMatches.length > 1) {
      return quotedMatches.map(match => match.replace(/"/g, '').trim()).filter(s => s.length > 0);
    }
    
    // Split by sentence-like patterns if no quotes
    const sentences = userInput.split(/[.!]\s+|\s*\n\s*/).filter(s => s.trim().length > 0);
    if (sentences.length > 1) {
      return sentences.map(s => s.trim());
    }
    
    // Single instruction
    return [userInput.trim()];
  }

  async parseIntent(userInput: string): Promise<UserIntent> {
    try {
      // Common prompt for both providers
      const prompt = `You are a test automation assistant. Parse this user instruction into a JSON object for Playwright automation.

User instruction: "${userInput}"

Analyze the instruction and return a JSON object with these exact fields:
- action: Must be EXACTLY one of these strings: navigate, click, type, fill, assert, wait, screenshot
- target: Description of what element to interact with (required for click, type, fill, assert)
- value: The text to type or expected value (required for type, fill, and text assertions)
- selector: A CSS selector or text selector for the element (optional but recommended)
- url: The URL to navigate to (required only for navigate action)
- confidence: A number between 0 and 1 indicating confidence (required)

IMPORTANT RULES:
1. You MUST return a valid JSON object with at least "action" and "confidence" fields
2. Never return an empty object {}
3. If you cannot determine the action, default to "click" with low confidence
4. Always include appropriate fields based on the action type

Examples:
1. "Go to https://example.com" returns:
{"action": "navigate", "url": "https://example.com", "confidence": 0.9}

2. "Click the login button" returns:
{"action": "click", "target": "login button", "selector": "button:has-text('Login')", "confidence": 0.8}

3. "Type john@example.com in the email field" returns:
{"action": "type", "target": "email field", "value": "john@example.com", "selector": "input[type='email']", "confidence": 0.8}

4. "Fill the form" returns:
{"action": "fill", "target": "form", "selector": "form", "confidence": 0.6}

5. "Check the page loaded" returns:
{"action": "assert", "target": "page loaded", "confidence": 0.7}

6. "Take a screenshot" returns:
{"action": "screenshot", "confidence": 0.9}

7. "Wait for 2 seconds" returns:
{"action": "wait", "value": "2000", "confidence": 0.9}

Return ONLY the JSON object, no markdown, no explanation:`

      let content: string;
      
      if (this.provider === 'anthropic' && this.anthropic) {
        const response = await this.anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        content = response.content[0].type === 'text' ? response.content[0].text : '';
        
        if (!content) {
          throw new Error('No response from Anthropic');
        }
        
        console.log('Raw Anthropic response:', JSON.stringify(content));
      } else if (this.provider === 'gemini' && this.genAI) {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        content = response.text();
        
        if (!content) {
          throw new Error('No response from Gemini');
        }
        
        console.log('Raw Gemini response:', JSON.stringify(content));
      } else {
        throw new Error('No AI provider configured');
      }

      // Clean up the response to extract JSON
      let cleanContent = content.trim();
      
      // Remove markdown code blocks if present
      cleanContent = cleanContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      
      // Try multiple patterns to find JSON object
      let jsonMatch = cleanContent.match(/\{[^{}]*\{[^{}]*\}[^{}]*\}|\{[^{}]+\}/);
      if (!jsonMatch) {
        // Try to find any object-like structure
        jsonMatch = cleanContent.match(/\{.*\}/);
      }
      
      if (!jsonMatch) {
        console.error('No JSON found in response:', cleanContent);
        console.warn('Falling back to intent parsing from original input');
        return this.fallbackIntentParsing(userInput);
      }
      
      cleanContent = jsonMatch[0];

      let intent: any;
      try {
        intent = JSON.parse(cleanContent);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Content being parsed:', cleanContent);
        
        // Try to fix common JSON errors
        try {
          // Fix trailing commas
          cleanContent = cleanContent.replace(/,\s*}/g, '}');
          // Fix missing quotes on property names
          cleanContent = cleanContent.replace(/(\w+):/g, '"$1":');
          // Try parsing again
          intent = JSON.parse(cleanContent);
        } catch (secondParseError) {
          console.error('Second parse attempt failed:', secondParseError);
          return this.fallbackIntentParsing(userInput);
        }
      }
      
      // Check for empty object IMMEDIATELY after parsing
      if (!intent || typeof intent !== 'object' || Object.keys(intent).length === 0) {
        console.warn('Empty or invalid JSON object received from Gemini:', cleanContent);
        return this.fallbackIntentParsing(userInput);
      }
      
      // Validate required fields
      if (!intent.action) {
        console.warn('Intent missing required "action" field:', intent);
        return this.fallbackIntentParsing(userInput);
      }
      
      // Validate action is one of the allowed types
      const allowedActions = ['navigate', 'click', 'type', 'fill', 'assert', 'wait', 'screenshot'];
      if (!allowedActions.includes(intent.action)) {
        console.warn(`Invalid action '${intent.action}', using fallback parsing`);
        return this.fallbackIntentParsing(userInput);
      }
      
      // Validate that click, type, and fill actions have meaningful targets
      if (['click', 'type', 'fill'].includes(intent.action)) {
        if (!intent.target || intent.target.trim() === '' || 
            intent.target === 'body' || intent.target === 'page' ||
            intent.target === 'element' || intent.target === 'button' ||
            intent.target === 'input' || intent.target === 'field') {
          console.warn(`Generic or missing target '${intent.target}' for ${intent.action} action, using fallback`);
          return this.fallbackIntentParsing(userInput);
        }
      }
      
      // Ensure confidence is set
      if (!intent.confidence) {
        intent.confidence = 0.5;
      }
      
      // Clean up fields based on action type
      const validatedIntent: UserIntent = {
        action: intent.action,
        confidence: intent.confidence
      };
      
      // Add fields based on action type and ensure required fields
      switch (intent.action) {
        case 'navigate':
          if (intent.url) {
            validatedIntent.url = intent.url;
          } else {
            // Try to extract URL from the input
            const urlMatch = userInput.match(/https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.com[^\s]*/i);
            if (urlMatch) {
              validatedIntent.url = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
            } else {
              console.warn('Navigate action without URL, using fallback');
              return this.fallbackIntentParsing(userInput);
            }
          }
          // Validate URL is present
          if (!validatedIntent.url) {
            console.warn('Navigate action missing required URL field');
            return this.fallbackIntentParsing(userInput);
          }
          break;
          
        case 'click':
          if (intent.target) validatedIntent.target = intent.target;
          if (intent.selector) validatedIntent.selector = intent.selector;
          // If no target or selector, try to extract from input
          if (!validatedIntent.target && !validatedIntent.selector) {
            const clickMatch = userInput.match(/click\s+(?:on\s+)?(?:the\s+)?(.+)/i);
            if (clickMatch) {
              validatedIntent.target = clickMatch[1].trim();
            }
          }
          break;
          
        case 'type':
        case 'fill':
          if (intent.target) validatedIntent.target = intent.target;
          if (intent.value) validatedIntent.value = intent.value;
          if (intent.selector) validatedIntent.selector = intent.selector;
          
          // If missing value, try to extract from input
          if (!validatedIntent.value) {
            const valueMatch = userInput.match(/['"]([^'"]+)['"]/);
            if (valueMatch) {
              validatedIntent.value = valueMatch[1];
            }
          }
          
          // Validate required fields for type/fill actions
          if (!validatedIntent.value && intent.action === 'type') {
            console.warn('Type action missing required value field');
            return this.fallbackIntentParsing(userInput);
          }
          if (!validatedIntent.target && !validatedIntent.selector) {
            console.warn('Type/fill action missing both target and selector');
            return this.fallbackIntentParsing(userInput);
          }
          break;
          
        case 'assert':
          if (intent.target) validatedIntent.target = intent.target;
          if (intent.value) validatedIntent.value = intent.value;
          break;
          
        case 'wait':
          if (intent.target) validatedIntent.target = intent.target;
          if (intent.value) validatedIntent.value = intent.value;
          // Extract wait time if not provided
          if (!validatedIntent.value && !validatedIntent.target) {
            const timeMatch = userInput.match(/(\d+)\s*(?:seconds?|secs?|ms|milliseconds?)/i);
            if (timeMatch) {
              const time = parseInt(timeMatch[1]);
              validatedIntent.value = userInput.toLowerCase().includes('ms') ? time.toString() : (time * 1000).toString();
            } else {
              validatedIntent.value = '1000'; // Default 1 second
            }
          }
          break;
          
        case 'screenshot':
          if (intent.target) validatedIntent.target = intent.target;
          break;
      }

      return validatedIntent;
    } catch (error) {
      console.error('NLP parsing error:', error);
      console.error('Error details:', error instanceof Error ? error.stack : error);
      
      return this.fallbackIntentParsing(userInput);
    }
  }

  private fallbackIntentParsing(userInput: string): UserIntent {
    console.log('Using fallback intent parsing for:', userInput);
    const input = userInput.toLowerCase();
    
    if (input.includes('go to') || input.includes('navigate') || input.includes('visit')) {
      const urlMatch = input.match(/(?:go to|navigate to|visit)\s+(.+)/);
      const url = urlMatch ? urlMatch[1].trim() : '';
      return {
        action: 'navigate',
        url: url.startsWith('http') ? url : `https://${url}`,
        confidence: 0.7
      };
    }
    
    if (input.includes('click')) {
      const targetMatch = input.match(/click\s+(?:the\s+)?(.+)/);
      return {
        action: 'click',
        target: targetMatch ? targetMatch[1].trim() : 'button',
        confidence: 0.6
      };
    }
    
    if (input.includes('type') || input.includes('enter')) {
      const typeMatch = input.match(/type\s+['"]([^'"]+)['"]|enter\s+['"]([^'"]+)['"]/);
      const inMatch = input.match(/in\s+(?:the\s+)?(.+)/);
      return {
        action: 'type',
        value: typeMatch ? (typeMatch[1] || typeMatch[2]) : '',
        target: inMatch ? inMatch[1].trim() : 'input field',
        confidence: 0.6
      };
    }
    
    if (input.includes('screenshot')) {
      return {
        action: 'screenshot',
        confidence: 0.9
      };
    }
    
    if (input.includes('wait')) {
      const timeMatch = input.match(/(\d+)\s*(?:seconds?|ms|milliseconds?)/);
      const time = timeMatch ? timeMatch[1] : '1000';
      return {
        action: 'wait',
        value: time.includes('ms') ? time : `${time}000`,
        confidence: 0.7
      };
    }
    
    if (input.includes('search')) {
      const searchMatch = input.match(/search\s+for\s+['"]([^'"]+)['"]/);
      const searchTerm = searchMatch ? searchMatch[1] : '';
      return {
        action: 'type',
        target: 'search box',
        value: searchTerm,
        selector: 'input[name="q"], [name="search"], .search-input',
        confidence: 0.8
      };
    }
    
    if (input.includes('check') || input.includes('verify') || input.includes('assert')) {
      if (input.includes('title')) {
        const titleMatch = input.match(/title\s+contains?\s+['"]([^'"]+)['"]/);
        const expectedTitle = titleMatch ? titleMatch[1] : '';
        return {
          action: 'assert',
          target: 'title',
          value: expectedTitle,
          confidence: 0.8
        };
      }
      return {
        action: 'assert',
        target: 'page content',
        confidence: 0.5
      };
    }
    
    return {
      action: 'click',
      target: userInput,
      confidence: 0.3
    };
  }
}