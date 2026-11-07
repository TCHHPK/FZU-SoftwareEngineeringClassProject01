/** statsByDate.js | 负责人：陈佳慧 | Canvas 日期收支柱状图 */
import { getFilteredRecords } from './filter.js';

function dailyTotals() {
  const data = new Map();
  const today = new Date();

  // 生成最近七个自然日的日期
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    dates.push(dateStr);
    data.set(dateStr, {
      date: dateStr,
      income: 0,
      expense: 0
    });
  }

  // 汇总最近七天的收入和支出
  getFilteredRecords().forEach((r) => {
    if (data.has(r.date)) {
      data.get(r.date)[r.type] += Math.round(r.amount * 100);
    }
  });

  return dates.map((date) => data.get(date));
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
// 根据最大金额选择合适的坐标轴上限
function getNiceMax(value) {
  const target = value * 1.1;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;

  let niceValue;
  if (normalized <= 1) {
    niceValue = 1;
  } else if (normalized <= 2) {
    niceValue = 2;
  } else if (normalized <= 5) {
    niceValue = 5;
  } else {
    niceValue = 10;
  }

  return niceValue * magnitude;
}

// 格式化 Y 轴金额
function formatAxisValue(value) {
  if (value >= 10000) {
    return `¥${(value / 10000).toFixed(1)}万`;
  }

  return `¥${value.toLocaleString('zh-CN', {
    maximumFractionDigits: value < 10 ? 3 : 0
  })}`;
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
  const left = 68;
  const right = 14;
  const top = 36;
  const bottom = 48;
  const plotWidth = Math.max(1, width - left - right);
  const plotHeight = Math.max(1, height - top - bottom);
  const maxY = getNiceMax(maximum);

  // 绘制收入、支出图例
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';

  // 收入图例（绿色）
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(left, 16, 10, 10);
  ctx.fillStyle = '#475569';
  ctx.fillText('收入', left + 15, 25);

  // 支出图例（红色）
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(left + 70, 16, 10, 10);
  ctx.fillStyle = '#475569';
  ctx.fillText('支出', left + 85, 25);

  // 恢复 Y 轴标签绘制样式
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
    ctx.fillText(formatAxisValue(value), left - 7, y + 4);
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
