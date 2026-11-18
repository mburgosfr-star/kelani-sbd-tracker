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
  let title = kind === 'about' ? 'Kelani SBD Tracker' : t.shareAboutTitle;
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
  return { kind, title, subtitle, context, rows, ...(dashboardSummary ? { dashboardSummary } : {}), ...(cycleSummary ? { cycleSummary } : {}), ...(kind === 'rest' || workout?.type === 'rest' ? { restSummary: { message: t.restDayCompletedSaved } } : {}), footer: t.shareCardFooter, downloadLabel: t.shareDownload, url: KELANI_DOWNLOAD_URL };
}

export function achievementShareText(card) {
  return `${card.downloadLabel}: ${card.url}`;
}

// Render a compact counterpart of the app's screens. Layout is measured before
// drawing; no history object, UI screenshot or private field reaches the canvas.
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
  const ink = '#fff4e6', muted = '#bdb5ad', orange = '#ff8a3d';
  const commands = [];
  const left = 56, width = 968;
  function wrap(value, size, available = width, weight = 700) {
    ctx.font = `${weight} ${size}px sans-serif`;
    const result = [];
    for (const paragraph of String(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > available) { result.push(line); line = word; }
        else line = next;
      }
      if (line) result.push(line);
    }
    return result;
  }
  function text(value, x, top, size, color = ink, available = width, align = 'center', weight = 700) {
    const lines = wrap(value, size, available, weight);
    commands.push(() => {
      ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px sans-serif`;
      lines.forEach((line, index) => ctx.fillText(line, x, top + index * size * 1.25));
    });
    return lines.length * size * 1.25;
  }
  function rect(x, top, w, h, color) {
    commands.push(() => { ctx.fillStyle = color; ctx.fillRect(x, top, w, h); });
  }
  function panel(x, top, w) {
    rect(x, top, w, 1, '#493321');
  }
  function rule(top) {
    rect(left, top, width, 2, '#493321');
  }
  // The same compact brand/context header across every kind of shared result.
  commands.push(() => ctx.drawImage(logo, 484, 32, 112, 112));
  text('Kelani SBD Tracker', 540, 160, 44, ink, width);
  let y = 232;
  if (card.context?.length) y += text(card.context.join(' · '), 540, y, 34, '#ffd166') + 22;
  rule(y); y += 34;
  if (!card.dashboardSummary) {
    y += text(card.title, 540, y, 58, orange, width, 'center') + 12;
    if (card.subtitle) y += text(card.subtitle, 540, y, 34, muted, width, 'center') + 12;
    y += 16;
  }

  if (card.dashboardSummary) {
    // Same 2 x 2 lift/total structure and label/value alignment as Dashboard.
    const tileWidth = (width - 40) / 2;
    const valueWidth = tileWidth - 172;
    const valueSize = value => {
      let size = 54;
      ctx.font = `700 ${size}px sans-serif`;
      while (size > 42 && ctx.measureText(value).width > valueWidth) {
        size -= 2; ctx.font = `700 ${size}px sans-serif`;
      }
      return size;
    };
    const rowHeights = card.dashboardSummary.columns.map((_, row) => Math.max(78,
      ...card.dashboardSummary.tiles.map(tile => wrap(tile.values[row], valueSize(tile.values[row]), valueWidth).length * 68 + 14)));
    const tileHeight = 106 + rowHeights.reduce((sum, height) => sum + height, 0);
    card.dashboardSummary.tiles.forEach((tile, index) => {
      const x = left + index % 2 * (tileWidth + 40);
      const top = y + Math.floor(index / 2) * (tileHeight + 38);
      text(tile.label, x + tileWidth / 2, top, 54, tile.color, tileWidth);
      let rowTop = top + 100;
      card.dashboardSummary.columns.forEach((label, row) => {
        text(label, x + 72, rowTop + 4, 42, ink, 145);
        text(tile.values[row], x + tileWidth - valueWidth / 2, rowTop, valueSize(tile.values[row]), tile.color, valueWidth);
        rowTop += rowHeights[row];
      });
    });
    y += tileHeight * 2 + 38;
  } else if (card.cycleSummary) {
    const review = card.cycleSummary;
    const statWidth = (width - 24) / 2;
    const statHeight = 96 + Math.max(...review.stats.map(stat => wrap(stat.label, 34, statWidth - 40).length)) * 42.5;
    review.stats.forEach((stat, index) => {
      const x = left + index * (statWidth + 24);
      panel(x, y, statWidth);
      text(stat.value, x + statWidth / 2, y + 14, 64, orange, statWidth - 44);
      text(stat.label, x + statWidth / 2, y + 96, 34, muted, statWidth - 44);
    });
    y += statHeight + 30;
    y += text(review.title, 540, y, 38, orange) + 8;
    y += text(review.comparison, 540, y, 32, muted) + 20;
    const col = [210, 540, 870];
    review.columns.forEach((label, index) => text(label, col[index + 1], y, 36, muted, 300, 'center'));
    y += 58;
    review.lifts.forEach(lift => {
      const nameHeight = wrap(lift.label, 42, 230).length * 52.5;
      const valuesHeight = Math.max(...lift.values.map(value => wrap(value, 44, 300).length)) * 55;
      const gainHeight = Math.max(...lift.gains.map(value => wrap(value, 34, 300).length)) * 42.5;
      const rowHeight = Math.max(nameHeight, valuesHeight + gainHeight + 8) + 28;
      panel(left, y, width);
      text(lift.label, col[0], y + 16, 42, lift.color, 230);
      lift.values.forEach((value, index) => {
        text(value, col[index + 1], y + 14, 44, ink, 300, 'center');
        text(lift.gains[index], col[index + 1], y + 22 + valuesHeight, 34, lift.gainColors[index], 300, 'center');
      });
      y += rowHeight + 8;
    });
    if (review.meet) {
      y += 12;
      y += text(`${review.meet.label}: ${review.meet.value}`, 540, y, 34, orange) + 12;
    }
    y += 20;
    rule(y); y += 26;
    y += text(review.progressTitle, 540, y, 38, orange) + 18;
    const gainWidth = width / 3;
    const gainHeight = Math.max(...review.lifts.map(lift => wrap(lift.label, 34, gainWidth - 20).length)) * 42.5;
    review.lifts.forEach((lift, index) => {
      const x = left + (index + 0.5) * gainWidth;
      text(lift.label, x, y, 34, lift.color, gainWidth - 20);
      text(lift.sinceStart, x, y + gainHeight + 8, 32, lift.sinceStartColor, gainWidth - 20);
    });
    y += gainHeight + 70;
    if (review.total) y += text(review.total, 540, y, 38) + 16;
    if (review.points.length) {
      const chartTop = y + 12;
      const values = review.points.map(point => point.value);
      const min = Math.min(...values);
      const range = Math.max(Math.max(...values) - min, 10);
      const points = review.points.map((point, index) => ({ ...point,
        x: review.points.length === 1 ? 540 : 180 + index * 720 / (review.points.length - 1),
        y: chartTop + 160 - (point.value - min) / range * 100,
      }));
      [60, 110, 160].forEach(offset => rect(120, chartTop + offset, 840, 1, '#493321'));
      commands.push(() => {
        ctx.strokeStyle = orange; ctx.lineWidth = 5; ctx.beginPath();
        points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        ctx.stroke();
        points.forEach(point => { ctx.fillStyle = orange; ctx.beginPath(); ctx.arc(point.x, point.y, 7, 0, Math.PI * 2); ctx.fill(); });
      });
      points.forEach((point, index) => {
        text(point.label, point.x, chartTop + 186, 32, muted, 140, 'center');
        if (index === 0 || index === points.length - 1) text(point.weight, point.x, point.y - 42, 30, ink, 240, 'center');
      });
      y = chartTop + 238;
      y += text(review.chartLabel, 540, y, 30, muted) + 12;
    }
  } else if (card.rows.length) {
    // Use the completion screens' centered results, with no decorative boxes.
    const meetTotal = card.kind === 'meet' && card.rows.length === 4 ? card.rows.at(-1) : null;
    if (meetTotal) {
      y += text(meetTotal.label, 540, y, 38, muted, width, 'center') + 10;
      y += text(meetTotal.value, 540, y, 100, orange, width, 'center') + 36;
    }
    const rows = card.rows.filter(row => row !== meetTotal);
    if (card.kind === 'meet') {
      const columnWidth = width / rows.length;
      const labelHeight = Math.max(...rows.map(row => wrap(row.label, 42, columnWidth - 24).length)) * 52.5;
      const valueHeight = Math.max(...rows.map(row => wrap(row.value, 54, columnWidth - 24).length)) * 67.5;
      rows.forEach((row, index) => {
        const x = left + columnWidth * (index + 0.5);
        text(row.label, x, y, 42, row.color, columnWidth - 24, 'center');
        text(row.value, x, y + labelHeight + 12, 54, ink, columnWidth - 24, 'center');
      });
      y += labelHeight + valueHeight + 40;
    } else {
      rows.forEach((row, index) => {
        if (index) { rule(y); y += 32; }
        y += text(row.label, 540, y, 48, row.color, width - 40, 'center') + 14;
        const value = card.kind === 'workout' ? row.value.split(' · ').join('\n') : row.value;
        y += text(value, 540, y, 54, ink, width - 40, 'center') + 38;
      });
    }

  } else if (card.restSummary) {
    // Same confirmation and recovery message as the actual rest-day screen.
    const message = card.restSummary?.message || card.subtitle || card.title;
    const messageHeight = wrap(message, 38, width - 96).length * 47.5;
    const height = Math.max(380, messageHeight + 220);
    const iconY = y + 96;
    commands.push(() => {
      ctx.strokeStyle = orange; ctx.lineWidth = 6; ctx.beginPath();
      ctx.arc(540, iconY, 42, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(520, iconY); ctx.lineTo(535, iconY + 14);
      ctx.lineTo(563, iconY - 16); ctx.stroke();
    });
    text(message, 540, y + 188, 38, ink, width - 96, 'center');
    y += height;
  }
  canvas.height = Math.max(720, Math.ceil(y + 56));
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 1080, canvas.height);
  commands.forEach(draw => draw());
  return canvas.toDataURL('image/png');
}
