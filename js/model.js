/** model.js | 负责人：王可人 | 记账数据模型 */
import { getRecords, saveRecords, getCategories } from './storage.js';
export function validateDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('日期格式必须为 YYYY-MM-DD');
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('日期无效，请输入真实日期');
  }
  return date;
}
export function validateAmount(amount) {
  if (amount === null || amount === undefined || String(amount).trim() === '') {
    throw new Error('请输入金额');
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error('金额必须大于 0');
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents < 1 || Math.abs(value * 100 - cents) > 1e-6) {
    throw new Error('金额最多保留两位小数，且不能超过安全范围');
  }
  return cents / 100;
}
export function validateType(type) {
  if (type !== 'income' && type !== 'expense') throw new Error('收支类型必须为收入或支出');
  return type;
}
export function validateCategory(type, category) {
  validateType(type);
  if (typeof category !== 'string' || !category.trim()) throw new Error('请选择类别');
  const name = category.trim();
  if (!getCategories()[type].includes(name)) throw new Error(`类别「${name}」不存在于当前收支类型中`);
  return name;
}
export function validateRecordInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('记录数据必须是对象');
  const type = validateType(input.type);
  const amount = validateAmount(input.amount);
  const date = validateDate(input.date);
  const category = validateCategory(type, input.category);
  const note = input.note ?? '';
  if (typeof note !== 'string') throw new Error('备注必须是字符串');
  if (note.length > 200) throw new Error('备注不能超过 200 个字符');
  return { type, amount, date, category, note: note.trim() };
}
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `rec_${crypto.randomUUID()}`;
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
export function addRecord(input) {
  const normalized = validateRecordInput(input);
  const records = getRecords();
  let id;
  do { id = generateId(); } while (records.some((record) => record.id === id));
  const now = new Date().toISOString();
  const record = { id, ...normalized, createdAt: now, updatedAt: now };
  records.push(record);
  saveRecords(records);
  return { ...record };
}
export function getAllRecords() {
  return getRecords().map((record) => ({ ...record })).sort((a, b) => {
    const dateCmp = String(b.date).localeCompare(String(a.date));
    if (dateCmp !== 0) return dateCmp;
    const createdCmp = String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
    if (createdCmp !== 0) return createdCmp;
    return String(b.id).localeCompare(String(a.id));
  });
}
export function getRecordById(id) {
  const record = getRecords().find((item) => item.id === id);
  return record ? { ...record } : null;
}
export function getRecentRecords(limit = 10) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('记录数量必须是正整数');
  return getAllRecords().slice(0, limit);
}
export function updateRecord(id, updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) throw new Error('修改内容必须是对象');
  const allowed = ['type', 'amount', 'date', 'category', 'note'];
  const invalid = Object.keys(updates).filter((field) => !allowed.includes(field));
  if (invalid.length) throw new Error(`不允许修改字段：${invalid.join(', ')}`);
  const records = getRecords();
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) throw new Error('找不到需要修改的记录');
  const original = records[index];
  const normalized = validateRecordInput({ ...original, ...updates });
  const updated = { ...original, ...normalized, updatedAt: new Date().toISOString() };
  records[index] = updated;
  saveRecords(records);
  return { ...updated };
}
export function deleteRecord(id) {
  const records = getRecords();
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) return false;
  records.splice(index, 1);
  saveRecords(records);
  return true;
}
export function filterRecords(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('筛选条件必须是对象');
  const { startDate = '', endDate = '', type = 'all', category = 'all', minAmount = '', maxAmount = '' } = options;
  if (startDate) validateDate(startDate);
  if (endDate) validateDate(endDate);
  if (startDate && endDate && startDate > endDate) throw new Error('开始日期不能晚于结束日期');
  if (type !== 'all') validateType(type);
  const parseBoundary = (v, label) => {
    if (v === '' || v === null || v === undefined || String(v).trim() === '') return null;
    const value = Number(v);
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)) ||
        Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      throw new Error(`${label}必须是非负金额，最多两位小数`);
    }
    return Math.round(value * 100) / 100;
  };
  const min = parseBoundary(minAmount, '最小金额');
  const max = parseBoundary(maxAmount, '最大金额');
  if (min !== null && max !== null && min > max) throw new Error('最小金额不能大于最大金额');
  return getAllRecords().filter((record) => {
    if (startDate && record.date < startDate) return false;
    if (endDate && record.date > endDate) return false;
    if (type !== 'all' && record.type !== type) return false;
    if (category !== 'all' && category !== '' && record.category !== category) return false;
    if (min !== null && record.amount < min) return false;
    if (max !== null && record.amount > max) return false;
    return true;
  });
}
export function calculateSummary(records = getAllRecords()) {
  if (!Array.isArray(records)) throw new TypeError('records 必须是数组');
  let incomeCents = 0;
  let expenseCents = 0;
  records.forEach((record) => {
    const cents = Math.round(validateAmount(record.amount) * 100);
    if (record.type === 'income') incomeCents += cents;
    else if (record.type === 'expense') expenseCents += cents;
    else throw new Error('记录包含无效的收支类型');
  });
  if (!Number.isSafeInteger(incomeCents) || !Number.isSafeInteger(expenseCents)) {
    throw new Error('累计金额超出安全范围');
  }
  return { income: incomeCents / 100, expense: expenseCents / 100, balance: (incomeCents - expenseCents) / 100 };
}
