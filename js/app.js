/**
 * app.js | 负责人：吴政迅 | 个人记账本主入口
 * 

 * 1. 按顺序初始化 12 个模块
 * 2. 一个模块崩了不影响其他模块运行
 * 3. 管理全局事件联动（比如新增记录后刷新列表和统计）
 * 4. 给用户初始化完成的提示
 */

// ========== 第一步：导入所有模块 ==========
// 每个同学负责一个模块，这里把他们的函数都拿过来用
import { initTabs, showToast } from './ui.js';           // 章玲：tab 切换、提示条
import { initStorage, getRecords } from './storage.js';   // 吴雅晴：本地存储读写
import { initCategoryManager } from './category.js';     // 张佩琪：类别管理
import { initAddRecord } from './addRecord.js';          // 陈瑀涵：新增记账表单
import { initFilter } from './filter.js';                 // 沈文驰：筛选条件
import { initRecordList } from './recordList.js';         // 蔡靖熹：记录列表
import { initStatsOverview } from './statsOverview.js';  // 徐张睿：收支概览卡片
import { initStatsByCategory } from './statsByCategory.js'; // 庄剑钇：类别饼图
import { initStatsByDate } from './statsByDate.js';       // 陈佳慧：日期柱状图
import { initExportImport } from './exportImport.js';     // 梁倩：导入导出


// ========== 第二步：安全初始化函数 ==========
/**
 * safeInit - 安全初始化单个模块
 *
 * 
 * @param {string} name - 模块名字，用来打日志
 * @param {Function} fn - 模块的初始化函数
 */
function safeInit(name, fn) {
  try {
    // 执行模块的初始化函数
    fn();
    // 控制台打印成功信息，方便调试
    console.log(`[app] ✅ ${name} 初始化成功`);
  } catch (error) {
    // 这个模块崩了，打印错误，但不影响其他模块
    console.error(`[app] ❌ ${name} 初始化失败：`, error);
    // 弹个提示条告诉用户哪个模块挂了
    showToast(`${name} 模块加载失败：${error.message}`, 'error');
  }
}


// ========== 第三步：注册全局事件联动 ==========
/**
 * registerGlobalEvents - 监听全局事件，做跨模块联动
 
 */
function registerGlobalEvents() {
  // 监听"记录变化"事件（新增、删除、导入都会触发）
  document.addEventListener('records:changed', (event) => {
    const { action, id } = event.detail;
    console.log(`[app] 📝 记录${action === 'add' ? '新增' : '删除'}：${id}`);
  });

  // 监听"类别变化"事件（添加/删除类别时触发）
  document.addEventListener('categories:changed', () => {
    console.log('[app] 🏷️ 类别发生变化');
  });

  // 监听"tab 切换"事件（点顶部 tab 时触发）
  document.addEventListener('app:tab-changed', (event) => {
    const { tab } = event.detail;
    console.log(`[app] 🔄 切换到 ${tab} tab`);

    // 特殊情况：切到"统计"tab 时，图表需要重新绘制
    //图表在隐藏状态下，canvas 宽高是 0，画不出来
    // 所以切过来时，手动触发一次"筛选条件变化"事件，让图表重绘
    if (tab === 'stats') {
      document.dispatchEvent(new CustomEvent('filters:changed'));
    }
  });
}


// ========== 第四步：主初始化函数 ==========
/**
 * initializeApp - 整个应用的入口函数
 * 
 * 初始化顺序很重要：
 * 1. 先初始化存储层（后面所有模块都要读写数据）
 * 2. 再注册全局事件
 * 3. 再初始化 tab 切换
 * 4. 最后初始化各个业务模块
 */
function initializeApp() {
  console.log('[app] 🚀 开始初始化个人记账本...');

  // 1. 先初始化存储层——这是最基础的，后面所有模块都要读写 localStorage
  safeInit('storage', initStorage);

  // 2. 注册全局事件联动
  registerGlobalEvents();

  // 3. 初始化 tab 切换
  // 注意：initTabs 接受一个回调函数，切换 tab 时会调用它
  // 我们在回调里派发一个 app:tab-changed 事件，让其他模块知道切 tab 了
  safeInit('tabs', () => initTabs((tab) => {
    document.dispatchEvent(new CustomEvent('app:tab-changed', { detail: { tab } }));
  }));

  // 4. 按顺序初始化各个业务模块
  safeInit('category', initCategoryManager);        // 类别管理
  safeInit('addRecord', initAddRecord);              // 新增表单
  safeInit('filter', initFilter);                   // 筛选条件
  safeInit('recordList', initRecordList);            // 记录列表
  safeInit('statsOverview', initStatsOverview);       // 收支概览
  safeInit('statsByCategory', initStatsByCategory);   // 类别饼图
  safeInit('statsByDate', initStatsByDate);          // 日期柱状图
  safeInit('exportImport', initExportImport);        // 导入导出

  // 5. 初始化完成，给用户一个友好的提示
  const recordCount = getRecords().length;
  if (recordCount === 0) {
    showToast('👋 欢迎使用个人记账本！先记一笔试试吧', 'info');
  } else {
    showToast(`✅ 已加载 ${recordCount} 笔记录`, 'success');
  }

  console.log('[app] 🎉 个人记账本 Team 2 初始化完成');
}


// ========== 第五步：启动应用 ==========
/**
 * 
 * 
 * 如果页面还在加载中（document.readyState === 'loading'），
 * 就等 DOMContentLoaded 事件触发后再执行。
 * 
 * 如果页面已经加载完了（比如 script 放在 body 末尾），
 * 就直接执行。
 * 
 *
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
  initializeApp();
}
