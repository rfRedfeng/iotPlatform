import { storage, h } from '../utils.js';
import { go } from '../router.js';

export function navigation(root) {
  const nav = h('nav', { class: 'nav' }, [
    h('a', { href: '#/' }, '首页'),
    h('a', { href: '#/devices' }, '设备列表'),
    h('a', { href: '#/dashboard' }, '仪表盘'),
  ]);

  // 根据登录状态显示/隐藏导航链接
  const token = storage.get('accessToken');
  if (!token) {
    // 没登录，隐藏设备列表和仪表盘链接
    nav.querySelectorAll('a').forEach(a => {
      if (a.getAttribute('href') !== '#/') {
        a.style.display = 'none';
      }
    });
  }

  root.appendChild(nav);
}
