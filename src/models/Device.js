const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    model: { type: String }, // e.g. Samsung S24 Ultra

    // WhatsApp connection status
    status: {
      type: String,
      enum: ['Online', 'Offline', 'Connecting', 'QR_Scanning'],
      default: 'Offline',
    },

    // Battery level
    battery: { type: Number, min: 0, max: 100, default: 100 },

    // Last seen timestamp
    lastSeen: { type: Date, default: Date.now },

    // QR code for WhatsApp session (base64 or session data)
    qrCode: { type: String },

    // Session ID for WhatsApp Web connection
    sessionId: { type: String },

    // Owner reference
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Mark primary device
    isPrimary: { type: Boolean, default: false },

    // Track if device is actively connected to WhatsApp
    isActive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 🔹 Static method: count total active devices
deviceSchema.statics.countActiveDevices = async function () {
  return this.countDocuments({ isActive: true, status: 'Online' });
};

// 🔹 Instance method: mark device as scanned via QR
deviceSchema.methods.markQrScanned = function (sessionId) {
  this.status = 'Online';
  this.isActive = true;
  this.sessionId = sessionId;
  this.qrCode = null; // clear QR once scanned
  this.lastSeen = new Date();
  return this.save();
};

// 🔹 Instance method: mark device offline
deviceSchema.methods.markOffline = function () {
  this.status = 'Offline';
  this.isActive = false;
  this.lastSeen = new Date();
  return this.save();
};

// ✅ Safe export pattern: reuse existing model if already compiled
module.exports = mongoose.models.Device || mongoose.model('Device', deviceSchema);
