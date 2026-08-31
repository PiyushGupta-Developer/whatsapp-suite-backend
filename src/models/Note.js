const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    contactId: { type: String, index: true },
    title: { type: String, trim: true },
    content: { type: String, trim: true },
    type: { type: String, enum: ['note', 'reminder', 'schedule'], default: 'note' },
    date: { type: Date },
    completed: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Note || mongoose.model('Note', noteSchema);
