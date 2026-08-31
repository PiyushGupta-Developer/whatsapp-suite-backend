// const mongoose = require('mongoose');

// const contactSchema = new mongoose.Schema(
//   {
//     name: { type: String, trim: true },
//     architectName: { type: String, trim: true },
//     firmName: { type: String, trim: true },
//     area: { type: String, trim: true },
//     address: { type: String, trim: true },
//     location: { type: String, trim: true },
//     date: { type: Date },
//     meetingCallDate: { type: Date },
//     requirement: { type: String, trim: true },
//     req: { type: String, trim: true },
//     phone: { type: String, required: true, trim: true },
//     email: { type: String, trim: true, lowercase: true },
//     remark: { type: String, trim: true },
//     reminderAt: { type: Date },
//     reminderSentAt: { type: Date },
//     whatsappId: String,
//     tags: [{ type: String }],
//     lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
//     status: {
//       type: String,
//       enum: ['Active', 'Blocked', 'Unsubscribed'],
//       default: 'Active',
//     },
//     lastMessagedAt: { type: Date },
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   },
//   { timestamps: true }
// );

// contactSchema.index({ phone: 1 });
// contactSchema.index({ reminderAt: 1, reminderSentAt: 1 });

// module.exports = mongoose.models.Contact || mongoose.model('Contact', contactSchema);


const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    architectName: { type: String, trim: true },
    firmName: { type: String, trim: true },
    area: { type: String, trim: true },
    address: { type: String, trim: true },
    location: { type: String, trim: true },
    date: { type: Date },
    meetingCallDate: { type: Date },
    requirement: { type: String, trim: true },
    req: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    remark: { type: String, trim: true },

    reminderAt: { type: Date },
    reminderSentAt: { type: Date },
    reminderMessage: { type: String, trim: true },
    reminderDeviceId: { type: String, trim: true },

    whatsappId: String,
    tags: [{ type: String }],
    lists: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ContactList',
      },
    ],
    status: {
      type: String,
      enum: ['Active', 'Blocked', 'Unsubscribed'],
      default: 'Active',
    },
    lastMessagedAt: { type: Date },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

contactSchema.index({ phone: 1 });
contactSchema.index({
  reminderAt: 1,
  reminderSentAt: 1,
});

module.exports =
  mongoose.models.Contact ||
  mongoose.model('Contact', contactSchema);