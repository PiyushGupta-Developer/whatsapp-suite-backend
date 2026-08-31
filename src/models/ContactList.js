const mongoose = require('mongoose');

const contactListSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    contactCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContactList', contactListSchema);
