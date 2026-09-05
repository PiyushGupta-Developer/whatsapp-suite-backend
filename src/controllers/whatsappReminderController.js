const WhatsAppReminder = require("../models/WhatsAppReminder");

const saveWhatsAppReminderNumbers = async (req, res) => {
  try {
    const { phoneNumbers } = req.body;

    // Validation: phoneNumbers must be an array
    if (!Array.isArray(phoneNumbers)) {
      return res.status(400).json({
        success: false,
        message: "phoneNumbers must be an array",
      });
    }

    // Remove spaces and empty numbers
    const cleanedNumbers = phoneNumbers
      .map((phone) => String(phone).trim())
      .filter(Boolean);

    // Maximum 2 numbers allowed
    if (cleanedNumbers.length < 1 || cleanedNumbers.length > 2) {
      return res.status(400).json({
        success: false,
        message: "Only 1 or 2 valid phone numbers are allowed",
      });
    }

    // Find existing settings document
    let reminderSettings = await WhatsAppReminder.findOne();

    if (reminderSettings) {
      // Update existing numbers
      reminderSettings.phoneNumbers = cleanedNumbers;

      await reminderSettings.save();
    } else {
      // Create new settings
      reminderSettings = await WhatsAppReminder.create({
        phoneNumbers: cleanedNumbers,
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
