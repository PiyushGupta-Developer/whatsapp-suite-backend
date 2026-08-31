require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Device = require('../models/Device');
const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_suite');
    console.log('Connected. Seeding...');

    await User.deleteMany();
    await Device.deleteMany();
    await Campaign.deleteMany();
    await Contact.deleteMany();

    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@whatsappsuite.com',
      password: 'admin123',
      role: 'Administrator',
      status: 'Active',
      mobile: '+919876543210',
    });

    await User.create([
      { name: 'Rahul Sharma', email: 'rahul@whatsappsuite.com', password: 'pass123', role: 'Manager', status: 'Active', mobile: '+919876543211' },
      { name: 'Priya Singh', email: 'priya@whatsappsuite.com', password: 'pass123', role: 'Operator', status: 'Active', mobile: '+919876543212' },
      { name: 'Amit Kumar', email: 'amit@whatsappsuite.com', password: 'pass123', role: 'Operator', status: 'Active', mobile: '+919876543213' },
      { name: 'Neha Verma', email: 'neha@whatsappsuite.com', password: 'pass123', role: 'Viewer', status: 'Inactive', mobile: '+919876543214' },
    ]);

    const devices = await Device.create([
      { name: 'Samsung S24 Ultra', phoneNumber: '+91 98765 43210', model: 'Samsung S24 Ultra', status: 'Online', battery: 87, lastSeen: new Date(), owner: admin._id },
      { name: 'iPhone 15 Pro', phoneNumber: '+91 87654 32109', model: 'iPhone 15 Pro', status: 'Online', battery: 92, lastSeen: new Date(), owner: admin._id },
      { name: 'OnePlus 12', phoneNumber: '+91 76543 21098', model: 'OnePlus 12', status: 'Online', battery: 78, lastSeen: new Date(), owner: admin._id },
      { name: 'Redmi Note 13', phoneNumber: '+91 65432 10987', model: 'Redmi Note 13', status: 'Offline', battery: 45, lastSeen: new Date(Date.now() - 86400000), owner: admin._id },
    ]);

    await Campaign.create([
      { name: 'Festival Offer 2024', status: 'Completed', recipients: 8500, sent: 8500, delivered: 8230, read: 7520, failed: 270, device: devices[0]._id, createdBy: admin._id, startedAt: new Date('2024-07-21'), completedAt: new Date('2024-07-21') },
      { name: 'Summer Sale', status: 'Completed', recipients: 12000, sent: 12000, delivered: 11650, read: 9800, failed: 350, device: devices[1]._id, createdBy: admin._id, startedAt: new Date('2024-07-20'), completedAt: new Date('2024-07-20') },
      { name: 'New Product Launch', status: 'Running', recipients: 5000, sent: 3500, delivered: 3250, read: 0, failed: 250, device: devices[0]._id, createdBy: admin._id, startedAt: new Date('2024-07-18') },
      { name: 'Weekend Offer', status: 'Completed', recipients: 10000, sent: 10000, delivered: 9765, read: 8800, failed: 120, device: devices[2]._id, createdBy: admin._id, startedAt: new Date('2024-07-17'), completedAt: new Date('2024-07-17') },
      { name: 'Flash Sale', status: 'Scheduled', recipients: 7500, sent: 0, delivered: 0, read: 0, failed: 0, device: devices[0]._id, createdBy: admin._id, scheduledAt: new Date('2024-07-22T11:30:00') },
    ]);

    // Sample contacts
    const samplePhones = [];
    for (let i = 0; i < 100; i++) {
      samplePhones.push({
        name: `Contact ${i + 1}`,
        phone: `+9198${String(10000000 + i).padStart(8, '0')}`,
        createdBy: admin._id,
      });
    }
    await Contact.insertMany(samplePhones);

    console.log('Seed completed!');
    console.log('Login: admin@whatsappsuite.com / admin123');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seed();
