import { buildCycleReview } from './cycleReview';
import { formatWeightFromKg, formatEstimatedWeightFromKg, formatDecimalDisplay } from './workoutUnits';

export const KELANI_DOWNLOAD_URL = 'https://github.com/mburgosfr-star/kelani-sbd-tracker';
const colors = { Squat: '#ff5c45', Bench: '#ff8a3d', Deadlift: '#ffd166' };
const success = set => set.done && !set.failed && !set.skipped && Number(set.weight) > 0 && Number(set.reps) > 0;

// Explicit allowlist: no names, body measurements, dates, notes or backup data.
export function buildAchievementCard({ kind = 'about', workout, celebration, history = [], cycle = 1, athleteLevel, workoutNumber, t, weightUnit = 'kg' }) {
  const label = lift => ({ Squat: t.squat, Bench: t.bench, Deadlift: t.deadlift, Total: t.total })[lift] || '';
  const weight = value => formatWeightFromKg(value, weightUnit, { recorded: true });
  const rows = [];
  const add = (name, value, color = '#fff4e6') => rows.push({ label: name, value, color });
  let title = t.shareAboutTitle;
  let subtitle = t.shareAboutSubtitle;
  if (kind === 'milestone') {
    title = t.milestoneStrengthTitle;
    subtitle = t.shareMilestoneSubtitle;
    for (const item of celebration?.achievements || []) {
      if (item.type === 'level') {
        add(t.milestoneNewLevel, ({ beginner: t.athleteLevelBeginner, intermediate: t.athleteLevelIntermediate, advanced: t.athleteLevelAdvanced, elite: t.athleteLevelElite })[item.value] || '', '#ffd166');
      } else if (['oneRM', 'e1RM'].includes(item.type) && Number(item.value) > 0) {
        const format = formatEstimatedWeightFromKg;
        add(`${label(item.lift)} ${item.type === 'oneRM' ? '1RM' : 'e1RM'}`, `${format(item.value, weightUnit)} (+${format(item.gain, weightUnit)})`, colors[item.lift]);
      }
      else if (['strengthMax', 'eStrengthMax'].includes(item.type) && Number(item.value) > 0) {
        add(item.type === 'strengthMax' ? t.strengthMax : t.eStrengthMax,
          `${formatDecimalDisplay(item.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x (+${formatDecimalDisplay(item.gain, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, '#ffd166');
      }
    }
  } else if (kind === 'cycle') {
    const review = buildCycleReview(history, cycle);
    title = t.cycleCompleted;
    subtitle = `${t.cycle} ${cycle}`;
    add(t.cycleReviewTrainingDays, String(review.trainingDays));
    add(t.cycleReviewRestDays, String(review.restDays));
    review.lifts.filter(item => item.oneRM > 0).forEach(item => {
      add(`${label(item.lift)} 1RM`, `${weight(item.oneRM)}${item.oneRMGain > 0 ? ` (+${weight(item.oneRMGain)})` : ''}`, colors[item.lift]);
    });
  } else if (kind === 'rest' || workout?.type === 'rest') {
    title = t.restDayCompleted;
    subtitle = t.shareRestSubtitle;
  } else if (kind === 'workout' || kind === 'meet') {
    title = kind === 'meet' ? t.meetCompleted : t.workoutCompleted;
    subtitle = kind === 'meet' ? t.shareMeetSubtitle : t.shareCompletedSubtitle;
    const blocks = (workout?.lifts || (workout?.lift ? [{ lift: workout.lift, sets: workout.sets }] : [])).filter(block => ['Squat', 'Bench', 'Deadlift'].includes(block.lift));
    let total = 0;
    const validMeetLifts = new Set();
    for (const block of blocks) {
      const sets = (block.sets || []).filter(success);
      if (!sets.length || !label(block.lift)) continue;
      if (kind === 'meet') {
        const best = Math.max(...sets.map(set => Number(set.weight)));
        add(label(block.lift), weight(best), colors[block.lift]);
        total += best;
        validMeetLifts.add(block.lift);
      } else {
        const groups = new Map();
        sets.forEach(set => {
          const key = `${set.reps} × ${weight(set.weight)}`;
          groups.set(key, (groups.get(key) || 0) + 1);
        });
        add(label(block.lift), [...groups].map(([value, count]) => `${count} × ${value}`).join(' · '), colors[block.lift]);
      }
    }
    if (kind === 'meet' && ['Squat', 'Bench', 'Deadlift'].every(lift => validMeetLifts.has(lift))) add(t.total, weight(total), '#ffd166');
  }
  const levelLabel = ({ beginner: t.athleteLevelBeginner, intermediate: t.athleteLevelIntermediate,
    advanced: t.athleteLevelAdvanced, elite: t.athleteLevelElite })[athleteLevel];
  const positiveInteger = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
  const number = workout?.number ?? workoutNumber;
  const context = [
    levelLabel,
    positiveInteger(cycle) ? `${t.cycle} ${Number(cycle)}` : null,
    positiveInteger(number) ? `${t.workout} ${Number(number)}` : null,
  ].filter(Boolean);
  return { title, subtitle, context, rows, footer: t.shareCardFooter, downloadLabel: t.shareDownload, url: KELANI_DOWNLOAD_URL };
}

export function achievementShareText(card) {
  return `${card.downloadLabel}: ${card.url}`;
}

// App-owned logo and explicit result fields only. All line heights are measured first.
export async function renderAchievementCard(card) {
  await document.fonts?.ready;
  const logo = new Image();
  const loaded = new Promise((resolve, reject) => { logo.onload = resolve; logo.onerror = reject; });
  logo.src = '/icons/icon-512.webp';
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  function lines(value, size, width = 920) {
    ctx.font = `700 ${size}px sans-serif`;
    const result = [];
    let line = '';
    for (const word of String(value).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) { result.push(line); line = word; }
      else line = next;
    }
    if (line) result.push(line);
    return result;
  }
  // Keep a full-size card. Distribute spare height between content sections,
  // never into a detached footer. The download link travels as separate text.
  const drawings = [];
  let y = 28 + 180 + 40;
  let section = 0;
  function nextSection(gap) { section += 1; y += gap; }
  function paragraph(value, size, lineHeight, color = '#fff4e6', width = 920) {
    for (const line of lines(value, size, width)) {
      drawings.push({ value: line, y: y + size, size, color, section });
      y += lineHeight;
    }
  }
  paragraph('Kelani SBD Tracker', 48, 58);
  nextSection(56);
  paragraph(card.title, 68, 82, '#ff8a3d');
  y += 20;
  paragraph(card.subtitle, 44, 56, '#ccc4bb');
  const context = card.context || [];
  if (context.length) {
    nextSection(48);
    paragraph(context[0], 44, 56, '#ffd166');
    if (context.length > 1) paragraph(context.slice(1).join(' · '), 44, 56, '#ffd166');
  }
  if (card.rows.length) {
    nextSection(56);
    card.rows.forEach((row, index) => {
      if (index) y += 40;
      paragraph(row.label, 44, 56, row.color);
      paragraph(row.value, 52, 66);
    });
  } else {
    nextSection(56);
    paragraph(card.footer, 44, 56, '#ddd4ca', 880);
  }
  canvas.height = Math.max(1080, y + 48);
  const sectionSpacing = section ? (canvas.height - y - 48) / section : 0;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 1080, canvas.height);
  ctx.drawImage(logo, 450, 28, 180, 180);
  for (const item of drawings) {
    ctx.textAlign = 'center';
    ctx.fillStyle = item.color;
    ctx.font = `700 ${item.size}px sans-serif`;
    ctx.fillText(item.value, 540, item.y + item.section * sectionSpacing, 920);
  }
  return canvas.toDataURL('image/png');
}
