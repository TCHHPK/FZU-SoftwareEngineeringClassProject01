/**
 * recordList.js — Iteration 2
 * 负责人：蔡靖熹（GitHub: TCHHPK）
 * 新增：按记账日期分组、20 笔分页、显示更多；保留第一版全部功能。
 * 交接接口：initRecordList() / renderRecordList()。
 */
import { getFilteredRecords } from './filter.js';

const PAGE_SIZE = 20;
let visibleLimit = PAGE_SIZE;

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function formatMoney(amount) {
  return `¥${Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function makeRecordItem(record) {
  const item = make('article', 'record-item');
  const main = make('div', 'record-main');
  main.appendChild(make('span', 'record-category', record.category));
  main.appendChild(make('span', 'record-note', record.note || '无备注'));

  const actions = make('div', 'record-actions');
  const isIncome = record.type === 'income';
  actions.appendChild(make('strong',
    `record-amount ${isIncome ? 'income' : 'expense'}`,
    `${isIncome ? '+' : '-'}${formatMoney(record.amount)}`));

  item.append(main, actions);
  return item;
}

/** 按日期倒序渲染，跨日期时创建新分组。 */
export function renderRecordList() {
  const root = document.getElementById('record-list');
  if (!root) return;

  const records = getFilteredRecords();
  root.replaceChildren();
  root.appendChild(make('p', 'record-count',
    `共 ${records.length} 笔符合条件的记录，按日期从近到远显示`));

  if (records.length === 0) {
    root.appendChild(make('p', 'empty-state', '暂无符合条件的记账记录'));
    return;
  }

  let lastDate = null;
  let group = null;
  records.slice(0, visibleLimit).forEach((record) => {
    if (record.date !== lastDate) {
      group = make('section', 'record-group');
      group.appendChild(make('h3', 'record-date', record.date));
      root.appendChild(group);
      lastDate = record.date;
    }
    group.appendChild(makeRecordItem(record));
  });

  if (records.length > visibleLimit) {
    const more = make('button', 'btn btn-secondary record-more',
      `显示更多（剩余 ${records.length - visibleLimit} 笔）`);
    more.type = 'button';
    more.dataset.action = 'show-more';
    root.appendChild(more);
  }
}

export function initRecordList() {
  const root = document.getElementById('record-list');
  if (!root) throw new Error('缺少记录列表容器 #record-list');

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.action === 'show-more') {
      visibleLimit += PAGE_SIZE;
      renderRecordList();
    }
  });

  document.addEventListener('records:changed', renderRecordList);
  document.addEventListener('filters:changed', () => {
    visibleLimit = PAGE_SIZE;
    renderRecordList();
  });
  renderRecordList();
}
