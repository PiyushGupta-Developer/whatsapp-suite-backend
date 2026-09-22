const BulkDaySchedule = require("../models/BulkDaySchedule");

/**
 * Get next 15th day of a month
 */
function getNextFifteenthDate(time) {
  const [hours, minutes] = String(time).split(":").map(Number);

  const now = new Date();

  let next = new Date(now);

  next.setDate(15);
  next.setHours(hours, minutes, 0, 0);

  // Agar current month ki 15th date/time nikal chuka hai
  // to next month ki 15th date
  if (next <= now) {
    next.setMonth(next.getMonth() + 1);
    next.setDate(15);
    next.setHours(hours, minutes, 0, 0);
  }

  return next;
}

/**
 * Create Bulk Day Schedule
 */
exports.create = async (req, res) => {
  try {
    const {
      name,
      scheduleType,
      recurring = false,
      dayOfMonth,
      time,
      status = "active",
      cronExpression,
      selectedMonths = [],
      year,
      calculatedDates = [],
      deviceIds = [],
      recipients = [],
      message = "",
      delaySeconds = 0,
    } = req.body;

    // -----------------------------------------
    // 1. Validate name
    // -----------------------------------------

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Schedule name is required",
      });
    }

    // -----------------------------------------
    // 2. Validate schedule type
    // -----------------------------------------

    if (!["fifteenth_day", "month_end"].includes(scheduleType)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid scheduleType. Allowed values: fifteenth_day, month_end",
      });
    }

    // -----------------------------------------
    // 3. Validate time
    // -----------------------------------------

    if (!time) {
      return res.status(400).json({
        success: false,
        message: "Schedule time is required",
      });
    }

    // -----------------------------------------
    // 4. Validate devices
    // -----------------------------------------

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one WhatsApp device is required",
      });
    }

    // -----------------------------------------
    // 5. Validate recipients
    // -----------------------------------------

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one recipient is required",
      });
    }

    // -----------------------------------------
    // 6. Validate recipient phone numbers
    // -----------------------------------------

    const invalidRecipient = recipients.find(
      (recipient) => !recipient || !recipient.phone,
    );

    if (invalidRecipient) {
      return res.status(400).json({
        success: false,
        message: "Every recipient must contain a phone number",
      });
    }

    // -----------------------------------------
    // 7. Calculate next run
    // -----------------------------------------

    let nextRunAt = null;

    // -----------------------------------------
    // FIFTEENTH DAY
    // -----------------------------------------

    if (scheduleType === "fifteenth_day") {
      if (Number(dayOfMonth) !== 15) {
        return res.status(400).json({
          success: false,
          message: "For fifteenth_day schedule, dayOfMonth must be 15",
        });
      }

      nextRunAt = getNextFifteenthDate(time);
    }

    // -----------------------------------------
    // MONTH END
    // -----------------------------------------

    if (scheduleType === "month_end") {
      if (!Array.isArray(calculatedDates) || calculatedDates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "calculatedDates is required for month_end schedule",
        });
      }

      const parsedDates = calculatedDates
        .map((date) => new Date(date))
        .filter((date) => !Number.isNaN(date.getTime()));

      if (parsedDates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid dates found in calculatedDates",
        });
      }

      parsedDates.sort((a, b) => a.getTime() - b.getTime());

      const now = new Date();

      nextRunAt = parsedDates.find((date) => date > now) || null;

      if (!nextRunAt) {
        return res.status(400).json({
          success: false,
          message: "No future date found in calculatedDates",
        });
      }
    }

    // -----------------------------------------
    // 8. User ID
    // -----------------------------------------

    const createdBy = req.user?._id || req.user?.id;

    if (!createdBy) {
      return res.status(401).json({
        success: false,
        message: "User authentication information not found",
      });
    }

    // -----------------------------------------
    // 9. Create schedule
    // -----------------------------------------

    const schedule = await BulkDaySchedule.create({
      name: name.trim(),

      scheduleType,

      recurring: Boolean(recurring),

      dayOfMonth: dayOfMonth !== undefined ? Number(dayOfMonth) : null,

      time,

      status,

      cronExpression: cronExpression || null,

      selectedMonths: Array.isArray(selectedMonths)
        ? selectedMonths.map(Number)
        : [],

      year: year !== undefined && year !== null ? Number(year) : null,

      calculatedDates: Array.isArray(calculatedDates) ? calculatedDates : [],

      nextRunAt,

      deviceIds,

      recipients,

      message,

      delaySeconds: Number(delaySeconds) || 0,

      createdBy,
    });

    // -----------------------------------------
    // 10. Response
    // -----------------------------------------

    return res.status(201).json({
      success: true,
      message: "Bulk day schedule created successfully",

      data: schedule,
    });
  } catch (error) {
    console.error("[BulkDaySchedule] Create error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create bulk day schedule",
      error: error.message,
    });
  }
};
