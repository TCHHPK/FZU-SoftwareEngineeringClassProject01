/** filter.js | 负责人：沈文驰 | 多条件筛选：日期范围、收支类型、类别、金额区间 */
import { filterRecords } from './model.js';
import { refreshCategoryOptions } from './category.js';
import { showToast } from './ui.js';

const DEBOUNCE_MS = 300;
const DATE_IDS = ['filter-start', 'filter-end'];
const AMOUNT_IDS = ['filter-min-amount', 'filter-max-amount'];
let amountTimer = null;
let lastErrorMessage = '';

function element(id) {
  return document.getElementById(id);
}

function valueOf(id, fallback = '') {
  return element(id)?.value ?? fallback;
}

/** 读取当前筛选条件，字段名与 model.filterRecords 保持一致 */
export function getActiveFilters() {
  return {
    startDate: valueOf('filter-start').trim(),
    endDate: valueOf('filter-end').trim(),
    type: valueOf('filter-type', 'all'),
    category: valueOf('filter-category', 'all'),
    minAmount: valueOf('filter-min-amount').trim(),
    maxAmount: valueOf('filter-max-amount').trim()
  };
}

/** 记录列表、收支概览、两个统计图表都通过这里拿到筛选后的数据 */
export function getFilteredRecords() {
  return filterRecords(getActiveFilters());
}

function clearErrorMarks() {
  [...DATE_IDS, ...AMOUNT_IDS, 'filter-type', 'filter-category'].forEach((id) => {
    element(id)?.removeAttribute('aria-invalid');
  });
}

/** 根据校验错误把提示落到具体输入框，方便用户定位 */
function markErrorFields(message) {
  clearErrorMarks();
  let ids = [];
  if (message.includes('日期')) ids = DATE_IDS;
  else if (message.includes('金额')) ids = AMOUNT_IDS;
  else if (message.includes('类别')) ids = ['filter-category'];
  else if (message.includes('类型')) ids = ['filter-type'];
  ids.forEach((id) => element(id)?.setAttribute('aria-invalid', 'true'));
}

/** 日期选择器互相约束，避免选出非法区间 */
function syncDateBounds() {
  const start = element('filter-start');
  const end = element('filter-end');
  if (!start || !end) return;
  if (start.value) end.min = start.value;
  else end.removeAttribute('min');
  if (end.value) start.max = end.value;
  else start.removeAttribute('max');
}

/** 手输日期可能绕过选择器约束，这里自动对齐并提示 */
function alignDateRange(changedId) {
  const start = element('filter-start');
  const end = element('filter-end');
  if (!start?.value || !end?.value || start.value <= end.value) return;
  if (changedId === 'filter-start') end.value = start.value;
  else start.value = end.value;
  showToast('开始日期与结束日期已自动对齐', 'info');
}

function notifyFilterChanged() {
  if (amountTimer !== null) {
    clearTimeout(amountTimer);
    amountTimer = null;
  }
  syncDateBounds();
  try {
    // 先让 model.js 校验，条件不合法时不派发事件，避免列表和图表渲染中断。
    getFilteredRecords();
    clearErrorMarks();
    lastErrorMessage = '';
    document.dispatchEvent(new CustomEvent('filters:changed', {
      detail: getActiveFilters()
    }));
  } catch (error) {
    markErrorFields(error.message);
    if (error.message !== lastErrorMessage) {
      showToast(`筛选条件有误：${error.message}`, 'error');
    }
    lastErrorMessage = error.message;
  }
}

/** 金额输入逐字触发时做防抖，避免频繁重绘列表与 Canvas */
function scheduleFilterChanged() {
  if (amountTimer !== null) clearTimeout(amountTimer);
  amountTimer = setTimeout(notifyFilterChanged, DEBOUNCE_MS);
}

/**
 * 失焦时如果金额条件不成立，清空出错的那一项。
 * 否则非法值会留在输入框里，之后新增记录触发 records:changed 时，
 * 列表和统计调用 getFilteredRecords() 会抛错，导致界面不刷新。
 */
function handleAmountChange(id) {
  try {
    filterRecords(getActiveFilters());
  } catch (error) {
    const target = error.message.includes('最小金额') ? 'filter-min-amount'
      : error.message.includes('最大金额') ? 'filter-max-amount'
      : id;
    const input = element(target);
    if (input?.value) {
      input.value = '';
      showToast(`已清除无效的金额条件：${error.message}`, 'error');
    }
  }
  notifyFilterChanged();
}

export function resetFilters() {
  ['filter-start', 'filter-end', 'filter-min-amount', 'filter-max-amount'].forEach((id) => {
    const input = element(id);
    if (input) input.value = '';
  });
  const type = element('filter-type');
  if (type) type.value = 'all';
  refreshCategoryOptions();
  const category = element('filter-category');
  if (category) category.value = 'all';
  clearErrorMarks();
  lastErrorMessage = '';
  syncDateBounds();
  notifyFilterChanged();
  showToast('筛选条件已重置', 'info');
}

export function initFilter() {
  DATE_IDS.forEach((id) => {
    element(id)?.addEventListener('change', () => {
      alignDateRange(id);
      notifyFilterChanged();
    });
  });
  ['filter-type', 'filter-category'].forEach((id) => {
    element(id)?.addEventListener('change', notifyFilterChanged);
  });
  AMOUNT_IDS.forEach((id) => {
    const input = element(id);
    input?.addEventListener('input', scheduleFilterChanged);
    input?.addEventListener('change', () => handleAmountChange(id));
  });
  element('filter-reset')?.addEventListener('click', resetFilters);
  syncDateBounds();
}
