/** statsByDate.js | 负责人：陈佳慧 | Canvas 日期收支柱状图 */
import { getFilteredRecords } from './filter.js';

function dailyTotals() {
  const data = new Map();
  getFilteredRecords().forEach((r) => {
    if (!data.has(r.date)) data.set(r.date, { date: r.date, income: 0, expense: 0 });
    data.get(r.date)[r.type] += Math.round(r.amount * 100);
  });
  // 显示最近七个有记录的日期；所有筛选结果仍计入概览卡片。
  return [...data.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
}

function configureCanvas(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

export function renderStatsByDate() {
  const canvas = document.getElementById('date-chart');
  const empty = document.getElementById('date-chart-empty');
  if (!canvas || !empty) return;
  const days = dailyTotals();
  const maximum = Math.max(0, ...days.flatMap((d) => [d.income, d.expense])) / 100;
  if (!days.length || maximum <= 0) {
    canvas.hidden = true;
    empty.hidden = false;
    return;
  }
  canvas.hidden = false;
  empty.hidden = true;
  const stage = configureCanvas(canvas);
  if (!stage) return;
  const { ctx, width, height } = stage;
  const left = 56;
  const right = 14;
  const top = 14;
  const bottom = 48;
  const plotWidth = Math.max(1, width - left - right);
  const plotHeight = Math.max(1, height - top - bottom);
  const maxY = maximum * 1.15 || 1;

  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  for (let i = 0; i <= 4; i++) {
    const y = top + (plotHeight * i / 4);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
    const value = maxY * (4 - i) / 4;
    ctx.fillText(value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toFixed(0), left - 7, y + 4);
  }

  const segmentWidth = plotWidth / days.length;
  const barWidth = Math.min(19, segmentWidth * 0.32);
  days.forEach((day, i) => {
    const centerX = left + (i + 0.5) * segmentWidth;
    [
      { cents: day.income, color: '#16a34a', offset: -barWidth - 1 },
      { cents: day.expense, color: '#ef4444', offset: 1 }
    ].forEach(({ cents, color, offset }) => {
      const barHeight = (cents / 100 / maxY) * plotHeight;
      ctx.fillStyle = color;
      ctx.fillRect(centerX + offset, top + plotHeight - barHeight, barWidth, barHeight);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = width < 370 ? '10px sans-serif' : '11px sans-serif';
    ctx.fillText(day.date.slice(5), centerX, height - bottom + 19);
  });
}

export function initStatsByDate() {
  document.addEventListener('records:changed', renderStatsByDate);
  document.addEventListener('filters:changed', renderStatsByDate);
  document.addEventListener('app:tab-changed', (event) => {
    if (event.detail.tab === 'stats') requestAnimationFrame(renderStatsByDate);
  });
  window.addEventListener('resize', () => {
    if (!document.getElementById('panel-stats')?.hidden) renderStatsByDate();
  });
  renderStatsByDate();
}
