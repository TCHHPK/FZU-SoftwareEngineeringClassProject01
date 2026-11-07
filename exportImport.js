/** exportImport.js | 负责人：梁倩 | JSON/CSV 导出与导入 */
import { loadData, saveData } from './storage.js';
import { validateAmount, validateDate, validateType } from './model.js';
import { refreshCategoryOptions, renderCategoryList } from './category.js';
import { showToast } from './ui.js';

const CSV_FIELDS = ['id', 'type', 'amount', 'category', 'date', 'note', 'createdAt', 'updatedAt'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_CATEGORIES = {
  expense: ['餐饮', '交通', '购物', '其他支出'],
  income: ['工资', '奖金', '其他收入']
};

function downloadBlob(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvValue(value) {
  const text = String(value ?? '');
  // 防止用户备注成为 Excel/表格软件中的公式。
  const safe = /^[\s]*[=+@\-]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text)
    ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportJSON() {
  const data = loadData();
  const content = JSON.stringify(data, null, 2);
  downloadBlob(content, 'application/json;charset=utf-8', `记账本_${new Date().toISOString().slice(0, 10)}.json`);
  return data.records.length;
}

export function exportCSV() {
  const data = loadData();
  const rows = [CSV_FIELDS.map(csvValue).join(',')];
  data.records.forEach((record) => {
    rows.push(CSV_FIELDS.map((key) => csvValue(record[key])).join(','));
  });
  downloadBlob(`\uFEFF${rows.join('\r\n')}`, 'text/csv;charset=utf-8', `记账本_${new Date().toISOString().slice(0, 10)}.csv`);
  return data.records.length;
}

/** 解析带引号、逗号和换行的 CSV，文件第一行必须是字段名。 */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let insideQuotes = false;
  let afterQuote = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (insideQuotes) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { insideQuotes = false; afterQuote = true; }
      else { field += ch; }
    } else if (ch === ',') {
      row.push(field);
      field = '';
      afterQuote = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
      afterQuote = false;
    } else if (ch === '"' && field === '' && !afterQuote) {
      insideQuotes = true;
    } else {
      if (afterQuote) throw new Error('CSV 引号结束后存在非法字符');
      if (ch === '"') throw new Error('CSV 字段包含非法引号');
      field += ch;
    }
  }
  if (insideQuotes) throw new Error('CSV 存在未闭合的引号');
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  if (!rows.length) throw new Error('CSV 文件为空');
  const headers = rows.shift().map((header) => header.trim());
  if (new Set(headers).size !== headers.length) throw new Error('CSV 列名重复');
  if (!['type', 'amount', 'category', 'date'].every((fieldName) => headers.includes(fieldName))) {
    throw new Error('CSV 缺少必需字段：type、amount、category、date');
  }
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV 第 ${index + 2} 行列数不正确`);
    const record = {};
    headers.forEach((header, i) => { record[header] = cells[i]; });
    return record;
  });
}

function normalizeCategoryName(value) {
  if (typeof value !== 'string') throw new Error('类别必须是字符串');
  const name = value.trim();
  if (!name || name.length > 20) throw new Error('类别名称长度应为 1 至 20 个字符');
  return name;
}

function uniqueCategoryPush(categories, type, name) {
  if (!categories[type].some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    categories[type].push(name);
  }
}

function normalizeImportedData(payload) {
  let rows;
  let importedCategories = null;
  if (Array.isArray(payload)) rows = payload;
  else if (payload && typeof payload === 'object' && Array.isArray(payload.records)) {
    if (payload.version !== undefined && payload.version !== 1) throw new Error('不支持的 JSON 数据版本');
    rows = payload.records;
    importedCategories = payload.categories ?? null;
  } else {
    throw new Error('JSON 必须是记录数组或包含 records 数组的对象');
  }
  if (importedCategories !== null) {
    if (typeof importedCategories !== 'object' || !Array.isArray(importedCategories.expense) ||
        !Array.isArray(importedCategories.income)) throw new Error('导入类别结构无效');
  }
  return { rows, importedCategories };
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `rec_${crypto.randomUUID()}`;
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function normalizeTimestamp(value, fallback) {
  if (value === '' || value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error('时间戳格式错误');
  return new Date(value).toISOString();
}

/** 返回 {added, skipped, addedCategories}；通过单次 saveData 原子提交。 */
export function importData(payload) {
  const { rows, importedCategories } = normalizeImportedData(payload);
  const current = loadData();
  const categories = {
    expense: [...new Set([...DEFAULT_CATEGORIES.expense, ...current.categories.expense])],
    income: [...new Set([...DEFAULT_CATEGORIES.income, ...current.categories.income])]
  };
  const oldCategoryCount = categories.expense.length + categories.income.length;
  if (importedCategories) {
    for (const type of ['expense', 'income']) {
      for (const value of importedCategories[type]) {
        uniqueCategoryPush(categories, type, normalizeCategoryName(value));
      }
    }
  }

  const knownIds = new Set(current.records.map((r) => r.id));
  const idsInFile = new Set();
  const incoming = [];
  let skipped = 0;
  const now = new Date().toISOString();
  rows.forEach((item, index) => {
    try {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('记录不是对象');
      const type = validateType(item.type);
      const amount = validateAmount(item.amount);
      const date = validateDate(item.date);
      const category = normalizeCategoryName(item.category);
      const note = item.note ?? '';
      if (typeof note !== 'string' || note.length > 200) throw new Error('备注必须是 200 字以内的字符串');
      uniqueCategoryPush(categories, type, category);
      let id = item.id;
      if (id === '' || id === undefined || id === null) {
        do { id = newId(); } while (knownIds.has(id) || idsInFile.has(id));
      }
      if (typeof id !== 'string' || id.length > 150) throw new Error('记录 ID 无效');
      if (idsInFile.has(id)) throw new Error('导入文件中存在重复 ID');
      idsInFile.add(id);
      if (knownIds.has(id)) { skipped++; return; }
      const createdAt = normalizeTimestamp(item.createdAt, now);
      const updatedAt = normalizeTimestamp(item.updatedAt, createdAt);
      incoming.push({ id, type, amount, category, date, note: note.trim(), createdAt, updatedAt });
    } catch (error) {
      throw new Error(`第 ${index + 1} 笔记录无效：${error.message}`);
    }
  });
  saveData({ version: 1, categories, records: [...current.records, ...incoming] });
  return {
    added: incoming.length,
    skipped,
    addedCategories: categories.expense.length + categories.income.length - oldCategoryCount
  };
}

export function initExportImport() {
  document.getElementById('export-json')?.addEventListener('click', () => {
    try { showToast(`已导出 ${exportJSON()} 笔 JSON 记录`, 'success'); }
    catch (error) { showToast(`导出失败：${error.message}`, 'error'); }
  });
  document.getElementById('export-csv')?.addEventListener('click', () => {
    try { showToast(`已导出 ${exportCSV()} 笔 CSV 记录`, 'success'); }
    catch (error) { showToast(`导出失败：${error.message}`, 'error'); }
  });
  document.getElementById('import-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('import-file');
    const file = input?.files?.[0];
    if (!file) { showToast('请先选择 JSON 或 CSV 文件', 'error'); return; }
    if (file.size > MAX_FILE_BYTES) { showToast('文件不能超过 5MB', 'error'); return; }
    try {
      const text = await file.text();
      const ext = file.name.split('.').pop().toLowerCase();
      let payload;
      if (ext === 'json') payload = JSON.parse(text.replace(/^\uFEFF/, ''));
      else if (ext === 'csv') payload = parseCSV(text);
      else throw new Error('仅支持 JSON 或 CSV 文件');
      const { added, skipped, addedCategories } = importData(payload);
      renderCategoryList();
      refreshCategoryOptions();
      document.dispatchEvent(new CustomEvent('categories:changed'));
      document.dispatchEvent(new CustomEvent('records:changed', { detail: { action: 'import' } }));
      input.value = '';
      showToast(`导入完成：新增 ${added} 笔，跳过重复 ${skipped} 笔，新增类别 ${addedCategories} 个`, 'success');
    } catch (error) {
      console.error('[exportImport] 导入失败：', error);
      showToast(`导入失败：${error.message}`, 'error');
    }
  });
}
