const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String },
    mimeType: { type: String },
    size: { type: Number }, // bytes
    type: {
      type: String,
      enum: ['Image', 'Video', 'PDF', 'Document', 'Audio'],
      required: true,
    },
    path: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Media', mediaSchema);
