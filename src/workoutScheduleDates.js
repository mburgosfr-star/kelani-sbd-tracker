const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LEGACY_DATE_PATTERN = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
}

export function parseWorkoutDateKey(value) {
  if (!value) return null;

  if (value instanceof Date || typeof value === 'number') {
    return localDateKey(value);
  }

  const text = String(value).trim();
  const dateKeyMatch = text.match(DATE_KEY_PATTERN);
  if (dateKeyMatch) {
    const [, year, month, day] = dateKeyMatch;
    const candidate = new Date(Number(year), Number(month) - 1, Number(day));
    return (
      candidate.getFullYear() === Number(year) &&
      candidate.getMonth() === Number(month) - 1 &&
      candidate.getDate() === Number(day)
    ) ? text : null;
  }

  // Older Kelani history stored Dutch local dates such as 30-9-2026.
  const legacyMatch = text.match(LEGACY_DATE_PATTERN);
  if (legacyMatch) {
    const [, day, month, year] = legacyMatch;
    const candidate = new Date(Number(year), Number(month) - 1, Number(day));
    return (
      candidate.getFullYear() === Number(year) &&
      candidate.getMonth() === Number(month) - 1 &&
      candidate.getDate() === Number(day)
    )
      ? `${year}-${padDatePart(month)}-${padDatePart(day)}`
      : null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : localDateKey(parsed);
}

export function addLocalDays(dateKey, days) {
  const match = String(dateKey || '').match(DATE_KEY_PATTERN);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() + Number(days || 0));
  return localDateKey(date);
}

function completionDateKey(entry) {
  return parseWorkoutDateKey(
    entry?.completedAt ||
    entry?.workoutSnapshot?.completedAt ||
    entry?.timestamp ||
    entry?.date ||
    entry?.completedDate
  );
}

export function getLatestWorkoutCompletionDateKey({ history = [], workouts = [] } = {}) {
  const keys = [
    ...(history || [])
      .filter(entry => !entry?.seedMax)
      .map(completionDateKey),
    ...(workouts || [])
      .filter(workout => workout?.completed || workout?.completedAt)
      .map(completionDateKey),
  ].filter(Boolean);

  return keys.length ? keys.sort().at(-1) : null;
}

export function getNextWorkoutDateKey({ history = [], workouts = [], today = new Date() } = {}) {
  const todayKey = parseWorkoutDateKey(today);
  if (!todayKey) return null;

  const latestCompletionDate = getLatestWorkoutCompletionDateKey({ history, workouts });
  return latestCompletionDate && latestCompletionDate >= todayKey
    ? addLocalDays(latestCompletionDate, 1)
    : todayKey;
}

export function buildWorkoutScheduleDateKeys({
  workouts = [],
  currentIndex = 0,
  history = [],
  today = new Date(),
} = {}) {
  const safeCurrentIndex = Math.max(0, Number(currentIndex) || 0);
  const nextWorkoutDate = getNextWorkoutDateKey({ history, workouts, today });

  return (workouts || []).map((workout, index) => {
    const completedDate = completionDateKey(workout);
    if (workout?.completed && completedDate) return completedDate;
    if (index < safeCurrentIndex) return completedDate;

    return addLocalDays(nextWorkoutDate, index - safeCurrentIndex);
  });
}

export function workoutScheduleLocale(language) {
  if (language === 'nl') return 'nl-NL';
  if (language === 'ca') return 'ca-ES';
  return 'en-US';
}

function capitalizeFirst(value) {
  const text = String(value || '');
  return text ? `${text.charAt(0).toLocaleUpperCase()}${text.slice(1)}` : text;
}

export function formatWorkoutScheduleDate(dateKey, {
  language = 'en',
  today = new Date(),
  todayLabel = 'today',
  tomorrowLabel = 'tomorrow',
  compact = false,
} = {}) {
  const parsedKey = parseWorkoutDateKey(dateKey);
  const todayKey = parseWorkoutDateKey(today);
  if (!parsedKey || !todayKey) return '';

  const date = new Date(`${parsedKey}T12:00:00`);
  const absoluteLabel = new Intl.DateTimeFormat(workoutScheduleLocale(language), {
    weekday: compact ? 'short' : undefined,
    day: 'numeric',
    month: compact ? 'short' : 'long',
  }).format(date);

  if (parsedKey === todayKey) {
    return `${capitalizeFirst(todayLabel)} · ${absoluteLabel}`;
  }
  if (parsedKey === addLocalDays(todayKey, 1)) {
    return `${capitalizeFirst(tomorrowLabel)} · ${absoluteLabel}`;
  }

  return capitalizeFirst(absoluteLabel);
}

export function getMeetProjectionDateKeys({
  projectionLabel,
  currentCycle,
  currentWorkoutNumber,
  currentWorkoutDate,
} = {}) {
  const baseDate = parseWorkoutDateKey(currentWorkoutDate);
  const baseWorkoutNumber = Number(currentWorkoutNumber);
  if (!baseDate || !Number.isFinite(baseWorkoutNumber)) return [];

  const matches = [...String(projectionLabel || '').matchAll(/C(\d+)W(\d+)/gi)];
  return matches
    .map(match => ({ cycle: Number(match[1]), workoutNumber: Number(match[2]) }))
    .filter(target => (
      target.cycle === Number(currentCycle) &&
      Number.isFinite(target.workoutNumber) &&
      target.workoutNumber >= baseWorkoutNumber
    ))
    .map(target => addLocalDays(baseDate, target.workoutNumber - baseWorkoutNumber))
    .filter(Boolean);
}

export function formatWorkoutScheduleDateRange(dateKeys = [], { language = 'en' } = {}) {
  const validKeys = [...new Set((dateKeys || []).map(parseWorkoutDateKey).filter(Boolean))];
  if (!validKeys.length) return '';

  const dates = validKeys.map(dateKey => new Date(`${dateKey}T12:00:00`));
  const crossesYear = dates.some(date => date.getFullYear() !== dates[0].getFullYear());
  const formatter = new Intl.DateTimeFormat(workoutScheduleLocale(language), {
    day: 'numeric',
    month: 'long',
    year: crossesYear ? 'numeric' : undefined,
  });

  if (dates.length === 1) return capitalizeFirst(formatter.format(dates[0]));
  if (typeof formatter.formatRange === 'function') {
    return capitalizeFirst(formatter.formatRange(dates[0], dates.at(-1)));
  }
  return `${capitalizeFirst(formatter.format(dates[0]))} – ${capitalizeFirst(formatter.format(dates.at(-1)))}`;
}
