// scripts/components/header.js — I4 引入
//
// 受保护页面的公共头部。
// 行为：
//   - mount 一次：建 DOM（含用户名、WS 状态指示、登出按钮）
//   - mount 一次：绑事件（登出按钮的 click）
//   - subscribe：state 变化时只更新 WS 状态指示的局部（不重画整个 header）
//   - 切页时 cleanup：取消订阅
//
// 返回 { element, cleanup } 给调用方（page 的 render 函数）

import { getState, setState, subscribe } from '../state.js';
import { disconnect } from '../ws.js';
import { storage, h } from '../utils.js';
import { go } from '../router.js';

/**
 * 挂载头部到 root。返回 { element, cleanup }
 */
export function mountHeader() {
  // 1. 读初始状态
  const user = getState().user;
  const status = getState().wsStatus;

  // 2. 一次建 DOM
  const element = h('header', { class: 'header' }, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' } }, [
      h('h1', { style: { margin: '0' } }, 'IoT Cloud Platform'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '1rem' } }, [
        h('span', {
          id: 'ws-status',
          style: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: colorFor(status) },
        }, [
          h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: colorFor(status), display: 'inline-block' } }),
          textFor(status),
        ]),
        user ? h('span', { style: { fontSize: '0.9rem' } }, `欢迎, ${user.username}`) : null,
        user ? h('button', { id: 'logout-btn', style: { padding: '0.25rem 0.75rem' } }, '登出') : null,
      ]),
    ]),
  ]);

  // 3. 一次绑事件（登出按钮）
  const logoutBtn = element.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // 4. 订阅 state 变化 → 只更新 WS 指示
  const unsubscribe = subscribe((state) => {
    updateWsIndicator(element, state.wsStatus);
  });

  // 5. 返回给 page，cleanup 在切走时由 router 调
  return {
    element,
    cleanup: () => {
      unsubscribe();
    },
  };
}

/**
 * 局部更新：只改 WS 指示的颜色和文字
 */
export function updateWsIndicator(element, status) {
  const ind = element.querySelector('#ws-status');
  if (!ind) return;
  const color = colorFor(status);
  ind.style.color = color;
  // 内部的小圆点也更新颜色
  const dot = ind.querySelector('span');
  if (dot) dot.style.backgroundColor = color;
  // 文字是 textNode,需要替换最后一段
  ind.lastChild && ind.lastChild.nodeType === 3 && (ind.lastChild.nodeValue = textFor(status));
  // 简化做法:重置所有 textNodes
  ind.replaceChildren(
    h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, display: 'inline-block' } }),
    textFor(status),
  );
}

function colorFor(status) {
  if (status === 'connected') return '#2ecc71';   // 绿
  if (status === 'connecting') return '#f39c12';  // 黄
  return '#e74c3c';                                // 红
}

function textFor(status) {
  if (status === 'connected') return '实时已连接';
  if (status === 'connecting') return '连接中';
  return '实时已断开';
}

function handleLogout() {
  setState({ user: null, accessToken: null, refreshToken: null });
  storage.remove('accessToken');
  storage.remove('refreshToken');
  try { disconnect(); } catch (e) { console.warn('[logout] disconnect error', e); }
  console.log('[logout] cleared');
  go('/login');
}