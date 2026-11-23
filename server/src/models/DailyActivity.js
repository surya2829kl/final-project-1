import mongoose from 'mongoose';

const dailyActivitySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: Date, required: true },
    steps: { type: Number, default: 0, min: 0 },
    sleepHours: { type: Number, default: 0, min: 0, max: 24 },
    restingHeartRate: { type: Number, min: 25, max: 240 },
  },
  { timestamps: true },
);

dailyActivitySchema.index({ user: 1, day: 1 }, { unique: true });

export default mongoose.model('DailyActivity', dailyActivitySchema);
