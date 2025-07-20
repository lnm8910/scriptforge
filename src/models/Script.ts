import mongoose, { Schema, Document } from 'mongoose';

export interface IScript extends Document {
  name: string;
  description: string;
  script: string;
  tags: string[];
  status: 'draft' | 'ready' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const ScriptSchema: Schema<IScript> = new Schema<IScript>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: false,
    trim: true,
    maxlength: 1000
  },
  script: {
    type: String,
    required: true
  },
  tags: {
    type: [String],
    default: [],
    index: true
  },
  status: {
    type: String,
    enum: ['draft', 'ready', 'running', 'completed', 'failed'],
    default: 'draft',
    index: true
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

ScriptSchema.index({ name: 'text', description: 'text' });
ScriptSchema.index({ createdAt: -1 });
ScriptSchema.index({ updatedAt: -1 });

export default mongoose.model<IScript>('Script', ScriptSchema);