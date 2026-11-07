/** 数据层烟雾测试：node --experimental-default-type=module tests/smoke.mjs */
import assert from 'node:assert/strict';
const map = new Map();
globalThis.localStorage = {
  getItem: (key) => map.has(key) ? map.get(key) : null,
  setItem: (key, value) => { map.set(key, value); }
};
const { initStorage, loadData } = await import('../js/storage.js');
const model = await import('../js/model.js');
const category = await import('../js/category.js');
const exchange = await import('../js/exportImport.js');

initStorage();
assert.equal(loadData().records.length, 0);
const r1 = model.addRecord({ type: 'expense', amount: '35.50', category: '餐饮', date: '2026-11-07', note: '午餐' });
const r2 = model.addRecord({ type: 'income', amount: 1500, category: '工资', date: '2026-11-06', note: '兼职' });
assert.equal(model.getRecentRecords(10).length, 2);
assert.equal(model.filterRecords({ type: 'expense' }).length, 1);
assert.equal(model.filterRecords({ minAmount: '40' }).length, 1);
assert.deepEqual(model.calculateSummary(), { income: 1500, expense: 35.5, balance: 1464.5 });
assert.equal(model.updateRecord(r1.id, { amount: 40 }).amount, 40);
assert.throws(() => model.validateDate('2026-02-30'));
assert.throws(() => model.validateAmount(-1));
assert.throws(() => model.validateAmount('3.14159'));
assert.throws(() => model.filterRecords({ startDate: '2026-12-01', endDate: '2026-11-01' }));
assert.equal(category.addCategory('expense', '娱乐'), '娱乐');
assert.throws(() => category.addCategory('expense', '娱乐'));
assert.throws(() => category.removeCategory('expense', '餐饮'));
assert.equal(category.removeCategory('expense', '娱乐'), true);
const exported = loadData();
const { added, skipped } = exchange.importData(exported);
assert.equal(added, 0);
assert.equal(skipped, 2);
const csv = '"id","type","amount","category","date","note","createdAt","updatedAt"\r\n"x-1","expense","15.75","停车","2026-11-05","停车, \""临时\""\n两行","",""';
const records = exchange.parseCSV(csv);
assert.equal(records.length, 1);
assert.equal(records[0].note, '停车, "临时"\n两行');
assert.equal(exchange.importData(records).added, 1);
assert.ok(loadData().categories.expense.includes('停车'));
assert.equal(model.deleteRecord(r2.id), true);
assert.equal(model.getAllRecords().length, 2);
// Invalid import must not partially modify storage.
const before = JSON.stringify(loadData());
assert.throws(() => exchange.importData([{ type: 'expense', amount: 10, category: '新类别', date: '2026-11-07' }, { type: 'expense', amount: -1, category: '新类别', date: '2026-11-07' }]));
assert.equal(JSON.stringify(loadData()), before);
console.log('PASS: storage/model/categories/import/CSV/date validation');
