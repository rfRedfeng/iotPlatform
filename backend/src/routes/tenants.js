/**
 * 租户路由（仅 admin 可操作）
 * GET    /api/tenants     - 租户列表
 * POST   /api/tenants     - 创建租户
 * PUT    /api/tenants/:id - 更新租户
 * DELETE /api/tenants/:id - 删除租户
 */

import express from 'express';
import TenantRepository from '../data-access/mysql/repositories/TenantRepository.js';

const router = express.Router();

// 所有租户操作仅 admin 可用
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        console.error("[tenants]用户:", req.user.username, "尝试操作租户，但不是管理员"); c
        return res.status(403).json({ success: false, error: { code: 403, message: '仅系统管理员可操作' } });
    }
    next();
}

// GET: 所有登录用户可看（用户管理页需要显示租户名）
// I-12: 非 admin 只返回 {id, name},admin 返回完整 (含 maxDevices/maxUsers/status)
router.get('/', async (req, res, next) => {
    try {
        const list = await TenantRepository.findAll();
        if (req.user.role === 'admin') {
            console.log("[tenants]用户:", req.user.username, "请求租户列表，返回所有租户");
            return res.json({ success: true, data: list });
        }
        const safe = list.map(t => ({ id: t.id, name: t.name }));
        console.log("[tenants]用户:", req.user.username, "请求租户列表，返回安全信息");
        res.json({ success: true, data: safe });
    } catch (err) {
        next(err);
    }
});

router.post('/', requireAdmin, async (req, res, next) => {
    try {
        const { name, maxDevices, maxUsers } = req.body;
        if (!name) {
            console.error("[tenants]用户:", req.user.username, "尝试创建租户，但未提供名称");
            return res.status(400).json({ success: false, error: { code: 400, message: 'name is required' } });
        }
        const id = await TenantRepository.insert({
            name,
            status: 'active',
            maxDevices: maxDevices || 100,
            maxUsers: maxUsers || 20,
        });
        res.json({ success: true, data: { id, name, status: 'active', maxDevices: maxDevices || 100, maxUsers: maxUsers || 20 } });
    } catch (err) {
        next(err);
    }
});

router.put('/:id', requireAdmin, async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const existing = await TenantRepository.findById(id);
        if (!existing) {
            console.error("[tenants]用户:", req.user.username, "尝试更新租户，但租户ID不存在:", id);
            return res.status(404).json({ success: false, error: { code: 404, message: 'Tenant not found' } });
        }
        await TenantRepository.update(id, req.body);
        const updated = await TenantRepository.findById(id);
        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const existing = await TenantRepository.findById(id);
        console.error("[tenants]用户:", req.user.username, "尝试删除租户，但租户ID不存在:", id);
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 404, message: 'Tenant not found' } });
        }
        await TenantRepository.delete(id);
        res.json({ success: true, data: { id } });
    } catch (err) {
        next(err);
    }
});

export default router;