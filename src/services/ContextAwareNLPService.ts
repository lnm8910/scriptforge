import { NLPService } from './NLPService';
import { PageAnalyzerService } from './PageAnalyzerService';
import { UserIntent, PageContext, ElementInfo } from '../types';

export class ContextAwareNLPService extends NLPService {
  public pageAnalyzer: PageAnalyzerService;

  constructor() {
    super();
    this.pageAnalyzer = new PageAnalyzerService();
  }

  async parseIntentWithContext(userInput: string, currentUrl?: string): Promise<UserIntent> {
    // First, get basic intent parsing
    const baseIntent = await this.parseIntent(userInput);
    
    // If we have a URL (either from intent or provided), analyze the page
    const url = baseIntent.url || currentUrl;
    if (url) {
      try {
        console.log(`\n=== Analyzing page for context: ${url} ===`);
        const pageContext = await this.pageAnalyzer.analyzePage(url);
        
        // Always attach page context, even for navigation actions
        // This ensures AI knows what's actually on the page
        baseIntent.pageContext = pageContext;
        
        // For non-navigation actions, also enhance with element matching
        if (baseIntent.action !== 'navigate') {
          const enhancedIntent = await this.enhanceIntentWithPageContext(baseIntent, pageContext, userInput);
          enhancedIntent.pageContext = pageContext;
          return enhancedIntent;
        }
        
        console.log(`Page analyzed: ${pageContext.elements.length} elements, ${pageContext.forms.length} forms found`);
        return baseIntent;
      } catch (error) {
        console.error('Page analysis failed:', error);
        // For navigation actions, we MUST have page context to generate valid tests
        if (baseIntent.action === 'navigate') {
          throw new Error(`Failed to analyze page at ${url}. Cannot generate accurate test without page context. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        // For other actions, we can warn but continue
        console.warn('Could not analyze page, continuing without page context');
        return baseIntent;
      }
    }
    
    return baseIntent;
  }

  private async enhanceIntentWithPageContext(
    intent: UserIntent, 
    pageContext: PageContext,
    originalInput: string
  ): Promise<UserIntent> {
    const enhancedIntent = { ...intent };
    
    // Build a comprehensive prompt with page context
    const prompt = this.buildContextAwarePrompt(intent, pageContext, originalInput);
    
    try {
      let response: string;
      
      if (this.provider === 'anthropic' && this.anthropic) {
        const result = await this.anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        response = result.content[0].type === 'text' ? result.content[0].text : '';
      } else if (this.provider === 'gemini' && this.genAI) {
        const result = await this.model.generateContent(prompt);
        const geminiResponse = await result.response;
        response = geminiResponse.text();
      } else {
        throw new Error('No AI provider configured');
      }

      // Parse the AI response
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const suggestion = JSON.parse(match[0]);
        
        if (suggestion.selector) {
          enhancedIntent.selector = suggestion.selector;
          enhancedIntent.confidence = suggestion.confidence || 0.9;
        }
        
        if (suggestion.elementInfo) {
          // Store additional element info for better error messages
          (enhancedIntent as any).elementInfo = suggestion.elementInfo;
        }
        
        if (suggestion.substituted) {
          // Store substitution info to inform the user
          (enhancedIntent as any).substituted = true;
          (enhancedIntent as any).substitutionNote = suggestion.substitutionNote;
          
          // Update the target to reflect what was actually found
          if (suggestion.elementInfo?.text) {
            enhancedIntent.target = suggestion.elementInfo.text;
          }
        }
      }
    } catch (error) {
      console.error('Error enhancing intent with context:', error);
    }
    
    // Fallback: Use our own matching algorithm if AI fails
    if (!enhancedIntent.selector && enhancedIntent.target) {
      const matchedElement = this.findBestMatchingElement(
        enhancedIntent.target,
        pageContext.elements,
        enhancedIntent.action
      );
      
      if (matchedElement) {
        enhancedIntent.selector = matchedElement.selector;
        enhancedIntent.confidence = 0.8;
      }
    }
    
    return enhancedIntent;
  }

  private buildContextAwarePrompt(
    intent: UserIntent,
    pageContext: PageContext,
    originalInput: string
  ): string {
    // Filter relevant elements based on action
    const relevantElements = this.filterRelevantElements(pageContext.elements, intent.action);
    
    // Format elements for the prompt
    const elementsDescription = relevantElements.slice(0, 20).map(el => {
      const parts = [];
      if (el.tag) parts.push(`${el.tag}`);
      if (el.text) parts.push(`text="${el.text}"`);
      if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
      if (el.testId) parts.push(`data-testid="${el.testId}"`);
      if (el.id) parts.push(`id="${el.id}"`);
      if (el.type) parts.push(`type="${el.type}"`);
      return `- ${parts.join(', ')} -> selector: "${el.selector}"`;
    }).join('\n');

    return `You are analyzing a web page to find the best selector for a test automation task.

Page URL: ${pageContext.url}
Page Title: ${pageContext.title}

User's instruction: "${originalInput}"
Parsed action: ${intent.action}
Target description: ${intent.target || 'not specified'}

Available interactive elements on the page:
${elementsDescription}

IMPORTANT RULES:
1. You MUST choose a selector from the list above - do NOT make up selectors
2. If the user asks for an element that doesn't exist (e.g., "form link" when only "Start Registration" exists):
   - Choose the closest matching element
   - Explain the substitution in the reasoning
3. NEVER return a selector that's not in the list above

Based on the user's instruction and available elements, return a JSON object with:
{
  "selector": "the most appropriate selector from the list above",
  "confidence": 0.1-1.0,
  "reasoning": "brief explanation, including any substitutions made",
  "elementInfo": {
    "text": "actual visible text",
    "type": "element type",
    "actualMatch": "what the user asked for vs what was found"
  },
  "substituted": true/false,
  "substitutionNote": "explanation if element was substituted"
}

Choose the selector that best matches the user's intent. Prefer:
1. data-testid attributes (most stable)
2. id attributes (stable)
3. Unique text content (readable)
4. Specific type/role combinations
5. CSS selectors (less stable)

Return ONLY the JSON object.`;
  }

  private filterRelevantElements(elements: ElementInfo[], action: string): ElementInfo[] {
    // Filter visible and interactive elements
    let filtered = elements.filter(el => el.isVisible && el.isInteractive);
    
    switch (action) {
      case 'click':
        return filtered.filter(el => 
          el.tag === 'button' || 
          el.tag === 'a' || 
          el.type === 'submit' ||
          el.type === 'button' ||
          el.type === 'checkbox' ||
          el.type === 'radio'
        );
        
      case 'type':
      case 'fill':
        return filtered.filter(el => 
          (el.tag === 'input' && el.type !== 'submit' && el.type !== 'button') || 
          el.tag === 'textarea'
        );
        
      case 'select':
        return filtered.filter(el => el.tag === 'select');
        
      default:
        return filtered;
    }
  }

  private findBestMatchingElement(
    target: string,
    elements: ElementInfo[],
    action: string
  ): ElementInfo | null {
    const targetLower = target.toLowerCase();
    const relevantElements = this.filterRelevantElements(elements, action);
    
    // Score each element
    const scored = relevantElements.map(element => {
      let score = 0;
      
      // Exact text match (highest priority)
      if (element.text?.toLowerCase() === targetLower) {
        score += 20;
      } else if (element.text?.toLowerCase().includes(targetLower)) {
        score += 10;
      }
      
      // Placeholder match
      if (element.placeholder?.toLowerCase().includes(targetLower)) {
        score += 15;
      }
      
      // Test ID match
      if (element.testId?.toLowerCase().includes(targetLower.replace(/\s+/g, '-'))) {
        score += 18;
      }
      
      // ID match
      if (element.id?.toLowerCase().includes(targetLower.replace(/\s+/g, '-'))) {
        score += 16;
      }
      
      // Name attribute match
      if (element.name?.toLowerCase().includes(targetLower)) {
        score += 12;
      }
      
      // Type match for inputs
      if (element.type && targetLower.includes(element.type)) {
        score += 5;
      }
      
      // Tag match
      if (targetLower.includes(element.tag)) {
        score += 3;
      }
      
      // Class name match
      const targetWords = targetLower.split(/\s+/);
      for (const word of targetWords) {
        if (element.classes.some(cls => cls.toLowerCase().includes(word))) {
          score += 4;
        }
      }
      
      return { element, score };
    });
    
    // Sort by score
    scored.sort((a, b) => b.score - a.score);
    
    // Return best match if score is high enough
    if (scored.length > 0 && scored[0].score >= 5) {
      return scored[0].element;
    }
    
    return null;
  }

}