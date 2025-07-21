import { UserIntent, ScriptGenerationResponse, TestScript } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

type AIProvider = 'anthropic' | 'gemini';

export class ScriptGeneratorService {
  private genAI: GoogleGenerativeAI | null = null;
  private anthropic: Anthropic | null = null;
  private provider!: AIProvider;

  constructor() {
    // Initialize AI providers based on available API keys
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
      console.log('ScriptGenerator using Anthropic AI provider');
    } else if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.provider = 'gemini';
      console.log('ScriptGenerator using Google Gemini AI provider');
    }
  }
  
  async generateFromIntent(intent: UserIntent, originalInput: string): Promise<ScriptGenerationResponse> {
    try {
      const script = await this.generatePlaywrightScriptWithAI([intent], originalInput);
      const suggestions = await this.generateAISuggestions(intent, originalInput);
      
      return {
        success: true,
        script,
        suggestions
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate script: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async generateFromMultipleIntents(intents: UserIntent[], originalInput: string): Promise<ScriptGenerationResponse> {
    try {
      const script = await this.generatePlaywrightScriptWithAI(intents, originalInput);
      const suggestions = await this.generateAISuggestions(intents[0], originalInput, intents);
      
      return {
        success: true,
        script,
        suggestions
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate script: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async addStepsToScript(existingScript: TestScript, intent: UserIntent, originalInput: string): Promise<ScriptGenerationResponse> {
    try {
      const modifiedScript = await this.addStepsWithAI(existingScript.script, intent, originalInput);
      const suggestions = await this.generateAISuggestions(intent, originalInput);
      
      return {
        success: true,
        script: modifiedScript,
        suggestions
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to add steps to script: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async generatePlaywrightScriptWithAI(intents: UserIntent[], originalInput: string): Promise<string> {
    const intentDescriptions = intents.map((intent, index) => {
      let description = `${index + 1}. ${intent.action}`;
      if (intent.url) description += ` to ${intent.url}`;
      if (intent.target) description += ` on "${intent.target}"`;
      if (intent.value) description += ` with value "${intent.value}"`;
      if (intent.selector) description += ` (suggested selector: ${intent.selector})`;
      return description;
    }).join('\n');

    let pageContextInfo = '';
    if (intents[0]?.pageContext) {
      const pc = intents[0].pageContext;
      pageContextInfo = `
Page Context Available:
- URL: ${pc.url}
- Title: ${pc.title}
- ${pc.elements.length} interactive elements found
- ${pc.forms.length} forms detected`;

      // Add key elements
      if (pc.elements.length > 0) {
        pageContextInfo += `\n\nKey Interactive Elements (USE ONLY THESE - DO NOT MAKE UP NEW ONES):
${pc.elements.slice(0, 15).map(el => 
  `- ${el.tag}${el.text ? ` text="${el.text}"` : ''}${el.id ? ` id="${el.id}"` : ''}${el.testId ? ` data-testid="${el.testId}"` : ''} -> selector: "${el.selector}"`
).join('\n')}`;
      }

      // Add DOM structure if available
      if (pc.domContent) {
        const domPreview = pc.domContent.substring(0, 3000);
        pageContextInfo += `\n\nDOM Structure (for context):
\`\`\`json
${domPreview}${pc.domContent.length > 3000 ? '\n... (truncated)' : ''}
\`\`\``;
        
        console.log('\n=== DOM Content in AI Prompt ===');
        console.log('DOM content included:', pc.domContent.length, 'characters total');
        console.log('Truncated to:', domPreview.length, 'characters for prompt');
        console.log('DOM preview:', domPreview.substring(0, 500) + '...');
        console.log('=== End DOM Content ===\n');
      }
    } else {
      pageContextInfo = `

WARNING: NO PAGE CONTEXT AVAILABLE
- Cannot analyze the target page
- DO NOT make up any selectors or page content
- Add comments explaining that page analysis failed
- Use generic selectors like 'text=Button Text' if absolutely necessary`;
    }

    const prompt = `You are an expert Playwright test automation engineer. Generate a complete, production-ready Playwright test script based on the following user request and parsed intents.

User's Original Request: "${originalInput}"

Parsed Actions:
${intentDescriptions}
${pageContextInfo}

CRITICAL INSTRUCTIONS - FOLLOW THESE OR THE TEST WILL FAIL:
1. You MUST use ONLY the elements that actually exist on the page (shown in Page Context above)
2. DO NOT create selectors like #name, #email, #password unless they are EXPLICITLY listed in the page context
3. If the user asks for an element that doesn't exist:
   - Add a comment: // ERROR: No such element found on page
   - Skip that step or use page.pause() to let user handle manually
4. NEVER make up selectors - if you can't find it in the page context, it DOES NOT EXIST
5. For navigation, use the ACTUAL page title from context, not guessed titles
6. Example of what NOT to do:
   - DON'T: await page.locator('#email').fill('test@example.com'); // If #email not in context
   - DO: // ERROR: No email field found on page - skipping this step

Requirements:
1. Generate a COMPLETE Playwright test script that includes:
   - Import statement: import { test, expect } from '@playwright/test';
   - Test function: test('test name', async ({ page }) => { ... });
2. Use the EXACT selectors from the page context (don't create new ones)
3. Add appropriate waits and error handling
4. Include meaningful assertions where appropriate
5. Add helpful comments explaining each step
6. Use descriptive variable names if needed
7. Ensure the test name reflects the user's intent
8. Handle navigation properly with appropriate waits
9. For form interactions, consider clearing fields before typing
10. Add screenshots for important steps if it makes sense

IMPORTANT: The response must be a complete, valid TypeScript file that can be executed with Playwright.
Start with the import statement and include the full test function.

DO NOT include any explanatory text like "Here's the script" or "This code does..."
The FIRST character of your response MUST be the letter 'i' from 'import'
The response should start EXACTLY like this: import { test, expect } from '@playwright/test';

Return ONLY the complete Playwright test code, no markdown formatting, no explanations, no introductory text.`;

    // Log AI request
    console.log('\n=== AI Script Generation Request ===');
    console.log('Provider:', this.provider);
    console.log('Original Input:', originalInput);
    console.log('Intents:', JSON.stringify(intents, null, 2));
    console.log('Prompt length:', prompt.length, 'characters');
    if (intents[0]?.pageContext?.domContent) {
      console.log('DOM content included:', intents[0].pageContext.domContent.length, 'characters');
    }
    console.log('Full prompt:', prompt);
    console.log('=== End Request ===\n');

    try {
      let scriptContent: string;
      
      if (this.provider === 'anthropic' && this.anthropic) {
        const response = await this.anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        scriptContent = response.content[0].type === 'text' ? response.content[0].text : '';
      } else if (this.provider === 'gemini' && this.genAI) {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        scriptContent = response.text();
      } else {
        throw new Error('No AI provider configured');
      }

      // Log AI response
      console.log('\n=== AI Script Generation Response ===');
      console.log('Response length:', scriptContent.length, 'characters');
      console.log('Raw response:', scriptContent.substring(0, 500) + (scriptContent.length > 500 ? '...' : ''));
      
      // Clean up any markdown formatting if present
      scriptContent = scriptContent.trim();
      scriptContent = scriptContent.replace(/```(?:javascript|typescript|js|ts)?\s*/gi, '');
      scriptContent = scriptContent.replace(/```\s*$/g, '');
      
      // Remove any explanatory text before the import statement
      const importIndex = scriptContent.indexOf('import ');
      if (importIndex > 0) {
        console.warn('Found explanatory text before import, removing it');
        scriptContent = scriptContent.substring(importIndex);
      }
      
      // Remove any text that looks like explanations
      if (scriptContent.toLowerCase().includes("here's") || scriptContent.toLowerCase().includes("this script")) {
        const actualImportIndex = scriptContent.indexOf('import ');
        if (actualImportIndex > 0) {
          scriptContent = scriptContent.substring(actualImportIndex);
        }
      }

      console.log('Cleaned response:', scriptContent.substring(0, 500) + (scriptContent.length > 500 ? '...' : ''));
      console.log('=== End Response ===\n');

      // Ensure we have a valid script - check for common patterns
      const hasImport = scriptContent.includes('import') || scriptContent.includes('require');
      const hasTest = scriptContent.includes('test(') || scriptContent.includes('test.describe(') || scriptContent.includes('it(');
      
      if (!hasImport || !hasTest) {
        console.error('Generated script validation failed:');
        console.error('Has import:', hasImport);
        console.error('Has test:', hasTest);
        console.error('Full script:', scriptContent);
        
        // If it looks like it might be valid TypeScript/JavaScript, return it anyway
        if (scriptContent.includes('await') || scriptContent.includes('page.') || scriptContent.includes('expect')) {
          console.warn('Script might be valid despite failing validation, returning it anyway');
          return scriptContent;
        }
        
        throw new Error('Generated script appears to be invalid');
      }

      return scriptContent;
    } catch (error) {
      console.error('AI script generation failed:', error);
      throw new Error(`AI script generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async addStepsWithAI(existingScript: string, intent: UserIntent, originalInput: string): Promise<string> {
    const intentDescription = this.describeIntent(intent);
    
    let pageContextSection = '';
    if (intent.pageContext) {
      const pc = intent.pageContext;
      pageContextSection = `

Current Page Context:
- URL: ${pc.url}
- Title: ${pc.title}
- ${pc.elements.length} interactive elements available`;

      if (pc.elements.length > 0) {
        pageContextSection += `\n\nRelevant Elements:
${pc.elements.slice(0, 10).map(el => 
  `- ${el.tag}${el.text ? ` text="${el.text}"` : ''}${el.id ? ` id="${el.id}"` : ''}${el.testId ? ` data-testid="${el.testId}"` : ''} -> selector: "${el.selector}"`
).join('\n')}`;
      }

      if (pc.domContent) {
        const domPreview = pc.domContent.substring(0, 2000);
        pageContextSection += `\n\nDOM Structure (for context):
\`\`\`json
${domPreview}${pc.domContent.length > 2000 ? '\n... (truncated)' : ''}
\`\`\``;
      }
    }
    
    const prompt = `You are an expert Playwright test automation engineer. You need to add new steps to an existing Playwright test script.

Existing Script:
${existingScript}

User's Request: "${originalInput}"

New Action to Add: ${intentDescription}${pageContextSection}

Requirements:
1. Add the new steps in the appropriate location within the test (before the closing brackets)
2. Maintain consistency with the existing code style
3. Add appropriate waits and error handling for the new steps
4. Include comments explaining the new steps
5. Ensure selectors follow best practices (prefer data-testid, then id, then semantic selectors)
6. If the action is related to form submission, consider adding assertions to verify success

Return the COMPLETE modified script with the new steps integrated. Do not use markdown formatting.

DO NOT include any explanatory text like "Here's the modified script" or "This adds..."
The FIRST character of your response MUST be the letter 'i' from 'import'
Return ONLY code, no explanations.`;

    // Log AI request for adding steps
    console.log('\n=== AI Add Steps Request ===');
    console.log('Provider:', this.provider);
    console.log('Original Input:', originalInput);
    console.log('Intent:', JSON.stringify(intent, null, 2));
    console.log('Existing script length:', existingScript.length, 'characters');
    console.log('Prompt length:', prompt.length, 'characters');
    console.log('=== End Request ===\n');

    try {
      let modifiedScript: string;
      
      if (this.provider === 'anthropic' && this.anthropic) {
        const response = await this.anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 3000,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        modifiedScript = response.content[0].type === 'text' ? response.content[0].text : '';
      } else if (this.provider === 'gemini' && this.genAI) {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        modifiedScript = response.text();
      } else {
        throw new Error('No AI provider configured');
      }

      // Log AI response
      console.log('\n=== AI Add Steps Response ===');
      console.log('Response length:', modifiedScript.length, 'characters');
      console.log('First 300 chars:', modifiedScript.substring(0, 300) + '...');
      
      // Clean up any markdown formatting
      modifiedScript = modifiedScript.trim();
      modifiedScript = modifiedScript.replace(/```(?:javascript|typescript|js|ts)?\s*/gi, '');
      modifiedScript = modifiedScript.replace(/```\s*$/g, '');
      
      // Remove any explanatory text before the import statement
      const importIndex = modifiedScript.indexOf('import ');
      if (importIndex > 0) {
        console.warn('Found explanatory text before import, removing it');
        modifiedScript = modifiedScript.substring(importIndex);
      }
      
      console.log('=== End Response ===\n');
      
      return modifiedScript;
    } catch (error) {
      console.error('AI step addition failed:', error);
      throw new Error(`AI step addition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private describeIntent(intent: UserIntent): string {
    let description = `${intent.action}`;
    if (intent.url) description += ` to URL: ${intent.url}`;
    if (intent.target) description += ` on element: "${intent.target}"`;
    if (intent.value) description += ` with value: "${intent.value}"`;
    if (intent.selector) description += ` (suggested selector: ${intent.selector})`;
    if (intent.pageContext) {
      description += ` (page context available from ${intent.pageContext.url})`;
    }
    return description;
  }

  private async generateAISuggestions(intent: UserIntent, originalInput: string, allIntents?: UserIntent[]): Promise<string[]> {
    const context = allIntents ? 
      `The user has provided multiple actions: ${allIntents.map(i => i.action).join(', ')}` : 
      `The user wants to ${intent.action}${intent.target ? ` on ${intent.target}` : ''}`;

    const prompt = `You are a Playwright test automation expert. Based on this user request and action, suggest 3-5 practical next steps or improvements for their test script.

User Request: "${originalInput}"
Context: ${context}
Current Action: ${this.describeIntent(intent)}

Generate 3-5 concise, actionable suggestions for what the user might want to do next or how to improve their test. Focus on:
- Common next steps in the testing workflow
- Best practices for reliability
- Useful assertions or verifications
- Error handling improvements

Return ONLY a JSON array of strings, no markdown, no explanations. Example:
["Add assertion to verify navigation success", "Wait for page to fully load", "Take screenshot after action"]`;

    console.log('\n=== AI Suggestions Request ===');
    console.log('User input:', originalInput);
    console.log('Intent:', JSON.stringify(intent, null, 2));
    console.log('=== End Request ===\n');

    try {
      let suggestionsContent: string;
      
      if (this.provider === 'anthropic' && this.anthropic) {
        const response = await this.anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        suggestionsContent = response.content[0].type === 'text' ? response.content[0].text : '';
      } else if (this.provider === 'gemini' && this.genAI) {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        suggestionsContent = response.text();
      } else {
        throw new Error('No AI provider configured');
      }

      // Parse the JSON response
      suggestionsContent = suggestionsContent.trim();
      suggestionsContent = suggestionsContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      
      const suggestions = JSON.parse(suggestionsContent);
      if (Array.isArray(suggestions)) {
        console.log('\n=== AI Suggestions Response ===');
        console.log('Suggestions:', JSON.stringify(suggestions, null, 2));
        console.log('=== End Response ===\n');
        
        return suggestions.slice(0, 5); // Limit to 5 suggestions
      }
    } catch (error) {
      console.error('AI suggestions generation failed:', error);
      // Return empty suggestions array on failure instead of throwing
      // This is non-critical functionality
      return [];
    }

    // If we reach here, return empty array
    return [];
  }

  async generateFullTestSuite(intents: UserIntent[], testName: string = 'Generated Test Suite'): Promise<string> {
    // Use the AI-powered generation method
    return this.generatePlaywrightScriptWithAI(intents, testName);
  }

  private escapeString(str: string): string {
    // Escape single quotes and backslashes for use in single-quoted strings
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

}