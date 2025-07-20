import mongoose, { Schema, Document } from 'mongoose';

export interface IExecution extends Document {
  scriptId: mongoose.Types.ObjectId;
  scriptName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  output?: string;
  error?: string;
  screenshots?: string[];
  testResults?: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
  };
  browserInfo?: {
    name: string;
    version: string;
  };
  metadata?: Record<string, any>;
}

const ExecutionSchema: Schema<IExecution> = new Schema<IExecution>({
  scriptId: {
    type: Schema.Types.ObjectId,
    ref: 'Script',
    required: true,
    index: true
  },
  scriptName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  startTime: {
    type: Date,
    default: Date.now,
    index: true
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number
  },
  output: {
    type: String,
    maxlength: 50000
  },
  error: {
    type: String,
    maxlength: 10000
  },
  screenshots: {
    type: [String],
    default: []
  },
  testResults: {
    passed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  browserInfo: {
    name: String,
    version: String
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (_, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

ExecutionSchema.index({ startTime: -1 });
ExecutionSchema.index({ scriptId: 1, startTime: -1 });

ExecutionSchema.pre<IExecution>('save', function(next) {
  if (this.endTime && this.startTime) {
    this.duration = this.endTime.getTime() - this.startTime.getTime();
  }
  next();
});

export default mongoose.model<IExecution>('Execution', ExecutionSchema);