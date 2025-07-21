import { chromium, Browser, Page } from 'playwright';

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

export interface PageContext {
  url: string;
  title: string;
  elements: ElementInfo[];
  forms: FormInfo[];
  domContent?: string;
  timestamp: Date;
}

export interface FormInfo {
  id?: string;
  name?: string;
  fields: ElementInfo[];
  submitButton?: ElementInfo;
}

export class PageAnalyzerService {
  private browser: Browser | null = null;

  async analyzePage(url: string): Promise<PageContext> {
    try {
      if (!this.browser) {
        this.browser = await chromium.launch({ headless: true });
      }

      const page = await this.browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      
      // Wait a bit for any dynamic content
      await page.waitForTimeout(2000);

      const title = await page.title();
      const elements = await this.extractElements(page);
      const forms = await this.extractForms(page);
      const domContent = await this.extractDOMContent(page);

      // Log DOM content details
      console.log('\n=== Page Analysis DOM Content ===');
      console.log('URL:', url);
      console.log('DOM content length:', domContent.length, 'characters');
      console.log('First 1000 characters of DOM:');
      console.log(domContent.substring(0, 1000) + (domContent.length > 1000 ? '\n... (truncated)' : ''));
      console.log('=== End DOM Content ===\n');

      await page.close();

      return {
        url,
        title,
        elements,
        forms,
        domContent,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Page analysis error:', error);
      throw new Error(`Failed to analyze page: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractElements(page: Page): Promise<ElementInfo[]> {
    const elements = await page.evaluate(() => {
      // Helper function to generate selector (defined inside evaluate)
      function generateSelector(el: Element): string {
        // Try data-testid first
        if (el.getAttribute('data-testid')) {
          return `[data-testid="${el.getAttribute('data-testid')}"]`;
        }
        
        // Try ID
        if (el.id) {
          return `#${el.id}`;
        }
        
        // Try unique class combination
        if (el.classList.length > 0) {
          try {
            // Escape special characters in class names (for Tailwind CSS)
            const escapedClasses = Array.from(el.classList).map(cls => 
              cls.replace(/([:\[\](){},.>~+\s])/g, '\\\\$1')
            );
            const classSelector = `.${escapedClasses.join('.')}`;
            // Test if selector is valid before using it
            document.querySelector(classSelector);
            if (document.querySelectorAll(classSelector).length === 1) {
              return classSelector;
            }
          } catch (e) {
            // If selector is invalid, skip class-based selection
          }
        }
        
        // Try role + text
        if (el.getAttribute('role') && (el as HTMLElement).innerText) {
          const text = (el as HTMLElement).innerText.trim();
          if (text.length < 50) {
            return `[role="${el.getAttribute('role')}"]:has-text("${text}")`;
          }
        }
        
        // Generate CSS path
        const path: string[] = [];
        let current: Element | null = el;
        
        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();
          
          if (current.id) {
            selector = `#${current.id}`;
            path.unshift(selector);
            break;
          } else {
            const siblings = Array.from(current.parentElement?.children || []);
            const sameTagSiblings = siblings.filter(s => s.tagName === current!.tagName);
            
            if (sameTagSiblings.length > 1) {
              const index = sameTagSiblings.indexOf(current) + 1;
              selector += `:nth-of-type(${index})`;
            }
            
            path.unshift(selector);
          }
          
          current = current.parentElement;
        }
        
        return path.join(' > ');
      }
      
      const interactiveSelectors = 'button, input, select, textarea, a, [onclick], [data-testid], [role="button"], [role="link"]';
      const elements = document.querySelectorAll(interactiveSelectors);
      
      const elementInfos: any[] = [];
      
      elements.forEach((el: Element) => {
        const htmlEl = el as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        
        // Generate a unique selector for this element
        const selector = generateSelector(el);
        
        elementInfos.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          classes: Array.from(el.classList),
          testId: el.getAttribute('data-testid') || undefined,
          text: htmlEl.innerText?.trim() || undefined,
          placeholder: el.getAttribute('placeholder') || undefined,
          type: el.getAttribute('type') || undefined,
          name: el.getAttribute('name') || undefined,
          href: el.getAttribute('href') || undefined,
          selector: selector,
          isVisible: rect.width > 0 && rect.height > 0,
          isInteractive: !htmlEl.hasAttribute('disabled') && htmlEl.style.pointerEvents !== 'none'
        });
      });
      
      return elementInfos;
    });

    // Add XPath as alternative selector
    for (const element of elements) {
      element.xpath = await this.generateXPath(page, element.selector);
    }

    return elements;
  }

  private async extractForms(page: Page): Promise<FormInfo[]> {
    return await page.evaluate(() => {
      // Reuse the generateSelector function from above
      function generateSelector(el: Element): string {
        if (el.getAttribute('data-testid')) {
          return `[data-testid="${el.getAttribute('data-testid')}"]`;
        }
        if (el.id) {
          return `#${el.id}`;
        }
        // Simplified version for forms
        return el.tagName.toLowerCase();
      }
      
      const forms = document.querySelectorAll('form');
      const formInfos: any[] = [];
      
      forms.forEach((form) => {
        const fields: any[] = [];
        const inputs = form.querySelectorAll('input, select, textarea');
        let submitButton: any = null;
        
        inputs.forEach((input) => {
          const htmlInput = input as HTMLInputElement;
          fields.push({
            tag: input.tagName.toLowerCase(),
            id: input.id || undefined,
            name: input.getAttribute('name') || undefined,
            type: input.getAttribute('type') || 'text',
            placeholder: input.getAttribute('placeholder') || undefined,
            required: htmlInput.required,
            selector: generateSelector(input)
          });
        });
        
        // Find submit button
        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"])');
        if (submitBtn) {
          submitButton = {
            tag: submitBtn.tagName.toLowerCase(),
            text: (submitBtn as HTMLElement).innerText?.trim() || 'Submit',
            selector: generateSelector(submitBtn)
          };
        }
        
        formInfos.push({
          id: form.id || undefined,
          name: form.getAttribute('name') || undefined,
          fields,
          submitButton
        });
      });
      
      return formInfos;
    });
  }

  private async generateXPath(page: Page, cssSelector: string): Promise<string | undefined> {
    try {
      return await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (!element) return undefined;
        
        const getXPath = (el: Element): string => {
          if (el.id) {
            return `//*[@id="${el.id}"]`;
          }
          
          const path: string[] = [];
          let current: Element | null = el;
          
          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let index = 1;
            let sibling = current.previousElementSibling;
            
            while (sibling) {
              if (sibling.tagName === current.tagName) {
                index++;
              }
              sibling = sibling.previousElementSibling;
            }
            
            const tagName = current.tagName.toLowerCase();
            const pathPart = `${tagName}[${index}]`;
            path.unshift(pathPart);
            
            current = current.parentElement;
          }
          
          return '/' + path.join('/');
        };
        
        return getXPath(element);
      }, cssSelector);
    } catch {
      return undefined;
    }
  }


  private async extractDOMContent(page: Page): Promise<string> {
    try {
      // Extract a cleaned version of the DOM that focuses on structure and content
      const domContent = await page.evaluate(() => {
        const cleanElement = (element: Element): any => {
          const tagName = element.tagName.toLowerCase();
          
          // Skip script and style tags
          if (tagName === 'script' || tagName === 'style') {
            return null;
          }
          
          const result: any = {
            tag: tagName
          };
          
          // Add important attributes
          const importantAttrs = ['id', 'class', 'data-testid', 'name', 'type', 'placeholder', 
                                  'aria-label', 'role', 'href', 'value', 'for', 'title'];
          
          importantAttrs.forEach(attr => {
            const value = element.getAttribute(attr);
            if (value) {
              result[attr] = value;
            }
          });
          
          // Add text content for leaf nodes
          if (element.children.length === 0) {
            const text = element.textContent?.trim();
            if (text && text.length > 0 && text.length < 200) {
              result.text = text;
            }
          }
          
          // Recursively process children
          const children = Array.from(element.children)
            .map(child => cleanElement(child))
            .filter(child => child !== null);
          
          if (children.length > 0) {
            result.children = children;
          }
          
          return result;
        };
        
        // Start from body or main content area
        const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        return JSON.stringify(cleanElement(mainContent), null, 2);
      });
      
      // Limit DOM content to reasonable size (e.g., 50KB)
      const maxLength = 50000;
      if (domContent.length > maxLength) {
        return domContent.substring(0, maxLength) + '\n... (truncated)';
      }
      
      return domContent;
    } catch (error) {
      console.error('Error extracting DOM content:', error);
      return '';
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}