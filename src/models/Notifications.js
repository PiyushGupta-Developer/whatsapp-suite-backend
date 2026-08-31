const mongoose = require('mongoose');
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: [
        'info',
        'success',
        'warning',
        'error',
        'reminder',
        'campaign',
        'system'
      ],
      default: 'info'
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    link: {
      type: String,
      default: null
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Fast lookups for "unread notifications for a user, newest first"
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);