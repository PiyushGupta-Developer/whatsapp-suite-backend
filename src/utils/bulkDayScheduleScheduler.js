const BulkDaySchedule = require("../models/BulkDaySchedule");
const messageService = require("../services/messageService");

let timer = null;
let isTickRunning = false;

/**
 * Get next 15th date.
 *
 * Example:
 * Current date: 22 Sep 2026
 * Time: 10:00
 *
 * Next run:
 * 15 Oct 2026 10:00
 */
function getNextFifteenthDate(schedule, currentDate = new Date()) {
  const [hours, minutes] = String(schedule.time).split(":").map(Number);

  const next = new Date(currentDate);

  next.setDate(15);
  next.setHours(hours, minutes, 0, 0);

  if (next <= currentDate) {
    next.setMonth(next.getMonth() + 1);
    next.setDate(15);
    next.setHours(hours, minutes, 0, 0);
  }

  return next;
}

/**
 * Get next month-end date.
 *
 * Uses selectedMonths.
 *
 * Example:
 * selectedMonths: [9, 10, 11, 12]
 *
 * 30 Sep
 * 31 Oct
 * 30 Nov
 * 31 Dec
 *
 * Then next year:
 * 30 Sep 2027
 */
function getNextMonthEndDate(schedule, currentDate = new Date()) {
  const selectedMonths = Array.isArray(schedule.selectedMonths)
    ? schedule.selectedMonths
        .map(Number)
        .filter((month) => month >= 1 && month <= 12)
        .sort((a, b) => a - b)
    : [];

  if (!selectedMonths.length) {
    return null;
  }

  const [hours, minutes] = String(schedule.time).split(":").map(Number);

  let year = currentDate.getFullYear();

  for (const month of selectedMonths) {
    const monthIndex = month - 1;

    // Last day of selected month
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();

    const candidate = new Date(year, monthIndex, lastDay, hours, minutes, 0, 0);

    if (candidate > currentDate) {
      return candidate;
    }
  }

  // All selected months for current year are passed.
  // Move to next year.
  year++;

  const firstMonth = selectedMonths[0];
  const monthIndex = firstMonth - 1;

  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  return new Date(year, monthIndex, lastDay, hours, minutes, 0, 0);
}

/**
 * Calculate next run based on schedule type.
 */
function calculateNextRun(schedule, currentDate = new Date()) {
  if (schedule.scheduleType === "fifteenth_day") {
    return getNextFifteenthDate(schedule, currentDate);
  }

  if (schedule.scheduleType === "month_end") {
    return getNextMonthEndDate(schedule, currentDate);
  }

  return null;
}

/**
 * Build message items for messageService.sendBulk()
 */
function buildMessageItems(schedule) {
  const recipients = Array.isArray(schedule.recipients)
    ? schedule.recipients
    : [];

  return recipients
    .filter((recipient) => recipient && recipient.phone)
    .map((recipient) => ({
      phone: recipient.phone,
      jid: recipient.whatsappId || undefined,
      contact: recipient,
      message: schedule.message || "",
      sendText: true,
      mediaFiles: [],
    }));
}

/**
 * Get WhatsApp devices.
 */
function getDevices(schedule) {
  return Array.isArray(schedule.deviceIds) ? schedule.deviceIds : [];
}

/**
 * Execute one schedule.
 */
async function executeBulkDaySchedule(schedule) {
  const scheduleId = schedule._id.toString();

  try {
    console.log("[BulkDayScheduler] Executing:", scheduleId, schedule.name);

    const items = buildMessageItems(schedule);

    /**
     * No recipients
     */
    if (!items.length) {
      console.log("[BulkDayScheduler] No recipients:", scheduleId);

      await BulkDaySchedule.findByIdAndUpdate(schedule._id, {
        $set: {
          lastRunAt: new Date(),
          isProcessing: false,
        },
      });

      return;
    }

    /**
     * No WhatsApp devices
     */
    const devices = getDevices(schedule);

    if (!devices.length) {
      console.log("[BulkDayScheduler] No devices:", scheduleId);

      await BulkDaySchedule.findByIdAndUpdate(schedule._id, {
        $set: {
          isProcessing: false,
        },
      });

      return;
    }

    console.log(
      "[BulkDayScheduler] Recipients:",
      items.length,
      "Devices:",
      devices.length,
    );

    /**
     * Send messages
     */
    const result = await messageService.sendBulk(items, devices);

    const results = result?.results || [];

    const sent = results.filter((result) => result.ok).length;

    const failed = results.length - sent;

    console.log("[BulkDayScheduler] Send result:", {
      total: items.length,
      sent,
      failed,
    });

    /**
     * If recurring:
     * calculate next occurrence.
     *
     * If one-time:
     * stop after execution.
     */
    let nextRunAt = null;

    if (schedule.recurring) {
      nextRunAt = calculateNextRun(schedule, new Date());
    }

    /**
     * IMPORTANT:
     *
     * Do not blindly set status = active.
     *
     * User may have manually stopped
     * the schedule while sending.
     */
    const updated = await BulkDaySchedule.findOneAndUpdate(
      {
        _id: schedule._id,
        status: "active",
      },
      {
        $set: {
          lastRunAt: new Date(),
          nextRunAt,
          isProcessing: false,
        },
      },
      {
        new: true,
      },
    );

    /**
     * If user stopped the schedule while
     * execution was running, the above query
     * will not match.
     *
     * Only release processing lock.
     */
    if (!updated) {
      await BulkDaySchedule.findByIdAndUpdate(schedule._id, {
        $set: {
          isProcessing: false,
        },
      });

      console.log(
        "[BulkDayScheduler] Schedule was stopped during execution:",
        scheduleId,
      );

      return;
    }

    console.log("[BulkDayScheduler] Next run:", nextRunAt);
  } catch (error) {
    console.error("[BulkDayScheduler] Execution error:", scheduleId, error);

    /**
     * IMPORTANT:
     *
     * Don't automatically stop the schedule
     * when WhatsApp sending fails.
     *
     * Release lock so it can be processed again
     * according to the next scheduler cycle.
     */
    await BulkDaySchedule.findByIdAndUpdate(schedule._id, {
      $set: {
        isProcessing: false,
      },
    });
  }
}

/**
 * Scheduler tick
 */
async function tick() {
  /**
   * Prevent overlapping ticks inside the same
   * Node.js process.
   */
  if (isTickRunning) {
    return;
  }

  isTickRunning = true;

  try {
    const now = new Date();

    console.log("[BulkDayScheduler] Checking:", now.toISOString());

    /**
     * Find active schedules which are due.
     *
     * IMPORTANT:
     * isProcessing must be false.
     */
    const dueSchedules = await BulkDaySchedule.find({
      status: "active",
      isProcessing: false,
      nextRunAt: {
        $ne: null,
        $lte: now,
      },
    }).limit(10);

    console.log("[BulkDayScheduler] Due schedules:", dueSchedules.length);

    /**
     * Process each due schedule.
     */
    for (const schedule of dueSchedules) {
      /**
       * Atomic lock.
       *
       * active + isProcessing:false
       *
       * becomes:
       *
       * active + isProcessing:true
       *
       * This prevents duplicate execution.
       */
      const lockedSchedule = await BulkDaySchedule.findOneAndUpdate(
        {
          _id: schedule._id,
          status: "active",
          isProcessing: false,
          nextRunAt: {
            $ne: null,
            $lte: now,
          },
        },
        {
          $set: {
            isProcessing: true,
          },
        },
        {
          new: true,
        },
      );

      /**
       * Another scheduler/process already
       * picked this schedule.
       */
      if (!lockedSchedule) {
        console.log(
          "[BulkDayScheduler] Already picked:",
          schedule._id.toString(),
        );

        continue;
      }

      /**
       * Execute schedule.
       */
      await executeBulkDaySchedule(lockedSchedule);
    }
  } catch (error) {
    console.error("[BulkDayScheduler] Tick error:", error);
  } finally {
    isTickRunning = false;
  }
}

/**
 * Start scheduler
 */
function startBulkDayScheduleScheduler() {
  if (timer) {
    console.log("[BulkDayScheduler] Already started");

    return;
  }

  console.log("[BulkDayScheduler] Scheduler started");

  /**
   * Run immediately once.
   */
  tick();

  /**
   * Then check every 15 seconds.
   */
  timer = setInterval(tick, 15 * 1000);
}

/**
 * Stop scheduler
 */
function stopBulkDayScheduleScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;

    console.log("[BulkDayScheduler] Scheduler stopped");
  }
}

module.exports = {
  startBulkDayScheduleScheduler,
  stopBulkDayScheduleScheduler,
  tick,
  executeBulkDaySchedule,
};
