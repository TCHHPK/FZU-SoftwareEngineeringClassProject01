/** storage.js 单元测试：node --experimental-default-type=module tests/storage.mjs */
import assert from 'node:assert/strict';
import {
  createDefaultData, initStorage, loadData, saveData,
  getRecords, saveRecords, getCategories, saveCategories, getStorageKey
} from '../js/storage.js';

const KEY = 'team2_personal_bookkeeping_v1';

// 数据损坏恢复属于预期行为，测试期间不刷警告日志。
console.warn = () => {};

class MemoryStorage {
  constructor() { this.map = new Map(); this.quota = false; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    if (this.quota) {
      const error = new Error('quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(key, String(value));
  }
  keys() { return [...this.map.keys()]; }
}

function useStorage() {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  return storage;
}

function sampleRecord(overrides = {}) {
  return {
    id: 'rec_1', type: 'expense', amount: 35.5, category: '餐饮',
    date: '2026-11-07', note: '午餐', createdAt: '2026-11-07T04:00:00.000Z',
    updatedAt: '2026-11-07T04:00:00.000Z', ...overrides
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

test('getStorageKey 返回约定的存储键', () => {
  useStorage();
  assert.equal(getStorageKey(), KEY);
});

test('initStorage 首次启动写入空默认数据', () => {
  const storage = useStorage();
  const data = initStorage();
  assert.equal(data.version, 1);
  assert.deepEqual(data.records, []);
  assert.ok(data.categories.expense.includes('餐饮'));
  assert.ok(data.categories.income.includes('工资'));
  assert.ok(storage.getItem(KEY).includes('"version":1'));
});

test('initStorage 第二次启动不覆盖已有数据', () => {
  useStorage();
  initStorage();
  saveRecords([sampleRecord()]);
  const again = initStorage();
  assert.equal(again.records.length, 1);
});

test('saveData / loadData 往返一致', () => {
  useStorage();
  initStorage();
  const data = createDefaultData();
  data.records.push(sampleRecord());
  data.categories.expense.push('娱乐');
  saveData(data);
  assert.deepEqual(loadData(), data);
});

test('getRecords 返回深拷贝，改数组不影响已存数据', () => {
  useStorage();
  initStorage();
  saveRecords([sampleRecord()]);
  const copy = getRecords();
  copy.push(sampleRecord({ id: 'rec_2' }));
  copy[0].amount = 999;
  assert.equal(getRecords().length, 1);
  assert.equal(getRecords()[0].amount, 35.5);
});

test('损坏的 JSON 会备份原文并恢复默认数据', () => {
  const storage = useStorage();
  storage.setItem(KEY, '{"records": [oops');
  const data = loadData();
  assert.deepEqual(data.records, []);
  const backupKeys = storage.keys().filter((key) => key.startsWith(`${KEY}:corrupt:`));
  assert.equal(backupKeys.length, 1);
  assert.equal(storage.getItem(backupKeys[0]), '{"records": [oops');
});

test('结构不合法的记录被丢弃，类别去重并补齐预设', () => {
  const storage = useStorage();
  storage.setItem(KEY, JSON.stringify({
    version: 999,
    records: [
      sampleRecord(),
      sampleRecord({ id: 'rec_2', amount: -1 }),
      sampleRecord({ id: 'rec_1', amount: 12 }),
      sampleRecord({ id: 'rec_3', date: '2026-13-40' }),
      sampleRecord({ id: 'rec_4', type: 'transfer' })
    ],
    categories: { expense: ['餐饮', '餐饮', ' 娱乐 ', ''], income: null }
  }));
  const data = loadData();
  assert.equal(data.version, 1);
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].id, 'rec_1');
  assert.deepEqual(data.categories.expense, ['餐饮', '交通', '购物', '其他支出', '娱乐']);
  assert.deepEqual(data.categories.income, ['工资', '奖金', '其他收入']);
});

test('非对象数据不会被当成有效存储', () => {
  const storage = useStorage();
  storage.setItem(KEY, '"just a string"');
  assert.deepEqual(loadData().records, []);
  assert.equal(storage.keys().filter((key) => key.startsWith(`${KEY}:corrupt:`)).length, 1);
});

test('saveData 拒绝结构错误的数据', () => {
  useStorage();
  initStorage();
  assert.throws(() => saveData(null), /必须是对象/);
  assert.throws(() => saveData({ records: [] }), /categories/);
  assert.throws(() => saveData({ records: {}, categories: { expense: [], income: [] } }), /records/);
});

test('saveRecords 拒绝非数组', () => {
  useStorage();
  initStorage();
  assert.throws(() => saveRecords('nope'), /必须是数组/);
});

test('saveCategories 拒绝缺字段的类别对象', () => {
  useStorage();
  initStorage();
  assert.throws(() => saveCategories({ expense: [] }), /expense 和 income/);
  saveCategories({ expense: ['餐饮', '娱乐'], income: ['工资'] });
  // 读取时会补齐预设类别，保证新增记录的下拉框始终有可用选项。
  assert.deepEqual(getCategories().expense, ['餐饮', '交通', '购物', '其他支出', '娱乐']);
});

test('容量超限时给出可操作的提示', () => {
  const storage = useStorage();
  initStorage();
  storage.quota = true;
  assert.throws(() => saveRecords([sampleRecord()]), /存储空间已满/);
});

test('localStorage 不可用时提示改用普通窗口', () => {
  useStorage();
  delete globalThis.localStorage;
  assert.throws(() => loadData(), /隐私模式/);
  assert.throws(() => initStorage(), /隐私模式/);
  useStorage();
});

test('数据写入后是合法 JSON，可直接导出', () => {
  const storage = useStorage();
  initStorage();
  saveRecords([sampleRecord({ note: '含"引号"和\n换行' })]);
  const parsed = JSON.parse(storage.getItem(KEY));
  assert.equal(parsed.records[0].note, '含"引号"和\n换行');
});

console.log(`\nPASS: ${passed} storage tests (${KEY})`);
