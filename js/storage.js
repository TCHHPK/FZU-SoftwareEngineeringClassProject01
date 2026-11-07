/** storage.js | 负责人：吴雅晴 | 本地存储 */
const STORAGE_KEY = 'team2_personal_bookkeeping_v1';
const DEFAULT_CATEGORIES = {
  expense: ['餐饮', '交通', '购物', '其他支出'],
  income: ['工资', '奖金', '其他收入']
};

export function createDefaultData() {
  return {
    version: 1,
    records: [],
    categories: {
      expense: [...DEFAULT_CATEGORIES.expense],
      income: [...DEFAULT_CATEGORIES.income]
    }
  };
}

function isValidData(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data) &&
    data.version === 1 && Array.isArray(data.records) &&
    data.categories !== null && typeof data.categories === 'object' &&
    Array.isArray(data.categories.expense) && Array.isArray(data.categories.income);
}

export function initStorage() {
  if (localStorage.getItem(STORAGE_KEY) === null) {
    const data = createDefaultData();
    saveData(data);
    return data;
  }
  return loadData();
}

export function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return createDefaultData();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`本地数据不是有效 JSON，请先备份：${error.message}`);
  }
  if (!isValidData(data)) throw new Error('本地数据结构无效，请先备份后检查');
  return data;
}

export function saveData(data) {
  if (!isValidData(data)) throw new Error('保存失败：数据结构不符合要求');
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    throw new Error(`保存失败：${error.message}`);
  }
  return true;
}

export function getRecords() { return loadData().records; }
export function saveRecords(records) {
  if (!Array.isArray(records)) throw new TypeError('records 必须是数组');
  const data = loadData();
  data.records = records;
  return saveData(data);
}
export function getCategories() { return loadData().categories; }
export function saveCategories(categories) {
  const data = loadData();
  data.categories = categories;
  return saveData(data);
}
export function getStorageKey() { return STORAGE_KEY; }
