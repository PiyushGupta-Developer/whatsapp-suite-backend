const mongoose = require("mongoose");

const whatsAppReminderSchema = new mongoose.Schema(
  {
    phoneNumbers: {
      type: [String],
      required: true,
      validate: {
        validator: function (numbers) {
          return numbers.length >= 1 && numbers.length <= 2;
        },
        message: "Only 1 or 2 phone numbers are allowed",
      },
    },

    deviceId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("WhatsAppReminder", whatsAppReminderSchema);
