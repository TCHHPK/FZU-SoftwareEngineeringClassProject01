/**
 * storage.js | 负责人：吴雅晴
 * 职责：localStorage 读写、初始化默认数据、JSON 序列化与损坏数据自愈。
 * 对外接口（答辩速查约定）：
 *   createDefaultData() / initStorage() / loadData() / saveData(data)
 *   getRecords() / saveRecords(records) / getCategories() / saveCategories(categories)
 *   getStorageKey()
 * 数据结构：{ version: 1, records: [...], categories: { expense: [], income: [] } }
 */
const STORAGE_KEY = 'team2_personal_bookkeeping_v1';
const CORRUPT_KEY_PREFIX = `${STORAGE_KEY}:corrupt:`;
const DATA_VERSION = 1;
const DEFAULT_CATEGORIES = {
  expense: ['餐饮', '交通', '购物', '其他支出'],
  income: ['工资', '奖金', '其他收入']
};

/** 当前环境的 localStorage；隐私模式或被禁用时返回 null。 */
function getBackend() {
  try {
    const backend = globalThis.localStorage;
    if (backend && typeof backend.getItem === 'function' && typeof backend.setItem === 'function') {
      return backend;
    }
  } catch (error) {
    // 某些浏览器在禁用存储时访问 window.localStorage 会直接抛异常。
  }
  return null;
}

function requireBackend() {
  const backend = getBackend();
  if (!backend) {
    throw new Error('当前浏览器不可用 localStorage（可能处于隐私模式），请改用普通窗口并导出 JSON 备份');
  }
  return backend;
}

function clone(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      // 含不可克隆值时退回 JSON 深拷贝。
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCategories(categories) {
  const clean = (list, defaults) => {
    const names = (Array.isArray(list) ? list : [])
      .filter((name) => typeof name === 'string')
      .map((name) => name.trim())
      .filter((name) => name.length > 0 && name.length <= 20);
    return [...new Set([...defaults, ...names])];
  };
  return {
    expense: clean(categories?.expense, DEFAULT_CATEGORIES.expense),
    income: clean(categories?.income, DEFAULT_CATEGORIES.income)
  };
}

function isValidRecord(record) {
  return isPlainObject(record) &&
    typeof record.id === 'string' && record.id.trim() !== '' &&
    (record.type === 'income' || record.type === 'expense') &&
    typeof record.amount === 'number' && Number.isFinite(record.amount) && record.amount > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
    typeof record.category === 'string' && record.category.trim() !== '' &&
    (record.note === undefined || typeof record.note === 'string');
}

/**
 * 把任意来源的数据整理成当前版本结构，无法识别时返回 null。
 * 用于兼容旧数据、修复手工改坏的 localStorage，避免整个页面白屏。
 */
function repairData(raw) {
  if (!isPlainObject(raw)) return null;
  const seen = new Set();
  const records = [];
  (Array.isArray(raw.records) ? raw.records : []).forEach((record) => {
    if (!isValidRecord(record) || seen.has(record.id)) return;
    seen.add(record.id);
    records.push({
      id: record.id,
      type: record.type,
      amount: Math.round(record.amount * 100) / 100,
      category: record.category.trim(),
      date: record.date,
      note: typeof record.note === 'string' ? record.note.slice(0, 200) : '',
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : (typeof record.createdAt === 'string' ? record.createdAt : '')
    });
  });
  return { version: DATA_VERSION, records, categories: normalizeCategories(raw.categories) };
}

function backupCorrupted(raw) {
  const backend = getBackend();
  if (!backend) return '';
  const key = `${CORRUPT_KEY_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    backend.setItem(key, raw);
    return key;
  } catch (error) {
    return '';
  }
}

function assertDataShape(data) {
  if (!isPlainObject(data)) throw new TypeError('保存失败：数据必须是对象');
  if (!Array.isArray(data.records)) throw new TypeError('保存失败：records 必须是数组');
  if (!isPlainObject(data.categories) ||
      !Array.isArray(data.categories.expense) ||
      !Array.isArray(data.categories.income)) {
    throw new TypeError('保存失败：categories 必须包含 expense 和 income 两个数组');
  }
}

function writeJSON(data) {
  const backend = requireBackend();
  let text;
  try {
    text = JSON.stringify(data);
  } catch (error) {
    throw new Error(`保存失败：数据无法序列化为 JSON（${error.message}）`);
  }
  try {
    backend.setItem(STORAGE_KEY, text);
  } catch (error) {
    const quota = error && (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014);
    if (quota) {
      throw new Error('保存失败：浏览器存储空间已满，请先导出 JSON 备份，再删除部分记录');
    }
    throw new Error(`保存失败：${error.message}`);
  }
  return true;
}

export function getStorageKey() {
  return STORAGE_KEY;
}

export function createDefaultData() {
  return {
    version: DATA_VERSION,
    records: [],
    categories: {
      expense: [...DEFAULT_CATEGORIES.expense],
      income: [...DEFAULT_CATEGORIES.income]
    }
  };
}

export function initStorage() {
  const backend = requireBackend();
  if (backend.getItem(STORAGE_KEY) === null) {
    const data = createDefaultData();
    writeJSON(data);
    return clone(data);
  }
  return loadData();
}

export function loadData() {
  const backend = requireBackend();
  const raw = backend.getItem(STORAGE_KEY);
  if (raw === null || raw === undefined || raw === '') return createDefaultData();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const backupKey = backupCorrupted(raw);
    console.error(`本地数据不是有效 JSON，已恢复默认数据${backupKey ? `，原数据备份在 ${backupKey}` : ''}`);
    return createDefaultData();
  }

  const repaired = repairData(parsed);
  if (repaired === null) {
    const backupKey = backupCorrupted(raw);
    console.error(`本地数据结构无法识别，已恢复默认数据${backupKey ? `，原数据备份在 ${backupKey}` : ''}`);
    return createDefaultData();
  }
  // 结构被修复过（旧版本、手工改坏）时立即写回，避免每次打开都重新修复。
  if (JSON.stringify(repaired) !== JSON.stringify(parsed)) {
    try {
      writeJSON(repaired);
    } catch (error) {
      console.warn(`本地数据已修复但写回失败：${error.message}`);
    }
  }
  return repaired;
}

export function saveData(data) {
  assertDataShape(data);
  return writeJSON(data);
}

export function getRecords() {
  return clone(loadData().records);
}

export function saveRecords(records) {
  if (!Array.isArray(records)) throw new TypeError('保存失败：records 必须是数组');
  const data = loadData();
  data.records = records;
  return saveData(data);
}

export function getCategories() {
  return clone(loadData().categories);
}

export function saveCategories(categories) {
  if (!isPlainObject(categories) ||
      !Array.isArray(categories.expense) ||
      !Array.isArray(categories.income)) {
    throw new TypeError('保存失败：categories 必须包含 expense 和 income 两个数组');
  }
  const data = loadData();
  data.categories = categories;
  return saveData(data);
}
