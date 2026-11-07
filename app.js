/** app.js | 负责人：吴政迅 | 12 人团队模块装配 */
import { initTabs, showToast } from './ui.js';
import { initStorage, getRecords } from './storage.js';
import { initCategoryManager } from './category.js';
import { initAddRecord } from './addRecord.js';
import { initFilter } from './filter.js';
import { initRecordList } from './recordList.js';
import { initStatsOverview } from './statsOverview.js';
import { initStatsByCategory } from './statsByCategory.js';
import { initStatsByDate } from './statsByDate.js';
import { initExportImport } from './exportImport.js';

// 每个模块独立初始化，失败不影响其他模块
function safeInit(name, fn) {
  try {
    fn();
    console.log(`[app] ${name} 初始化成功`);
  } catch (error) {
    console.error(`[app] ${name} 初始化失败：`, error);
    showToast(`${name} 模块加载失败：${error.message}`, 'error');
  }
}

// 记录变化时的全局联动
function registerGlobalEvents() {
  document.addEventListener('records:changed', (event) => {
    const { action, id } = event.detail;
    console.log(`[app] 记录${action === 'add' ? '新增' : '删除'}：${id}`);
  });

  document.addEventListener('categories:changed', () => {
    console.log('[app] 类别发生变化');
  });

  // tab 切换时，确保当前 tab 的数据是最新的
  document.addEventListener('app:tab-changed', (event) => {
    const { tab } = event.detail;
    console.log(`[app] 切换到 ${tab} tab`);
    // 切到统计 tab 时，重新触发一次筛选事件，确保图表刷新
    if (tab === 'stats') {
      document.dispatchEvent(new CustomEvent('filters:changed'));
    }
  });
}

function initializeApp() {
  console.log('[app] 开始初始化...');

  // 1. 存储层先初始化
  safeInit('storage', initStorage);

  // 2. 注册全局事件
  registerGlobalEvents();

  // 3. tab 切换
  safeInit('tabs', () => initTabs((tab) => {
    document.dispatchEvent(new CustomEvent('app:tab-changed', { detail: { tab } }));
  }));

  // 4. 各模块独立初始化
  safeInit('category', initCategoryManager);
  safeInit('addRecord', initAddRecord);
  safeInit('filter', initFilter);
  safeInit('recordList', initRecordList);
  safeInit('statsOverview', initStatsOverview);
  safeInit('statsByCategory', initStatsByCategory);
  safeInit('statsByDate', initStatsByDate);
  safeInit('exportImport', initExportImport);

  // 5. 初始化完成，给个友好提示
  const recordCount = getRecords().length;
  if (recordCount === 0) {
    showToast('欢迎使用个人记账本！先记一笔试试吧', 'info');
  } else {
    showToast(`已加载 ${recordCount} 笔记录`, 'success');
  }

  console.log('[app] 个人记账本 Team 2 初始化完成');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
  initializeApp();
}