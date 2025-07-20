import { GoogleGenerativeAI } from '@google/generative-ai';
import { UserIntent } from '../types';

export class NLPService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async parseMultipleIntents(userInput: string): Promise<UserIntent[]> {
    try {
      // Split input by quoted sections or sentence boundaries
      const instructions = this.extractInstructions(userInput);
      
      if (instructions.length <= 1) {
        // Single instruction, use existing method
        const singleIntent = await this.parseIntent(userInput);
        return [singleIntent];
      }
      
      // Parse each instruction separately
      const intents: UserIntent[] = [];
      for (const instruction of instructions) {
        const intent = await this.parseIntent(instruction);
        intents.push(intent);
      }
      
      return intents;
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
      const prompt = `Parse this user input into a JSON object for test automation. Return ONLY the JSON object, nothing else.

Structure:
{
  "action": "navigate|click|type|assert|wait|screenshot|extract",
  "target": "what to target",
  "value": "value if needed",
  "selector": "CSS selector if applicable", 
  "url": "URL if navigating",
  "confidence": 0.0-1.0
}

User input: "${userInput}"

Examples:
"Go to google.com" -> {"action": "navigate", "url": "https://google.com", "confidence": 0.9}
"Click login" -> {"action": "click", "target": "login button", "selector": "button", "confidence": 0.8}
"Type hello" -> {"action": "type", "value": "hello", "selector": "input", "confidence": 0.8}

Return only JSON:`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();
      
      if (!content) {
        throw new Error('No response from Gemini');
      }

      console.log('Raw Gemini response:', JSON.stringify(content));

      // Clean up the response to extract JSON
      let cleanContent = content.trim();
      
      // Remove markdown code blocks if present
      cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Find the first complete JSON object in the response
      const jsonMatch = cleanContent.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      } else {
        // Try to find JSON between braces more aggressively
        const braceStart = cleanContent.indexOf('{');
        const braceEnd = cleanContent.lastIndexOf('}');
        if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
          cleanContent = cleanContent.substring(braceStart, braceEnd + 1);
        }
      }

      // Remove any trailing non-JSON text
      cleanContent = cleanContent.replace(/\}[\s\S]*$/, '}');

      let intent: UserIntent;
      try {
        intent = JSON.parse(cleanContent) as UserIntent;
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Content being parsed:', cleanContent);
        throw new Error('Failed to parse JSON response from Gemini');
      }
      
      if (!intent.action) {
        throw new Error('Invalid intent structure');
      }

      return intent;
    } catch (error) {
      console.error('NLP parsing error:', error);
      
      return this.fallbackIntentParsing(userInput);
    }
  }

  private fallbackIntentParsing(userInput: string): UserIntent {
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