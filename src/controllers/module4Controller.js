/**
 * Module 4: Campaign · Bulk Sender · Media · Variables · Queue · Reports
 */
const { store, init, isMongoConnected } = require('../utils/memoryStore');
const Campaign = require('../models/Campaign');
const Template = require('../models/Template');
const Media = require('../models/Media');

async function ensureM4() {
  await init();
  if (!store.variables) {
    store.variables = [
      { key: 'Name', label: 'Contact Name', example: 'John Doe', source: 'contact' },
      { key: 'Phone', label: 'Phone Number', example: '+919876543210', source: 'contact' },
      { key: 'Email', label: 'Email', example: 'john@mail.com', source: 'contact' },
      { key: 'Company', label: 'Company', example: 'Acme Ltd', source: 'custom' },
      { key: 'OrderId', label: 'Order ID', example: 'ORD-1001', source: 'custom' },
      { key: 'Amount', label: 'Amount', example: '999', source: 'custom' },
      { key: 'Date', label: 'Date', example: '28 Jul 2026', source: 'system' },
    ];
  }
  if (!store.queue) {
    store.queue = [
      {
        _id: 'q1',
        campaignName: 'Festival Offer 2024',
        phone: '+919876543210',
        status: 'Sent',
        attempts: 1,
        message: 'Hello John...',
        scheduledAt: new Date(Date.now() - 3600000).toISOString(),
        processedAt: new Date(Date.now() - 3500000).toISOString(),
        error: null,
      },
      {
        _id: 'q2',
        campaignName: 'New Product Launch',
        phone: '+919876543211',
        status: 'Pending',
        attempts: 0,
        message: 'Check out our new product...',
        scheduledAt: new Date(Date.now() + 600000).toISOString(),
        processedAt: null,
        error: null,
      },
      {
        _id: 'q3',
        campaignName: 'New Product Launch',
        phone: '+919876543212',
        status: 'Failed',
        attempts: 3,
        message: 'Limited offer...',
        scheduledAt: new Date(Date.now() - 7200000).toISOString(),
        processedAt: new Date(Date.now() - 7000000).toISOString(),
        error: 'Number not on WhatsApp',
      },
      {
        _id: 'q4',
        campaignName: 'Summer Sale',
        phone: '+919876543213',
        status: 'Processing',
        attempts: 1,
        message: 'Summer deals...',
        scheduledAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      },
    ];
  }
  if (!store.messageTemplates) {
    store.messageTemplates = [
      {
        _id: 't1',
        name: 'Welcome',
        body: 'Hello {{Name}}, welcome to WhatsApp Suite!',
        variables: ['Name'],
        category: 'General',
        isActive: true,
      },
      {
        _id: 't2',
        name: 'Order Update',
        body: 'Hi {{Name}}, your order {{OrderId}} of ₹{{Amount}} is confirmed.',
        variables: ['Name', 'OrderId', 'Amount'],
        category: 'Transactional',
        isActive: true,
      },
      {
        _id: 't3',
        name: 'Promo',
        body: 'Dear {{Name}}, exclusive offer just for you. Valid till {{Date}}.',
        variables: ['Name', 'Date'],
        category: 'Marketing',
        isActive: true,
      },
    ];
  }
}

// ─── Variables ────────────────────────────────────────────────
exports.getVariables = async (req, res) => {
  try {
    await ensureM4();
    res.json({ success: true, data: store.variables });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createVariable = async (req, res) => {
  try {
    await ensureM4();
    const { key, label, example, source } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'key required' });
    if (store.variables.find((v) => v.key.toLowerCase() === key.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Variable already exists' });
    }
    const item = {
      key: key.replace(/\s+/g, ''),
      label: label || key,
      example: example || '',
      source: source || 'custom',
    };
    store.variables.push(item);
    res.status(201).json({ success: true, data: item });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteVariable = async (req, res) => {
  try {
    await ensureM4();
    store.variables = store.variables.filter((v) => v.key !== req.params.key);
    res.json({ success: true, message: 'Variable deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ─── Templates (message with variables) ───────────────────────
exports.getTemplates = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const list = await Template.find().sort({ createdAt: -1 });
      return res.json({ success: true, data: list });
    }
    await ensureM4();
    res.json({ success: true, data: store.messageTemplates });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const { name, body, category, variables } = req.body;
    if (!name || !body) return res.status(400).json({ success: false, message: 'name and body required' });
    const foundVars = (body.match(/\{\{(\w+)\}\}/g) || []).map((m) => m.replace(/[{}]/g, ''));
    if (isMongoConnected()) {
      const t = await Template.create({
        name,
        body,
        category: category || 'General',
        variables: variables || foundVars,
        createdBy: req.user._id,
      });
      return res.status(201).json({ success: true, data: t });
    }
    await ensureM4();
    const t = {
      _id: `t${Date.now()}`,
      name,
      body,
      category: category || 'General',
      variables: variables || foundVars,
      isActive: true,
    };
    store.messageTemplates.unshift(t);
    res.status(201).json({ success: true, data: t });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const t = await Template.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!t) return res.status(404).json({ success: false, message: 'Not found' });
      return res.json({ success: true, data: t });
    }
    await ensureM4();
    const t = store.messageTemplates.find((x) => x._id === req.params.id);
    if (!t) return res.status(404).json({ success: false, message: 'Not found' });
    Object.assign(t, req.body);
    res.json({ success: true, data: t });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    if (isMongoConnected()) {
      await Template.findByIdAndDelete(req.params.id);
      return res.json({ success: true, message: 'Deleted' });
    }
    await ensureM4();
    store.messageTemplates = store.messageTemplates.filter((x) => x._id !== req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ─── Queue ────────────────────────────────────────────────────
exports.getQueue = async (req, res) => {
  try {
    await ensureM4();
    const { status, search, page = 1, limit = 50 } = req.query;
    let list = [...store.queue];
    if (status && status !== 'All') list = list.filter((q) => q.status === status);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (q) =>
          (q.phone || '').includes(s) ||
          (q.campaignName || '').toLowerCase().includes(s) ||
          (q.message || '').toLowerCase().includes(s)
      );
    }
    const stats = {
      Pending: store.queue.filter((q) => q.status === 'Pending').length,
      Processing: store.queue.filter((q) => q.status === 'Processing').length,
      Sent: store.queue.filter((q) => q.status === 'Sent').length,
      Failed: store.queue.filter((q) => q.status === 'Failed').length,
      Total: store.queue.length,
    };
    const start = (parseInt(page) - 1) * parseInt(limit);
    res.json({
      success: true,
      stats,
      total: list.length,
      data: list.slice(start, start + parseInt(limit)),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.retryQueueItem = async (req, res) => {
  try {
    await ensureM4();
    const item = store.queue.find((q) => q._id === req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    item.status = 'Pending';
    item.attempts = (item.attempts || 0) + 1;
    item.error = null;
    res.json({ success: true, data: item, message: 'Queued for retry' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.clearQueue = async (req, res) => {
  try {
    await ensureM4();
    const { status } = req.body || {};
    if (status) {
      store.queue = store.queue.filter((q) => q.status !== status);
    } else {
      store.queue = store.queue.filter((q) => q.status === 'Pending' || q.status === 'Processing');
    }
    res.json({ success: true, message: 'Queue cleared' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ─── Bulk Sender ──────────────────────────────────────────────
exports.bulkSend = async (req, res) => {
  try {
    await ensureM4();
    const { name, message, contacts, sendNow, scheduledAt, deviceId, mediaFiles, templateId } = req.body;
    if (!message && !templateId) {
      return res.status(400).json({ success: false, message: 'message or templateId required' });
    }
    const list = Array.isArray(contacts) ? contacts : [];
    const recipients = list.length || req.body.recipients || 0;

    let body = message || '';
    if (templateId) {
      const t = store.messageTemplates.find((x) => x._id === templateId);
      if (t) body = t.body;
    }

    const campaign = {
      _id: `c${Date.now()}`,
      name: name || `Bulk ${new Date().toISOString().slice(0, 16)}`,
      message: body,
      mediaFiles: mediaFiles || [],
      recipients,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      status: sendNow ? 'Running' : scheduledAt ? 'Scheduled' : 'Draft',
      scheduledAt: scheduledAt || null,
      createdAt: new Date().toISOString(),
      deviceId,
    };

    if (!store.campaigns) store.campaigns = [];
    store.campaigns.unshift(campaign);

    // enqueue messages
    const sample = list.length
      ? list
      : Array.from({ length: Math.min(recipients, 20) }, (_, i) => ({
          phone: `+9198${String(10000000 + i)}`,
          name: `Contact ${i + 1}`,
        }));

    sample.forEach((c, i) => {
      let msg = body;
      msg = msg.replace(/\{\{Name\}\}/gi, c.name || '');
      msg = msg.replace(/\{\{Phone\}\}/gi, c.phone || '');
      msg = msg.replace(/\{\{Email\}\}/gi, c.email || '');
      store.queue.unshift({
        _id: `q${Date.now()}${i}`,
        campaignName: campaign.name,
        campaignId: campaign._id,
        phone: c.phone,
        status: sendNow ? (i % 7 === 0 ? 'Failed' : 'Pending') : 'Pending',
        attempts: 0,
        message: msg.slice(0, 120),
        scheduledAt: scheduledAt || new Date().toISOString(),
        processedAt: null,
        error: i % 7 === 0 && sendNow ? 'Simulated failure' : null,
      });
    });

    if (isMongoConnected()) {
      try {
        await Campaign.create({
          name: campaign.name,
          message: body,
          mediaFiles: mediaFiles || [],
          recipients,
          status: campaign.status,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          createdBy: req.user._id,
          device: deviceId,
        });
      } catch (_) {}
    }

    res.status(201).json({
      success: true,
      data: campaign,
      queued: sample.length,
      message: `Bulk job created · ${sample.length} messages in queue`,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ─── Reports ──────────────────────────────────────────────────
exports.getReports = async (req, res) => {
  try {
    await ensureM4();
    const campaigns = store.campaigns || [];
    let messagesSent = 0;
    let delivered = 0;
    let failed = 0;
    let read = 0;
    campaigns.forEach((c) => {
      messagesSent += c.sent || 0;
      delivered += c.delivered || 0;
      failed += c.failed || 0;
      read += c.read || 0;
    });

    // fallback demo numbers if empty
    if (messagesSent === 0) {
      messagesSent = 98750;
      delivered = 93250;
      failed = 2250;
      read = 75200;
    }

    const byDay = [
      { day: 'Mon', sent: 12000, delivered: 11400, failed: 300 },
      { day: 'Tue', sent: 15000, delivered: 14200, failed: 400 },
      { day: 'Wed', sent: 11000, delivered: 10500, failed: 250 },
      { day: 'Thu', sent: 18000, delivered: 17100, failed: 450 },
      { day: 'Fri', sent: 16000, delivered: 15200, failed: 380 },
      { day: 'Sat', sent: 14000, delivered: 13300, failed: 320 },
      { day: 'Sun', sent: 12750, delivered: 11550, failed: 150 },
    ];

    const topCampaigns = (campaigns.length
      ? campaigns
      : [
          { name: 'Festival Offer 2024', sent: 8500, delivered: 8230, failed: 270, read: 7520 },
          { name: 'Summer Sale', sent: 12000, delivered: 11650, failed: 350, read: 9800 },
          { name: 'New Product Launch', sent: 3500, delivered: 3250, failed: 250, read: 0 },
        ]
    )
      .slice(0, 8)
      .map((c) => ({
        name: c.name,
        sent: c.sent || 0,
        delivered: c.delivered || 0,
        failed: c.failed || 0,
        read: c.read || 0,
        rate: c.sent ? (((c.delivered || 0) / c.sent) * 100).toFixed(1) : '0',
      }));

    const queueStats = {
      Pending: store.queue.filter((q) => q.status === 'Pending').length,
      Processing: store.queue.filter((q) => q.status === 'Processing').length,
      Sent: store.queue.filter((q) => q.status === 'Sent').length,
      Failed: store.queue.filter((q) => q.status === 'Failed').length,
    };

    res.json({
      success: true,
      data: {
        summary: {
          messagesSent,
          delivered,
          failed,
          read,
          deliveryRate: messagesSent ? ((delivered / messagesSent) * 100).toFixed(1) : 0,
          readRate: delivered ? ((read / delivered) * 100).toFixed(1) : 0,
          failRate: messagesSent ? ((failed / messagesSent) * 100).toFixed(1) : 0,
        },
        byDay,
        topCampaigns,
        queueStats,
        campaignsCount: campaigns.length || 5,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Module overview
// exports.getModuleOverview = async (req, res) => {
//   try {
//     await ensureM4();
//     res.json({
//       success: true,
//       data: {
//         campaigns: (store.campaigns || []).length,
//         queuePending: store.queue.filter((q) => q.status === 'Pending').length,
//         templates: (store.messageTemplates || []).length,
//         variables: (store.variables || []).length,
//         media: (store.media || []).length,
//       },
//     });
//   } catch (e) {
//     res.status(500).json({ success: false, message: e.message });
//   }
// };

exports.getModuleOverview = async (req, res) => {
  try {
    await ensureM4();

    let campaignsCount = (store.campaigns || []).length;
    let templatesCount = (store.messageTemplates || []).length;

    // Use MongoDB counts when MongoDB is connected
    if (isMongoConnected()) {
      campaignsCount = await Campaign.countDocuments();
      templatesCount = await Template.countDocuments();
    }

    res.json({
      success: true,
      data: {
        campaigns: campaignsCount,
        queuePending: (store.queue || []).filter(
          (q) => q.status === 'Pending'
        ).length,
        templates: templatesCount,
        variables: (store.variables || []).length,
        media: (store.media || []).length,
      },
    });
  } catch (e) {
    console.error('getModuleOverview error:', e);

    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};