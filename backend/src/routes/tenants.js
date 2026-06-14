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
        return res.status(403).json({ success: false, error: { code: 403, message: '仅系统管理员可操作' } });
    }
    next();
}

// GET: 所有登录用户可看（用户管理页需要显示租户名）
router.get('/', async (req, res, next) => {
    try {
        const list = await TenantRepository.findAll();
        res.json({ success: true, data: list });
    } catch (err) {
        next(err);
    }
});

router.post('/', requireAdmin, async (req, res, next) => {
    try {
        const { name, maxDevices, maxUsers } = req.body;
        if (!name) {
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