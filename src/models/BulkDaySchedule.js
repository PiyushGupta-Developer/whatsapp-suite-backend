const mongoose = require("mongoose");

const bulkDayScheduleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    scheduleType: {
      type: String,
      enum: ["fifteenth_day", "month_end"],
      required: true,
    },

    recurring: {
      type: Boolean,
      default: false,
    },

    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31,
      default: null,
    },

    time: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "stopped"],
      default: "active",
    },

    cronExpression: {
      type: String,
      default: null,
    },

    selectedMonths: {
      type: [Number],
      default: [],
    },

    year: {
      type: Number,
      default: null,
    },

    calculatedDates: {
      type: [Date],
      default: [],
    },

    nextRunAt: {
      type: Date,
      default: null,
    },

    lastRunAt: {
      type: Date,
      default: null,
    },

    deviceIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device",
      },
    ],

    recipients: [
      {
        name: {
          type: String,
          default: "",
        },

        phone: {
          type: String,
          required: true,
        },

        whatsappId: {
          type: String,
          default: "",
        },
      },
    ],

    message: {
      type: String,
      default: "",
    },

    delaySeconds: {
      type: Number,
      default: 0,
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

module.exports =
  mongoose.models.BulkDaySchedule ||
  mongoose.model("BulkDaySchedule", bulkDayScheduleSchema);
