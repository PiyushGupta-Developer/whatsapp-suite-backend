const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }]
});

module.exports = mongoose.model('Group', groupSchema);
