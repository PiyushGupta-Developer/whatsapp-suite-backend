/**
 * Module 5: Scheduler · Cron · Reminder · Repeat · Retry
 */
const cron = require('node-cron');
const { store, init, isMongoConnected } = require('../utils/memoryStore');
const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const messageService = require('../services/messageService');

// In-memory cron job registry
const cronJobs = new Map();

async function ensureM5() {
  await init();
  if (!store.schedules) {
    store.schedules = [
      {
        _id: 's1',
        name: 'Morning Promo',
        type: 'Campaign',
        cronExpr: '0 9 * * *',
        cronLabel: 'Every day at 9:00 AM',
        timezone: 'Asia/Kolkata',
        repeat: 'Daily',
        status: 'Active',
        nextRun: nextFromCron('0 9 * * *'),
        lastRun: null,
        message: 'Good morning {{Name}}! Check today\'s offers.',
        recipients: 500,
        retryMax: 3,
        retryDelayMin: 5,
        createdAt: new Date().toISOString(),
      },
      {
        _id: 's2',
        name: 'Weekly Newsletter',
        type: 'Campaign',
        cronExpr: '0 10 * * 1',
        cronLabel: 'Every Monday at 10:00 AM',
        timezone: 'Asia/Kolkata',
        repeat: 'Weekly',
        status: 'Active',
        nextRun: nextFromCron('0 10 * * 1'),
        lastRun: null,
        message: 'Hi {{Name}}, your weekly update is here.',
        recipients: 2000,
        retryMax: 2,
        retryDelayMin: 10,
        createdAt: new Date().toISOString(),
      },
      {
        _id: 's3',
        name: 'Flash Sale Reminder',
        type: 'Reminder',
        cronExpr: null,
        cronLabel: 'One-time',
        timezone: 'Asia/Kolkata',
        repeat: 'Once',
        status: 'Scheduled',
        nextRun: new Date(Date.now() + 86400000).toISOString(),
        lastRun: null,
        message: 'Reminder: Flash sale ends tonight!',
        recipients: 800,
        retryMax: 3,
        retryDelayMin: 5,
        remindAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];
  }
  if (!store.reminders) {
    store.reminders = [
      {
        _id: 'r1',
        title: 'Follow up leads',
        message: 'Call back unpaid invoices',
        remindAt: new Date(Date.now() + 3600000).toISOString(),
        status: 'Pending',
        repeat: 'Once',
        relatedCampaign: null,
      },
      {
        _id: 'r2',
        title: 'Campaign health check',
        message: 'Review failed queue items',
        remindAt: new Date(Date.now() + 7200000).toISOString(),
        status: 'Pending',
        repeat: 'Daily',
        relatedCampaign: null,
      },
    ];
  }
  if (!store.retryPolicy) {
    store.retryPolicy = {
      maxAttempts: 3,
      delayMinutes: 5,
      backoff: 'linear', // linear | exponential
      retryOn: ['Failed', 'Timeout'],
      enabled: true,
    };
  }
  if (!store.cronLogs) {
    store.cronLogs = [
      {
        _id: 'cl1',
        scheduleId: 's1',
        scheduleName: 'Morning Promo',
        ranAt: new Date(Date.now() - 86400000).toISOString(),
        status: 'Success',
        sent: 480,
        failed: 20,
        message: 'Completed',
      },
    ];
  }
}

function cronFieldMatches(value, field, min, max) {
  const parts = String(field).split(',');
  return parts.some((part) => {
    const [base, stepText] = part.split('/');
    const step = stepText ? Math.max(1, parseInt(stepText, 10)) : 1;
    if (base === '*') return (value - min) % step === 0;
    if (base.includes('-')) {
      const [a, b] = base.split('-').map(Number);
      return value >= a && value <= b && (value - a) % step === 0;
    }
    const n = Number(base);
    return Number.isFinite(n) && value === n;
  });
}

function nextFromCron(expr) {
  if (!isValidCron(expr)) return null;
  const [minF, hourF, dayF, monthF, dowF] = expr.trim().split(/\s+/);
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (
      cronFieldMatches(d.getMinutes(), minF, 0, 59) &&
      cronFieldMatches(d.getHours(), hourF, 0, 23) &&
      cronFieldMatches(d.getDate(), dayF, 1, 31) &&
      cronFieldMatches(d.getMonth() + 1, monthF, 1, 12) &&
      cronFieldMatches(d.getDay(), dowF, 0, 6)
    ) return d.toISOString();
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

function isValidCron(expr) {
  if (!expr || typeof expr !== 'string') return false;
  try {
    return cron.validate(expr);
  } catch {
    return false;
  }
}

const CRON_PRESETS = [
  { label: 'Every minute (test)', expr: '* * * * *' },
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Every day 9:00 AM', expr: '0 9 * * *' },
  { label: 'Every day 6:00 PM', expr: '0 18 * * *' },
  { label: 'Every Monday 10:00 AM', expr: '0 10 * * 1' },
  { label: 'Weekdays 9:00 AM', expr: '0 9 * * 1-5' },
  { label: '1st of month 9:00 AM', expr: '0 9 1 * *' },
];

// ─── Overview ─────────────────────────────────────────────────
exports.getOverview = async (req, res) => {
  try {
    await ensureM5();
    res.json({
      success: true,
      data: {
        schedules: store.schedules.length,
        activeSchedules: store.schedules.filter((s) => s.status === 'Active').length,
        reminders: store.reminders.length,
        pendingReminders: store.reminders.filter((r) => r.status === 'Pending').length,
        cronJobsRunning: cronJobs.size,
        retryPolicy: store.retryPolicy,
        presets: CRON_PRESETS,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ─── Schedules (Scheduler + Cron + Repeat) ────────────────────
exports.getSchedules = async (req, res) => {
  try {
    await ensureM5();
    const { status, type } = req.query;
    let list = [...store.schedules];
    if (status && status !== 'All') list = list.filter((s) => s.status === status);
    if (type && type !== 'All') list = list.filter((s) => s.type === type);
    res.json({ success: true, count: list.length, data: list, presets: CRON_PRESETS });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createSchedule = async (req, res) => {
  try {
    await ensureM5();
    const {
      name,
      type,
      cronExpr,
      cronLabel,
      timezone,
      repeat,
      message,
      recipients,
      retryMax,
      retryDelayMin,
      remindAt,
      status,
      contactIds = [],
      deviceIds = [],
      mediaFiles = [],
      sendText = true,
    } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'name required' });

    if (cronExpr && !isValidCron(cronExpr)) {
      return res.status(400).json({ success: false, message: 'Invalid cron expression' });
    }

    const item = {
      _id: `s${Date.now()}`,
      name,
      type: type || 'Campaign',
      cronExpr: cronExpr || null,
      cronLabel: cronLabel || (cronExpr ? cronExpr : 'One-time'),
      timezone: timezone || 'Asia/Kolkata',
      repeat: repeat || (cronExpr ? 'Custom' : 'Once'),
      status: status || (cronExpr ? 'Active' : 'Scheduled'),
      nextRun: cronExpr ? nextFromCron(cronExpr) : remindAt || new Date(Date.now() + 3600000).toISOString(),
      lastRun: null,
      message: message || '',
      recipients: recipients || 0,
      contactIds: Array.isArray(contactIds) ? contactIds : [],
      deviceIds: Array.isArray(deviceIds) ? deviceIds : [],
      mediaFiles: Array.isArray(mediaFiles) ? mediaFiles : [],
      sendText: sendText !== false,
      retryMax: retryMax ?? 3,
      retryDelayMin: retryDelayMin ?? 5,
      remindAt: remindAt || null,
      createdAt: new Date().toISOString(),
    };

    store.schedules.unshift(item);

    // A one-time campaign schedule is also persisted as a real Campaign so the
    // persistent campaign scheduler can execute it after restart.
    if (!item.cronExpr && item.type === 'Campaign' && item.nextRun) {
      try {
        if (isMongoConnected()) {
          await Campaign.create({
            name: item.name,
            message: item.message,
            sendText: item.sendText !== false,
            mediaFiles: item.mediaFiles || [],
            recipients: item.recipients || 0,
            contactIds: item.contactIds || [],
            contacts: item.contactIds || [],
            deviceIds: item.deviceIds || [],
            status: 'Scheduled',
            scheduledAt: new Date(item.nextRun),
            nextRunAt: new Date(item.nextRun),
            timezone: item.timezone || 'Asia/Kolkata',
            repeat: item.repeat === 'Once' ? 'No Repeat' : item.repeat,
            createdBy: req.user?._id,
          });
        }
      } catch (e) {
        console.warn('[Scheduler] campaign persistence skipped:', e.message);
      }
    }

    // Register live cron if Active + valid expr
    if (item.status === 'Active' && item.cronExpr && isValidCron(item.cronExpr)) {
      registerCronJob(item);
    }

    res.status(201).json({ success: true, data: item, message: 'Schedule created' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    await ensureM5();
    const item = store.schedules.find((s) => s._id === req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Schedule not found' });

    const { cronExpr } = req.body;
    if (cronExpr && !isValidCron(cronExpr)) {
      return res.status(400).json({ success: false, message: 'Invalid cron expression' });
    }

    Object.assign(item, req.body);
    unregisterCronJob(item._id);
    if (item.status === 'Active' && item.cronExpr && isValidCron(item.cronExpr)) {
      registerCronJob(item);
    }

    res.json({ success: true, data: item, message: 'Schedule updated' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleSchedule = async (req, res) => {
  try {
    await ensureM5();
    const item = store.schedules.find((s) => s._id === req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });

    item.status = item.status === 'Active' ? 'Paused' : 'Active';
    unregisterCronJob(item._id);
    if (item.status === 'Active' && item.cronExpr && isValidCron(item.cronExpr)) {
      registerCronJob(item);
    }

    res.json({ success: true, data: item, message: `Schedule ${item.status}` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteSchedule = async (req, res) => {
  try {
    await ensureM5();
    unregisterCronJob(req.params.id);
    store.schedules = store.schedules.filter((s) => s._id !== req.params.id);
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

async function executeScheduleItem(item) {
  let recipients = [];
  if (isMongoConnected()) {
    if (Array.isArray(item.contactIds) && item.contactIds.length) {
      recipients = await Contact.find({ _id: { $in: item.contactIds }, status: { $ne: 'Unsubscribed' } }).lean();
    } else {
      recipients = await Contact.find({ status: { $ne: 'Unsubscribed' } }).limit(item.recipients || 0).lean();
    }
  } else {
    await init();
    recipients = (store.contacts || []).filter((c) => !item.contactIds?.length || item.contactIds.map(String).includes(String(c._id)));
    if (item.recipients) recipients = recipients.slice(0, item.recipients);
  }

  const result = await messageService.sendBulk(
    recipients.map((c) => ({
      phone: c.phone,
      jid: c.whatsappId,
      contact: c,
      message: item.message || '',
      sendText: item.sendText !== false,
      mediaFiles: item.mediaFiles || [],
    })),
    item.deviceIds || []
  );

  const sent = result.results.filter((r) => r.ok).length;
  const failed = result.results.length - sent;
  const log = {
    _id: `cl${Date.now()}`,
    scheduleId: item._id,
    scheduleName: item.name,
    ranAt: new Date().toISOString(),
    status: failed === result.results.length ? 'Failed' : 'Success',
    sent,
    failed,
    total: result.results.length,
    devices: result.deviceIds,
    message: 'Schedule delivery completed',
  };
  store.cronLogs = store.cronLogs || [];
  store.cronLogs.unshift(log);
  item.lastRun = log.ranAt;
  item.nextRun = item.cronExpr ? nextFromCron(item.cronExpr) : null;
  return log;
}

exports.runScheduleNow = async (req, res) => {
  try {
    await ensureM5();
    const item = store.schedules.find((s) => s._id === req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });

    const log = await executeScheduleItem(item);
    res.json({ success: true, data: log, message: 'Schedule executed' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

function registerCronJob(item) {
  try {
    unregisterCronJob(item._id);
    if (!item.cronExpr || !isValidCron(item.cronExpr)) return;
    const job = cron.schedule(item.cronExpr, async () => {
      try {
        await executeScheduleItem(item);
        console.log(`[CRON] ${item.name} delivered`);
      } catch (e) {
        console.error(`[CRON] ${item.name}:`, e.message);
      }
    }, { scheduled: true, timezone: item.timezone || 'Asia/Kolkata' });
    cronJobs.set(item._id, job);
  } catch (e) {
    console.error('registerCronJob error', e.message);
  }
}

function unregisterCronJob(id) {
  const job = cronJobs.get(id);
  if (job) {
    job.stop();
    cronJobs.delete(id);
  }
}

// ─── Cron presets & validate ──────────────────────────────────
exports.getCronPresets = async (req, res) => {
  res.json({ success: true, data: CRON_PRESETS });
};

exports.validateCron = async (req, res) => {
  const { expr } = req.body;
  const valid = isValidCron(expr);
  res.json({
    success: true,
    valid,
    expr,
    message: valid ? 'Valid cron expression' : 'Invalid cron expression',
    nextRun: valid ? nextFromCron(expr) : null,
  });
};

exports.getCronLogs = async (req, res) => {
  try {
    await ensureM5();
    res.json({ success: true, data: store.cronLogs || [] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ─── Reminders ────────────────────────────────────────────────
exports.getReminders = async (req, res) => {
  try {
    await ensureM5();
    const { status } = req.query;
    let list = [...store.reminders];
    if (status && status !== 'All') list = list.filter((r) => r.status === status);
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createReminder = async (req, res) => {
  try {
    await ensureM5();
    const { title, message, remindAt, repeat, relatedCampaign } = req.body;
    if (!title || !remindAt) {
      return res.status(400).json({ success: false, message: 'title and remindAt required' });
    }
    const item = {
      _id: `r${Date.now()}`,
      title,
      message: message || '',
      remindAt,
      status: 'Pending',
      repeat: repeat || 'Once',
      relatedCampaign: relatedCampaign || null,
      createdAt: new Date().toISOString(),
    };
    store.reminders.unshift(item);
    res.status(201).json({ success: true, data: item, message: 'Reminder created' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.completeReminder = async (req, res) => {
  item.status = 'Done';
  
  // Agar repeat = 'Daily' hai to automatically NAYA reminder ban jayega
  if (item.repeat === 'Daily') {
    const next = new Date(item.remindAt);
    next.setDate(next.getDate() + 1);   // 1 din aage badha do
    store.reminders.unshift({
      ...item,
      _id: `r${Date.now()}`,
      status: 'Pending',
      remindAt: next.toISOString(),
    });
  }
};

exports.updateReminder = async (req, res) => {
  try {
    await ensureM5();
    const item = store.reminders.find((r) => r._id === req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    Object.assign(item, req.body);
    res.json({ success: true, data: item });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.completeReminder = async (req, res) => {
  try {
    await ensureM5();
    const item = store.reminders.find((r) => r._id === req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    item.status = 'Done';
    if (item.repeat === 'Daily') {
      const next = new Date(item.remindAt);
      next.setDate(next.getDate() + 1);
      store.reminders.unshift({
        ...item,
        _id: `r${Date.now()}`,
        status: 'Pending',
        remindAt: next.toISOString(),
      });
    }
    res.json({ success: true, data: item, message: 'Reminder completed' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteReminder = async (req, res) => {
  try {
    await ensureM5();
    store.reminders = store.reminders.filter((r) => r._id !== req.params.id);
    res.json({ success: true, message: 'Reminder deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ─── Retry policy ─────────────────────────────────────────────
exports.getRetryPolicy = async (req, res) => {
  try {
    await ensureM5();
    res.json({ success: true, data: store.retryPolicy });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateRetryPolicy = async (req, res) => {
  try {
    await ensureM5();
    store.retryPolicy = { ...store.retryPolicy, ...req.body };
    res.json({ success: true, data: store.retryPolicy, message: 'Retry policy updated' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.retryFailed = async (req, res) => {
  try {
    await ensureM5();
    // Retry failed queue items (from module 4 queue)
    if (!store.queue) store.queue = [];
    const policy = store.retryPolicy;
    let count = 0;
    store.queue.forEach((q) => {
      if (q.status === 'Failed' && (q.attempts || 0) < (policy.maxAttempts || 3)) {
        q.status = 'Pending';
        q.attempts = (q.attempts || 0) + 1;
        q.error = null;
        q.scheduledAt = new Date(Date.now() + (policy.delayMinutes || 5) * 60000).toISOString();
        count++;
      }
    });
    res.json({ success: true, retried: count, message: `${count} items re-queued` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.retryOne = async (req, res) => {
  try {
    await ensureM5();
    if (!store.queue) return res.status(404).json({ success: false, message: 'No queue' });
    const item = store.queue.find((q) => q._id === req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Queue item not found' });
    const policy = store.retryPolicy;
    if ((item.attempts || 0) >= (policy.maxAttempts || 3)) {
      return res.status(400).json({
        success: false,
        message: `Max retries (${policy.maxAttempts}) reached`,
      });
    }
    item.status = 'Pending';
    item.attempts = (item.attempts || 0) + 1;
    item.error = null;
    item.scheduledAt = new Date(Date.now() + (policy.delayMinutes || 5) * 60000).toISOString();
    res.json({ success: true, data: item, message: 'Item re-queued' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
