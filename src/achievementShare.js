import { buildCycleReview } from './cycleReview';
import { formatWeightFromKg, formatEstimatedWeightFromKg, formatDecimalDisplay } from './workoutUnits';

export const KELANI_DOWNLOAD_URL = 'https://github.com/mburgosfr-star/kelani-sbd-tracker';
const colors = { Squat: '#ff5c45', Bench: '#ff8a3d', Deadlift: '#ffd166' };
const success = set => set.done && !set.failed && !set.skipped && Number(set.weight) > 0 && Number(set.reps) > 0;

// Explicit allowlist: no names, body measurements, dates, notes or backup data.
export function buildAchievementCard({ kind = 'about', workout, celebration, history = [], cycle = 1, athleteLevel, workoutNumber, dashboard, t, weightUnit = 'kg' }) {
  const label = lift => ({ Squat: t.squat, Bench: t.bench, Deadlift: t.deadlift, Total: t.total })[lift] || '';
  const weight = value => formatWeightFromKg(value, weightUnit, { recorded: true });
  const rows = [];
  const add = (name, value, color = '#fff4e6') => rows.push({ label: name, value, color });
  let dashboardSummary;
  if (kind === 'about') {
    // Copy only the same displayed lift metrics as Dashboard. Never copy
    // the source object, personal fields, or body measurements to a card.
    const value = number => Number.isFinite(Number(number)) && Number(number) > 0
      ? formatEstimatedWeightFromKg(Number(number), weightUnit) : t.cycleReviewUnavailable;
    dashboardSummary = {
      columns: [t.oneRM, t.e1RM],
      tiles: ['Squat', 'Bench', 'Deadlift', 'Total'].map(lift => {
        const metrics = lift === 'Total' ? dashboard?.total : dashboard?.lifts?.[lift];
        return { label: label(lift), color: colors[lift] || '#c62828',
          values: [value(metrics?.oneRM), value(metrics?.e1RM)] };
      }),
    };
  }
  let cycleSummary;
  let title = kind === 'about' ? t.dashboard : t.shareAboutTitle;
  let subtitle = kind === 'about' ? '' : t.shareAboutSubtitle;
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
    subtitle = '';
    const gain = value => value == null ? t.cycleReviewUnavailable
      : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatEstimatedWeightFromKg(Math.abs(value), weightUnit)}`;
    const result = (value, estimated = false) => value == null ? t.cycleReviewUnavailable
      : (estimated ? formatEstimatedWeightFromKg(value, weightUnit) : weight(value));
    cycleSummary = {
      stats: [{ label: t.cycleReviewTrainingDays, value: String(review.trainingDays) },
        { label: t.cycleReviewRestDays, value: String(review.restDays) }],
      title: t.cycleReviewResults, comparison: t.cycleReviewComparison,
      columns: [t.oneRM, t.e1RM],
      lifts: review.lifts.map(item => ({ label: label(item.lift), color: colors[item.lift],
        values: [result(item.oneRM), result(item.e1rm, true)],
        gains: [gain(item.oneRMGain), gain(item.e1RMGain)],
        gainColors: [item.oneRMGain, item.e1RMGain].map(value => value > 0 ? '#2ecc71' : value < 0 ? '#ff5c45' : '#bdb5ad'),
        sinceStart: gain(item.sinceStartGain), sinceStartColor: item.sinceStartGain > 0 ? '#2ecc71' : item.sinceStartGain < 0 ? '#ff5c45' : '#bdb5ad',
      })),
      meet: review.meetTotal == null ? null : { label: t.cycleReviewMeetTotal, value: weight(review.meetTotal) },
      progressTitle: t.cycleReviewSinceStart,
      total: review.total == null ? null : `${weight(review.total)} (${gain(review.totalGain)})`,
      chartLabel: t.cycleReviewChartLabel,
      points: (review.points.length <= 7 ? review.points : [review.points[0], ...review.points.slice(-6)])
        .map(point => ({ value: point.total, label: point.cycle === 0 ? t.cycleReviewBaseline : String(point.cycle), weight: weight(point.total) })),
    };
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
  return { title, subtitle, context, rows, ...(dashboardSummary ? { dashboardSummary } : {}), ...(cycleSummary ? { cycleSummary } : {}), footer: t.shareCardFooter, downloadLabel: t.shareDownload, url: KELANI_DOWNLOAD_URL };
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
  // Shared visual language with the result screens: colored lift names,
  // readable values, restrained panels and the same cycle-review evidence.
  const textColor = '#fff4e6';
  const muted = '#bdb5ad';
  const orange = '#ff8a3d';
  const commands = [];
  let y = 40;
  function text(value, x, top, size, color = textColor, width = 920) {
    const wrapped = lines(value, size, width);
    commands.push(() => {
      ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = `700 ${size}px sans-serif`;
      wrapped.forEach((line, index) => ctx.fillText(line, x, top + size + index * size * 1.3));
    });
    return wrapped.length * size * 1.3;
  }
  function panel(top, height) {
    commands.push(() => {
      ctx.fillStyle = '#111111'; ctx.fillRect(40, top, 1000, height);
      ctx.fillStyle = '#493321'; ctx.fillRect(40, top, 1000, 2);
    });
  }
  commands.push(() => ctx.drawImage(logo, 460, 40, 160, 160));
  y = 216;
  y += text('Kelani SBD Tracker', 540, y, 42);
  y += 30;
  y += text(card.title, 540, y, 64, orange);
  if (card.subtitle) { y += 10; y += text(card.subtitle, 540, y, 36, muted); }
  if (card.context?.length) { y += 24; y += text(card.context.join(' · '), 540, y, 36, '#ffd166'); }
  y += 36;
  if (card.dashboardSummary) {
    const dashboard = card.dashboardSummary;
    const tileWidth = 478;
    const tileHeight = 294;
    dashboard.tiles.forEach((tile, index) => {
      const x = 50 + (index % 2) * 502;
      const top = y + Math.floor(index / 2) * (tileHeight + 28);
      // Black dashboard quadrants, lift-colored rules and generous internal
      // spacing. No marketing block displacing the user's actual results.
      commands.push(() => {
        ctx.fillStyle = tile.color; ctx.fillRect(x, top, tileWidth, 4);
      });
      text(tile.label, x + tileWidth / 2, top + 26, 50, tile.color, tileWidth - 32);
      dashboard.columns.forEach((column, row) => {
        const rowTop = top + 118 + row * 82;
        text(column, x + 78, rowTop + 6, 34, muted, 140);
        const value = tile.values[row];
        let size = 52;
        ctx.font = `700 ${size}px sans-serif`;
        while (size > 28 && ctx.measureText(value).width > 290) {
          size -= 2; ctx.font = `700 ${size}px sans-serif`;
        }
        text(value, x + 318, rowTop, size, tile.color, 292);
      });
    });
    y += tileHeight * 2 + 28;
  } else if (card.cycleSummary) {
    const review = card.cycleSummary;
    const statHeight = Math.max(...review.stats.map(stat => lines(stat.label, 32, 420).length)) * 42 + 106;
    panel(y, statHeight);
    review.stats.forEach((stat, index) => {
      const x = 290 + index * 500;
      text(stat.value, x, y + 12, 64, orange, 420);
      text(stat.label, x, y + 98, 32, textColor, 420);
    });
    y += statHeight + 28;
    const top = y;
    // Reserve measured header space before laying out the results table.
    const headingHeight = lines(review.title, 42).length * 55;
    const comparisonHeight = lines(review.comparison, 28).length * 37;
    const bodyHeight = 54 + review.lifts.length * 126 + (review.meet ? 80 : 0);
    panel(top, 40 + headingHeight + comparisonHeight + bodyHeight);
    y += 20;
    y += text(review.title, 540, y, 42, orange);
    y += text(review.comparison, 540, y, 28, muted) + 18;
    review.columns.forEach((column, index) => text(column, 540 + index * 320, y, 34, muted, 290));
    y += 54;
    review.lifts.forEach(lift => {
      text(lift.label, 220, y + 12, 36, lift.color, 280);
      lift.values.forEach((value, index) => {
        const x = 540 + index * 320;
        text(value, x, y, 38, textColor, 290);
        text(lift.gains[index], x, y + 56, 30, lift.gainColors[index], 290);
      });
      y += 126;
    });
    if (review.meet) y += text(`${review.meet.label}: ${review.meet.value}`, 540, y, 36, orange);
    y = top + 40 + headingHeight + comparisonHeight + bodyHeight + 28;
    const progressTop = y;
    const progressTitleHeight = lines(review.progressTitle, 40).length * 52;
    const chartHeight = review.points.length ? 240 : 0;
    panel(y, 40 + progressTitleHeight + 110 + (review.total ? 64 : 0) + chartHeight);
    y += 20;
    y += text(review.progressTitle, 540, y, 40, orange);
    review.lifts.forEach((lift, index) => {
      const x = 210 + index * 330;
      text(lift.label, x, y + 10, 32, lift.color, 300);
      text(lift.sinceStart, x, y + 60, 34, lift.sinceStartColor, 300);
    });
    y += 110;
    if (review.total) y += text(review.total, 540, y, 40);
    if (review.points.length) {
      const chartTop = y;
      const values = review.points.map(point => point.value);
      const min = Math.min(...values);
      const range = Math.max(Math.max(...values) - min, 10);
      const points = review.points.map((point, index) => ({ ...point,
        x: review.points.length === 1 ? 540 : 170 + index * 740 / (review.points.length - 1),
        y: chartTop + 150 - (point.value - min) / range * 90,
      }));
      commands.push(() => {
        ctx.strokeStyle = orange; ctx.lineWidth = 5; ctx.beginPath();
        points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        ctx.stroke();
        points.forEach(point => { ctx.fillStyle = orange; ctx.beginPath(); ctx.arc(point.x, point.y, 7, 0, Math.PI * 2); ctx.fill(); });
      });
      points.forEach((point, index) => {
        text(point.label, point.x, chartTop + 185, 26, muted, 145);
        if (index === 0 || index === points.length - 1) text(point.weight, point.x, point.y - 46, 28, textColor, 260);
      });
    }
    y = progressTop + 40 + progressTitleHeight + 110 + (review.total ? 64 : 0) + chartHeight;
  } else if (card.rows.length) {
    const contentHeights = card.rows.map(row => 44 + lines(row.label, 40).length * 52 + lines(row.value, 48, 880).length * 63);
    const extra = Math.max(0, 1080 - y - 40 - contentHeights.reduce((sum, height) => sum + height + 24, 0)) / card.rows.length;
    card.rows.forEach((row, index) => {
      const labelHeight = lines(row.label, 40).length * 52;
      const valueHeight = lines(row.value, 48, 880).length * 63;
      const height = contentHeights[index] + extra;
      panel(y, height);
      const inset = (height - labelHeight - valueHeight) / 2;
      text(row.label, 540, y + inset, 40, row.color);
      text(row.value, 540, y + inset + labelHeight, 48, textColor, 880);
      y += height + 24;
    });
  } else {
    const textHeight = lines(card.footer, 46, 840).length * 60;
    const height = Math.max(textHeight + 100, 1080 - y - 40);
    panel(y, height);
    text(card.footer, 540, y + (height - textHeight) / 2, 46, textColor, 840);
    y += height;
  }
  canvas.height = Math.max(1080, Math.ceil(y + 40));
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 1080, canvas.height);
  commands.forEach(draw => draw());
  return canvas.toDataURL('image/png');
}
