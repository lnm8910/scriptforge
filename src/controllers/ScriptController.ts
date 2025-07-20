import { Router } from 'express';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { TestScript } from '../types';
import { ScriptExecutorService } from '../services/ScriptExecutorService';
import { ScriptStorageService } from '../services/ScriptStorageService';

export class ScriptController {
  private router = Router();
  private scriptExecutor = new ScriptExecutorService();
  private storageService = new ScriptStorageService();
  private io?: Server;

  constructor(io?: Server) {
    this.io = io;
    this.setupRoutes();
  }

  private setupRoutes() {
    // Search scripts route (must come before /:id)
    this.router.get('/search', async (req, res) => {
      try {
        const query = req.query.q as string;
        if (!query) {
          return res.status(400).json({ error: 'Search query is required' });
        }
        const scripts = await this.storageService.searchScripts(query);
        res.json({ scripts });
      } catch (error) {
        console.error('Error searching scripts:', error);
        res.status(500).json({ error: 'Failed to search scripts' });
      }
    });

    // Get all executions route (must come before /:id)
    this.router.get('/executions/all', async (req, res) => {
      try {
        const scriptId = req.query.scriptId as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const executions = await this.storageService.getExecutions(scriptId, limit);
        res.json({ executions });
      } catch (error) {
        console.error('Error fetching all executions:', error);
        res.status(500).json({ error: 'Failed to fetch executions' });
      }
    });

    this.router.get('/', async (req, res) => {
      try {
        const scriptsMap = await this.storageService.loadScripts();
        const scripts = Array.from(scriptsMap.values());
        res.json({ scripts });
      } catch (error) {
        console.error('Error fetching scripts:', error);
        res.status(500).json({ error: 'Failed to fetch scripts' });
      }
    });

    this.router.post('/', async (req, res) => {
      try {
        const { name, description, script, tags = [] } = req.body;
        
        if (!name || !script) {
          return res.status(400).json({ error: 'Name and script are required' });
        }

        const testScript: TestScript = {
          id: '', // MongoDB will generate the ID
          name,
          description: description || '',
          script,
          createdAt: new Date(),
          updatedAt: new Date(),
          tags,
          status: 'ready'
        };

        const savedScript = await this.storageService.saveScript(testScript);
        
        console.log('Script created with ID:', savedScript.id);
        res.status(201).json({ script: savedScript });
      } catch (error) {
        console.error('Error creating script:', error);
        res.status(500).json({ error: 'Failed to create script' });
      }
    });

    this.router.get('/:id', async (req, res) => {
      try {
        const script = await this.storageService.getScript(req.params.id);
        if (!script) {
          return res.status(404).json({ error: 'Script not found' });
        }
        res.json({ script });
      } catch (error) {
        console.error('Error fetching script:', error);
        res.status(500).json({ error: 'Failed to fetch script' });
      }
    });

    this.router.put('/:id', async (req, res) => {
      try {
        const script = await this.storageService.getScript(req.params.id);
        if (!script) {
          return res.status(404).json({ error: 'Script not found' });
        }

        const { name, description, script: scriptContent, tags, status } = req.body;
        
        const updatedScript: TestScript = {
          ...script,
          name: name || script.name,
          description: description !== undefined ? description : script.description,
          script: scriptContent || script.script,
          tags: tags || script.tags,
          status: status || script.status,
          updatedAt: new Date()
        };

        const savedScript = await this.storageService.saveScript(updatedScript);
        
        console.log(`Script updated: ${savedScript.name} (${req.params.id})`);
        res.json({ script: savedScript });
      } catch (error) {
        console.error('Update script error:', error);
        res.status(500).json({ error: 'Failed to update script' });
      }
    });

    this.router.delete('/:id', async (req, res) => {
      try {
        const script = await this.storageService.getScript(req.params.id);
        if (!script) {
          return res.status(404).json({ error: 'Script not found' });
        }

        const deleted = await this.storageService.deleteScript(req.params.id);
        if (deleted) {
          console.log(`Script deleted: ${script.name} (${req.params.id})`);
        }

        res.json({ 
          message: 'Script deleted successfully',
          deletedScript: script
        });
      } catch (error) {
        console.error('Delete script error:', error);
        res.status(500).json({ error: 'Failed to delete script' });
      }
    });

    this.router.post('/:id/execute', async (req, res) => {
      try {
        console.log('Attempting to execute script with ID:', req.params.id);
        
        const script = await this.storageService.getScript(req.params.id);
        if (!script) {
          console.log('Script not found in database');
          return res.status(404).json({ error: 'Script not found' });
        }

        // Create execution record
        const executionId = await this.storageService.createExecution(script.id, script.name);
        
        script.status = 'running';
        await this.storageService.saveScript(script);

        console.log(`Executing script ${script.id}: ${script.name}`);
        
        // Emit execution start event
        if (this.io) {
          this.io.emit('execution-output', {
            scriptId: script.id,
            output: `Starting execution of "${script.name}"`,
            type: 'info'
          });
        }
        
        // Add a timeout wrapper to prevent hanging
        const executionPromise = this.scriptExecutor.executeScript(script, this.io);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Script execution timed out after 60 seconds')), 60000);
        });

        const result = await Promise.race([executionPromise, timeoutPromise]);
        
        console.log(`Script execution completed:`, result);
        
        // Update execution record
        await this.storageService.updateExecution(executionId, {
          status: result.success ? 'completed' : 'failed',
          endTime: new Date(),
          output: result.output,
          error: result.error,
          screenshots: result.screenshots,
          testResults: {
            passed: result.success ? 1 : 0,
            failed: result.success ? 0 : 1,
            skipped: 0,
            total: 1
          }
        });
        
        script.status = result.success ? 'completed' : 'failed';
        script.updatedAt = new Date();
        await this.storageService.saveScript(script);

        res.json({ 
          result,
          script: await this.storageService.getScript(script.id),
          executionId
        });
      } catch (error) {
        console.error('Script execution error:', error);
        
        const script = await this.storageService.getScript(req.params.id);
        if (script) {
          script.status = 'failed';
          script.updatedAt = new Date();
          await this.storageService.saveScript(script);
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
          success: false,
          error: errorMessage,
          output: '',
          duration: 0,
          screenshots: []
        };
        
        res.json({
          result,
          script: await this.storageService.getScript(req.params.id)
        });
      }
    });

    this.router.post('/:id/validate', async (req, res) => {
      try {
        const script = await this.storageService.getScript(req.params.id);
        if (!script) {
          return res.status(404).json({ error: 'Script not found' });
        }

        const validation = await this.scriptExecutor.validateScript(script);
        res.json({ validation });
      } catch (error) {
        console.error('Script validation error:', error);
        res.status(500).json({ 
          error: 'Script validation failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.router.get('/:id/download', async (req, res) => {
      try {
        const script = await this.storageService.getScript(req.params.id);
        if (!script) {
          return res.status(404).json({ error: 'Script not found' });
        }

      const filename = `${script.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.spec.ts`;
      
        res.setHeader('Content-Type', 'application/typescript');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(script.script);
      } catch (error) {
        console.error('Download script error:', error);
        res.status(500).json({ error: 'Failed to download script' });
      }
    });

    // Get execution history for a script
    this.router.get('/:id/executions', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const executions = await this.storageService.getExecutions(req.params.id, limit);
        res.json({ executions });
      } catch (error) {
        console.error('Error fetching executions:', error);
        res.status(500).json({ error: 'Failed to fetch execution history' });
      }
    });

    // Get execution statistics for a script
    this.router.get('/:id/stats', async (req, res) => {
      try {
        const stats = await this.storageService.getExecutionStats(req.params.id);
        res.json({ stats });
      } catch (error) {
        console.error('Error fetching execution stats:', error);
        res.status(500).json({ error: 'Failed to fetch execution statistics' });
      }
    });

  }

  public getRouter() {
    return this.router;
  }
}