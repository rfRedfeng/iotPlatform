# Phase 5 Todo — 前端（毕设简化版，垂直切片）

> 配套计划：`tasks/plan-phase5-frontend.md`
> 原始设计：`docs/SPEC.md` §14（参考保留，毕设实际范围以本文件为准）
> 推进方式：**垂直切片**，每步端到端可见

## 增量列表（I0 → I8）

| # | 名称 | 涉及层级 | 验收（做完能看到） |
|---|------|----------|------------------|
| I0 | Hello 骨架 | L6 + index.html | 浏览器 `#page-content` 有 "Hello IoT" |
| I1 | Hash 路由 | L3 + L6 | 点击链接 URL hash 切换，假页 A/B 互切 |
| I2 | 状态 + 重渲染 | L1 + L6 | 计数器页：按钮点一下数字 +1 |
| I3 | 登录闭环 | L0 storage + L2 api + L4 login 页 | 输对密码 token 进 localStorage |
| I4 | WS 状态 | L2 ws + L1 | 登录后 wsStatus 显示绿色"已连接" |
| I5 | 设备列表只读 | L2 api + L1 + L5 Header | 登录后看到后端真实设备 |
| I6 | 创建设备 + WS 反馈 | L5 Modal + L2 api+ws + L1 | Modal 提交 → 列表自动多一行 |
| I7 | 设备详情 + 实时图 | L5 DataChart + L2 ws | 详情页图渲染，新数据点 5s 内出现 |
| I8 | Dashboard | L2 + L5 | 3 张统计卡 + 趋势图 |

## 每增量固定结构

```
1. 改代码
2. 浏览器看效果（用户自验或我截图）
3. 对照验收表打勾
4. git commit
5. 不预判下一步
```

## 依赖

```
I0 → I1 → I2 → I3 → I4 → I5 → I6 → I7 → I8
                              ↘________↗
                                I6 需 I5 的列表
```

## 回退策略

每个 I 完成时打 tag（如 `i3-done`），崩了 `git checkout i2-done` 回退。

## 状态

- [x] I0 — Hello 骨架
- [x] I1 — Hash 路由
- [ ] I2 — 状态 + 重渲染
- [ ] I3 — 登录闭环
- [ ] I4 — WS 连接状态
- [ ] I5 — 设备列表只读
- [ ] I6 — 创建设备 + WS 反馈
- [ ] I7 — 设备详情 + 实时图
- [ ] I8 — Dashboard

---

## 优化待办（毕设打磨时统一处理）

- [ ] **OPT-1**: `router.js` 的 `matchRoute` 改成预编译模式
  - 当前：每次 dispatch 重新编译所有 pattern 的正则（重复劳动）
  - 优化：`route()` 时编译并存 `{ regex, paramNames, handler }`，`matchRoute` 直接用
  - 估时：5 分钟；I8 收尾时统一处理
  - 讨论见会话历史（user 提出 "为什么不能先构建正则再去匹配"）