/**
 * recordList.js — Iteration 1
 * 负责人：蔡靖熹（GitHub: TCHHPK）
 * 目标：展示最近 20 笔收支记录；处理空状态；响应新增记录和筛选变化。
 * 交接接口：initRecordList() / renderRecordList()。
 */
import { getFilteredRecords } from './filter.js';

const PAGE_SIZE = 20;

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

/** 渲染列表（数据已由 filter.js / model.js 按日期倒序排列）。 */
export function renderRecordList() {
  const root = document.getElementById('record-list');
  if (!root) return;

  const records = getFilteredRecords();
  root.replaceChildren();
  root.appendChild(make('p', 'record-count',
    `共 ${records.length} 笔符合条件的记录，显示最近 ${PAGE_SIZE} 笔`));

  if (records.length === 0) {
    root.appendChild(make('p', 'empty-state', '暂无符合条件的记账记录'));
    return;
  }

  records.slice(0, PAGE_SIZE).forEach((record) => {
    const item = make('article', 'record-item');
    const main = make('div', 'record-main');
    main.appendChild(make('span', 'record-category', record.category));
    main.appendChild(make('span', 'record-note',
      `${record.date} · ${record.note || '无备注'}`));

    const actions = make('div', 'record-actions');
    const isIncome = record.type === 'income';
    actions.appendChild(make('strong',
      `record-amount ${isIncome ? 'income' : 'expense'}`,
      `${isIncome ? '+' : '-'}${formatMoney(record.amount)}`));

    item.append(main, actions);
    root.appendChild(item);
  });
}

/** 主入口调用一次即可；后续数据变化通过事件驱动刷新。 */
export function initRecordList() {
  const root = document.getElementById('record-list');
  if (!root) throw new Error('缺少记录列表容器 #record-list');

  document.addEventListener('records:changed', renderRecordList);
  document.addEventListener('filters:changed', renderRecordList);
  renderRecordList();
}
