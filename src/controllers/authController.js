const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { store, init, isMongoConnected } = require('../utils/memoryStore');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'whatsapp_suite_jwt_secret_2024_change_me', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    // Prefer MongoDB when available
    if (isMongoConnected()) {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
      if (user.status !== 'Active') {
        return res.status(403).json({ success: false, message: 'Account is inactive. Contact admin.' });
      }
      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });
      const token = generateToken(user._id);
      return res.json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
        },
      });
    }

    // In-memory fallback
    await init();
    const user = store.users.find((u) => u.email === email.toLowerCase());
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (user.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'Account is inactive. Contact admin.' });
    }
    user.lastLogin = new Date();
    const token = generateToken(user._id);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// exports.register = async (req, res) => {
//   try {
//     const { name, email, password, role, mobile } = req.body;
//     if (isMongoConnected()) {
//       const exists = await User.findOne({ email: email.toLowerCase() });
//       if (exists) {
//         return res.status(400).json({ success: false, message: 'User already exists' });
//       }
//       const user = await User.create({
//         name,
//         email,
//         password,
//         role: role || 'Operator',
//         mobile,
//       });
//       const token = generateToken(user._id);
//       return res.status(201).json({
//         success: true,
//         token,
//         user: { id: user._id, name: user.name, email: user.email, role: user.role },
//       });
//     }

//     await init();
//     if (store.users.find((u) => u.email === email.toLowerCase())) {
//       return res.status(400).json({ success: false, message: 'User already exists' });
//     }
//     const bcrypt = require('bcryptjs');
//     const newUser = {
//       _id: `u${Date.now()}`,
//       name,
//       email: email.toLowerCase(),
//       password: await bcrypt.hash(password || 'pass123', 10),
//       role: role || 'Operator',
//       status: 'Active',
//       mobile,
//       toJSON() {
//         const { password, ...rest } = this;
//         return rest;
//       },
//       comparePassword(p) {
//         return bcrypt.compare(p, this.password);
//       },
//     };
//     store.users.push(newUser);
//     const token = generateToken(newUser._id);
//     res.status(201).json({
//       success: true,
//       token,
//       user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role },
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

exports.register = async (req, res) => {
  try {
    const { name, email, password, role, mobile } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required'
      });
    }
       
    // Normalize email safely
    const normalizedEmail = String(email).trim().toLowerCase();

    if (isMongoConnected()) {
      const exists = await User.findOne({
        email: normalizedEmail
      });

      if (exists) {
        return res.status(400).json({
          success: false,
          message: 'User already exists'
        });
      }

      const user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password,
        role: role || 'Operator',
        mobile,
      });

      const token = generateToken(user._id);

      return res.status(201).json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    }

    await init();

    const exists = store.users.find(
      (u) => u.email.toLowerCase() === normalizedEmail
    );

    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    const bcrypt = require('bcryptjs');

    const newUser = {
      _id: `u${Date.now()}`,
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
      role: role || 'Operator',
      status: 'Active',
      mobile,

      toJSON() {
        const { password, ...rest } = this;
        return rest;
      },

      comparePassword(p) {
        return bcrypt.compare(p, this.password);
      },
    };

    store.users.push(newUser);

    const token = generateToken(newUser._id);

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });

  } catch (error) {
    console.error('Register error:', error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
