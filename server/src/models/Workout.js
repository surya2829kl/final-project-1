import mongoose from 'mongoose';

const workoutSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ['Running', 'Cycling', 'Strength', 'Yoga', 'Swimming', 'Walking', 'Other'],
    },
    duration: { type: Number, required: true, min: 1 },
    calories: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 240, default: '' },
  },
  { timestamps: true },
);

export default mongoose.model('Workout', workoutSchema);
