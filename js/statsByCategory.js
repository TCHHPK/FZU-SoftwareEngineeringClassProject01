/* ==========================================================================
 * js/statsByCategory.js —— 分类统计：各类别支出饼图
 * 负责人：庄剑钇
 * 对应题目要求：数据统计
 *
 * 接口约定（全队统一，见 README）：
 *   - 全局命名空间 window.BillApp
 *   - 数据来源：BillApp.storage.load() 返回记录数组
 *   - 本模块对外导出 render(container, records)
 *
 * 依赖：Chart.js 4.x（全局 Chart），由 index.html 用 <script> 引入
 * 用法：
 *   BillApp.statsByCategory.render('#stats-category', BillApp.storage.load());
 *   或不传 records，模块自己从 storage 取：
 *   BillApp.statsByCategory.render('#stats-category');
 * ========================================================================== */

(function (global) {
  'use strict';

  /* 饼图配色：8 个类别够用，超出的类别循环取色 */
  var COLORS = [
    '#D85A30', '#378ADD', '#1D9E75', '#EF9F27',
    '#7F77DD', '#D4537E', '#97C459', '#888780'
  ];

  /* 保存图表实例：切换 tab 反复 render 时先销毁旧的，否则会叠出好几张图 */
  var chartInstance = null;

  /* ------------------------------------------------------------------
   * 1. 数据处理：把原始记录数组聚合成「各类别支出合计」
   * ---------------------------------------------------------------- */
  function groupByCategory(records) {
    var map = {};

    (records || []).forEach(function (r) {
      if (!r) return;
      if (r.type !== 'expense') return;              // 只要支出，收入不计入饼图

      var amount = Number(r.amount);                 // 存进 localStorage 后可能是字符串，必须转数字
      if (!isFinite(amount) || amount <= 0) return;   // 非法金额直接跳过

      var key = String(r.category || '').trim() || '未分类';
      map[key] = (map[key] || 0) + amount;
    });

    var list = [];
    Object.keys(map).forEach(function (k) {
      list.push({ label: k, value: map[k] });
    });

    // 从大到小排序，饼图第一块永远占比最大，看起来更专业
    list.sort(function (a, b) { return b.value - a.value; });
    return list;
  }

  /* ------------------------------------------------------------------
   * 2. 小工具
   * ---------------------------------------------------------------- */
  function money(n) {
    return '¥' + Number(n).toFixed(2);
  }

  function percent(part, total) {
    if (!total) return '0.0%';
    return (part / total * 100).toFixed(1) + '%';
  }

  /* 只在第一次渲染时注入样式，避免重复插入 */
  function ensureStyle() {
    if (document.getElementById('sbc-style')) return;
    var css = [
      '.sbc-wrap{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;}',
      '.sbc-chart-box{position:relative;width:260px;height:260px;flex:0 0 auto;}',
      '.sbc-chart-box canvas{display:block;width:100%!important;height:100%!important;}',
      '.sbc-list{flex:1 1 200px;min-width:180px;margin:0;padding:0;list-style:none;}',
      '.sbc-list li{display:flex;align-items:center;gap:8px;padding:6px 0;',
      '  border-bottom:1px dashed #E6E6E6;font-size:14px;color:#2C2C2A;}',
      '.sbc-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;}',
      '.sbc-name{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.sbc-val{font-variant-numeric:tabular-nums;color:#444;}',
      '.sbc-pct{width:52px;text-align:right;color:#888;font-variant-numeric:tabular-nums;}',
      '.sbc-empty{padding:40px 0;text-align:center;color:#999;font-size:14px;}',
      '.sbc-total{padding:4px 0 10px;font-size:13px;color:#666;}',
      '.sbc-total b{font-size:18px;color:#D85A30;font-weight:500;}'
    ].join('');
    var style = document.createElement('style');
    style.id = 'sbc-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------------
   * 3. 对外接口：render(container, records)
   * ---------------------------------------------------------------- */
  function render(container, records) {
    var box = typeof container === 'string' ? document.querySelector(container) : container;
    if (!box) {
      console.warn('[statsByCategory] 找不到容器：', container);
      return;
    }

    /* 没传 records 就自己去 storage 拿，方便 app.js 单独调用 */
    if (!records) {
      var storage = global.BillApp && global.BillApp.storage;
      records = (storage && typeof storage.load === 'function') ? storage.load() : [];
    }

    var data = groupByCategory(records);
    var total = data.reduce(function (sum, item) { return sum + item.value; }, 0);

    /* 清场：销毁旧图表 + 清空容器，保证重复渲染不会叠图 */
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    box.innerHTML = '';

    /* 空数据兜底：没有支出记录时给个友好提示，不要留白屏 */
    if (!data.length) {
      box.innerHTML = '<div class="sbc-empty">还没有支出记录，先记一笔再来看分类统计吧</div>';
      return;
    }

    /* Chart.js 没加载成功时给个明确提示，方便排查 */
    if (typeof global.Chart === 'undefined') {
      box.innerHTML = '<div class="sbc-empty">Chart.js 没有加载成功，请检查 index.html 里的 script 标签</div>';
      return;
    }

    ensureStyle();

    /* ---------- 构建 DOM 结构：左边饼图，右边明细列表 ---------- */
    var wrap = document.createElement('div');
    wrap.className = 'sbc-wrap';

    var chartBox = document.createElement('div');
    chartBox.className = 'sbc-chart-box';
    var canvas = document.createElement('canvas');
    chartBox.appendChild(canvas);

    var right = document.createElement('div');
    right.style.flex = '1 1 200px';
    right.style.minWidth = '180px';

    var totalLine = document.createElement('div');
    totalLine.className = 'sbc-total';
    totalLine.innerHTML = '总支出 <b>' + money(total) + '</b>，共 ' + data.length + ' 个类别';
    right.appendChild(totalLine);

    var ul = document.createElement('ul');
    ul.className = 'sbc-list';
    data.forEach(function (item, i) {
      var li = document.createElement('li');

      var dot = document.createElement('span');
      dot.className = 'sbc-dot';
      dot.style.background = COLORS[i % COLORS.length];

      var name = document.createElement('span');
      name.className = 'sbc-name';
      name.textContent = item.label;

      var val = document.createElement('span');
      val.className = 'sbc-val';
      val.textContent = money(item.value);

      var pct = document.createElement('span');
      pct.className = 'sbc-pct';
      pct.textContent = percent(item.value, total);

      li.appendChild(dot);
      li.appendChild(name);
      li.appendChild(val);
      li.appendChild(pct);
      ul.appendChild(li);
    });
    right.appendChild(ul);

    wrap.appendChild(chartBox);
    wrap.appendChild(right);
    box.appendChild(wrap);

    /* ---------- 画饼图（Chart.js 4.x 语法）---------- */
    chartInstance = new global.Chart(canvas.getContext('2d'), {
      type: 'pie',
      data: {
        labels: data.map(function (d) { return d.label; }),
        datasets: [{
          data: data.map(function (d) { return Number(d.value.toFixed(2)); }),
          backgroundColor: data.map(function (d, i) { return COLORS[i % COLORS.length]; }),
          borderColor: '#FFFFFF',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,   // 交给外层容器控制高度，避免 canvas 高度为 0
        layout: { padding: 4 },
        plugins: {
          legend: { display: false },  // 图例用我们自己的列表，更好排版
          tooltip: {
            backgroundColor: 'rgba(44,44,42,0.92)',
            padding: 10,
            displayColors: true,
            callbacks: {
              label: function (ctx) {
                var v = ctx.parsed;
                return ' ' + ctx.label + '：' + money(v) + '（' + percent(v, total) + '）';
              }
            }
          }
        }
      }
    });

    return chartInstance;
  }

  /* ------------------------------------------------------------------
   * 4. 挂到全局命名空间（文件级隔离，不污染其他模块）
   * ---------------------------------------------------------------- */
  global.BillApp = global.BillApp || {};
  global.BillApp.statsByCategory = {
    render: render,
    groupByCategory: groupByCategory   // 暴露给博客写测试/其他模块复用
  };

  /* 兼容 app.js 直接按函数名调用的写法 */
  global.renderStatsByCategory = render;

})(window);
