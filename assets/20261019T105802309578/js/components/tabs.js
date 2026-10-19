// WAI-ARIA tabs: a tablist of buttons with roving tabindex; ←/→/Home/End move between tabs.
import { esc } from '../util.js';

// tabs: [{key, label, short?, count?}] — short: the label on narrow screens
export function tabsHtml(id, tabs, active, label) {
  return `<div class="tabs" role="tablist" aria-label="${esc(label)}" id="${id}">${tabs.map(t => `
    <button type="button" role="tab" class="tab" id="${id}-${t.key}" data-tab="${t.key}"
      aria-selected="${t.key === active}" aria-controls="${id}-panel" tabindex="${t.key === active ? 0 : -1}">${t.short ? `<span class="tab-long">${esc(t.label)}</span><span class="tab-short">${esc(t.short)}</span>` : esc(t.label)}${t.count != null ? ` <span class="tab-count">${esc(t.count)}</span>` : ''}</button>`).join('')}
  </div>
  <div class="tab-panel" role="tabpanel" id="${id}-panel" aria-labelledby="${id}-${active}" tabindex="0"></div>`;
}

// Wire a tablist; onSelect(key) renders the panel. Returns select(key) for programmatic use.
export function initTabs(root, id, onSelect) {
  const list = root.querySelector(`#${id}`);
  const panel = root.querySelector(`#${id}-panel`);
  const tabs = [...list.querySelectorAll('[role=tab]')];
  const select = (key, { focus = false } = {}) => {
    for (const t of tabs) {
      const on = t.dataset.tab === key;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    panel.setAttribute('aria-labelledby', `${id}-${key}`);
    onSelect(key, panel);
  };
  list.addEventListener('click', (ev) => {
    const t = ev.target.closest('[role=tab]');
    if (t) select(t.dataset.tab);
  });
  list.addEventListener('keydown', (ev) => {
    const i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[ev.key];
    if (to == null) return;
    ev.preventDefault();
    ev.stopPropagation(); // not the chapter shortcuts
    select(tabs[(to + tabs.length) % tabs.length].dataset.tab, { focus: true });
  });
  return select;
}
