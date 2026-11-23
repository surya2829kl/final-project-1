import { Router } from 'express';
import mongoose from 'mongoose';
import DailyActivity from '../models/DailyActivity.js';
import Goal from '../models/Goal.js';
import Meal from '../models/Meal.js';
import Workout from '../models/Workout.js';
import authenticate from '../middleware/authenticate.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

router.use(authenticate);

router.get('/steps', async (req, res, next) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const activity = await DailyActivity.findOne({ user: req.userId, day: { $gte: start, $lt: end } });
    res.json(activity || { steps: 0, sleepHours: 0 });
  } catch (error) {
    next(error);
  }
});

router.put('/steps', async (req, res, next) => {
  try {
    const { steps, sleepHours, restingHeartRate } = req.body;
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const updates = {};
    if (steps !== undefined) updates.steps = steps;
    if (sleepHours !== undefined) updates.sleepHours = sleepHours;
    if (restingHeartRate !== undefined) updates.restingHeartRate = restingHeartRate;
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'Provide at least one activity metric.' });
    const activity = await DailyActivity.findOneAndUpdate(
      { user: req.userId, day },
      { $set: updates, $setOnInsert: { user: req.userId, day } },
      { new: true, upsert: true, runValidators: true },
    );
    if (activity.steps !== undefined) {
      await Goal.updateMany(
        { user: req.userId, category: 'Steps' },
        { $set: { current: activity.steps } },
      );
    }
    return res.json(activity);
  } catch (error) {
    return next(error);
  }
});

router.get('/workouts', async (req, res, next) => {
  try {
    res.json(await Workout.find({ user: req.userId }).sort({ date: -1 }).limit(200));
  } catch (error) {
    next(error);
  }
});

router.post('/workouts', async (req, res, next) => {
  try {
    const workout = await Workout.create({ ...req.body, user: req.userId });
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const weeklyCount = await Workout.countDocuments({
      user: req.userId,
      date: { $gte: start, $lt: end },
    });
    await Goal.updateMany(
      { user: req.userId, category: 'Workouts' },
      { $set: { current: weeklyCount } },
    );
    res.status(201).json(workout);
  } catch (error) {
    next(error);
  }
});

router.delete('/workouts/:id', async (req, res, next) => {
  try {
    const workout = await Workout.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!workout) return res.status(404).json({ message: 'Workout not found.' });
    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/meals', async (req, res, next) => {
  try {
    res.json(await Meal.find({ user: req.userId }).sort({ date: -1 }).limit(200));
  } catch (error) {
    next(error);
  }
});

router.post('/meals', async (req, res, next) => {
  try {
    const meal = await Meal.create({ ...req.body, user: req.userId });
    res.status(201).json(meal);
  } catch (error) {
    next(error);
  }
});

router.delete('/meals/:id', async (req, res, next) => {
  try {
    const meal = await Meal.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!meal) return res.status(404).json({ message: 'Meal not found.' });
    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/goals', async (req, res, next) => {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const [activity, weeklyWorkouts] = await Promise.all([
      DailyActivity.findOne({ user: req.userId, day: { $gte: dayStart, $lt: dayEnd } }),
      Workout.countDocuments({ user: req.userId, date: { $gte: weekStart, $lt: weekEnd } }),
    ]);
    await Promise.all([
      Goal.updateMany({ user: req.userId, category: 'Steps' }, { $set: { current: activity?.steps || 0 } }),
      Goal.updateMany({ user: req.userId, category: 'Workouts' }, { $set: { current: weeklyWorkouts } }),
    ]);
    res.json(await Goal.find({ user: req.userId }).sort({ createdAt: 1 }));
  } catch (error) {
    next(error);
  }
});

router.post('/goals', async (req, res, next) => {
  try {
    let current = req.body.current;
    if (req.body.category === 'Steps') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const activity = await DailyActivity.findOne({ user: req.userId, day: { $gte: start, $lt: end } });
      current = activity?.steps || 0;
    } else if (req.body.category === 'Workouts') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      current = await Workout.countDocuments({ user: req.userId, date: { $gte: start, $lt: end } });
    }
    const goal = await Goal.create({ ...req.body, current, user: req.userId });
    res.status(201).json(goal);
  } catch (error) {
    next(error);
  }
});

router.patch('/goals/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'category', 'target', 'current', 'unit', 'dueDate'];
    const changes = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowed.includes(key)),
    );
    if (!Object.keys(changes).length) return res.status(400).json({ message: 'No valid goal changes were provided.' });
    const goal = await Goal.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      changes,
      { new: true, runValidators: true },
    );
    if (!goal) return res.status(404).json({ message: 'Goal not found.' });
    return res.json(goal);
  } catch (error) {
    return next(error);
  }
});

router.delete('/goals/:id', async (req, res, next) => {
  try {
    const goal = await Goal.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!goal) return res.status(404).json({ message: 'Goal not found.' });
    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const parsedOffset = Number.parseInt(req.query.weekOffset, 10);
    const weekOffset = Number.isFinite(parsedOffset) ? Math.min(0, Math.max(-52, parsedOffset)) : 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + weekOffset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const [workouts, activity, weekWorkoutCount] = await Promise.all([
      Workout.find({ user: req.userId, date: { $gte: start, $lt: end } }),
      DailyActivity.find({ user: req.userId, day: { $gte: start, $lt: end } }),
      Workout.countDocuments({ user: req.userId, date: { $gte: start, $lt: end } }),
    ]);
    const week = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const dateKey = date.toDateString();
      return {
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        steps: activity.find((entry) => new Date(entry.day).toDateString() === dateKey)?.steps || 0,
        calories: workouts
          .filter((workout) => new Date(workout.date).toDateString() === dateKey)
          .reduce((sum, workout) => sum + workout.calories, 0),
      };
    });
    res.json({ week, weekOffset, weekStart: start, weekWorkoutCount });
  } catch (error) {
    next(error);
  }
});

export default router;
