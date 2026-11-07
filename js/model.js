/** model.js | 负责人：王可人 | 记账数据模型（记录 + 类别管理） */
import { load, save } from './storage.js';

/* 模块边界：记录持久化交给 storage.js 的 load / save，类别表由本模块独立管理。 */

/* ============================================================================
 * 常量与预设类别
 * ========================================================================== */

/** 类别表的独立持久化 key，与 storage.js 的记录 key 解耦 */
export const CATEGORY_STORAGE_KEY = 'BillApp:categories';
/** 记录持久化 key，仅用于界面展示与调试，实际读写由 storage.js 负责 */
export const RECORD_STORAGE_KEY = 'BillApp:records';
/** 删除被引用类别时的兜底类别 */
export const UNCATEGORIZED = '未分类';
export const CATEGORY_SCHEMA_VERSION = 1;
export const MAX_CATEGORY_LENGTH = 12;
export const MAX_NOTE_LENGTH = 200;

export const RECORD_TYPES = Object.freeze(['expense', 'income']);

const TYPE_LABEL = Object.freeze({ expense: '支出', income: '收入' });

/**
 * 预设类别：支出 餐饮 / 交通 / 购物，收入 工资。
 * 仅在该 key 不存在或数据损坏时作为初始值写入；写入后以 localStorage 为准，
 * 因此删除预设类别后刷新页面不会「复活」。
 */
export const DEFAULT_CATEGORIES = Object.freeze({
  expense: Object.freeze(['餐饮', '交通', '购物']),
  income: Object.freeze(['工资']),
});

/* ============================================================================
 * 内部工具
 * ========================================================================== */

/**
 * 构造带业务错误码的 Error，便于 UI 区分处理（如 CATEGORY_IN_USE）。
 */
function createError(message, code, extra) {
  const error = new Error(message);
  error.name = 'BillAppModelError';
  error.code = code;
  if (extra && typeof extra === 'object') Object.assign(error, extra);
  return error;
}

function getLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch (error) {
    return null;
  }
}

function cloneTable(table) {
  return { expense: [...table.expense], income: [...table.income] };
}

/**
 * 校验并规整单个类型的类别数组，非法返回 null。
 */
function sanitizeCategoryList(list) {
  if (!Array.isArray(list)) return null;
  const result = [];
  const seen = new Set();
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (typeof item !== 'string') return null;
    const name = item.trim();
    if (!name || name.length > MAX_CATEGORY_LENGTH || seen.has(name)) return null;
    seen.add(name);
    result.push(name);
  }
  return result;
}

/**
 * 解析类别表持久化内容，格式不正确返回 null（调用方回落到预设类别）。
 */
function parseCategoryPayload(raw) {
  if (typeof raw !== 'string' || raw === '') return null;

  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const table = payload.categories;
  if (!table || typeof table !== 'object' || Array.isArray(table)) return null;

  const expense = sanitizeCategoryList(table.expense);
  const income = sanitizeCategoryList(table.income);
  if (!expense || !income) return null;

  return { expense, income };
}

/**
 * 写入类别表，保持 { version, updatedAt, categories } 结构，方便日后迁移。
 */
function writeCategories(table) {
  const store = getLocalStorage();
  if (!store) return false;

  const payload = {
    version: CATEGORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    categories: cloneTable(table),
  };

  try {
    store.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    throw createError('类别保存失败：浏览器存储不可用或空间已满', 'CATEGORY_STORAGE_FAILED');
  }
  return true;
}

/**
 * 读取类别表：优先使用 localStorage，缺失或损坏时写入并返回预设类别。
 */
function readCategories() {
  const store = getLocalStorage();
  if (store) {
    const stored = parseCategoryPayload(store.getItem(CATEGORY_STORAGE_KEY));
    if (stored) return stored;
  }

  const defaults = cloneTable(DEFAULT_CATEGORIES);
  try {
    writeCategories(defaults);
  } catch (error) {
    /* 无 localStorage（如隐私模式）时退化为仅内存生效，不阻断页面运行 */
  }
  return defaults;
}

function loadRecords() {
  const records = load();
  if (!Array.isArray(records)) throw new TypeError('storage.load() 必须返回记录数组');
  return records;
}

/* ============================================================================
 * 字段校验
 * ========================================================================== */

/**
 * 校验日期，必须是真实存在的 YYYY-MM-DD。
 */
export function validateDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createError('日期格式必须为 YYYY-MM-DD', 'INVALID_DATE');
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw createError('日期无效，请输入真实日期', 'INVALID_DATE');
  }
  return date;
}

/**
 * 校验金额：大于 0、最多两位小数、落在安全整数范围内，返回以元为单位的数字。
 */
export function validateAmount(amount) {
  if (amount === null || amount === undefined || String(amount).trim() === '') {
    throw createError('请输入金额', 'INVALID_AMOUNT');
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw createError('金额必须大于 0', 'INVALID_AMOUNT');
  }
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents < 1 || Math.abs(value * 100 - cents) > 1e-6) {
    throw createError('金额最多保留两位小数，且不能超过安全范围', 'INVALID_AMOUNT');
  }
  return cents / 100;
}

/**
 * 校验收支类型，只允许 income / expense。
 */
export function validateType(type) {
  if (type !== 'income' && type !== 'expense') {
    throw createError('收支类型必须为收入或支出', 'INVALID_TYPE');
  }
  return type;
}

/**
 * 校验类别名称本身（长度、空值、控制字符），返回去空格后的名称。
 */
export function validateCategoryName(name) {
  if (typeof name !== 'string') {
    throw createError('类别名称必须是字符串', 'INVALID_CATEGORY_NAME');
  }
  const value = name.trim();
  if (!value) {
    throw createError('请输入类别名称', 'INVALID_CATEGORY_NAME');
  }
  if (value.length > MAX_CATEGORY_LENGTH) {
    throw createError(`类别名称不能超过 ${MAX_CATEGORY_LENGTH} 个字符`, 'INVALID_CATEGORY_NAME');
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw createError('类别名称不能包含控制字符', 'INVALID_CATEGORY_NAME');
  }
  return value;
}

/**
 * 校验类别是否存在于对应收支类型的类别表中。
 */
export function validateCategory(type, category) {
  validateType(type);
  if (typeof category !== 'string' || !category.trim()) {
    throw createError('请选择类别', 'INVALID_CATEGORY');
  }
  const name = category.trim();
  if (!getCategories(type).includes(name)) {
    throw createError(`类别「${name}」不存在于当前收支类型中`, 'INVALID_CATEGORY');
  }
  return name;
}

/**
 * 校验整条记录输入，返回可直接落库的规范对象。
 */
export function validateRecordInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createError('记录数据必须是对象', 'INVALID_RECORD');
  }

  const type = validateType(input.type);
  const amount = validateAmount(input.amount);
  const date = validateDate(input.date);
  const category = validateCategory(type, input.category);

  const note = input.note ?? '';
  if (typeof note !== 'string') {
    throw createError('备注必须是字符串', 'INVALID_NOTE');
  }
  if (note.length > MAX_NOTE_LENGTH) {
    throw createError(`备注不能超过 ${MAX_NOTE_LENGTH} 个字符`, 'INVALID_NOTE');
  }

  return { type, amount, date, category, note: note.trim() };
}

/* ============================================================================
 * 类别管理（预设 + 自定义增删，独立持久化）
 * ========================================================================== */

/**
 * 获取类别列表。
 * @param {'expense'|'income'} [type] 省略时返回 { expense: [], income: [] }
 * @returns {string[]|{expense: string[], income: string[]}}
 */
export function getCategories(type) {
  const table = readCategories();
  if (type === undefined || type === null || type === 'all') {
    return { expense: [...table.expense], income: [...table.income] };
  }
  validateType(type);
  return [...table[type]];
}

/**
 * 判断某个类别是否存在于指定收支类型中。
 */
export function hasCategory(type, name) {
  validateType(type);
  if (typeof name !== 'string' || !name.trim()) return false;
  return getCategories(type).includes(name.trim());
}

/**
 * 新增自定义类别（同名类别可分别存在于收入与支出中）。
 * @returns {{type: string, name: string, categories: object}}
 */
export function addCategory(type, name) {
  validateType(type);
  const value = validateCategoryName(name);
  const table = readCategories();

  if (table[type].includes(value)) {
    throw createError(`类别「${value}」已存在于${TYPE_LABEL[type]}类别中`, 'CATEGORY_EXISTS', {
      type,
      category: value,
    });
  }

  table[type].push(value);
  writeCategories(table);

  return { type, name: value, categories: getCategories() };
}

/**
 * 删除类别。
 * 策略：
 * 1. 默认（force 为 false）遇到已被记录引用的类别时抛 CATEGORY_IN_USE，并返回引用条数；
 * 2. 传 { force: true } 时，先把引用记录迁移到 fallback（默认「未分类」），再删除类别；
 * 3. 两种结果都会立即持久化，刷新页面后不会恢复。
 *
 * @param {'expense'|'income'} type
 * @param {string} name
 * @param {{force?: boolean, fallback?: string}} [options]
 * @returns {{type: string, removed: string, moved: number, fallback: string|null, categories: object}}
 */
export function removeCategory(type, name, options = {}) {
  validateType(type);
  const value = validateCategoryName(name);

  const opts = options && typeof options === 'object' ? options : {};
  const force = Boolean(opts.force);
  const fallback = opts.fallback === undefined || opts.fallback === null || opts.fallback === ''
    ? UNCATEGORIZED
    : validateCategoryName(opts.fallback);

  const table = readCategories();
  if (!table[type].includes(value)) {
    throw createError(`类别「${value}」不存在于${TYPE_LABEL[type]}类别中`, 'CATEGORY_NOT_FOUND', {
      type,
      category: value,
    });
  }
  if (fallback === value) {
    throw createError('兜底类别不能与被删除的类别相同', 'INVALID_FALLBACK', { type, category: value });
  }

  const records = loadRecords();
  const affected = records.filter((record) => record.type === type && record.category === value);

  if (affected.length > 0 && !force) {
    throw createError(
      `类别「${value}」已被 ${affected.length} 条${TYPE_LABEL[type]}记录使用；请先迁移这些记录，或传 { force: true } 迁移到「${fallback}」后再删除`,
      'CATEGORY_IN_USE',
      { type, category: value, references: affected.length, fallback },
    );
  }

  let moved = 0;
  if (affected.length > 0) {
    const now = new Date().toISOString();
    const next = records.map((record) => {
      if (record.type === type && record.category === value) {
        moved += 1;
        return { ...record, category: fallback, updatedAt: now };
      }
      return record;
    });
    save(next);
  }

  table[type] = table[type].filter((item) => item !== value);
  if (moved > 0 && !table[type].includes(fallback)) table[type].push(fallback);
  writeCategories(table);

  return {
    type,
    removed: value,
    moved,
    fallback: moved > 0 ? fallback : null,
    categories: getCategories(),
  };
}

/**
 * 恢复预设类别（不影响已有记录，可能需要手动整理孤立类别）。
 */
export function resetCategories() {
  writeCategories(cloneTable(DEFAULT_CATEGORIES));
  return getCategories();
}

/* ============================================================================
 * 记录管理
 * ========================================================================== */

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `rec_${crypto.randomUUID()}`;
  }
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

/**
 * 新增一条记录，返回落库后的副本。
 */
export function addRecord(input) {
  const normalized = validateRecordInput(input);
  const records = loadRecords();

  let id;
  do {
    id = generateId();
  } while (records.some((record) => record && record.id === id));

  const now = new Date().toISOString();
  const record = { id, ...normalized, createdAt: now, updatedAt: now };

  records.push(record);
  save(records);
  return { ...record };
}

/**
 * 删除一条记录，返回被删除的记录副本。
 */
export function removeRecord(id) {
  if (typeof id !== 'string' || !id.trim()) {
    throw createError('记录 id 必须是字符串', 'INVALID_ID');
  }
  const key = id.trim();
  const records = loadRecords();
  const index = records.findIndex((record) => record && record.id === key);
  if (index === -1) {
    throw createError(`记录 ${key} 不存在`, 'RECORD_NOT_FOUND', { id: key });
  }

  const removed = records.splice(index, 1)[0];
  save(records);
  return { ...removed };
}

/**
 * 获取全部记录副本，按日期倒序、同日按创建时间倒序。
 */
export function getAllRecords() {
  return loadRecords()
    .map((record) => ({ ...record }))
    .sort((a, b) => {
      const dateCmp = String(b.date).localeCompare(String(a.date));
      if (dateCmp !== 0) return dateCmp;
      const createdCmp = String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
      if (createdCmp !== 0) return createdCmp;
      return String(b.id).localeCompare(String(a.id));
    });
}

/**
 * 按日期区间、收支类型、类别、金额区间、关键字过滤记录。
 * @param {{startDate?: string, endDate?: string, type?: string, category?: string, min?: number|string, max?: number|string, keyword?: string}} [filters]
 * @param {Array<object>} [records]
 * @returns {Array<object>}
 */
export function filterRecords(filters = {}, records = getAllRecords()) {
  if (!Array.isArray(records)) throw new TypeError('records 必须是数组');

  const options = filters && typeof filters === 'object' ? filters : {};
  const startDate = options.startDate ? validateDate(options.startDate) : null;
  const endDate = options.endDate ? validateDate(options.endDate) : null;
  if (startDate && endDate && startDate > endDate) {
    throw createError('开始日期不能晚于结束日期', 'INVALID_RANGE');
  }

  const type = options.type === undefined || options.type === null || options.type === ''
    ? 'all'
    : options.type;
  if (type !== 'all') validateType(type);

  const category = typeof options.category === 'string' ? options.category.trim() : 'all';

  const min = options.min === undefined || options.min === null || options.min === ''
    ? null
    : validateAmount(options.min);
  const max = options.max === undefined || options.max === null || options.max === ''
    ? null
    : validateAmount(options.max);
  if (min !== null && max !== null && min > max) {
    throw createError('最小金额不能大于最大金额', 'INVALID_RANGE');
  }

  const keyword = typeof options.keyword === 'string' ? options.keyword.trim() : '';

  return records
    .filter((record) => {
      if (!record || typeof record !== 'object') return false;
      if (startDate && record.date < startDate) return false;
      if (endDate && record.date > endDate) return false;
      if (type !== 'all' && record.type !== type) return false;
      if (category !== 'all' && category !== '' && record.category !== category) return false;
      if (min !== null && record.amount < min) return false;
      if (max !== null && record.amount > max) return false;
      if (keyword) {
        const haystack = `${record.category ?? ''}${record.note ?? ''}`;
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    })
    .map((record) => ({ ...record }));
}

/**
 * 对外主接口：按条件返回记录列表（默认全部，已排序）。
 */
export function list(filters = {}) {
  return filterRecords(filters);
}

/**
 * 汇总收入 / 支出 / 结余，内部以「分」累加避免浮点误差。
 * @param {Array<object>} [records]
 * @returns {{income: number, expense: number, balance: number}}
 */
export function calculateSummary(records = getAllRecords()) {
  if (!Array.isArray(records)) throw new TypeError('records 必须是数组');

  let incomeCents = 0;
  let expenseCents = 0;

  records.forEach((record) => {
    const cents = Math.round(validateAmount(record.amount) * 100);
    if (record.type === 'income') {
      incomeCents += cents;
    } else if (record.type === 'expense') {
      expenseCents += cents;
    } else {
      throw createError('记录包含无效的收支类型', 'INVALID_TYPE');
    }
  });

  if (!Number.isSafeInteger(incomeCents) || !Number.isSafeInteger(expenseCents)) {
    throw createError('累计金额超出安全范围', 'AMOUNT_OVERFLOW');
  }

  return {
    income: incomeCents / 100,
    expense: expenseCents / 100,
    balance: (incomeCents - expenseCents) / 100,
  };
}

/* ============================================================================
 * 对外主接口别名 + 全局命名空间挂载
 * ========================================================================== */

export const add = addRecord;
export const remove = removeRecord;

const categoryApi = {
  get: getCategories,
  add: addCategory,
  remove: removeCategory,
  reset: resetCategories,
  has: hasCategory,
  DEFAULT_CATEGORIES,
  STORAGE_KEY: CATEGORY_STORAGE_KEY,
};

const api = {
  /* 记录：题目约定的三个主接口 */
  add: addRecord,
  remove: removeRecord,
  list,
  /* 记录：兼容命名导出 */
  addRecord,
  removeRecord,
  getAllRecords,
  filterRecords,
  calculateSummary,
  /* 类别管理 */
  getCategories,
  addCategory,
  removeCategory,
  resetCategories,
  hasCategory,
  categories: categoryApi,
  /* 校验 */
  validateDate,
  validateAmount,
  validateType,
  validateCategory,
  validateCategoryName,
  validateRecordInput,
  constants: Object.freeze({
    CATEGORY_STORAGE_KEY,
    RECORD_STORAGE_KEY,
    UNCATEGORIZED,
    MAX_CATEGORY_LENGTH,
    MAX_NOTE_LENGTH,
    DEFAULT_CATEGORIES,
  }),
};

if (typeof window !== 'undefined') {
  window.BillApp = window.BillApp || {};
  window.BillApp.model = api;
}

export default api;
