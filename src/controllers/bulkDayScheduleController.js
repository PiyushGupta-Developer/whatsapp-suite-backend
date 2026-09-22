const BulkDaySchedule = require("../models/BulkDaySchedule");

/**
 * Get next 15th day of a month
 */
function getNextFifteenthDate(time) {
  const [hours, minutes] = String(time).split(":").map(Number);

  const now = new Date();

  const next = new Date(now);

  next.setDate(15);
  next.setHours(hours, minutes, 0, 0);

  // Current month's 15th date/time already passed
  if (next <= now) {
    next.setMonth(next.getMonth() + 1);
    next.setDate(15);
    next.setHours(hours, minutes, 0, 0);
  }

  return next;
}

/**
 * Validate HH:mm time
 */
function isValidTime(time) {
  if (typeof time !== "string") {
    return false;
  }

  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

/**
 * Get authenticated user's ID
 */
function getUserId(req) {
  return req.user?._id || req.user?.id || null;
}

/**
 * Create Bulk Day Schedule
 *
 * POST /api/bulk-day-schedule
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
    // 1. User authentication
    // -----------------------------------------

    const createdBy = getUserId(req);

    if (!createdBy) {
      return res.status(401).json({
        success: false,
        message: "User authentication information not found",
      });
    }

    // -----------------------------------------
    // 2. Validate name
    // -----------------------------------------

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Schedule name is required",
      });
    }

    // -----------------------------------------
    // 3. Validate schedule type
    // -----------------------------------------

    if (!["fifteenth_day", "month_end"].includes(scheduleType)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid scheduleType. Allowed values: fifteenth_day, month_end",
      });
    }

    // -----------------------------------------
    // 4. Validate time
    // -----------------------------------------

    if (!isValidTime(time)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid time. Time must be in HH:mm format, for example 10:00",
      });
    }

    // -----------------------------------------
    // 5. Validate status
    // -----------------------------------------

    if (!["active", "stopped"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: active, stopped",
      });
    }

    // -----------------------------------------
    // 6. Validate devices
    // -----------------------------------------

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one WhatsApp device is required",
      });
    }

    // -----------------------------------------
    // 7. Validate recipients
    // -----------------------------------------

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one recipient is required",
      });
    }

    // -----------------------------------------
    // 8. Validate recipient phone numbers
    // -----------------------------------------

    const invalidRecipient = recipients.find(
      (recipient) =>
        !recipient ||
        typeof recipient.phone !== "string" ||
        !recipient.phone.trim(),
    );

    if (invalidRecipient) {
      return res.status(400).json({
        success: false,
        message: "Every recipient must contain a phone number",
      });
    }

    // -----------------------------------------
    // 9. Validate delay
    // -----------------------------------------

    const parsedDelay = Number(delaySeconds);

    if (Number.isNaN(parsedDelay) || parsedDelay < 0) {
      return res.status(400).json({
        success: false,
        message: "delaySeconds must be a number greater than or equal to 0",
      });
    }

    // -----------------------------------------
    // 10. Prepare common values
    // -----------------------------------------

    let nextRunAt = null;

    const normalizedDeviceIds = deviceIds.map(String);

    const normalizedRecipients = recipients.map((recipient) => ({
      name: recipient.name || "",
      phone: String(recipient.phone).trim(),
      whatsappId: recipient.whatsappId || "",
    }));

    // -----------------------------------------
    // 11. FIFTEENTH DAY
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
    // 12. MONTH END
    // -----------------------------------------

    if (scheduleType === "month_end") {
      // selectedMonths required
      if (!Array.isArray(selectedMonths) || selectedMonths.length === 0) {
        return res.status(400).json({
          success: false,
          message: "selectedMonths is required for month_end schedule",
        });
      }

      // Convert months to numbers
      const normalizedMonths = selectedMonths
        .map(Number)
        .filter(
          (month) => Number.isInteger(month) && month >= 1 && month <= 12,
        );

      // Check invalid month values
      if (normalizedMonths.length !== selectedMonths.length) {
        return res.status(400).json({
          success: false,
          message: "selectedMonths must contain valid months from 1 to 12",
        });
      }

      // Remove duplicates and sort
      const uniqueMonths = [...new Set(normalizedMonths)].sort((a, b) => a - b);

      // Year validation
      if (year !== undefined && year !== null) {
        const parsedYear = Number(year);

        if (
          !Number.isInteger(parsedYear) ||
          parsedYear < 2000 ||
          parsedYear > 2100
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid year",
          });
        }
      }

      // calculatedDates validation
      if (!Array.isArray(calculatedDates) || calculatedDates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "calculatedDates is required for month_end schedule",
        });
      }

      const parsedDates = calculatedDates
        .map((date) => new Date(date))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

      if (parsedDates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid dates found in calculatedDates",
        });
      }

      const now = new Date();

      nextRunAt = parsedDates.find((date) => date > now) || null;

      /**
       * If recurring is true and all
       * calculatedDates are in the past,
       * the scheduler will calculate the
       * next year's month-end itself.
       */
      if (!nextRunAt && !Boolean(recurring)) {
        return res.status(400).json({
          success: false,
          message: "No future date found in calculatedDates",
        });
      }
    }

    // -----------------------------------------
    // 13. Create schedule
    // -----------------------------------------

    const schedule = await BulkDaySchedule.create({
      name: name.trim(),

      scheduleType,

      recurring: Boolean(recurring),

      dayOfMonth: dayOfMonth !== undefined ? Number(dayOfMonth) : null,

      time,

      status,

      isProcessing: false,

      cronExpression: cronExpression || null,

      selectedMonths: Array.isArray(selectedMonths)
        ? [
            ...new Set(
              selectedMonths
                .map(Number)
                .filter(
                  (month) =>
                    Number.isInteger(month) && month >= 1 && month <= 12,
                ),
            ),
          ].sort((a, b) => a - b)
        : [],

      year: year !== undefined && year !== null ? Number(year) : null,

      calculatedDates: Array.isArray(calculatedDates) ? calculatedDates : [],

      nextRunAt,

      lastRunAt: null,

      deviceIds: normalizedDeviceIds,

      recipients: normalizedRecipients,

      message: typeof message === "string" ? message : String(message || ""),

      delaySeconds: parsedDelay,

      createdBy,
    });

    // -----------------------------------------
    // 14. Response
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

/**
 * List Bulk Day Schedules
 *
 * GET /api/bulk-day-schedules
 *
 * Optional:
 * ?type=fifteenth_day
 * ?type=month_end
 * ?status=active
 * ?status=stopped
 */
exports.list = async (req, res) => {
  try {
    const createdBy = getUserId(req);

    if (!createdBy) {
      return res.status(401).json({
        success: false,
        message: "User authentication information not found",
      });
    }

    const { type, status } = req.query;

    const filter = {
      createdBy,
    };

    // Filter by schedule type
    if (type) {
      if (!["fifteenth_day", "month_end"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid type. Allowed values: fifteenth_day, month_end",
        });
      }

      filter.scheduleType = type;
    }

    // Filter by status
    if (status) {
      if (!["active", "stopped"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Allowed values: active, stopped",
        });
      }

      filter.status = status;
    }

    const schedules = await BulkDaySchedule.find(filter)
      .sort({
        createdAt: -1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      count: schedules.length,
      data: schedules,
    });
  } catch (error) {
    console.error("[BulkDaySchedule] List error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bulk day schedules",
      error: error.message,
    });
  }
};

/**
 * Update Schedule Status
 *
 * PATCH /api/bulk-day-schedules/:id/status
 *
 * Body:
 * {
 *   "status": "stopped"
 * }
 *
 * or:
 *
 * {
 *   "status": "active"
 * }
 */
exports.updateStatus = async (req, res) => {
  try {
    const createdBy = getUserId(req);

    if (!createdBy) {
      return res.status(401).json({
        success: false,
        message: "User authentication information not found",
      });
    }

    const { id } = req.params;

    const { status } = req.body;

    // Validate status
    if (!["active", "stopped"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "active" or "stopped"',
      });
    }

    const schedule = await BulkDaySchedule.findOne({
      _id: id,
      createdBy,
    });

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Bulk day schedule not found",
      });
    }

    // -----------------------------------------
    // STOP
    // -----------------------------------------

    if (status === "stopped") {
      schedule.status = "stopped";

      /**
       * Do NOT change isProcessing here.
       *
       * If a message is currently being sent,
       * scheduler will finish it and release
       * the lock.
       */
      await schedule.save();

      return res.status(200).json({
        success: true,
        message: "Bulk day schedule stopped successfully",
        data: schedule,
      });
    }

    // -----------------------------------------
    // RESUME
    // -----------------------------------------

    if (status === "active") {
      /**
       * If this schedule has no nextRunAt,
       * calculate a new one.
       */
      if (!schedule.nextRunAt) {
        if (schedule.scheduleType === "fifteenth_day") {
          schedule.nextRunAt = getNextFifteenthDate(schedule.time);
        }

        if (schedule.scheduleType === "month_end") {
          /**
           * Use calculatedDates first.
           */
          const now = new Date();

          const futureDate = Array.isArray(schedule.calculatedDates)
            ? schedule.calculatedDates
                .map((date) => new Date(date))
                .filter((date) => !Number.isNaN(date.getTime()) && date > now)
                .sort((a, b) => a.getTime() - b.getTime())[0]
            : null;

          if (futureDate) {
            schedule.nextRunAt = futureDate;
          }
        }
      }

      schedule.status = "active";

      await schedule.save();

      return res.status(200).json({
        success: true,
        message: "Bulk day schedule activated successfully",
        data: schedule,
      });
    }
  } catch (error) {
    console.error("[BulkDaySchedule] Status update error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update bulk day schedule status",
      error: error.message,
    });
  }
};

/**
 * Delete Bulk Day Schedule
 *
 * DELETE /api/bulk-day-schedules/:id
 */
exports.remove = async (req, res) => {
  try {
    const createdBy = getUserId(req);

    if (!createdBy) {
      return res.status(401).json({
        success: false,
        message: "User authentication information not found",
      });
    }

    const { id } = req.params;

    const schedule = await BulkDaySchedule.findOneAndDelete({
      _id: id,
      createdBy,
    });

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Bulk day schedule not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bulk day schedule deleted successfully",
      data: {
        id: schedule._id,
      },
    });
  } catch (error) {
    console.error("[BulkDaySchedule] Delete error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete bulk day schedule",
      error: error.message,
    });
  }
};
