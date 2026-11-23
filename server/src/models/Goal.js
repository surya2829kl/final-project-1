import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    category: {
      type: String,
      required: true,
      enum: ['Steps', 'Workouts', 'Calories', 'Sleep', 'Other'],
    },
    target: { type: Number, required: true, min: 1 },
    current: { type: Number, default: 0, min: 0 },
    unit: { type: String, required: true, trim: true, maxlength: 24 },
    dueDate: { type: Date },
  },
  { timestamps: true },
);

export default mongoose.model('Goal', goalSchema);
