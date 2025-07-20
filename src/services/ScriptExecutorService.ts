import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { TestScript } from '../types';
import { Server } from 'socket.io';

const execAsync = promisify(exec);

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
  screenshots?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ScriptExecutorService {
  private tempDir = path.join(process.cwd(), 'temp');

  constructor() {
    this.ensureTempDir();
  }

  /**
   * Architecture Note:
   * - Scripts are permanently stored in MongoDB
   * - Execution history and results are stored in MongoDB
   * - Temporary files are created only for Playwright execution (Playwright requires physical files)
   * - These temp files are automatically cleaned up after execution
   */

  private async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  async executeScript(script: TestScript, io?: Server): Promise<ExecutionResult> {
    const startTime = Date.now();
    let tempFilePath: string | null = null;
    
    try {
      console.log(`Starting execution of script: ${script.name}`);
      
      // Emit execution start
      if (io) {
        io.emit('execution-output', {
          scriptId: script.id,
          output: `Initializing script: ${script.name}`,
          type: 'info'
        });
      }
      
      // Create temporary file for Playwright execution
      // Note: Playwright requires physical files to run tests
      tempFilePath = await this.writeScriptToFile(script);
      console.log(`Creating temporary execution file: ${path.basename(tempFilePath)}`);
      
      // Skip validation for now to avoid temp file conflicts
      // We'll add content validation without creating temp files
      console.log('Performing content validation...');
      
      if (io) {
        io.emit('execution-output', {
          scriptId: script.id,
          output: 'Validating script content...',
          type: 'info'
        });
      }
      
      const contentValidation = this.validateScriptContentOnly(script.script);
      
      if (contentValidation.errors.length > 0) {
        console.log('Script content validation failed:', contentValidation.errors);
        
        if (io) {
          io.emit('execution-output', {
            scriptId: script.id,
            output: `Validation failed: ${contentValidation.errors.join('; ')}`,
            type: 'error'
          });
        }
        
        return {
          success: false,
          output: 'Script validation failed',
          error: contentValidation.errors.join('; '),
          duration: Date.now() - startTime,
          screenshots: []
        };
      }

      console.log('Script validation passed, attempting Playwright execution...');
      
      if (io) {
        io.emit('execution-output', {
          scriptId: script.id,
          output: 'Script validation passed! Preparing for execution...',
          type: 'success'
        });
      }
      
      // Verify temp file exists before copying
      try {
        await fs.access(tempFilePath);
        console.log(`Temp file verified at: ${tempFilePath}`);
      } catch (error) {
        throw new Error(`Temp file not found: ${tempFilePath}`);
      }
      
      // Copy temp file to tests directory for Playwright to find it
      const testsDir = path.join(process.cwd(), 'tests');
      await fs.mkdir(testsDir, { recursive: true });
      
      const testFileName = `generated_${script.id}_${Date.now()}.spec.ts`;
      const testFilePath = path.join(testsDir, testFileName);
      
      console.log(`Copying ${tempFilePath} to ${testFilePath}`);
      
      if (io) {
        io.emit('execution-output', {
          scriptId: script.id,
          output: 'Setting up test environment...',
          type: 'info'
        });
      }
      
      await fs.copyFile(tempFilePath, testFilePath);
      console.log('File copied successfully');
      
      if (io) {
        io.emit('execution-output', {
          scriptId: script.id,
          output: 'Starting Playwright test execution...',
          type: 'info'
        });
      }
      
      try {
        // Execute the Playwright test from tests directory in headed mode
        const { stdout, stderr } = await execAsync(
          `npx playwright test "${testFileName}" --reporter=line --headed`,
          { 
            cwd: process.cwd(),
            timeout: 30000, // 30 second timeout
            env: {
              ...process.env,
              PLAYWRIGHT_BROWSERS_PATH: '0' // Use local browsers
            }
          }
        );

        const duration = Date.now() - startTime;
        console.log(`Playwright execution completed in ${duration}ms`);

        // Emit execution output
        if (io) {
          io.emit('execution-output', {
            scriptId: script.id,
            output: stdout || 'No output from Playwright',
            type: 'info'
          });
          
          if (stderr && stderr.trim()) {
            io.emit('execution-output', {
              scriptId: script.id,
              output: `Stderr: ${stderr}`,
              type: 'warning'
            });
          }
        }

        // Check for success indicators in Playwright output
        const hasErrors = stderr && stderr.trim().length > 0;
        const hasPassed = stdout.includes('passed') || stdout.includes('✓') || 
                         stdout.includes('1 test passed') || 
                         (stdout.includes('Running 1 test') && !stdout.includes('failed'));
        const hasFailed = stdout.includes('failed') || stdout.includes('✗') || 
                         stdout.includes('Error:') || stdout.includes('browserType.launch:');
        
        const success = !hasErrors && hasPassed && !hasFailed;
        
        console.log(`Execution analysis: hasErrors=${hasErrors}, hasPassed=${hasPassed}, hasFailed=${hasFailed}, success=${success}`);
        
        // Emit completion status
        if (io) {
          io.emit('execution-output', {
            scriptId: script.id,
            output: success ? `✅ Test completed successfully in ${duration}ms` : `❌ Test failed after ${duration}ms`,
            type: success ? 'success' : 'error'
          });
          
          io.emit('execution-complete', {
            scriptId: script.id,
            success,
            duration
          });
        }

        return {
          success,
          output: stdout || 'Test completed',
          error: stderr || undefined,
          duration,
          screenshots: await this.findScreenshots()
        };
      } finally {
        // Clean up the test file from tests directory
        try {
          await fs.unlink(testFilePath);
        } catch (cleanupError) {
          console.warn('Failed to cleanup test file:', cleanupError);
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error('Script execution failed:', error);
      
      let errorMessage = 'Unknown execution error';
      if (error instanceof Error) {
        errorMessage = error.message.substring(0, 200);
      }
      
      // Emit error to frontend
      if (io) {
        io.emit('execution-output', {
          scriptId: script.id,
          output: `❌ Execution failed: ${errorMessage}`,
          type: 'error'
        });
        
        io.emit('execution-complete', {
          scriptId: script.id,
          success: false,
          duration
        });
      }
      
      return {
        success: false,
        output: '',
        error: errorMessage,
        duration,
        screenshots: []
      };
    } finally {
      // Always cleanup temp file
      if (tempFilePath) {
        await this.cleanupTempFile(tempFilePath);
      }
    }
  }

  async validateScript(script: TestScript): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Use the same temp file creation as execution
      const tempFilePath = await this.writeScriptToFile(script);
      
      try {
        const { stderr } = await execAsync(
          `npx tsc --noEmit "${tempFilePath}"`,
          { 
            cwd: process.cwd(),
            timeout: 30000
          }
        );

        if (stderr && stderr.includes('error TS')) {
          errors.push('TypeScript compilation errors:');
          // Extract just the error messages, not the full paths
          const errorLines = stderr.split('\n').filter(line => 
            line.includes('error TS') || line.includes('Cannot find module')
          );
          errorLines.forEach(line => {
            const cleanLine = line.replace(/.*temp_.*\.spec\.ts\(\d+,\d+\):\s*/, '');
            if (cleanLine.trim()) {
              errors.push(cleanLine.trim());
            }
          });
        }
      } finally {
        // Clean up temp file using the shared method
        await this.cleanupTempFile(tempFilePath);
      }
    } catch (error) {
      // If TypeScript validation fails, fall back to content validation only
      console.warn('TypeScript validation failed, using content validation only:', error);
    }

    this.validateScriptContent(script.script, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateScriptContentOnly(scriptContent: string): { errors: string[], warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    this.validateScriptContent(scriptContent, errors, warnings);
    return { errors, warnings };
  }

  private validateScriptContent(scriptContent: string, errors: string[], warnings: string[]) {
    if (!scriptContent.includes('@playwright/test')) {
      errors.push('Script must import from @playwright/test');
    }

    if (!scriptContent.includes('test(')) {
      errors.push('Script must contain at least one test() function');
    }

    if (!scriptContent.includes('async ({ page })')) {
      warnings.push('Test function should be async and accept page parameter');
    }

    if (scriptContent.includes('page.goto') && !scriptContent.includes('await page.goto')) {
      errors.push('page.goto calls must be awaited');
    }

    if (scriptContent.includes('page.click') && !scriptContent.includes('await page.click')) {
      errors.push('page.click calls must be awaited');
    }

    if (scriptContent.includes('page.fill') && !scriptContent.includes('await page.fill')) {
      errors.push('page.fill calls must be awaited');
    }

    const lines = scriptContent.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('page.') && !line.includes('await') && !line.includes('//') && !line.includes('*')) {
        warnings.push(`Line ${index + 1}: Consider adding await before page method call`);
      }
    });

    if (!scriptContent.includes('expect')) {
      warnings.push('Consider adding assertions with expect() for better test reliability');
    }

    if (scriptContent.split('\n').length > 50) {
      warnings.push('Script is quite long, consider breaking it into smaller tests');
    }
  }

  private async writeScriptToFile(script: TestScript): Promise<string> {
    const fileName = `temp_${script.id}_${Date.now()}.spec.ts`;
    const filePath = path.join(this.tempDir, fileName);
    
    await fs.writeFile(filePath, script.script, 'utf8');
    console.log(`Script written to: ${filePath}`);
    return filePath;
  }

  private async cleanupTempFile(filePath: string) {
    try {
      console.log(`Cleaning up temp file: ${filePath}`);
      await fs.unlink(filePath);
      console.log('Temp file cleaned up successfully');
    } catch (error) {
      console.warn('Failed to cleanup temp file:', filePath, error);
    }
  }

  private async findScreenshots(): Promise<string[]> {
    try {
      const files = await fs.readdir(process.cwd());
      return files.filter(file => 
        file.startsWith('screenshot-') && 
        (file.endsWith('.png') || file.endsWith('.jpg'))
      );
    } catch {
      return [];
    }
  }

  async getExecutionHistory(scriptId: string): Promise<any[]> {
    // In a real implementation, this would fetch from a database
    // For now, return empty array
    return [];
  }

  async cancelExecution(scriptId: string): Promise<boolean> {
    // In a real implementation, this would cancel running processes
    // For now, return false as no execution to cancel
    return false;
  }
}