import { buildCycleReview } from './cycleReview';
import { formatWeightFromKg, formatEstimatedWeightFromKg, formatDecimalDisplay } from './workoutUnits';

export const KELANI_DOWNLOAD_URL = 'https://github.com/mburgosfr-star/kelani-sbd-tracker';
const colors = { Squat: '#ff5c45', Bench: '#ff8a3d', Deadlift: '#ffd166' };
const success = set => set.done && !set.failed && !set.skipped && Number(set.weight) > 0 && Number(set.reps) > 0;

// Explicit allowlist: no names, body measurements, dates, notes or backup data.
export function buildAchievementCard({ kind = 'about', workout, celebration, history = [], cycle = 1, t, weightUnit = 'kg' }) {
  const label = lift => ({ Squat: t.squat, Bench: t.bench, Deadlift: t.deadlift, Total: t.total })[lift] || '';
  const weight = value => formatWeightFromKg(value, weightUnit);
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
        const format = item.type === 'e1RM' ? formatEstimatedWeightFromKg : formatWeightFromKg;
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
  return { title, subtitle, rows, footer: t.shareCardFooter, downloadLabel: t.shareDownload, url: KELANI_DOWNLOAD_URL };
}

export function achievementShareText(card) {
  return `${card.title}\n${card.downloadLabel}: ${card.url}`;
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
  const general = !card.rows.length;
  const titleLines = lines(card.title, general ? 62 : 56);
  const subtitleLines = lines(card.subtitle, 30);
  const measuredRows = card.rows.map(row => ({ ...row, labels: lines(row.label, 30), values: lines(row.value, 38) }));
  const introBottom = 295 + titleLines.length * 70 + 20 + subtitleLines.length * 42 + 50;
  const rowsHeight = measuredRows.reduce((sum, row) => sum + row.labels.length * 40 + row.values.length * 50 + 28, 0);
  canvas.height = general ? 1080 : Math.max(1080, introBottom + rowsHeight + 220);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 1080, canvas.height);
  const text = (value, x, y, size, color = '#fff4e6', align = 'left') => {
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px sans-serif`;
    ctx.fillText(value, x, y, 920);
  };
  if (general) {
    ctx.drawImage(logo, 420, 70, 240, 240);
    text('Kelani SBD Tracker', 540, 377, 44, '#fff4e6', 'center');
    let y = 495;
    titleLines.forEach(line => { text(line, 540, y, 62, '#ff8a3d', 'center'); y += 74; });
    y += 18;
    subtitleLines.forEach(line => { text(line, 540, y, 30, '#ffd166', 'center'); y += 42; });
    y += 55;
    lines(card.footer, 34, 820).forEach(line => { text(line, 540, y, 34, '#ddd4ca', 'center'); y += 48; });
  } else {
    ctx.drawImage(logo, 72, 62, 144, 144);
    text('Kelani SBD Tracker', 250, 151, 42);
    let y = 295;
    titleLines.forEach(line => { text(line, 80, y, 56, '#ff8a3d'); y += 70; });
    y += 20;
    subtitleLines.forEach(line => { text(line, 80, y, 30, '#ccc4bb'); y += 42; });
    y += 50;
    measuredRows.forEach(row => {
      row.labels.forEach(line => { text(line, 80, y, 30, row.color); y += 40; });
      row.values.forEach(line => { text(line, 80, y, 38); y += 50; });
      y += 28;
    });
  }
  const footerY = canvas.height - 170;
  ctx.fillStyle = '#ff8a3d';
  ctx.fillRect(440, footerY, 200, 4);
  text(card.downloadLabel, 540, footerY + 72, 32, '#ff8a3d', 'center');
  text(card.url.replace('https://', ''), 540, footerY + 123, 25, '#ccc4bb', 'center');
  return canvas.toDataURL('image/png');
}
