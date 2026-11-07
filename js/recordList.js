/**
 * recordList.js — Iteration 3 (final)
 * 负责人：蔡靖熹（GitHub: TCHHPK）
 * 新增：单笔删除、确认框、事件通知、删除后列表自动更新、当日显示笔数。
 * 交接接口：initRecordList() / renderRecordList()。
 */
import { deleteRecord } from './model.js';
import { getFilteredRecords } from './filter.js';
import { showToast } from './ui.js';

const PAGE_SIZE = 20;
let visibleLimit = PAGE_SIZE;
const money = (amount) => `¥${Number(amount).toLocaleString('zh-CN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
})}`;

function make(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function makeRecordItem(record) {
  const item = make('article', 'record-item');
  const main = make('div', 'record-main');
  main.appendChild(make('span', 'record-category', record.category));
  main.appendChild(make('span', 'record-note', record.note || '无备注'));

  const actions = make('div', 'record-actions');
  const isIncome = record.type === 'income';
  actions.appendChild(make(
    'strong', `record-amount ${isIncome ? 'income' : 'expense'}`,
    `${isIncome ? '+' : '-'}${money(record.amount)}`
  ));

  const button = make('button', 'btn-delete', '删除');
  button.type = 'button';
  button.dataset.recordId = record.id;
  button.setAttribute('aria-label', `删除${record.date}的${record.category}记录`);
  actions.appendChild(button);
  item.append(main, actions);
  return item;
}

export function renderRecordList() {
  const root = document.getElementById('record-list');
  if (!root) return;
  const records = getFilteredRecords();
  root.replaceChildren();

  const summary = make('p', 'record-count', `共 ${records.length} 笔符合条件的记录，按日期从近到远显示`);
  root.appendChild(summary);
  if (!records.length) {
    root.appendChild(make('p', 'empty-state', '暂无符合条件的记账记录'));
    return;
  }

  let lastDate = null;
  let group = null;
  const visible = records.slice(0, visibleLimit);
  // 按当前可见记录统计每天笔数（避免分页时将未显示的记录算进去）。
  const dayCounts = new Map();
  visible.forEach((record) => {
    dayCounts.set(record.date, (dayCounts.get(record.date) || 0) + 1);
  });

  visible.forEach((record) => {
    if (record.date !== lastDate) {
      group = make('section', 'record-group');
      group.appendChild(make('h3', 'record-date', `${record.date} · ${dayCounts.get(record.date)} 笔`));
      root.appendChild(group);
      lastDate = record.date;
    }
    group.appendChild(makeRecordItem(record));
  });

  if (records.length > visibleLimit) {
    const more = make('button', 'btn btn-secondary record-more', `显示更多（剩余 ${records.length - visibleLimit} 笔）`);
    more.type = 'button';
    more.dataset.action = 'show-more';
    root.appendChild(more);
  }
}

export function initRecordList() {
  const root = document.getElementById('record-list');
  if (!root) throw new Error('缺少记录列表容器');

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.action === 'show-more') {
      visibleLimit += PAGE_SIZE;
      renderRecordList();
      return;
    }
    const id = button.dataset.recordId;
    if (!id || !window.confirm('确定删除这笔记账记录吗？此操作不可撤销。')) return;
    try {
      if (!deleteRecord(id)) throw new Error('记录不存在或已删除');
      document.dispatchEvent(new CustomEvent('records:changed', {
        detail: { action: 'delete', id }
      }));
      showToast('记录已删除', 'success');
    } catch (error) {
      showToast(`删除失败：${error.message}`, 'error');
    }
  });

  document.addEventListener('records:changed', renderRecordList);
  document.addEventListener('filters:changed', () => {
    visibleLimit = PAGE_SIZE;
    renderRecordList();
  });
  renderRecordList();
}
