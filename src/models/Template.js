const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    body: { type: String, required: true },
    category: { type: String, default: 'General' },
    media: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Media' }],
    variables: [{ type: String }], // e.g. {{name}}, {{order_id}}
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Template', templateSchema);
