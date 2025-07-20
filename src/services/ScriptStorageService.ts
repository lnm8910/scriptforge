import fs from 'fs/promises';
import path from 'path';
import { TestScript } from '../types';

export class ScriptStorageService {
  private storageFile = path.join(process.cwd(), 'scripts.json');
  private saveTimeout: NodeJS.Timeout | null = null;

  async loadScripts(): Promise<Map<string, TestScript>> {
    try {
      const data = await fs.readFile(this.storageFile, 'utf8');
      const scriptsArray = JSON.parse(data) as TestScript[];
      const scriptsMap = new Map<string, TestScript>();
      
      scriptsArray.forEach(script => {
        // Convert date strings back to Date objects
        script.createdAt = new Date(script.createdAt);
        script.updatedAt = new Date(script.updatedAt);
        scriptsMap.set(script.id, script);
      });
      
      console.log(`Loaded ${scriptsMap.size} scripts from storage`);
      return scriptsMap;
    } catch (error) {
      console.log('No existing scripts file found, starting with empty storage');
      return new Map();
    }
  }

  async saveScripts(scripts: Map<string, TestScript>): Promise<void> {
    try {
      const scriptsArray = Array.from(scripts.values());
      await fs.writeFile(this.storageFile, JSON.stringify(scriptsArray, null, 2));
      console.log(`Saved ${scriptsArray.length} scripts to storage`);
    } catch (error) {
      console.error('Failed to save scripts:', error);
    }
  }

  async saveScriptsDebounced(scripts: Map<string, TestScript>): Promise<void> {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    // Set new timeout to save after 1 second of no changes
    this.saveTimeout = setTimeout(async () => {
      await this.saveScripts(scripts);
      this.saveTimeout = null;
    }, 1000);
  }

  async saveScript(script: TestScript): Promise<void> {
    try {
      const scripts = await this.loadScripts();
      scripts.set(script.id, script);
      await this.saveScripts(scripts);
    } catch (error) {
      console.error('Failed to save individual script:', error);
    }
  }

  async deleteScript(id: string): Promise<boolean> {
    try {
      const scripts = await this.loadScripts();
      const deleted = scripts.delete(id);
      if (deleted) {
        await this.saveScripts(scripts);
      }
      return deleted;
    } catch (error) {
      console.error('Failed to delete script:', error);
      return false;
    }
  }
}