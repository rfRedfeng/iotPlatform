// scripts/utils.js — I3 引入
//
// 提供 3 类工具：
//   1. storage   - localStorage 安全包装（隐私模式/禁用时 fallback 到内存）
//   2. h         - 安全 DOM 创建（替代 innerHTML 拼接，规避 XSS）
//   3. formatDate - 日期格式化（I5+ 用）
//
// 后续 I5/I7 会加：
//   - chart wrapper（封装 Chart.js，自动 destroy 旧实例）
//   - more helpers as needed

// ────────── storage ──────────
const _memoryFallback = new Map();   // localStorage 不可用时降级

export const storage = {
    get(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return _memoryFallback.has(key) ? _memoryFallback.get(key) : null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            _memoryFallback.set(key, value);
        }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch { }
        _memoryFallback.delete(key);
    },
    getJSON(key) {
        const raw = this.get(key);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    },
    setJSON(key, value) {
        try { this.set(key, JSON.stringify(value)); } catch { }
    },
};

// ────────── h() — 安全 DOM 创建 ──────────
//
// 用途：替代 innerHTML 拼接用户数据
// 关键：所有文本子节点走 textNode（不解析 HTML），即使传入 '<script>' 也只显示字面量
//
// 用法：
//   h('div', { class: 'card', onclick: fn }, [
//       h('h2', {}, '设备列表'),
//       h('p', {}, userInput),         // 安全：不会解析 HTML
//   ])

export function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);

    for (const [key, value] of Object.entries(props || {})) {
        if (value == null || value === false) continue;
        if (key === 'class' || key === 'className') {
            el.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'html') {
            // 显式 opt-in：调用方明确说"我知道这是 HTML"
            el.innerHTML = value;
        } else if (value === true) {
            el.setAttribute(key, '');
        } else {
            el.setAttribute(key, value);
        }
    }

    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
        if (child == null || child === false) continue;
        if (child instanceof Node) {
            el.appendChild(child);
        } else {
            // 字符串/数字 → textNode (不解析 HTML)
            el.appendChild(document.createTextNode(String(child)));
        }
    }
    return el;
}

// ────────── formatDate ──────────
export function formatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ────────── formatShort ──────────
// 趋势图 x 轴用：MM-DD HH:mm（去掉年份和秒，更紧凑）
export function formatShort(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}