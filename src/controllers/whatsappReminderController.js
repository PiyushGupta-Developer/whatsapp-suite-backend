const WhatsAppReminder = require("../models/WhatsAppReminder");

/**
 * Add or update fixed WhatsApp reminder numbers.
 * Maximum 2 numbers allowed.
 */
const saveWhatsAppReminderNumbers = async (req, res) => {
  try {
    const { phoneNumbers, deviceId } = req.body;

    // Validation
    if (!Array.isArray(phoneNumbers)) {
      return res.status(400).json({
        success: false,
        message: "phoneNumbers must be an array",
      });
    }

    if (phoneNumbers.length < 1 || phoneNumbers.length > 2) {
      return res.status(400).json({
        success: false,
        message: "Only 1 or 2 phone numbers are allowed",
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "deviceId is required",
      });
    }

    // Remove spaces and empty numbers
    const cleanedNumbers = phoneNumbers
      .map((phone) => String(phone).trim())
      .filter(Boolean);

    if (cleanedNumbers.length < 1 || cleanedNumbers.length > 2) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid 1 or 2 phone numbers",
      });
    }

    // Only ONE settings document
    let reminderSettings = await WhatsAppReminder.findOne();

    if (reminderSettings) {
      reminderSettings.phoneNumbers = cleanedNumbers;
      reminderSettings.deviceId = String(deviceId);

      await reminderSettings.save();
    } else {
      reminderSettings = await WhatsAppReminder.create({
        phoneNumbers: cleanedNumbers,
        deviceId: String(deviceId),
      });
    }

    return res.status(200).json({
      success: true,
      message: "WhatsApp reminder numbers saved successfully",
      data: reminderSettings,
    });
  } catch (error) {
    console.error("[WHATSAPP REMINDER] Save error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save WhatsApp reminder numbers",
    });
  }
};

module.exports = {
  saveWhatsAppReminderNumbers,
};
