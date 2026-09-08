const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      default: 'General',
      trim: true,
    },

    status: {
      type: String,
      enum: ['Draft', 'Active', 'Inactive'],
      default: 'Draft',
    },

    body: {
      type: String,
      required: true,
      trim: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  'Template',
  templateSchema
);