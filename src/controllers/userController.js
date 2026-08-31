const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { store, init, isMongoConnected } = require('../utils/memoryStore');
const {
  ROLES,
  permissionsForRole,
  allPermissionsList,
  roleHasPermission,
} = require('../utils/permissions');

function sanitize(user) {
  if (!user) return null;
  if (typeof user.toJSON === 'function') return user.toJSON();
  const { password, ...rest } = user;
  return rest;
}

// ─── List employees ───────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 50 } = req.query;

    if (isMongoConnected()) {
      const filter = {};
      if (role && role !== 'All Roles') filter.role = role;
      if (status && status !== 'All') filter.status = status;
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } },
        ];
      }
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const [users, total] = await Promise.all([
        User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
        User.countDocuments(filter),
      ]);
      const stats = {
        Administrator: await User.countDocuments({ role: 'Administrator' }),
        Manager: await User.countDocuments({ role: 'Manager' }),
        Operator: await User.countDocuments({ role: 'Operator' }),
        Viewer: await User.countDocuments({ role: 'Viewer' }),
        Active: await User.countDocuments({ status: 'Active' }),
        Inactive: await User.countDocuments({ status: 'Inactive' }),
      };
      return res.json({ success: true, count: users.length, total, stats, data: users, roles: ROLES });
    }

    await init();
    let users = [...store.users];
    if (role && role !== 'All Roles') users = users.filter((u) => u.role === role);
    if (status && status !== 'All') users = users.filter((u) => u.status === status);
    if (search) {
      const s = search.toLowerCase();
      users = users.filter(
        (u) =>
          (u.name || '').toLowerCase().includes(s) ||
          (u.email || '').toLowerCase().includes(s) ||
          (u.mobile || '').includes(s)
      );
    }
    const stats = {
      Administrator: store.users.filter((u) => u.role === 'Administrator').length,
      Manager: store.users.filter((u) => u.role === 'Manager').length,
      Operator: store.users.filter((u) => u.role === 'Operator').length,
      Viewer: store.users.filter((u) => u.role === 'Viewer').length,
      Active: store.users.filter((u) => u.status === 'Active').length,
      Inactive: store.users.filter((u) => u.status === 'Inactive').length,
    };
    res.json({
      success: true,
      count: users.length,
      total: users.length,
      stats,
      data: users.map(sanitize),
      roles: ROLES,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get single employee ──────────────────────────────────────
exports.getUser = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      return res.json({
        success: true,
        data: user,
        permissions: permissionsForRole(user.role),
      });
    }
    await init();
    const user = store.users.find((u) => u._id === req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({
      success: true,
      data: sanitize(user),
      permissions: permissionsForRole(user.role),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Create employee ──────────────────────────────────────────
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, mobile, status } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Allowed: ${ROLES.join(', ')}` });
    }

    if (isMongoConnected()) {
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists) return res.status(400).json({ success: false, message: 'Email already registered' });
      const user = await User.create({
        name,
        email: email.toLowerCase(),
        password: password || 'pass123',
        role: role || 'Operator',
        mobile,
        status: status || 'Active',
      });
      return res.status(201).json({ success: true, data: user, message: 'Employee created' });
    }

    await init();
    if (store.users.find((u) => u.email === email.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }
    const user = {
      _id: `u${Date.now()}`,
      name,
      email: email.toLowerCase(),
      password: await bcrypt.hash(password || 'pass123', 10),
      role: role || 'Operator',
      status: status || 'Active',
      mobile: mobile || '',
      createdAt: new Date().toISOString(),
      toJSON() {
        const { password, ...rest } = this;
        return rest;
      },
      comparePassword(p) {
        return bcrypt.compare(p, this.password);
      },
    };
    store.users.push(user);
    res.status(201).json({ success: true, data: sanitize(user), message: 'Employee created' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Update employee ──────────────────────────────────────────
exports.updateUser = async (req, res) => {
  try {
    const { name, email, role, mobile, status, password } = req.body;

    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Allowed: ${ROLES.join(', ')}` });
    }

    if (isMongoConnected()) {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      if (name) user.name = name;
      if (email) user.email = email.toLowerCase();
      if (role) user.role = role;
      if (mobile !== undefined) user.mobile = mobile;
      if (status) user.status = status;
      if (password) user.password = password;
      await user.save();
      return res.json({ success: true, data: user, message: 'Employee updated' });
    }

    await init();
    const user = store.users.find((u) => u._id === req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (role) user.role = role;
    if (mobile !== undefined) user.mobile = mobile;
    if (status) user.status = status;
    if (password) user.password = await bcrypt.hash(password, 10);
    res.json({ success: true, data: sanitize(user), message: 'Employee updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Activate / Deactivate ────────────────────────────────────
exports.toggleStatus = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      // Prevent self-deactivate
      if (String(user._id) === String(req.user._id || req.user.id)) {
        return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
      }
      user.status = user.status === 'Active' ? 'Inactive' : 'Active';
      await user.save();
      return res.json({ success: true, data: user, message: `Employee ${user.status}` });
    }

    await init();
    const user = store.users.find((u) => u._id === req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user._id === (req.user._id || req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }
    user.status = user.status === 'Active' ? 'Inactive' : 'Active';
    res.json({ success: true, data: sanitize(user), message: `Employee ${user.status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Set status explicitly ────────────────────────────────────
exports.setStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be Active or Inactive' });
    }
    if (isMongoConnected()) {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      if (String(user._id) === String(req.user._id || req.user.id) && status === 'Inactive') {
        return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
      }
      user.status = status;
      await user.save();
      return res.json({ success: true, data: user, message: `Employee set to ${status}` });
    }
    await init();
    const user = store.users.find((u) => u._id === req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user._id === (req.user._id || req.user.id) && status === 'Inactive') {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }
    user.status = status;
    res.json({ success: true, data: sanitize(user), message: `Employee set to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Delete employee ──────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    if (isMongoConnected()) {
      if (String(req.params.id) === String(req.user._id || req.user.id)) {
        return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
      }
      const user = await User.findByIdAndDelete(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      return res.json({ success: true, message: 'Employee deleted' });
    }
    await init();
    if (req.params.id === (req.user._id || req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    const idx = store.users.findIndex((u) => u._id === req.params.id);
    if (idx < 0) return res.status(404).json({ success: false, message: 'User not found' });
    store.users.splice(idx, 1);
    res.json({ success: true, message: 'Employee deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── My Profile ───────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const id = req.user._id || req.user.id;
    if (isMongoConnected()) {
      const user = await User.findById(id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      return res.json({
        success: true,
        data: user,
        permissions: permissionsForRole(user.role),
      });
    }
    await init();
    const user = store.users.find((u) => u._id === id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({
      success: true,
      data: sanitize(user),
      permissions: permissionsForRole(user.role),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const id = req.user._id || req.user.id;
    const { name, mobile, password, currentPassword } = req.body;
    // Users cannot change own role/status via profile

    if (isMongoConnected()) {
      const user = await User.findById(id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      if (password) {
        if (!currentPassword || !(await user.comparePassword(currentPassword))) {
          return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }
        user.password = password;
      }
      if (name) user.name = name;
      if (mobile !== undefined) user.mobile = mobile;
      await user.save();
      return res.json({ success: true, data: user, message: 'Profile updated' });
    }

    await init();
    const user = store.users.find((u) => u._id === id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (password) {
      if (!currentPassword || !(await user.comparePassword(currentPassword))) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
      user.password = await bcrypt.hash(password, 10);
    }
    if (name) user.name = name;
    if (mobile !== undefined) user.mobile = mobile;
    res.json({ success: true, data: sanitize(user), message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Permissions ──────────────────────────────────────────────
exports.getPermissions = async (req, res) => {
  try {
    const role = req.query.role || req.user.role;
    res.json({
      success: true,
      roles: ROLES,
      role,
      permissions: permissionsForRole(role),
      matrix: allPermissionsList(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkPermission = async (req, res) => {
  try {
    const permission = req.params.perm || req.params.permission;
    const allowed = roleHasPermission(req.user.role, permission);
    res.json({ success: true, permission, allowed, role: req.user.role });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
