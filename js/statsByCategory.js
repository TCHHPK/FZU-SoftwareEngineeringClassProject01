/** statsByCategory.js | 负责人：庄剑钇 | Canvas 支出类别饼图 */
import { getFilteredRecords } from './filter.js';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#0d9488', '#ec4899', '#64748b'];
const money = (n) => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function categoryTotals() {
  const map = new Map();
  getFilteredRecords().filter((r) => r.type === 'expense').forEach((r) => {
    map.set(r.category, (map.get(r.category) || 0) + Math.round(r.amount * 100));
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, cents]) => ({ name, cents }));
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

export function renderStatsByCategory() {
  const canvas = document.getElementById('category-chart');
  const empty = document.getElementById('category-chart-empty');
  const legend = document.getElementById('category-legend');
  if (!canvas || !empty || !legend) return;
  const data = categoryTotals();
  const total = data.reduce((s, item) => s + item.cents, 0);
  legend.replaceChildren();
  if (!total) {
    canvas.hidden = true;
    empty.hidden = false;
    return;
  }
  canvas.hidden = false;
  empty.hidden = true;
  const stage = configureCanvas(canvas);
  if (!stage) return; // 隐藏 Tab 不绘制，切换到统计页后会重绘。
  const { ctx, width, height } = stage;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width * 0.38, height * 0.42, 112);
  let angle = -Math.PI / 2;
  data.forEach((item, index) => {
    const delta = item.cents / total * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, angle, angle + delta);
    ctx.closePath();
    ctx.fillStyle = COLORS[index % COLORS.length];
    ctx.fill();
    angle += delta;
  });

  data.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.backgroundColor = COLORS[index % COLORS.length];
    const text = document.createElement('span');
    text.textContent = `${item.name} · ${(100 * item.cents / total).toFixed(1)}% · ${money(item.cents / 100)}`;
    row.append(dot, text);
    legend.appendChild(row);
  });
}

export function initStatsByCategory() {
  document.addEventListener('records:changed', renderStatsByCategory);
  document.addEventListener('filters:changed', renderStatsByCategory);
  document.addEventListener('app:tab-changed', (event) => {
    if (event.detail.tab === 'stats') requestAnimationFrame(renderStatsByCategory);
  });
  window.addEventListener('resize', () => {
    if (!document.getElementById('panel-stats')?.hidden) renderStatsByCategory();
  });
  renderStatsByCategory();
}
