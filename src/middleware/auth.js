const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { store, init, isMongoConnected } = require('../utils/memoryStore');

exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'whatsapp_suite_jwt_secret_2024_change_me');

    if (isMongoConnected()) {
      req.user = await User.findById(decoded.id);
      if (!req.user || req.user.status !== 'Active') {
        return res.status(401).json({ success: false, message: 'User not active or not found' });
      }
      return next();
    }

    await init();
    const user = store.users.find((u) => u._id === decoded.id || String(u._id) === String(decoded.id));
    if (!user || user.status !== 'Active') {
      return res.status(401).json({ success: false, message: 'User not active or not found' });
    }
    req.user = {
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role ${req.user.role} is not authorized to access this route`,
      });
    }
    next();
  };
};
