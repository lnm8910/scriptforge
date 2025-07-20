import { TestScript } from '../types';
import Script, { IScript } from '../models/Script';
import Execution, { IExecution } from '../models/Execution';
import mongoose from 'mongoose';

export class ScriptStorageService {
  async loadScripts(): Promise<Map<string, TestScript>> {
    try {
      const scripts = await Script.find().sort({ createdAt: -1 });
      const scriptsMap = new Map<string, TestScript>();
      
      scripts.forEach(script => {
        const testScript: TestScript = {
          id: script.id || script._id!.toString(),
          name: script.name,
          description: script.description,
          script: script.script,
          tags: script.tags,
          status: script.status,
          createdAt: script.createdAt,
          updatedAt: script.updatedAt
        };
        scriptsMap.set(testScript.id, testScript);
      });
      
      console.log(`Loaded ${scriptsMap.size} scripts from MongoDB`);
      return scriptsMap;
    } catch (error) {
      console.error('Failed to load scripts from MongoDB:', error);
      return new Map();
    }
  }

  async saveScript(script: TestScript): Promise<TestScript> {
    try {
      const { id, ...scriptData } = script;
      
      if (id && mongoose.Types.ObjectId.isValid(id)) {
        const updatedScript = await Script.findByIdAndUpdate(
          id,
          scriptData,
          { new: true, runValidators: true }
        );
        
        if (updatedScript) {
          return {
            id: updatedScript.id || updatedScript._id!.toString(),
            name: updatedScript.name,
            description: updatedScript.description,
            script: updatedScript.script,
            tags: updatedScript.tags,
            status: updatedScript.status,
            createdAt: updatedScript.createdAt,
            updatedAt: updatedScript.updatedAt
          };
        }
      }
      
      const newScript = new Script(scriptData);
      const savedScript = await newScript.save();
      
      return {
        id: savedScript.id || savedScript._id!.toString(),
        name: savedScript.name,
        description: savedScript.description,
        script: savedScript.script,
        tags: savedScript.tags,
        status: savedScript.status,
        createdAt: savedScript.createdAt,
        updatedAt: savedScript.updatedAt
      };
    } catch (error) {
      console.error('Failed to save script:', error);
      throw error;
    }
  }

  async deleteScript(id: string): Promise<boolean> {
    try {
      const result = await Script.findByIdAndDelete(id);
      return !!result;
    } catch (error) {
      console.error('Failed to delete script:', error);
      return false;
    }
  }

  async getScript(id: string): Promise<TestScript | null> {
    try {
      const script = await Script.findById(id);
      if (!script) {
        return null;
      }
      
      return {
        id: script.id || script._id!.toString(),
        name: script.name,
        description: script.description,
        script: script.script,
        tags: script.tags,
        status: script.status,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt
      };
    } catch (error) {
      console.error('Failed to get script:', error);
      return null;
    }
  }

  async searchScripts(query: string): Promise<TestScript[]> {
    try {
      const scripts = await Script.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { tags: { $in: [new RegExp(query, 'i')] } }
        ]
      }).sort({ updatedAt: -1 });

      return scripts.map(script => ({
        id: script.id || script._id!.toString(),
        name: script.name,
        description: script.description,
        script: script.script,
        tags: script.tags,
        status: script.status,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt
      }));
    } catch (error) {
      console.error('Failed to search scripts:', error);
      return [];
    }
  }

  async createExecution(scriptId: string, scriptName: string): Promise<string> {
    try {
      const execution = new Execution({
        scriptId: new mongoose.Types.ObjectId(scriptId),
        scriptName,
        status: 'pending',
        startTime: new Date()
      });
      
      const savedExecution = await execution.save();
      return savedExecution.id || savedExecution._id!.toString();
    } catch (error) {
      console.error('Failed to create execution:', error);
      throw error;
    }
  }

  async updateExecution(executionId: string, updates: Partial<IExecution>): Promise<void> {
    try {
      await Execution.findByIdAndUpdate(executionId, updates);
    } catch (error) {
      console.error('Failed to update execution:', error);
      throw error;
    }
  }

  async getExecutions(scriptId?: string, limit: number = 50): Promise<IExecution[]> {
    try {
      const query = scriptId ? { scriptId: new mongoose.Types.ObjectId(scriptId) } : {};
      const executions = await Execution.find(query)
        .sort({ startTime: -1 })
        .limit(limit);
      
      return executions;
    } catch (error) {
      console.error('Failed to get executions:', error);
      return [];
    }
  }

  async getExecutionStats(scriptId: string): Promise<{
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    averageDuration: number;
    lastRun?: Date;
  }> {
    try {
      const stats = await Execution.aggregate([
        { $match: { scriptId: new mongoose.Types.ObjectId(scriptId) } },
        {
          $group: {
            _id: null,
            totalRuns: { $sum: 1 },
            successfulRuns: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            failedRuns: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            },
            averageDuration: { $avg: '$duration' },
            lastRun: { $max: '$startTime' }
          }
        }
      ]);

      if (stats.length === 0) {
        return {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          averageDuration: 0
        };
      }

      return stats[0];
    } catch (error) {
      console.error('Failed to get execution stats:', error);
      return {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        averageDuration: 0
      };
    }
  }
}