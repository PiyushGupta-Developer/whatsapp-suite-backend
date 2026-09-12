const mongoose = require("mongoose");

const scheduleContactAddSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    tags: {
      type: [String],
      default: ["WhatsApp", "Schedule"],
    },

    lists: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ScheduleContactAdd", scheduleContactAddSchema);
