import { UserIntent, ScriptGenerationResponse, TestScript } from '../types';

export class ScriptGeneratorService {
  
  async generateFromIntent(intent: UserIntent, originalInput: string): Promise<ScriptGenerationResponse> {
    try {
      const script = this.buildPlaywrightScript(intent);
      const suggestions = this.generateSuggestions(intent);
      
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
      const script = this.buildPlaywrightScriptFromMultipleIntents(intents);
      const allSuggestions = intents.flatMap(intent => this.generateSuggestions(intent));
      // Remove duplicates
      const uniqueSuggestions = [...new Set(allSuggestions)];
      
      return {
        success: true,
        script,
        suggestions: uniqueSuggestions
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
      const newSteps = this.generateSteps(intent);
      const modifiedScript = this.insertStepsIntoScript(existingScript.script, newSteps);
      const suggestions = this.generateSuggestions(intent);
      
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

  private buildPlaywrightScript(intent: UserIntent): string {
    const imports = `import { test, expect } from '@playwright/test';

test('Generated test from user input', async ({ page }) => {`;

    const steps = this.generateSteps(intent);
    
    const closing = `});`;

    return `${imports}\n${steps}\n${closing}`;
  }

  private buildPlaywrightScriptFromMultipleIntents(intents: UserIntent[]): string {
    const imports = `import { test, expect } from '@playwright/test';

test('Generated test from user input', async ({ page }) => {`;

    const allSteps = intents.map((intent, index) => {
      const steps = this.generateSteps(intent);
      return index > 0 ? `\n  // Step ${index + 1}\n${steps}` : steps;
    }).join('\n');
    
    const closing = `});`;

    return `${imports}\n${allSteps}\n${closing}`;
  }

  private generateSteps(intent: UserIntent): string {
    const steps: string[] = [];
    
    switch (intent.action) {
      case 'navigate':
        if (intent.url) {
          steps.push(`  await page.goto('${intent.url}');`);
        }
        break;
        
      case 'click':
        const clickSelector = this.generateSelector(intent);
        steps.push(`  await page.click('${clickSelector}');`);
        break;
        
      case 'type':
        const typeSelector = this.generateSelector(intent);
        if (intent.value) {
          steps.push(`  await page.fill('${typeSelector}', '${intent.value}');`);
          // If it's a search, also add Enter key press
          if (intent.target?.toLowerCase().includes('search')) {
            steps.push(`  await page.keyboard.press('Enter');`);
          }
        }
        break;
        
      case 'assert':
        if (intent.target?.includes('title')) {
          steps.push(`  await expect(page).toHaveTitle('${intent.value || ''}');`);
        } else if (intent.target?.includes('text') || intent.value) {
          steps.push(`  await expect(page.locator('body')).toContainText('${intent.value || ''}');`);
        } else {
          steps.push(`  await expect(page.locator('${this.generateSelector(intent)}')).toBeVisible();`);
        }
        break;
        
      case 'wait':
        const waitTime = intent.value ? parseInt(intent.value) : 1000;
        if (intent.target) {
          const waitSelector = this.generateSelector(intent);
          steps.push(`  await page.waitForSelector('${waitSelector}');`);
        } else {
          steps.push(`  await page.waitForTimeout(${waitTime});`);
        }
        break;
        
      case 'screenshot':
        steps.push(`  await page.screenshot({ path: 'screenshot-${Date.now()}.png' });`);
        break;
        
      case 'extract':
        const extractSelector = this.generateSelector(intent);
        steps.push(`  const text = await page.textContent('${extractSelector}');`);
        steps.push(`  console.log('Extracted text:', text);`);
        break;
        
      default:
        steps.push(`  // Unable to generate step for action: ${intent.action}`);
    }
    
    return steps.join('\n');
  }

  private generateSelector(intent: UserIntent): string {
    if (intent.selector) {
      return intent.selector;
    }
    
    if (!intent.target) {
      return 'body';
    }
    
    const target = intent.target.toLowerCase();
    
    const selectorMappings: Record<string, string[]> = {
      'login': ['button:has-text("login")', '[data-testid="login"]', '.login-btn', '#login'],
      'submit': ['button[type="submit"]', 'input[type="submit"]', '.submit-btn'],
      'search': ['input[name="q"]', 'input[type="search"]', '[placeholder*="search" i]', '.search-input', '#search'],
      'search box': ['input[name="q"]', 'input[type="search"]', '[placeholder*="search" i]', '.search-input', '#search'],
      'email': ['input[type="email"]', '[name="email"]', '#email'],
      'password': ['input[type="password"]', '[name="password"]', '#password'],
      'username': ['[name="username"]', '[name="user"]', '#username'],
      'button': ['button', 'input[type="button"]', '.btn'],
      'link': ['a', 'link'],
      'input': ['input', 'textarea'],
      'form': ['form'],
      'menu': ['nav', '.menu', '.navigation'],
      'header': ['header', '.header'],
      'footer': ['footer', '.footer']
    };
    
    for (const [keyword, selectors] of Object.entries(selectorMappings)) {
      if (target.includes(keyword)) {
        return selectors[0];
      }
    }
    
    if (target.includes('text')) {
      const textMatch = target.match(/text['"\\s]*([^'"\\s]+)/);
      if (textMatch) {
        return `text="${textMatch[1]}"`;
      }
    }
    
    const words = target.split(' ');
    if (words.length === 1) {
      return `[data-testid="${words[0]}"], .${words[0]}, #${words[0]}`;
    }
    
    return `text="${target}"`;
  }

  private generateSuggestions(intent: UserIntent): string[] {
    const suggestions: string[] = [];
    
    switch (intent.action) {
      case 'navigate':
        suggestions.push('Add wait for page load', 'Verify page title', 'Check for specific elements');
        break;
      case 'click':
        suggestions.push('Add wait before click', 'Verify element is visible', 'Check page change after click');
        break;
      case 'type':
        suggestions.push('Clear field before typing', 'Verify typed value', 'Press Enter after typing');
        break;
      case 'assert':
        suggestions.push('Add multiple assertions', 'Check element attributes', 'Verify URL change');
        break;
      default:
        suggestions.push('Add error handling', 'Include wait conditions', 'Add verification steps');
    }
    
    if (intent.confidence < 0.7) {
      suggestions.unshift('Review generated selector - confidence is low');
    }
    
    return suggestions;
  }

  private insertStepsIntoScript(existingScript: string, newSteps: string): string {
    // Find the closing brace of the test function
    const closingBraceIndex = existingScript.lastIndexOf('});');
    
    if (closingBraceIndex === -1) {
      // If no closing brace found, append to the end
      return existingScript + '\n' + newSteps;
    }
    
    // Insert new steps before the closing brace
    const beforeClosing = existingScript.substring(0, closingBraceIndex);
    const afterClosing = existingScript.substring(closingBraceIndex);
    
    return beforeClosing + '\n\n  // Additional steps:\n' + newSteps + '\n' + afterClosing;
  }

  generateFullTestSuite(intents: UserIntent[], testName: string = 'Generated Test Suite'): string {
    const imports = `import { test, expect } from '@playwright/test';

test('${testName}', async ({ page }) => {`;

    const allSteps = intents.map(intent => this.generateSteps(intent)).join('\n\n');
    
    const closing = `});`;

    return `${imports}\n${allSteps}\n${closing}`;
  }
}