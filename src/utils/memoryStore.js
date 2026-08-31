/**
 * In-memory store used when MongoDB is not available (local demo).
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const store = {
  users: [],
  devices: [],
  campaigns: [],
  contacts: [],
  media: [],
  reminders: [],
  notes: [],
  schedules: [],
  queue: [],
  cronLogs: [],
  messageTemplates: [],
  variables: [],
  notifications: [],
  ready: false,
};

async function init() {
  if (store.ready) return;
  const hash = await bcrypt.hash('admin123', 10);
  const hash2 = await bcrypt.hash('pass123', 10);

  store.users = [
    {
      _id: 'u1',
      name: 'Admin User',
      email: 'admin@whatsappsuite.com',
      password: hash,
      role: 'Administrator',
      status: 'Active',
      mobile: '+919876543210',
      lastLogin: null,
      toJSON() {
        const { password, ...rest } = this;
        return rest;
      },
      comparePassword(p) {
        return bcrypt.compare(p, this.password);
      },
    },
    {
      _id: 'u2',
      name: 'Rahul Sharma',
      email: 'rahul@whatsappsuite.com',
      password: hash2,
      role: 'Manager',
      status: 'Active',
      mobile: '+919876543211',
      toJSON() {
        const { password, ...rest } = this;
        return rest;
      },
      comparePassword(p) {
        return bcrypt.compare(p, this.password);
      },
    },
    {
      _id: 'u3',
      name: 'Priya Singh',
      email: 'priya@whatsappsuite.com',
      password: hash2,
      role: 'Operator',
      status: 'Active',
      mobile: '+919876543212',
      toJSON() {
        const { password, ...rest } = this;
        return rest;
      },
      comparePassword(p) {
        return bcrypt.compare(p, this.password);
      },
    },
    {
      _id: 'u4',
      name: 'Amit Kumar',
      email: 'amit@whatsappsuite.com',
      password: hash2,
      role: 'Operator',
      status: 'Active',
      mobile: '+919876543213',
      toJSON() {
        const { password, ...rest } = this;
        return rest;
      },
      comparePassword(p) {
        return bcrypt.compare(p, this.password);
      },
    },
    {
      _id: 'u5',
      name: 'Neha Verma',
      email: 'neha@whatsappsuite.com',
      password: hash2,
      role: 'Viewer',
      status: 'Inactive',
      mobile: '+919876543214',
      toJSON() {
        const { password, ...rest } = this;
        return rest;
      },
      comparePassword(p) {
        return bcrypt.compare(p, this.password);
      },
    },
  ];

  store.devices = [
    { _id: 'd1', name: 'Samsung S24 Ultra', phoneNumber: '+91 98765 43210', model: 'Samsung S24 Ultra', status: 'Online', battery: 87, lastSeen: new Date() },
    { _id: 'd2', name: 'iPhone 15 Pro', phoneNumber: '+91 87654 32109', model: 'iPhone 15 Pro', status: 'Online', battery: 92, lastSeen: new Date() },
    { _id: 'd3', name: 'OnePlus 12', phoneNumber: '+91 76543 21098', model: 'OnePlus 12', status: 'Online', battery: 78, lastSeen: new Date() },
    { _id: 'd4', name: 'Redmi Note 13', phoneNumber: '+91 65432 10987', model: 'Redmi Note 13', status: 'Offline', battery: 45, lastSeen: new Date(Date.now() - 86400000) },
  ];

  store.campaigns = [
    { _id: 'c1', name: 'Festival Offer 2024', status: 'Completed', recipients: 8500, sent: 8500, delivered: 8230, read: 7520, failed: 270, createdAt: '2024-07-21T00:00:00.000Z' },
    { _id: 'c2', name: 'Summer Sale', status: 'Completed', recipients: 12000, sent: 12000, delivered: 11650, read: 9800, failed: 350, createdAt: '2024-07-20T00:00:00.000Z' },
    { _id: 'c3', name: 'New Product Launch', status: 'Running', recipients: 5000, sent: 3500, delivered: 3250, read: 0, failed: 250, createdAt: '2024-07-18T00:00:00.000Z' },
    { _id: 'c4', name: 'Weekend Offer', status: 'Completed', recipients: 10000, sent: 10000, delivered: 9765, read: 8800, failed: 120, createdAt: '2024-07-17T00:00:00.000Z' },
    { _id: 'c5', name: 'Flash Sale', status: 'Scheduled', recipients: 7500, sent: 0, delivered: 0, read: 0, failed: 0, createdAt: '2024-07-22T00:00:00.000Z', scheduledAt: '2024-07-22T11:30:00.000Z' },
  ];

  store.contacts = Array.from({ length: 100 }, (_, i) => ({
    _id: `ct${i}`,
    name: `Contact ${i + 1}`,
    phone: `+9198${String(10000000 + i).padStart(8, '0')}`,
  }));

  store.media = [
    { _id: 'm1', originalName: 'offer.jpg', type: 'Image', size: 120 * 1024, filename: 'offer.jpg' },
    { _id: 'm2', originalName: 'catalog.pdf', type: 'PDF', size: 1.3 * 1024 * 1024, filename: 'catalog.pdf' },
    { _id: 'm3', originalName: 'demo.mp4', type: 'Video', size: 5.4 * 1024 * 1024, filename: 'demo.mp4' },
  ];

  store.ready = true;
  console.log('In-memory demo data loaded (no MongoDB)');
  console.log('Login: admin@whatsappsuite.com / admin123');
}

function isMongoConnected() {
  try {
    const mongoose = require('mongoose');
    return mongoose.connection.readyState === 1;
  } catch {
    return false;
  }
}

module.exports = { store, init, isMongoConnected, uuidv4 };
