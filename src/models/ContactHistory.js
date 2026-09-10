const mongoose = require("mongoose");

const contactHistorySchema = new mongoose.Schema(
  {
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    version: {
      type: Number,
      required: true,
    },

    architectName: {
      type: String,
      default: "",
    },

    firmName: {
      type: String,
      default: "",
    },

    area: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    location: {
      type: String,
      default: "",
    },

    meetingCallDate: {
      type: Date,
      default: null,
    },

    req: {
      type: String,
      default: "",
    },

    requirement: {
      type: String,
      default: "",
    },

    phone: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      default: "",
    },

    remark: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      default: "Active",
    },

    tags: {
      type: Array,
      default: [],
    },

    lists: {
      type: Array,
      default: [],
    },

    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ContactHistory", contactHistorySchema);
