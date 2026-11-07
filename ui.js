/** ui.js | 负责人：章玲 | Tab 导航与提示条 */
let toastTimer = null;
export function initTabs(onChange = () => {}) {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');
  function switchTab(name) {
    const target = document.getElementById(`panel-${name}`);
    if (!target) return;
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    panels.forEach((panel) => { panel.hidden = panel !== target; });
    onChange(name);
  }
  tabs.forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  switchTab('add');
  return switchTab;
}
export function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  if (toastTimer !== null) clearTimeout(toastTimer);
  const colors = { success: '#15803d', error: '#b91c1c', info: '#1f2937' };
  toast.textContent = message;
  toast.style.backgroundColor = colors[type] || colors.info;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; toastTimer = null; }, 3000);
}
