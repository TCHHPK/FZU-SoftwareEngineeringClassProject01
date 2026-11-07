/** category.js | 负责人：张佩琪 | 类别管理 */
import { getCategories, saveCategories, getRecords } from './storage.js';
import { showToast } from './ui.js';
const DEFAULT_CATEGORIES = {
  expense: ['餐饮', '交通', '购物', '其他支出'],
  income: ['工资', '奖金', '其他收入']
};
let managerType = 'expense';
function validateType(type) {
  if (!['expense', 'income'].includes(type)) throw new Error('无效的类别类型');
}
export function getCategoriesForType(type) {
  validateType(type);
  return [...getCategories()[type]];
}
export function addCategory(type, name) {
  validateType(type);
  if (typeof name !== 'string') throw new Error('类别名称必须是字符串');
  const newName = name.trim();
  if (!newName || newName.length > 20) throw new Error('类别名称长度应为 1 至 20 个字符');
  const categories = getCategories();
  if (categories[type].some((item) => item.toLocaleLowerCase() === newName.toLocaleLowerCase())) {
    throw new Error('该类别已存在');
  }
  categories[type].push(newName);
  saveCategories(categories);
  return newName;
}
export function removeCategory(type, name) {
  validateType(type);
  if (DEFAULT_CATEGORIES[type].includes(name)) throw new Error('系统预设类别不能删除');
  if (getRecords().some((record) => record.type === type && record.category === name)) {
    throw new Error('该类别已有记账记录，不能删除');
  }
  const categories = getCategories();
  const index = categories[type].indexOf(name);
  if (index === -1) throw new Error('类别不存在');
  categories[type].splice(index, 1);
  saveCategories(categories);
  return true;
}
function fillSelect(select, names, firstValue, firstText) {
  if (!select) return;
  const previous = select.value;
  select.replaceChildren();
  const first = document.createElement('option');
  first.value = firstValue;
  first.textContent = firstText;
  select.appendChild(first);
  names.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  if (names.includes(previous)) select.value = previous;
}
export function refreshCategoryOptions() {
  const recordType = document.getElementById('record-type')?.value || 'expense';
  fillSelect(document.getElementById('record-category'), getCategoriesForType(recordType), '', '请选择类别');
  const filterType = document.getElementById('filter-type')?.value || 'all';
  const categories = getCategories();
  const names = filterType === 'all'
    ? [...new Set([...categories.expense, ...categories.income])]
    : getCategoriesForType(filterType);
  fillSelect(document.getElementById('filter-category'), names, 'all', '全部类别');
}
export function renderCategoryList() {
  const container = document.getElementById('category-list');
  if (!container) return;
  container.replaceChildren();
  const categories = getCategories();
  const records = getRecords();
  [{ type: 'expense', title: '支出类别' }, { type: 'income', title: '收入类别' }].forEach(({ type, title }) => {
    if (type !== managerType) return;
    const group = document.createElement('div');
    group.className = 'category-group';
    const heading = document.createElement('h3');
    heading.textContent = title;
    heading.tabIndex = -1;
    group.appendChild(heading);
    const items = document.createElement('div');
    items.className = 'category-items';
    categories[type].forEach((name) => {
      const item = document.createElement('div');
      item.className = 'category-item';
      const icon = document.createElement('span');
      icon.className = `category-icon ${type}`;
      icon.textContent = type === 'expense' ? '−' : '+';
      icon.setAttribute('aria-hidden', 'true');
      item.appendChild(icon);
      const info = document.createElement('div');
      info.className = 'category-info';
      const label = document.createElement('span');
      label.textContent = name;
      label.className = 'category-name';
      info.appendChild(label);
      const count = records.filter((record) => record.type === type && record.category === name).length;
      const usage = document.createElement('small');
      usage.className = 'category-usage';
      usage.textContent = count ? `关联 ${count} 笔记录，不能删除` : '暂无关联记录';
      info.appendChild(usage);
      item.appendChild(info);
      if (DEFAULT_CATEGORIES[type].includes(name)) {
        const tag = document.createElement('small');
        tag.className = 'category-default';
        tag.textContent = '预设';
        item.appendChild(tag);
      } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-delete';
        button.textContent = '删除';
        button.disabled = count > 0;
        button.title = count ? '已有记账记录引用此类别，不能删除' : `删除${name}`;
        button.setAttribute('aria-label', `删除${name}`);
        button.dataset.type = type;
        button.dataset.name = name;
        item.appendChild(button);
      }
      items.appendChild(item);
    });
    group.appendChild(items);
    container.appendChild(group);
  });
}
function refreshCategoryUI() {
  const filter = document.getElementById('filter-category');
  const previousFilter = filter?.value;
  renderCategoryList();
  refreshCategoryOptions();
  document.dispatchEvent(new CustomEvent('categories:changed'));
  // 删除当前筛选类别后，下拉框回到“全部”，同步刷新列表和统计。
  if (filter && filter.value !== previousFilter) {
    document.dispatchEvent(new CustomEvent('filters:changed'));
  }
}
export function initCategoryManager() {
  const addButton = document.getElementById('add-category-btn');
  const nameInput = document.getElementById('new-category');
  const typeSelect = document.getElementById('new-category-type');
  const list = document.getElementById('category-list');
  const form = document.getElementById('category-form');
  const errorText = document.getElementById('category-error');
  if (!addButton || !nameInput || !typeSelect || !list || !form || !errorText) {
    throw new Error('缺少类别管理界面元素');
  }
  function setError(message = '') {
    errorText.textContent = message;
    nameInput.setAttribute('aria-invalid', String(Boolean(message)));
  }
  function switchManagerType(type) {
    managerType = type;
    typeSelect.value = type;
    document.querySelectorAll('[data-category-type]').forEach((button) => {
      const active = button.dataset.categoryType === type;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    renderCategoryList();
  }
  document.querySelectorAll('[data-category-type]').forEach((button) => {
    button.addEventListener('click', () => switchManagerType(button.dataset.categoryType));
  });
  typeSelect.addEventListener('change', () => switchManagerType(typeSelect.value));
  nameInput.addEventListener('input', () => setError());
  nameInput.addEventListener('blur', () => {
    if (nameInput.value && !nameInput.value.trim()) setError('类别名称不能只包含空白字符');
  });
  // 使用原生表单提交，点击按钮与按回车共用同一校验、保存逻辑。
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const name = addCategory(typeSelect.value, nameInput.value);
      nameInput.value = '';
      setError();
      refreshCategoryUI();
      nameInput.focus();
      showToast(`已添加类别：${name}`, 'success');
    } catch (error) {
      setError(error.message);
      nameInput.focus();
      showToast(error.message, 'error');
    }
  });
  list?.addEventListener('click', (event) => {
    const button = event.target.closest('.category-delete');
    if (!button || button.disabled) return;
    const { type, name } = button.dataset;
    if (!window.confirm(`确定删除类别「${name}」吗？`)) return;
    try {
      removeCategory(type, name);
      refreshCategoryUI();
      nameInput.focus();
      showToast(`已删除类别：${name}`, 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
  document.getElementById('record-type')?.addEventListener('change', refreshCategoryOptions);
  document.getElementById('filter-type')?.addEventListener('change', refreshCategoryOptions);
  document.addEventListener('records:changed', renderCategoryList);
  switchManagerType(typeSelect.value);
  refreshCategoryUI();
}
