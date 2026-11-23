# FitFlow

FitFlow is a fitness and wellness tracker built with MongoDB, Express, React, and Node.js. The dashboard brings together workouts, nutrition, daily activity, goals, and progress.

## Requirements

- Node.js 20+
- MongoDB running locally, or a MongoDB connection string

## Run locally

1. Install dependencies from the project root:

   ```bash
   npm install
   ```

2. Create `server/.env` from `server/.env.example`. For local MongoDB and Compass, the example URI is `mongodb://127.0.0.1:27017/fitflow`. Set `JWT_SECRET` to a random secret of at least 32 characters.
3. Start the API and React development server:

   ```bash
   npm run dev
   ```

   The frontend runs at `http://localhost:5173` and the API at `http://localhost:5000`. Open the frontend and create an account or sign in.

4. Create a production frontend build with `npm run build`. Start the API with `npm start`.

FitFlow requires an account. Passwords are hashed before storage, and each workout, meal, goal, and daily activity record is associated with its account. In MongoDB Compass, connect to the URI above and inspect the `fitflow` database collections.

## API

- `GET /api/health` — API and database health
- `POST /api/auth/register` — create an account and receive a session token
- `POST /api/auth/login` — sign in
- `GET|PATCH /api/auth/me` — read or update the signed-in profile
- `GET|PUT /api/steps` — read or update today's steps and optional sleep/heart-rate metrics
- `GET|POST|DELETE /api/workouts` — list, log, or delete workouts
- `GET|POST|DELETE /api/meals` — list, log, or delete meals
- `GET|POST /api/goals` — list or create goals
- `PATCH|DELETE /api/goals/:id` — update progress or delete a goal
- `GET /api/summary?weekOffset=0` — signed-in user's weekly activity chart data

All endpoints except health, register, and login require a bearer token. Workout types: Running, Cycling, Strength, Yoga, Swimming, Walking, Other. Meal categories: Breakfast, Lunch, Dinner, Snack. Goal categories: Steps, Workouts, Calories, Sleep, Other.
