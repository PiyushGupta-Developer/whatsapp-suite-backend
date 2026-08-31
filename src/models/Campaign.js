const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    message: { type: String, default: '' },
    sendText: { type: Boolean, default: true },
    mediaFiles: [{ type: mongoose.Schema.Types.Mixed }],

    status: {
      type: String,
      enum: ['Draft', 'Scheduled', 'Running', 'Completed', 'Failed', 'Paused'],
      default: 'Draft',
    },

    recipients: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    read: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },

    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
    deviceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' }],
    contactListIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    directRecipients: [
  {
    name: { type: String, default: '' },
    phone: { type: String, required: true },
    whatsappId: { type: String, default: '' },
  },
],
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],

    scheduledAt: { type: Date },
    timezone: { type: String, default: 'Asia/Kolkata' },
    repeat: {
      type: String,
      enum: ['No Repeat', 'Daily', 'Weekly', 'Monthly', 'Custom'],
      default: 'No Repeat',
    },
    endDate: { type: Date },
    nextRunAt: { type: Date },

    estimatedTimeMinutes: { type: Number },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startedAt: { type: Date },
    completedAt: { type: Date },
    report: {
      total: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      results: [{ type: mongoose.Schema.Types.Mixed }],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
