import { Router } from 'express';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { TestScript } from '../types';
import { ScriptExecutorService } from '../services/ScriptExecutorService';
import { ScriptStorageService } from '../services/ScriptStorageService';

export class ScriptController {
  private router = Router();
  private scripts: Map<string, TestScript> = new Map();
  private scriptExecutor = new ScriptExecutorService();
  private storageService = new ScriptStorageService();
  private io?: Server;

  constructor(io?: Server) {
    this.io = io;
    this.initializeStorage();
    this.setupRoutes();
  }

  private async initializeStorage() {
    try {
      this.scripts = await this.storageService.loadScripts();
    } catch (error) {
      console.error('Failed to initialize script storage:', error);
    }
  }

  private setupRoutes() {
    this.router.get('/', (req, res) => {
      const scripts = Array.from(this.scripts.values());
      res.json({ scripts });
    });

    this.router.post('/', async (req, res) => {
      try {
        const { name, description, script, tags = [] } = req.body;
        
        if (!name || !script) {
          return res.status(400).json({ error: 'Name and script are required' });
        }

        const testScript: TestScript = {
          id: uuidv4(),
          name,
          description: description || '',
          script,
          createdAt: new Date(),
          updatedAt: new Date(),
          tags,
          status: 'ready'
        };

        this.scripts.set(testScript.id, testScript);
        await this.storageService.saveScript(testScript);
        
        console.log('Script created with ID:', testScript.id);
        console.log('Total scripts in store:', this.scripts.size);
        res.status(201).json({ script: testScript });
      } catch (error) {
        console.error('Error creating script:', error);
        res.status(500).json({ error: 'Failed to create script' });
      }
    });

    this.router.get('/:id', (req, res) => {
      const script = this.scripts.get(req.params.id);
      if (!script) {
        return res.status(404).json({ error: 'Script not found' });
      }
      res.json({ script });
    });

    this.router.put('/:id', async (req, res) => {
      try {
        const script = this.scripts.get(req.params.id);
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

        this.scripts.set(script.id, updatedScript);
        await this.storageService.saveScript(updatedScript);
        
        console.log(`Script updated: ${updatedScript.name} (${req.params.id})`);
        res.json({ script: updatedScript });
      } catch (error) {
        console.error('Update script error:', error);
        res.status(500).json({ error: 'Failed to update script' });
      }
    });

    this.router.delete('/:id', async (req, res) => {
      try {
        const script = this.scripts.get(req.params.id);
        if (!script) {
          return res.status(404).json({ error: 'Script not found' });
        }

        const deleted = this.scripts.delete(req.params.id);
        if (deleted) {
          // Save the updated scripts to storage
          await this.storageService.saveScriptsDebounced(this.scripts);
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
        console.log('Available script IDs:', Array.from(this.scripts.keys()));
        
        const script = this.scripts.get(req.params.id);
        if (!script) {
          console.log('Script not found in memory store');
          return res.status(404).json({ error: 'Script not found' });
        }

        script.status = 'running';
        this.scripts.set(script.id, script);
        // Use debounced save to prevent nodemon restarts
        await this.storageService.saveScriptsDebounced(this.scripts);

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
        
        script.status = result.success ? 'completed' : 'failed';
        script.updatedAt = new Date();
        this.scripts.set(script.id, script);
        await this.storageService.saveScriptsDebounced(this.scripts);

        res.json({ 
          result,
          script: this.scripts.get(script.id)
        });
      } catch (error) {
        console.error('Script execution error:', error);
        
        const script = this.scripts.get(req.params.id);
        if (script) {
          script.status = 'failed';
          script.updatedAt = new Date();
          this.scripts.set(script.id, script);
          await this.storageService.saveScriptsDebounced(this.scripts);
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
          script: this.scripts.get(req.params.id)
        });
      }
    });

    this.router.post('/:id/validate', async (req, res) => {
      try {
        const script = this.scripts.get(req.params.id);
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

    this.router.get('/:id/download', (req, res) => {
      const script = this.scripts.get(req.params.id);
      if (!script) {
        return res.status(404).json({ error: 'Script not found' });
      }

      const filename = `${script.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.spec.ts`;
      
      res.setHeader('Content-Type', 'application/typescript');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(script.script);
    });
  }

  public getRouter() {
    return this.router;
  }
}