/** addRecord.js | 负责人：陈瑀涵 | 新增记账表单 */
import { addRecord } from './model.js';
import { showToast } from './ui.js';
import { refreshCategoryOptions } from './category.js';
function getLocalToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function readFormData() {
  const value = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`记账表单缺少字段：${id}`);
    return el.value;
  };
  return {
    type: value('record-type'), date: value('record-date'),
    amount: value('record-amount'), category: value('record-category'),
    note: value('record-note')
  };
}
function resetRecordForm(form) {
  form.reset();
  const input = document.getElementById('record-date');
  if (input) input.value = getLocalToday();
  refreshCategoryOptions();
}
function handleRecordSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  try {
    const record = addRecord(readFormData());
    resetRecordForm(form);
    document.dispatchEvent(new CustomEvent('records:changed', { detail: { action: 'add', id: record.id } }));
    const type = record.type === 'income' ? '收入' : '支出';
    showToast(`${type} ¥${record.amount.toFixed(2)} 保存成功`, 'success');
  } catch (error) {
    console.error('[addRecord] 保存失败：', error);
    showToast(`保存失败：${error.message}`, 'error');
  }
}
export function initAddRecord() {
  const form = document.getElementById('record-form');
  if (!form) throw new Error('未找到新增记账表单');
  const input = document.getElementById('record-date');
  if (input && !input.value) input.value = getLocalToday();
  refreshCategoryOptions();
  form.addEventListener('submit', handleRecordSubmit);
}
