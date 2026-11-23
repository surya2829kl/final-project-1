import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, Bell, Bike, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, Clock3, Dumbbell, Flame, Footprints, LayoutDashboard,
  Leaf, LogOut, Menu, Plus, Salad, Search, Settings, Sparkles, Target, TrendingUp,
  Waves, X, Zap,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const TOKEN_KEY = 'fitflow-token';
const EMPTY_DATA = { workouts: [], meals: [], goals: [], steps: 0, week: [], weekWorkoutCount: 0 };
const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Activity', icon: Activity },
  { label: 'Nutrition', icon: Salad },
  { label: 'Goals', icon: Target },
  { label: 'Progress', icon: TrendingUp },
];

async function request(path, options = {}, token = localStorage.getItem(TOKEN_KEY)) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(result.message || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'FF';
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [data, setData] = useState(EMPTY_DATA);
  const [authLoading, setAuthLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const [connectionError, setConnectionError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [activePage, setActivePage] = useState('Overview');
  const [modal, setModal] = useState('');
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [stepsInput, setStepsInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const searchRef = useRef(null);

  function notify(message, error = false) {
    setToast(message);
    setToastError(error);
  }

  useEffect(() => {
    if (!token) {
      setAuthLoading(false);
      setUser(null);
      setData(EMPTY_DATA);
      setConnectionError('');
      return undefined;
    }

    let active = true;
    setAuthLoading(true);
    setConnectionError('');
    async function loadAccount() {
      try {
        const profile = await request('/auth/me', {}, token);
        if (!active) return;
        setUser(profile);
        const [workouts, meals, goals, activity] = await Promise.all([
          request('/workouts', {}, token),
          request('/meals', {}, token),
          request('/goals', {}, token),
          request('/steps', {}, token),
        ]);
        if (!active) return;
        setUser(profile);
        setData((current) => ({
          ...current,
          workouts,
          meals,
          goals,
          steps: activity.steps || 0,
        }));
        setConnectionError('');
      } catch (error) {
        if (!active) return;
        if (error.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
          setData(EMPTY_DATA);
          setConnectionError('');
        } else {
          setConnectionError(error.message);
          notify('Could not reach your account data. Check the backend and retry.', true);
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    }
    loadAccount();
    return () => { active = false; };
  }, [token, retryCount]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    request(`/summary?weekOffset=${weekOffset}`, {}, token)
      .then((summary) => {
      if (active) setData((current) => ({ ...current, week: summary.week, weekWorkoutCount: summary.weekWorkoutCount }));
      })
      .catch((error) => {
      if (active) {
        setConnectionError(error.message);
        notify('Could not load progress data. Check the backend and retry.', true);
      }
      });
    return () => { active = false; };
  }, [token, weekOffset]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') setModal('');
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const today = new Date().toDateString();
  const todaysMeals = useMemo(() => data.meals.filter((meal) => new Date(meal.date).toDateString() === today), [data.meals, today]);
  const todaysWorkouts = useMemo(() => data.workouts.filter((workout) => new Date(workout.date).toDateString() === today), [data.workouts, today]);
  const consumed = todaysMeals.reduce((total, meal) => total + Number(meal.calories || 0), 0);
  const protein = todaysMeals.reduce((total, meal) => total + Number(meal.protein || 0), 0);
  const burned = todaysWorkouts.reduce((total, workout) => total + Number(workout.calories || 0), 0);

  async function saveWorkout(payload) {
    setSaving(true);
    try {
      const workout = await request('/workouts', { method: 'POST', body: JSON.stringify(payload) });
      setData((current) => ({
        ...current,
        workouts: [workout, ...current.workouts],
        goals: current.goals.map((goal) => goal.category === 'Workouts'
          ? { ...goal, current: Number(goal.current) + (weekOffset === 0 ? 1 : 0) }
          : goal),
        week: weekOffset === 0
          ? current.week.map((day) => day.day === new Date().toLocaleDateString('en-US', { weekday: 'short' })
            ? { ...day, calories: day.calories + Number(workout.calories) }
            : day)
          : current.week,
        weekWorkoutCount: current.weekWorkoutCount + (weekOffset === 0 ? 1 : 0),
      }));
      setModal('');
      notify('Workout saved to MongoDB.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      setSaving(false);
    }
  }

  async function saveMeal(payload) {
    setSaving(true);
    try {
      const meal = await request('/meals', { method: 'POST', body: JSON.stringify(payload) });
      setData((current) => ({ ...current, meals: [meal, ...current.meals] }));
      setModal('');
      notify('Meal saved to MongoDB.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      setSaving(false);
    }
  }

  async function saveGoal(payload) {
    setSaving(true);
    try {
      const goal = await request('/goals', { method: 'POST', body: JSON.stringify(payload) });
      setData((current) => ({ ...current, goals: [...current.goals, goal] }));
      setModal('');
      notify('Goal saved to MongoDB.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      setSaving(false);
    }
  }

  async function saveProgress(goal, currentValue) {
    setSaving(true);
    try {
      const updated = await request(`/goals/${goal._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ current: Number(currentValue) }),
      });
      setData((current) => ({
        ...current,
        goals: current.goals.map((entry) => entry._id === updated._id ? updated : entry),
      }));
      setModal('');
      notify('Goal progress updated.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      setSaving(false);
    }
  }

  async function addSteps(event) {
    event.preventDefault();
    const amount = Number(stepsInput);
    if (!Number.isFinite(amount) || amount < 1) {
      notify('Enter a positive number of steps.', true);
      return;
    }
    try {
      const activity = await request('/steps', {
        method: 'PUT',
        body: JSON.stringify({ steps: data.steps + Math.round(amount) }),
      });
      setData((current) => ({
        ...current,
        steps: activity.steps,
        goals: current.goals.map((goal) => goal.category === 'Steps' ? { ...goal, current: activity.steps } : goal),
        week: weekOffset === 0
          ? current.week.map((day) => day.day === new Date().toLocaleDateString('en-US', { weekday: 'short' })
            ? { ...day, steps: activity.steps }
            : day)
          : current.week,
      }));
      setStepsInput('');
      notify('Steps saved to MongoDB.');
    } catch (error) {
      notify(error.message, true);
    }
  }

  async function deleteRecord(type, record) {
    const title = type === 'workouts' ? 'workout' : type === 'meals' ? 'meal' : 'goal';
    if (!window.confirm(`Delete this ${title}? This cannot be undone.`)) return;
    try {
      await request(`/${type}/${record._id}`, { method: 'DELETE' });
      const key = type;
      setData((current) => ({ ...current, [key]: current[key].filter((item) => item._id !== record._id) }));
      notify(`${title[0].toUpperCase()}${title.slice(1)} deleted.`);
    } catch (error) {
      notify(error.message, true);
    }
  }

  async function saveProfile(name) {
    setSaving(true);
    try {
      const profile = await request('/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) });
      setUser(profile);
      notify('Profile saved.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      setSaving(false);
    }
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setData(EMPTY_DATA);
    setActivePage('Overview');
    setModal('');
    setConnectionError('');
    notify('You have been signed out.');
  }

  function completeAuthentication(result) {
    localStorage.setItem(TOKEN_KEY, result.token);
    setUser(result.user);
    setToken(result.token);
    setConnectionError('');
    setActivePage('Overview');
    setWeekOffset(0);
    notify('You’re signed in. Your data is saved to MongoDB.');
  }

  function runSearch(event) {
    event.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    const sections = [
      ['Activity', data.workouts.some((item) => `${item.type} ${item.note || ''}`.toLowerCase().includes(query))],
      ['Nutrition', data.meals.some((item) => `${item.name} ${item.category}`.toLowerCase().includes(query))],
      ['Goals', data.goals.some((item) => `${item.name} ${item.category}`.toLowerCase().includes(query))],
    ];
    const match = sections.find(([, found]) => found);
    if (!match) {
      notify(`No records found for “${searchQuery.trim()}”.`);
      return;
    }
    setActivePage(match[0]);
    setMobileNav(false);
  }

  if (authLoading) {
    return <div className="auth-loading"><div className="brand-mark"><Activity size={20} /></div><span>Connecting to your account…</span></div>;
  }
  if (!token) return <AuthPage onAuthenticated={completeAuthentication} />;
  if (!user) {
    return <ConnectionErrorPage
      message={connectionError || 'Your account could not be reached.'}
      onRetry={() => setRetryCount((count) => count + 1)}
      onSignOut={signOut}
    />;
  }

  const openPage = (page) => {
    setActivePage(page);
    setMobileNav(false);
  };
  const initialsText = initials(user.name);
  const latestNotifications = [
    ...data.workouts.map((item) => ({ ...item, title: `${item.type} workout`, detail: `${item.duration} min · ${item.calories} kcal`, time: item.date })),
    ...data.meals.map((item) => ({ ...item, title: item.name, detail: `${item.calories} kcal · ${item.category}`, time: item.date })),
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 5);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.6} /></div><span>fitflow<span className="brand-dot">.</span></span></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="profile-switch" onClick={() => openPage('Settings')}>
          <div className="avatar">{initialsText}</div><span className="profile-copy"><b>{user.name}</b><small>{user.email}</small></span><ChevronDown size={16} />
        </button>
        <div className="nav-label">MENU</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${activePage === label ? 'active' : ''}`} onClick={() => openPage(label)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Activity' && <span className="nav-count">{data.workouts.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="coach-card"><div className="coach-icon"><Sparkles size={16} /></div><b>A little goes a long way</b><p>Your activity is private to your account and saved in MongoDB.</p><button onClick={() => openPage('Progress')}>View your progress <ArrowRight size={14} /></button></div>
          <button className={`nav-item ${activePage === 'Settings' ? 'active' : ''}`} onClick={() => openPage('Settings')}><Settings size={18} /><span>Settings</span></button>
          <button className={`nav-item ${activePage === 'Help' ? 'active' : ''}`} onClick={() => openPage('Help')}><CircleHelp size={18} /><span>Help & support</span></button>
          <button className="sidebar-footer" onClick={signOut} title="Sign out" aria-label="Sign out">
            <span className="footer-avatar">{initialsText}</span><span className="footer-user"><b>{user.name}</b><small>Sign out</small></span><LogOut size={15} />
          </button>
        </div>
      </aside>
      {mobileNav && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumb">Workspace <ChevronRight size={14} /> <b>{activePage}</b></div></div>
          <div className="topbar-actions">
            <form className="search-box" onSubmit={runSearch}><Search size={16} /><input ref={searchRef} aria-label="Search your records" placeholder="Search workouts, meals, goals..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /><kbd>⌘ K</kbd></form>
            <button className="icon-button notification-button" aria-label="Recent activity" title="Recent activity" onClick={() => setModal('notifications')}><Bell size={18} /></button>
            <button className="top-avatar top-avatar-button" aria-label="Open settings" onClick={() => openPage('Settings')}>{initialsText}</button>
          </div>
        </header>
        <div className="page-content">
          {connectionError && <div className="connection-error" role="alert"><span>{connectionError}</span><button onClick={() => setRetryCount((count) => count + 1)}>Retry</button></div>}
          {activePage === 'Overview' && <Overview data={data} user={user} setModal={setModal} onAddSteps={addSteps} stepsInput={stepsInput} setStepsInput={setStepsInput} consumed={consumed} protein={protein} burned={burned} weekOffset={weekOffset} setWeekOffset={setWeekOffset} onNavigate={openPage} onDeleteWorkout={(workout) => deleteRecord('workouts', workout)} />}
          {activePage === 'Activity' && <ActivityPage workouts={data.workouts} setModal={setModal} onDelete={(workout) => deleteRecord('workouts', workout)} query={searchQuery} />}
          {activePage === 'Nutrition' && <NutritionPage meals={data.meals} setModal={setModal} onDelete={(meal) => deleteRecord('meals', meal)} query={searchQuery} />}
          {activePage === 'Goals' && <GoalsPage goals={data.goals} setModal={setModal} onProgress={(goal) => setModal({ type: 'progress', goal })} onDelete={(goal) => deleteRecord('goals', goal)} query={searchQuery} />}
          {activePage === 'Progress' && <ProgressPage data={data} steps={data.steps} goals={data.goals} weekOffset={weekOffset} setWeekOffset={setWeekOffset} />}
          {activePage === 'Settings' && <SettingsPage user={user} onSave={saveProfile} onSignOut={signOut} saving={saving} />}
          {activePage === 'Help' && <HelpPage onNavigate={openPage} />}
          <footer className="page-footer"><span>© {new Date().getFullYear()} FitFlow. Your data belongs to you.</span><span className={`connection-status ${connectionError ? '' : 'connected'}`}><i />{connectionError ? 'Connection issue' : 'Connected to MongoDB'}</span></footer>
        </div>
      </main>
      {typeof modal === 'string' && ['workout', 'meal', 'goal'].includes(modal) && <LogModal type={modal} onClose={() => setModal('')} onWorkout={saveWorkout} onMeal={saveMeal} onGoal={saveGoal} saving={saving} />}
      {typeof modal === 'object' && modal?.type === 'progress' && <ProgressModal goal={modal.goal} onClose={() => setModal('')} onSave={saveProgress} saving={saving} />}
      {modal === 'notifications' && <NotificationsModal items={latestNotifications} onClose={() => setModal('')} />}
      {toast && <div className={`toast ${toastError ? 'toast-error' : ''}`} role="status">{toastError ? <X size={17} /> : <Check size={17} />}{toast}</div>}
    </div>
  );
}

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await request(`/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        body: JSON.stringify(form),
      }, null);
      onAuthenticated(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <div className="auth-decoration auth-decoration-one" /><div className="auth-decoration auth-decoration-two" />
    <section className="auth-card">
      <div className="brand auth-brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.6} /></div><span>fitflow<span className="brand-dot">.</span></span></div>
      <div className="auth-eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'A FRESH START'}</div>
      <h1>{mode === 'login' ? 'Your wellness, in rhythm.' : 'Make room for progress.'}</h1>
      <p className="auth-description">{mode === 'login' ? 'Sign in to pick up where you left off.' : 'Create your account and start tracking your wellbeing.'}</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <form className="auth-form" onSubmit={submit}>
        {mode === 'register' && <label>Your name<input name="name" type="text" autoComplete="name" placeholder="Jordan Davis" minLength="2" maxLength="60" required /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" minLength="8" maxLength="72" required /></label>
        <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={16} /></button>
      </form>
      <div className="auth-switch">{mode === 'login' ? 'New to FitFlow?' : 'Already have an account?'} <button onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></div>
      <div className="auth-privacy"><Check size={14} />Your personal health data is saved to your MongoDB account.</div>
    </section>
  </main>;
}

function ConnectionErrorPage({ message, onRetry, onSignOut }) {
  return <main className="auth-page">
    <section className="auth-card connection-error-card">
      <div className="brand auth-brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.6} /></div><span>fitflow<span className="brand-dot">.</span></span></div>
      <div className="auth-eyebrow">ACCOUNT CONNECTION</div>
      <h1>We can’t reach your account.</h1>
      <p className="auth-description">{message}</p>
      <div className="connection-error-actions"><button className="primary-button" onClick={onRetry}>Retry connection</button><button className="secondary-button" onClick={onSignOut}>Sign out</button></div>
    </section>
  </main>;
}

function PageHeading({ eyebrow, title, description, button, onClick }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{button && <button className="primary-button" onClick={onClick}><Plus size={17} />{button}</button>}</div>;
}

function Overview({ data, user, setModal, onAddSteps, stepsInput, setStepsInput, consumed, protein, burned, weekOffset, setWeekOffset, onNavigate, onDeleteWorkout }) {
  const steps = data.steps;
  const stepPercent = Math.min(steps / 10000 * 100, 100);
  const goalCalories = 2200;
  const caloriePercent = Math.min(consumed / goalCalories * 100, 100);
  const recent = [...data.workouts].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
  const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
  const avgSteps = data.week.length ? Math.round(data.week.reduce((sum, day) => sum + day.steps, 0) / data.week.length) : 0;
  const avgCalories = data.week.length ? Math.round(data.week.reduce((sum, day) => sum + day.calories, 0) / data.week.length) : 0;
  const weekLabel = weekOffset === 0 ? 'This week' : `${Math.abs(weekOffset)} week${Math.abs(weekOffset) === 1 ? '' : 's'} ago`;
  const workoutGoal = data.goals.find((goal) => goal.category === 'Workouts');
  const stepGoal = data.goals.find((goal) => goal.category === 'Steps');
  return <>
    <PageHeading eyebrow={todayLabel} title={<>Your wellness,<br className="mobile-break" /> in rhythm<span className="title-period">.</span></>} description="A little progress each day adds up to big results." button="Log activity" onClick={() => setModal('workout')} />
    <div className="welcome-strip"><div className="welcome-icon"><Sparkles size={18} /></div><div><b>Welcome back, {user.name.split(' ')[0]}.</b><span>{data.workouts.length ? `You have logged ${data.workouts.length} workout${data.workouts.length === 1 ? '' : 's'} so far.` : 'Log your first activity and start building your routine.'}</span></div><button onClick={() => setModal('workout')}>Log a workout <ArrowRight size={15} /></button></div>
    <section className="stats-grid">
      <StatCard label="Steps today" value={steps.toLocaleString()} unit={`/ ${Number(stepGoal?.target || 10000).toLocaleString()}`} icon={Footprints} color="green" delta={`${Math.round(stepPercent)}%`} deltaLabel="of your daily target" positive />
      <StatCard label="Calories burned" value={burned.toLocaleString()} unit="kcal today" icon={Flame} color="orange" delta={`${todaysWorkoutMinutes(data.workouts)} min`} deltaLabel="active time today" />
      <StatCard label="Meals logged" value={todaysMealsCount(data.meals)} unit="today" icon={Salad} color="purple" delta={`${consumed.toLocaleString()} kcal`} deltaLabel="consumed today" />
      <StatCard label="Workouts" value={`${data.workouts.length}`} unit="all time" icon={Dumbbell} color="blue" delta={`${data.weekWorkoutCount} this week`} deltaLabel={workoutGoal ? `${workoutGoal.target} per week goal` : 'keep moving'} />
    </section>
    <section className="dashboard-grid">
      <div className="panel activity-panel">
        <div className="panel-heading"><div><h2>Your activity</h2><p>Steps and calories recorded in your account.</p></div><button className="select-button" onClick={() => setWeekOffset(0)}>{weekLabel}<ChevronDown size={15} /></button></div>
        <div className="chart-legend"><span><i className="legend-green" />Steps</span><span><i className="legend-orange" />Calories burned</span><button aria-label="Previous week" title="Previous week" onClick={() => setWeekOffset((offset) => Math.max(-52, offset - 1))}><ChevronLeft size={16} /></button><button aria-label="Next week" title="Next week" onClick={() => setWeekOffset((offset) => Math.min(0, offset + 1))} disabled={weekOffset === 0}><ChevronRight size={16} /></button></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.week} margin={{ top: 10, right: 2, left: -24, bottom: 0 }}>
          <defs><linearGradient id="stepsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#73b99b" stopOpacity={0.22} /><stop offset="96%" stopColor="#73b99b" stopOpacity={0.01} /></linearGradient><linearGradient id="caloriesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5a982" stopOpacity={0.15} /><stop offset="96%" stopColor="#f5a982" stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#eef0ec" strokeDasharray="3 4" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#9a9f99', fontSize: 11, fontFamily: 'DM Sans' }} tickMargin={12} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9a9f99', fontSize: 10, fontFamily: 'DM Sans' }} tickFormatter={(value) => `${value / 1000}k`} domain={[0, 10000]} ticks={[0, 2500, 5000, 7500, 10000]} allowDecimals={false} /><Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="steps" stroke="#559c7b" strokeWidth={2.5} fill="url(#stepsFill)" activeDot={{ r: 4, strokeWidth: 0 }} /><Area type="monotone" dataKey="calories" stroke="#efa277" strokeWidth={2} fill="url(#caloriesFill)" activeDot={{ r: 4, strokeWidth: 0 }} />
        </AreaChart></ResponsiveContainer></div>
        <div className="chart-summary"><div><span className="summary-dot green-dot" /><span>Avg. daily steps</span><b>{avgSteps.toLocaleString()} <small>steps</small></b></div><div><span className="summary-dot orange-dot" /><span>Avg. calories burned</span><b>{avgCalories.toLocaleString()} <small>kcal</small></b></div><span className="trend-note"><ArrowUpRight size={14} />{weekLabel}</span></div>
      </div>
      <div className="panel goals-panel">
        <div className="panel-heading"><div><h2>Daily goals</h2><p>Small wins make a big difference.</p></div><button className="more-button" onClick={() => setModal('goal')} aria-label="Create goal">+</button></div>
        {stepGoal && <GoalProgress label={stepGoal.name} current={steps} target={stepGoal.target} unit={stepGoal.unit} color="#62a586" icon={Footprints} />}
        {workoutGoal && <GoalProgress label={workoutGoal.name} current={workoutGoal.current} target={workoutGoal.target} unit={workoutGoal.unit} color="#a28bc7" icon={Dumbbell} />}
        {data.goals.length === 0 && <EmptyState icon={Target} title="No goals yet" text="Add a goal to keep yourself motivated." />}
        <button className="text-button goals-link" onClick={() => onNavigate('Goals')}>View all goals <ArrowRight size={14} /></button>
      </div>
    </section>
    <section className="lower-grid">
      <div className="panel recent-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Your effort is adding up.</p></div><button className="text-button" onClick={() => onNavigate('Activity')}>View all <ArrowRight size={14} /></button></div>
        {recent.length ? <div className="activity-list">{recent.map((workout) => <WorkoutRow key={workout._id} workout={workout} onDelete={onDeleteWorkout} />)}</div> : <EmptyState icon={Dumbbell} title="Your next workout starts here" text="Log your first activity to see it here." />}
      </div>
      <div className="panel nutrition-panel"><div className="panel-heading"><div><h2>Nutrition today</h2><p>Nourish to flourish.</p></div><button className="more-button" onClick={() => setModal('meal')} aria-label="Log a meal"><Plus size={17} /></button></div>
        <div className="nutrition-overview"><div className="calorie-ring" style={{ '--progress': `${caloriePercent * 3.6}deg` }}><div><b>{consumed.toLocaleString()}</b><span>kcal eaten</span></div></div><div className="nutrition-meta"><b>{Math.max(goalCalories - consumed, 0).toLocaleString()} <small>kcal left</small></b><span>Daily target: {goalCalories.toLocaleString()}</span><div className="nutrition-bar"><i style={{ width: `${caloriePercent}%` }} /></div><button className="text-button" onClick={() => onNavigate('Nutrition')}>See food log <ArrowRight size={14} /></button></div></div>
      </div>
    </section>
    <section className="bottom-grid">
      <div className="panel steps-panel"><div className="panel-heading"><div><h2>Step tracker</h2><p>Every step moves you forward.</p></div><div className="steps-icon"><Footprints size={17} /></div></div><div className="steps-number"><b>{steps.toLocaleString()}</b><span>steps today</span></div><div className="step-track"><i style={{ width: `${stepPercent}%` }} /></div><div className="step-footer"><span>{Math.max(Number(stepGoal?.target || 10000) - steps, 0).toLocaleString()} to daily goal</span><b>{Math.round(stepPercent)}%</b></div><form className="quick-step-form" onSubmit={onAddSteps}><input aria-label="Steps to add" type="number" min="1" placeholder="Add steps" value={stepsInput} onChange={(event) => setStepsInput(event.target.value)} /><button type="submit"><Plus size={15} />Add</button></form></div>
      <div className="tip-card"><div className="tip-top"><div className="tip-icon"><Leaf size={17} /></div><span>YOUR DAILY RESET</span><Sparkles size={17} /></div><h3>Rest is part of<br />the routine.</h3><p>Your body gets stronger while it recovers. Make room for a little downtime today.</p><div className="tip-footer"><span>Wellness help & support</span><button aria-label="Read wellness tips" onClick={() => onNavigate('Help')}><ArrowRight size={17} /></button></div></div>
    </section>
  </>;
}

function todaysWorkoutMinutes(workouts) {
  const today = new Date().toDateString();
  return workouts.filter((workout) => new Date(workout.date).toDateString() === today).reduce((sum, workout) => sum + Number(workout.duration), 0);
}

function todaysMealsCount(meals) {
  const today = new Date().toDateString();
  return meals.filter((meal) => new Date(meal.date).toDateString() === today).length;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><b>{label}</b>{payload.map((item) => <span key={item.dataKey} style={{ color: item.color }}><i />{item.dataKey === 'steps' ? `${item.value.toLocaleString()} steps` : `${item.value} kcal`}</span>)}</div>;
}

function StatCard({ label, value, unit, icon: Icon, color, delta, deltaLabel, positive }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className={`stat-icon ${color}`}><Icon size={18} strokeWidth={1.9} /></div></div><div className="stat-value">{value}<small>{unit}</small></div><div className="stat-foot"><span className={positive ? 'stat-positive' : 'stat-neutral'}>{positive && <ArrowUpRight size={14} />}{delta}</span><span>{deltaLabel}</span></div></div>;
}

function GoalProgress({ label, current, target, unit, color, icon: Icon }) {
  const percent = Math.min(Number(current) / Number(target) * 100, 100) || 0;
  return <div className="goal-progress"><div className="goal-row"><div className="goal-label"><span style={{ color, backgroundColor: `${color}18` }}><Icon size={15} /></span><b>{label}</b></div><span>{Number(current).toLocaleString()} <small>/ {Number(target).toLocaleString()} {unit}</small></span></div><div className="goal-track"><i style={{ width: `${percent}%`, background: color }} /></div></div>;
}

function WorkoutRow({ workout, onDelete }) {
  const config = {
    Running: { Icon: Activity, color: 'run' }, Cycling: { Icon: Bike, color: 'cycle' },
    Strength: { Icon: Dumbbell, color: 'strength' }, Yoga: { Icon: Waves, color: 'yoga' },
    Swimming: { Icon: Waves, color: 'cycle' }, Walking: { Icon: Footprints, color: 'run' },
  }[workout.type] || { Icon: Activity, color: 'run' };
  const { Icon, color } = config;
  const date = new Date(workout.date);
  const isToday = date.toDateString() === new Date().toDateString();
  return <div className="workout-row"><div className={`workout-icon ${color}`}><Icon size={17} /></div><div className="workout-info"><b>{workout.type}{workout.note ? ` · ${workout.note}` : ''}</b><span>{isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span></div><div className="workout-stats"><b>{workout.duration} <small>min</small></b><span>{workout.calories} kcal</span></div>{onDelete && <button className="row-delete" aria-label={`Delete ${workout.type} workout`} title="Delete workout" onClick={() => onDelete(workout)}><X size={15} /></button>}</div>;
}

function ActivityPage({ workouts, setModal, onDelete, query }) {
  const filtered = workouts.filter((workout) => `${workout.type} ${workout.note || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <><PageHeading eyebrow="YOUR MOVEMENT" title={<>Activity<span className="title-period">.</span></>} description="Every workout is a promise you keep to yourself." button="Log workout" onClick={() => setModal('workout')} /><div className="page-summary-cards"><StatCard label="Total sessions" value={workouts.length} unit="workouts" icon={Dumbbell} color="green" delta="Saved sessions" deltaLabel="in your account" /><StatCard label="Time moving" value={workouts.reduce((total, workout) => total + Number(workout.duration), 0)} unit="minutes" icon={Clock3} color="purple" delta="Active minutes" deltaLabel="all time" /><StatCard label="Energy used" value={workouts.reduce((total, workout) => total + Number(workout.calories), 0).toLocaleString()} unit="kcal" icon={Flame} color="orange" delta="Total burn" deltaLabel="all time" /></div><div className="panel full-list-panel"><div className="panel-heading"><div><h2>All workouts</h2><p>Your activity history, one session at a time.</p></div><span className="list-count">{filtered.length} sessions</span></div><div className="activity-list">{[...filtered].sort((a, b) => new Date(b.date) - new Date(a.date)).map((workout) => <WorkoutRow key={workout._id} workout={workout} onDelete={onDelete} />)}</div>{!filtered.length && <EmptyState icon={Dumbbell} title={query ? 'No matching workouts' : 'Your next workout starts here'} text={query ? 'Try another search.' : 'Log your first activity and start building your routine.'} />}</div></>;
}

function NutritionPage({ meals, setModal, onDelete, query }) {
  const todayMeals = meals.filter((meal) => new Date(meal.date).toDateString() === new Date().toDateString());
  const filtered = meals.filter((meal) => `${meal.name} ${meal.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const calories = todayMeals.reduce((total, meal) => total + Number(meal.calories), 0);
  const protein = todayMeals.reduce((total, meal) => total + Number(meal.protein || 0), 0);
  return <><PageHeading eyebrow="FUEL YOUR DAY" title={<>Nutrition<span className="title-period">.</span></>} description="Good food is fuel for all the things you love to do." button="Log a meal" onClick={() => setModal('meal')} /><div className="page-summary-cards"><StatCard label="Calories today" value={calories.toLocaleString()} unit="/ 2,200 kcal" icon={Flame} color="orange" delta={`${Math.max(2200 - calories, 0)} left`} deltaLabel="daily target" /><StatCard label="Protein today" value={protein} unit="g" icon={Zap} color="purple" delta="Daily target" deltaLabel="120 g" /><StatCard label="Meals logged" value={todayMeals.length} unit="meals" icon={Salad} color="green" delta="Today" deltaLabel="in your account" /></div><div className="panel full-list-panel"><div className="panel-heading"><div><h2>Food log</h2><p>Your saved meals, newest first.</p></div><span className="list-count">{filtered.length} entries</span></div><div className="meal-list">{[...filtered].sort((a, b) => new Date(b.date) - new Date(a.date)).map((meal) => <MealRow key={meal._id} meal={meal} onDelete={onDelete} />)}</div>{!filtered.length && <EmptyState icon={Salad} title={query ? 'No matching meals' : 'Start with your next meal'} text={query ? 'Try another search.' : 'Keep track of what fuels your day.'} />}</div></>;
}

function MealRow({ meal, onDelete }) {
  const icons = { Breakfast: '☀', Lunch: '◉', Dinner: '☾', Snack: '✳' };
  return <div className="meal-row"><div className="meal-symbol">{icons[meal.category] || '◉'}</div><div className="meal-info"><b>{meal.name}</b><span>{meal.category} · {meal.protein || 0}g protein · {new Date(meal.date).toLocaleDateString()}</span></div><div className="meal-calories"><b>{meal.calories}</b><span>kcal</span></div><button className="row-delete" aria-label={`Delete ${meal.name}`} title="Delete meal" onClick={() => onDelete(meal)}><X size={15} /></button></div>;
}

function GoalsPage({ goals, setModal, onProgress, onDelete, query }) {
  const filtered = goals.filter((goal) => `${goal.name} ${goal.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <><PageHeading eyebrow="ONE STEP AT A TIME" title={<>Your goals<span className="title-period">.</span></>} description="Make your goals realistic, then show up for them." button="Create a goal" onClick={() => setModal('goal')} /><div className="goal-cards">{filtered.map((goal) => {
    const percent = Math.min(Number(goal.current) / Number(goal.target) * 100, 100) || 0;
    return <div className="panel goal-card" key={goal._id}><div className="goal-card-top"><div className="goal-card-icon"><Target size={19} /></div><span>{goal.category}</span></div><h3>{goal.name}</h3><div className="goal-card-value"><b>{Number(goal.current).toLocaleString()}</b><span>/ {Number(goal.target).toLocaleString()} {goal.unit}</span></div><div className="goal-track"><i style={{ width: `${percent}%` }} /></div><div className="goal-card-foot"><span>{Math.round(percent)}% complete</span><span>{Math.max(Number(goal.target) - Number(goal.current), 0).toLocaleString()} to go</span></div><div className="goal-card-actions"><button className="secondary-button" onClick={() => onProgress(goal)}>Update progress</button><button className="row-delete" aria-label={`Delete ${goal.name}`} title="Delete goal" onClick={() => onDelete(goal)}><X size={15} /></button></div></div>;
  })}</div>{!filtered.length && <div className="panel"><EmptyState icon={Target} title={query ? 'No matching goals' : 'Give yourself something to aim for'} text={query ? 'Try another search.' : 'Start with one small goal and build from there.'} /></div>}</>;
}

function ProgressPage({ data, steps, goals, weekOffset, setWeekOffset }) {
  const complete = goals.filter((goal) => Number(goal.current) >= Number(goal.target)).length;
  const activeDays = data.week.filter((day) => day.steps > 0 || day.calories > 0).length;
  const label = weekOffset === 0 ? 'This week' : `${Math.abs(weekOffset)} week${Math.abs(weekOffset) === 1 ? '' : 's'} ago`;
  return <><PageHeading eyebrow="LOOK HOW FAR YOU'VE COME" title={<>Progress<span className="title-period">.</span></>} description="Progress isn't always loud. Sometimes it looks like showing up." /><div className="page-summary-cards"><StatCard label="Steps today" value={steps.toLocaleString()} unit="steps" icon={Footprints} color="green" delta={`${Math.round(steps / 10000 * 100)}%`} deltaLabel="daily target" positive /><StatCard label="Goals completed" value={complete} unit={`of ${goals.length}`} icon={Check} color="purple" delta="Keep going" deltaLabel="at your own pace" /><StatCard label="Active days" value={activeDays} unit="this week" icon={Flame} color="orange" delta="Based on saved activity" deltaLabel="workouts and steps" /></div><div className="panel progress-panel"><div className="panel-heading"><div><h2>Your weekly rhythm</h2><p>Only activity saved to your account is shown.</p></div><div className="week-controls"><button className="icon-button" aria-label="Previous week" onClick={() => setWeekOffset((offset) => Math.max(-52, offset - 1))}><ChevronLeft size={16} /></button><span className="list-count">{label}</span><button className="icon-button" aria-label="Next week" disabled={weekOffset === 0} onClick={() => setWeekOffset((offset) => Math.min(0, offset + 1))}><ChevronRight size={16} /></button></div></div><div className="progress-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.week} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#73b99b" stopOpacity={0.22} /><stop offset="100%" stopColor="#73b99b" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef0ec" strokeDasharray="3 4" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#9a9f99', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9a9f99', fontSize: 11 }} tickFormatter={(value) => `${value / 1000}k`} domain={[0, (max) => Math.max(10000, Math.ceil(max / 2500) * 2500)]} tickCount={5} allowDecimals={false} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="steps" stroke="#559c7b" strokeWidth={2.5} fill="url(#progressFill)" /></AreaChart></ResponsiveContainer></div><div className="progress-insight"><div className="insight-icon"><Sparkles size={17} /></div><span><b>{activeDays ? `You showed up ${activeDays} day${activeDays === 1 ? '' : 's'} this week.` : 'Your next step starts your progress.'}</b> {activeDays ? 'Keep building a routine at your own pace.' : 'Log a workout or steps to see your progress here.'}</span></div></div></>;
}

function SettingsPage({ user, onSave, onSignOut, saving }) {
  const [name, setName] = useState(user.name);
  useEffect(() => setName(user.name), [user.name]);
  return <><PageHeading eyebrow="YOUR ACCOUNT" title={<>Settings<span className="title-period">.</span></>} description="Manage your profile and account access." /><section className="panel settings-panel"><div className="panel-heading"><div><h2>Profile information</h2><p>Your name is shown in your FitFlow workspace.</p></div><div className="goal-card-icon"><Settings size={18} /></div></div><form className="settings-form" onSubmit={(event) => { event.preventDefault(); onSave(name); }}><label>Full name<input value={name} onChange={(event) => setName(event.target.value)} minLength="2" maxLength="60" required /></label><label>Email address<input value={user.email} disabled /></label><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></form></section><section className="panel account-panel"><div><h2>Sign out</h2><p>This will end your session on this device. Your saved data stays in MongoDB.</p></div><button className="secondary-button" onClick={onSignOut}><LogOut size={15} />Sign out</button></section></>;
}

function HelpPage({ onNavigate }) {
  return <><PageHeading eyebrow="HERE FOR YOU" title={<>Help & support<span className="title-period">.</span></>} description="A few quick answers to help you get the most out of FitFlow." /><section className="help-grid"><article className="panel help-card"><div className="goal-card-icon"><Dumbbell size={18} /></div><h2>How do I log a workout?</h2><p>Open Activity and select “Log workout.” Your workout is stored in your MongoDB account and appears in your activity history.</p><button className="text-button" onClick={() => onNavigate('Activity')}>Go to Activity <ArrowRight size={14} /></button></article><article className="panel help-card"><div className="goal-card-icon"><Salad size={18} /></div><h2>How do I track food?</h2><p>Open Nutrition, choose “Log a meal,” then enter the meal type, calories, and protein if you know it.</p><button className="text-button" onClick={() => onNavigate('Nutrition')}>Go to Nutrition <ArrowRight size={14} /></button></article><article className="panel help-card"><div className="goal-card-icon"><Target size={18} /></div><h2>Where is my data stored?</h2><p>FitFlow saves your account, goals, workouts, steps, and meals in MongoDB. In Compass, open the fitflow database to inspect its collections.</p><button className="text-button" onClick={() => onNavigate('Settings')}>Account settings <ArrowRight size={14} /></button></article></section></>;
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><div><Icon size={23} /></div><b>{title}</b><span>{text}</span></div>;
}

function LogModal({ type, onClose, onWorkout, onMeal, onGoal, saving }) {
  const isMeal = type === 'meal';
  const isGoal = type === 'goal';
  const title = isGoal ? 'Create a goal' : isMeal ? 'Log a meal' : 'Log a workout';
  const submit = isGoal ? onGoal : isMeal ? onMeal : onWorkout;

  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    if (isGoal) payload.target = Number(payload.target);
    else {
      payload.calories = Number(payload.calories);
      if (isMeal) payload.protein = Number(payload.protein || 0);
      else payload.duration = Number(payload.duration);
    }
    submit(payload);
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><div className="eyebrow">{isGoal ? 'AIM FOR SOMETHING GOOD' : 'A MOMENT FOR YOU'}</div><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><form onSubmit={handleSubmit} className="modal-form">
    {isGoal ? <>
      <label>Goal name<input name="name" placeholder="e.g. Run my first 5K" required maxLength="100" /></label>
      <div className="form-row"><label>Category<select name="category"><option>Steps</option><option>Workouts</option><option>Calories</option><option>Sleep</option><option>Other</option></select></label><label>Target<input name="target" type="number" min="1" placeholder="10000" required /></label></div>
      <label>Unit<input name="unit" placeholder="steps, sessions, hours..." required maxLength="24" /></label>
    </> : isMeal ? <>
      <label>What did you have?<input name="name" placeholder="e.g. Avocado toast & eggs" required maxLength="100" /></label>
      <div className="form-row"><label>Meal<select name="category"><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snack</option></select></label><label>Calories<input name="calories" type="number" min="0" placeholder="420" required /></label></div>
      <label>Protein <span className="optional-label">(grams)</span><input name="protein" type="number" min="0" placeholder="Optional" /></label>
    </> : <>
      <label>Activity type<select name="type"><option>Running</option><option>Cycling</option><option>Strength</option><option>Yoga</option><option>Swimming</option><option>Walking</option><option>Other</option></select></label>
      <div className="form-row"><label>Duration <span className="optional-label">(minutes)</span><input name="duration" type="number" min="1" placeholder="30" required /></label><label>Calories burned<input name="calories" type="number" min="0" placeholder="250" required /></label></div>
      <label>Note <span className="optional-label">(optional)</span><input name="note" placeholder="How did it feel?" maxLength="240" /></label>
    </>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving...' : <><Plus size={16} />{isGoal ? 'Create goal' : isMeal ? 'Save meal' : 'Save workout'}</>}</button></div>
  </form></section></div>;
}

function ProgressModal({ goal, onClose, onSave, saving }) {
  const [current, setCurrent] = useState(goal.current);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="progress-title"><div className="modal-heading"><div><div className="eyebrow">KEEP YOUR MOMENTUM</div><h2 id="progress-title">Update progress</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSave(goal, current); }}><p className="progress-modal-description">{goal.name} · target {Number(goal.target).toLocaleString()} {goal.unit}</p><label>Current progress<input type="number" min="0" value={current} onChange={(event) => setCurrent(event.target.value)} required /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save progress'}</button></div></form></section></div>;
}

function NotificationsModal({ items, onClose }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="notifications-title"><div className="modal-heading"><div><div className="eyebrow">YOUR ACCOUNT</div><h2 id="notifications-title">Recent activity</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>{items.length ? <div className="notification-list">{items.map((item) => <div className="notification-item" key={`${item._id}-${item.title}`}><span className="notification-dot" /><div><b>{item.title}</b><span>{item.detail}</span></div><time>{new Date(item.time).toLocaleDateString()}</time></div>)}</div> : <EmptyState icon={Bell} title="Nothing new yet" text="Your saved workouts and meals will show here." />}<div className="modal-actions"><button className="primary-button" onClick={onClose}>Done</button></div></section></div>;
}

export default App;
