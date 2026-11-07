/**
 * statsOverview.js | 负责人：徐张睿 | 收支概览卡片
 *
 * 职责：
 * 1. 三张卡：总收入 / 总支出 / 当前结余（跟随筛选条件）
 * 2. 口径：内部转账（还款、卡互转、代付收回）不算支出，只算"真正花掉的钱"
 * 3. 本月预算规划：剩余天数、每天还能花多少、先留出储蓄目标、较上月同期对比
 *
 * 对外接口：initStatsOverview() / renderStatsOverview()
 * 事件：records:changed、filters:changed 时自动刷新
 */
import { getRecords } from './storage.js';
import { getFilteredRecords } from './filter.js';

const SAVE_RATE = 0.2;
const TRANSFER_CATEGORIES = ['内部转账', '转账', '还款', '信用卡还款'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function money(amount) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}¥${Math.abs(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  })}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthOf(date) {
  return String(date == null ? '' : date).slice(0, 7);
}

/**
 * 口径：内部转账不算支出。
 * 信用卡还款、余额宝转入、自己的卡互转、代付收回，在流水里是"支出"，但一分钱没花。
 * 识别方式：类别命中，或备注以 #转账 / #还款 / #内部 开头。
 */
export function isTransfer(record) {
  if (!record) return false;
  const category = String(record.category == null ? '' : record.category).trim();
  if (TRANSFER_CATEGORIES.includes(category)) return true;
  return /^#(转账|还款|内部)/.test(String(record.note == null ? '' : record.note).trim());
}

/** 对一组记录计算"真实"收支（剔除内部转账），供三张卡片使用。 */
export function computeRealSummary(records) {
  let income = 0;
  let expense = 0;
  let transferCount = 0;
  let transferSum = 0;
  records.forEach((record) => {
    const amount = Number(record.amount) || 0;
    if (isTransfer(record)) {
      transferCount += 1;
      transferSum += amount;
      return;
    }
    if (record.type === 'income') income += amount;
    else expense += amount;
  });
  return { income, expense, balance: income - expense, transferCount, transferSum };
}

/** 本月预算规划：按自然月计算，独立于筛选条件（用的是全部记录）。 */
export function computeMonthPlan() {
  const today = todayStr();
  const ym = monthOf(today);
  const now = new Date();
  const D = now.getDate();
  const T = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remaining = T - D + 1;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYm = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`;

  let income = 0;
  let expense = 0;
  let todaySpent = 0;
  let transferCount = 0;
  let transferSum = 0;
  let prevSame = 0;
  let prevCount = 0;

  getRecords().forEach((record) => {
    const amount = Number(record.amount) || 0;
    const mo = monthOf(record.date);

    if (isTransfer(record)) {
      if (mo === ym) { transferCount += 1; transferSum += amount; }
      return;
    }

    if (mo === ym) {
      if (record.type === 'income') income += amount;
      else { expense += amount; if (record.date === today) todaySpent += amount; }
    }

    if (record.type === 'expense' && mo === prevYm) {
      const day = Number(String(record.date).slice(8, 10));
      if (day <= D) { prevSame += amount; prevCount += 1; }
    }
  });

  const balance = income - expense;
  const saveTarget = Math.round(income * SAVE_RATE * 100) / 100;
  const spendable = Math.max(balance - saveTarget, 0);
  const quota = remaining > 0 ? spendable / remaining : 0;
  const momRatio = (prevCount >= 3 && prevSame > 0) ? (expense - prevSame) / prevSame : null;

  return {
    today, D, T, remaining,
    income, expense, balance, todaySpent,
    saveTarget, spendable, quota, momRatio,
    transferCount, transferSum,
    hasData: income !== 0 || expense !== 0 || transferCount > 0
  };
}

/* ---------------- 样式（只注入一次，类名以 so- 前缀，避免与 style.css 冲突） ---------------- */
function ensureStyles() {
  if (document.getElementById('so-styles')) return;
  const style = document.createElement('style');
  style.id = 'so-styles';
  style.textContent = [
    '.so-plan{margin-top:0}',
    '.so-plan h3{margin:0 0 2px;font-size:16px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}',
    '.so-hint{font-weight:400;font-size:12px;color:#6b7280}',
    '.so-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:14px}',
    '.so-row b{font-size:16px;font-variant-numeric:tabular-nums}',
    '.so-val{color:#1d4ed8}',
    '.so-bar{height:8px;border-radius:99px;background:#eef0f4;margin:12px 0 8px;overflow:hidden}',
    '.so-bar i{display:block;height:100%;border-radius:99px;transition:width .35s ease}',
    '.so-meta{color:#6b7280;font-size:12.5px;margin-top:6px;line-height:1.8;word-break:break-all}',
    '.so-up{color:#dc2626}',
    '.so-down{color:#15803d}'
  ].join('');
  document.head.appendChild(style);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
  return el;
}

function renderMonthPlan() {
  const panel = document.getElementById('panel-stats');
  if (!panel) return;

  const plan = computeMonthPlan();
  ensureStyles();

  let root = panel.querySelector('.so-plan');
  if (!root) {
    root = document.createElement('section');
    root.className = 'so-plan card';
    const grid = panel.querySelector('.stats-grid');
    if (grid) panel.insertBefore(root, grid.nextSibling);
    else panel.appendChild(root);
  }

  const quota = Math.max(plan.quota, 0);
  const ratio = quota > 0 ? Math.min(plan.todaySpent / quota, 1) : (plan.todaySpent > 0 ? 1 : 0);
  const color = ratio >= 1 ? '#dc2626' : ratio >= 0.7 ? '#f59e0b' : '#15803d';

  let foot = '';
  if (!plan.hasData) {
    foot = '本月还没有记录，先记第一笔。';
  } else {
    const parts = [`结余 ${money(plan.balance)}`];
    if (plan.saveTarget > 0) {
      parts.push(`已预留储蓄 ${money(plan.saveTarget)}（收入的 ${Math.round(SAVE_RATE * 100)}%）`);
    }
    if (plan.transferCount > 0) {
      parts.push(`另有 ${plan.transferCount} 笔内部转账 ${money(plan.transferSum)} 不计入真实支出`);
    }
    foot = parts.join(' · ');
  }

  let trend = '';
  if (plan.hasData) {
    trend = plan.momRatio === null
      ? '较上月同期：数据不足'
      : `较上月同期支出 ${plan.momRatio >= 0 ? '+' : '-'}${Math.round(Math.abs(plan.momRatio) * 100)}%`;
  }

  root.innerHTML = [
    '<h3>本月预算规划 <span class="so-hint">按自然月 · 不受筛选影响</span></h3>',
    '<div class="so-row"><span>本月还剩 <b>' + plan.remaining + '</b> 天，每天还能花 <b class="so-val">' + money(quota) + '</b></span>',
    '<span class="so-hint">今日已花 ' + money(plan.todaySpent) + '</span></div>',
    '<div class="so-bar"><i style="width:' + (ratio * 100).toFixed(1) + '%;background:' + color + '"></i></div>',
    '<div class="so-meta">' + foot + '</div>',
    trend ? '<div class="so-meta">' + trend + '</div>' : ''
  ].join('');
}

export function renderStatsOverview() {
  const filtered = getFilteredRecords();
  const real = computeRealSummary(filtered);

  setText('total-income', money(real.income));
  setText('total-expense', money(real.expense));
  const balanceEl = setText('total-balance', money(real.balance));
  if (balanceEl) balanceEl.classList.toggle('negative', real.balance < 0);

  const scope = document.getElementById('stats-scope');
  if (scope) {
    const base = `统计范围：当前筛选结果（${filtered.length} 笔）`;
    scope.textContent = real.transferCount > 0
      ? `${base} · 已排除 ${real.transferCount} 笔内部转账 ${money(real.transferSum)}`
      : base;
  }

  renderMonthPlan();
}

export function initStatsOverview() {
  document.addEventListener('records:changed', renderStatsOverview);
  document.addEventListener('filters:changed', renderStatsOverview);
  renderStatsOverview();
}
