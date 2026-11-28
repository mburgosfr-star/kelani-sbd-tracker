import { buildCycleReview } from './cycleReview';
import { formatWeightFromKg, formatEstimatedWeightFromKg, formatDecimalDisplay } from './workoutUnits';

export const KELANI_DOWNLOAD_URL = 'https://github.com/mburgosfr-star/kelani-sbd-tracker';
const colors = { Squat: '#ff5c45', Bench: '#ff8a3d', Deadlift: '#ffd166' };
const success = set => set.done && !set.failed && !set.skipped && Number(set.weight) > 0 && Number(set.reps) > 0;

// Explicit allowlist: no names, body measurements, dates, notes or backup data.
export function buildAchievementCard({ kind = 'about', workout, celebration, history = [], cycle = 1, athleteLevel, workoutNumber, dashboard, dashboardRecentPrEvents, t, weightUnit = 'kg' }) {
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
    const record = (label, gain) => Number.isFinite(gain) && gain > 0
      ? { label, gain: `+${formatEstimatedWeightFromKg(gain, weightUnit)}` } : null;
    dashboardSummary = {
      columns: [t.oneRM, t.e1RM],
      tiles: ['Squat', 'Bench', 'Deadlift', 'Total'].map(lift => {
        const metrics = lift === 'Total' ? dashboard?.total : dashboard?.lifts?.[lift];
        const recent = lift === 'Total' ? dashboardRecentPrEvents?.total : dashboardRecentPrEvents?.lifts?.[lift];
        return { label: label(lift), color: colors[lift] || '#ff7970',
          values: [value(metrics?.oneRM), value(metrics?.e1RM)],
          records: [record(t.new1RMPR, recent?.oneRMGain), record(t.newE1RMPR, recent?.e1RMGain)] };
      }),
    };
  }
  let cycleSummary;
  let title = kind === 'about' ? 'Kelani SBD Tracker' : t.shareAboutTitle;
  let subtitle = kind === 'about' ? '' : t.shareAboutSubtitle;
  if (kind === 'milestone') {
    title = t.milestoneStrengthTitle;
    subtitle = '';
    const addResult = (label, value, gain, color = '#ffd166') => rows.push({ label, value, gain: `+${gain}`, color });
    for (const item of celebration?.achievements || []) {
      if (item.type === 'level') {
        add(t.milestoneNewLevel, ({ beginner: t.athleteLevelBeginner, intermediate: t.athleteLevelIntermediate, advanced: t.athleteLevelAdvanced, elite: t.athleteLevelElite })[item.value] || '', '#ffd166');
      } else if (['oneRM', 'e1RM'].includes(item.type) && Number(item.value) > 0) {
        const format = formatEstimatedWeightFromKg;
        addResult(`${label(item.lift)} ${item.type === 'oneRM' ? '1RM' : 'e1RM'}`,
          format(item.value, weightUnit), format(item.gain, weightUnit), colors[item.lift]);
      }
      else if (['strengthMax', 'eStrengthMax'].includes(item.type) && Number(item.value) > 0) {
        const format = value => formatDecimalDisplay(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        addResult(item.type === 'strengthMax' ? t.strengthMax : t.eStrengthMax,
          `${format(item.value)}x`, format(item.gain));
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
  function box(x, top, w, h, radius, fill, border) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, top, w, h, radius);
    else ctx.rect(x, top, w, h);
    ctx.fillStyle = fill;
    ctx.fill();
    if (border) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
  }
  const green = '#46e597';
  if (card.kind === 'milestone') {
    const center = canvas.width / 2;
    const contentLeft = 84;
    const contentWidth = canvas.width - contentLeft * 2;
    commands.push(() => {
      const glow = ctx.createRadialGradient(center, 36, 0, center, 36, 620);
      glow.addColorStop(0, '#43271a');
      glow.addColorStop(1, '#141110');
      box(24, 24, canvas.width - 48, canvas.height - 48, 40, glow, '#98603c');
      box(center - 65, 66, 130, 130, 38, '#322218', '#bd7645');
      // A rising arrow and confetti drawn at export resolution on every platform.
      ctx.beginPath();
      ctx.moveTo(center - 29, 151);
      ctx.lineTo(center + 25, 107);
      ctx.moveTo(center - 1, 107);
      ctx.lineTo(center + 25, 107);
      ctx.lineTo(center + 25, 133);
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#ffae70';
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      const confetti = [
        [-124, 105, 6, '#ffd166'], [-98, 161, 5, green], [-156, 153, 4, orange],
        [124, 103, 5, green], [101, 161, 6, '#ffd166'], [156, 151, 4, orange],
      ];
      confetti.forEach(([offset, top, radius, color]) => {
        ctx.beginPath();
        ctx.arc(center + offset, top, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    });

    let top = 222;
    top += text(card.title, center, top, 64, ink, contentWidth);
    if (card.context?.length) {
      top += 10 + text(card.context.join(' · '), center, top + 10, 36, '#dbc0aa', contentWidth);
    }
    top += 36;

    card.rows.forEach(row => {
      const labelWidth = 360, valueWidth = 410;
      const labelHeight = wrap(row.label, 43, labelWidth).length * 43 * 1.25;
      const valueHeight = wrap(row.value, 56, valueWidth).length * 56 * 1.25;
      const gainHeight = row.gain ? wrap(row.gain, 40, valueWidth).length * 40 * 1.25 : 0;
      const metricsHeight = valueHeight + gainHeight;
      const rowHeight = Math.max(labelHeight, metricsHeight) + 36;
      const rowTop = top;
      commands.push(() => {
        box(contentLeft, rowTop, contentWidth, rowHeight, 24, '#211a16', '#574134');
        box(contentLeft + 20, rowTop + (rowHeight - 44) / 2, 5, 44, 2.5, row.color);
      });
      text(row.label, contentLeft + 46, rowTop + (rowHeight - labelHeight) / 2, 43, ink, labelWidth, 'left');
      const valueX = contentLeft + contentWidth - 28;
      const valueTop = rowTop + (rowHeight - metricsHeight) / 2;
      text(row.value, valueX, valueTop, 56, ink, valueWidth, 'right');
      if (row.gain) text(row.gain, valueX, valueTop + valueHeight, 40, green, valueWidth, 'right');
      top += rowHeight + 14;
    });

    const brand = 'Kelani SBD Tracker';
    ctx.font = '700 38px sans-serif';
    const brandWidth = ctx.measureText(brand).width;
    const brandLeft = center - (58 + 14 + brandWidth) / 2;
    const brandTop = top + 12;
    commands.push(() => ctx.drawImage(logo, brandLeft, brandTop, 58, 58));
    text(brand, brandLeft + 72, brandTop + 9, 38, '#dbc0aa', contentWidth, 'left');
    canvas.height = Math.ceil(brandTop + 110);
    ctx.fillStyle = '#0b0908';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    commands.forEach(draw => draw());
    return canvas.toDataURL('image/png');
  }

  // The same compact brand/context header across the other shared results.
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
    const { columns, tiles } = card.dashboardSummary;
    const gap = 24, padding = 24, tileWidth = (width - gap) / 2;
    const innerWidth = tileWidth - padding * 2;
    const valueWidth = innerWidth - 116, gainWidth = 150, recordLabelWidth = innerWidth - gainWidth - 12;
    const lineHeight = (value, size, available) => wrap(value, size, available).length * size * 1.25;
    const recordHeight = record => record
      ? Math.max(lineHeight(record.label, 30, recordLabelWidth), lineHeight(record.gain, 30, gainWidth))
      : 0;
    for (let index = 0; index < tiles.length; index += 2) {
      const pair = tiles.slice(index, index + 2);
      const top = y;
      const headerHeight = Math.max(...pair.map(tile => lineHeight(tile.label, 55, innerWidth))) + 20;
      const valueHeights = columns.map((_, row) => Math.max(64,
        ...pair.map(tile => lineHeight(tile.values[row], 50, valueWidth))));
      const recordHeights = columns.map((_, row) => Math.max(...pair.map(tile => recordHeight(tile.records[row]))));
      const tileHeight = padding * 2 + headerHeight
        + valueHeights.reduce((sum, valueHeight, row) => sum + valueHeight + recordHeights[row], 0) + 16;
      pair.forEach((tile, column) => {
        const x = left + column * (tileWidth + gap);
        commands.push(() => box(x, top, tileWidth, tileHeight, 26, '#211a16', '#574134'));
        text(tile.label, x + padding, top + padding, 55, tile.color, innerWidth, 'left');
        let rowTop = top + padding + headerHeight;
        columns.forEach((label, row) => {
          const right = x + tileWidth - padding;
          text(label, x + padding, rowTop + 9, 36, muted, 104, 'left');
          text(tile.values[row], right, rowTop, 50, tile.color, valueWidth, 'right');
          const record = tile.records[row];
          if (record) {
            const recordTop = rowTop + valueHeights[row];
            text(record.label, x + padding, recordTop, 30, green, recordLabelWidth, 'left');
            text(record.gain, right, recordTop, 30, green, gainWidth, 'right');
          }
          rowTop += valueHeights[row] + recordHeights[row] + 16;
        });
      });
      y += tileHeight + gap;
    }
    y -= gap;
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
