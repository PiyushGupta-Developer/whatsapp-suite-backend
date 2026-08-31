const { store, init } = require('../utils/memoryStore');
const wa = require('../services/whatsappService');
const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const { isMongoConnected } = require('../utils/memoryStore');

exports.getSession = async (req, res) => {
  try {
    const deviceId = req.query.deviceId || req.headers['x-device-id'];
    if (deviceId) {
      const st = wa.getStatus(deviceId);
      return res.json({
        success: true,
        data: {
          deviceId,
          status: st.status,
          phone: st.phone ? `+${st.phone}` : null,
          contactCount: st.contacts,
        },
      });
    }
    // any online session
    const devices = (await init(), store.devices) || [];
    for (const d of devices) {
      const st = wa.getStatus(d._id);
      if (st.status === 'Online') {
        return res.json({
          success: true,
          data: { deviceId: d._id, status: 'Online', phone: st.phone ? `+${st.phone}` : d.phoneNumber, contactCount: st.contacts },
        });
      }
    }
    res.json({ success: true, data: { status: 'Offline', phone: null, contactCount: 0 } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.syncContacts = async (req, res) => {
  try {
    const deviceId = req.body.deviceId || req.query.deviceId;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId required — use connected device id' });
    }
    const list = await wa.loadContacts(deviceId);
    res.json({
      success: true,
      message: `Synced ${list.length} chats/contacts from WhatsApp`,
      count: list.length,
      data: list,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getContacts = async (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    let list = [];

    if (deviceId) {
      list = wa.listContacts(deviceId);
      if (!list.length) list = await wa.loadContacts(deviceId);
    } else {
      // first online device
      await init();
      for (const d of store.devices || []) {
        const st = wa.getStatus(d._id);
        if (st.status === 'Online') {
          list = wa.listContacts(d._id);
          if (!list.length) list = await wa.loadContacts(d._id);
          break;
        }
      }
    }

    const { search, filter } = req.query;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(s) ||
          (c.phone || '').includes(s)
      );
    }
    if (filter === 'unread') list = list.filter((c) => (c.unread || 0) > 0);
    if (filter === 'groups') list = list.filter((c) => c.isGroup);

    const session = deviceId ? wa.getStatus(deviceId) : { status: list.length ? 'Online' : 'Offline' };

    res.json({
      success: true,
      count: list.length,
      data: list,
      session: {
        status: session.status || (list.length ? 'Online' : 'Offline'),
        phone: session.phone ? `+${session.phone}` : null,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getContact = async (req, res) => {
  try {
    await init();
    if (!store.waNotes) store.waNotes = {};
    let found = null;
    for (const d of store.devices || []) {
      const list = wa.listContacts(d._id);
      found = list.find((c) => c._id === req.params.id);
      if (found) break;
    }
    if (!found) return res.status(404).json({ success: false, message: 'Contact not found — sync after QR login' });
    const notes = store.waNotes[req.params.id] || [];
    res.json({ success: true, data: { ...found, notes } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.addNote = async (req, res) => {
  try {
    await init();
    if (!store.waNotes) store.waNotes = {};
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, message: 'text required' });
    const id = req.params.id;
    if (!store.waNotes[id]) store.waNotes[id] = [];
    const note = {
      _id: `n${Date.now()}`,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      createdBy: req.user?.name || 'User',
    };
    store.waNotes[id].unshift(note);
    res.status(201).json({ success: true, data: note });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteNote = async (req, res) => {
  try {
    await init();
    if (store.waNotes?.[req.params.id]) {
      store.waNotes[req.params.id] = store.waNotes[req.params.id].filter((n) => n._id !== req.params.noteId);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.scheduleForContact = async (req, res) => {
  try {
    const { type, message, at, repeat, mediaFiles = [], deviceIds = [], sendText = true } = req.body;
    if (!message && !mediaFiles.length) return res.status(400).json({ success: false, message: 'message or mediaFiles required' });

    let contact = null;
    if (isMongoConnected()) {
      contact = await Contact.findById(req.params.id).lean();
    }
    if (!contact) {
      await init();
      contact = store.contacts.find((x) => String(x._id) === String(req.params.id)) || null;
    }
    if (!contact) {
      for (const d of store.devices || []) {
        const live = wa.listContacts(d._id).find((x) => x._id === req.params.id);
        if (live) { contact = live; break; }
      }
    }
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    if (type === 'reminder') {
      const reminderAt = at || new Date(Date.now() + 3600000).toISOString();
      if (isMongoConnected()) {
        const Note = require('../models/Note');
        const note = await Note.create({
          contact: contact._id,
          contactId: String(contact._id),
          title: `WhatsApp reminder: ${contact.name || contact.phone}`,
          content: message,
          type: 'reminder',
          date: new Date(reminderAt),
          createdBy: req.user?._id,
          metadata: { repeat, mediaFiles },
        });
        return res.status(201).json({ success: true, data: note, message: 'Reminder set' });
      }
      store.notes = store.notes || [];
      const note = { _id:`n${Date.now()}`, contactId:String(contact._id), title:`WhatsApp reminder: ${contact.name || contact.phone}`, content:message, type:'reminder', date:reminderAt, repeat:repeat||'Once', mediaFiles, completed:false, createdAt:new Date().toISOString() };
      store.notes.unshift(note);
      return res.status(201).json({ success:true,data:note,message:'Reminder set' });
    }

    const scheduledAt = at ? new Date(at) : new Date(Date.now() + 3600000);
    if (Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ success:false,message:'Invalid schedule time' });

    const payload = {
      name: `To: ${contact.name || contact.phone}`,
      message: message || '',
      sendText: sendText !== false,
      mediaFiles,
      recipients: 1,
      status: 'Scheduled',
      scheduledAt,
      nextRunAt: scheduledAt,
      timezone: req.body.timezone || 'Asia/Kolkata',
      repeat: repeat || 'No Repeat',
      deviceIds: Array.isArray(deviceIds) ? deviceIds : [],
      contacts: isMongoConnected() ? [contact._id] : [contact],
      createdBy: req.user?._id,
    };

    if (isMongoConnected()) {
      const campaign = await Campaign.create(payload);
      return res.status(201).json({ success:true,data:campaign,message:'Scheduled with media attachment support' });
    }

    await init();
    store.campaigns = store.campaigns || [];
    const campaign = { _id:`c${Date.now()}`, ...payload, scheduledAt:scheduledAt.toISOString(), nextRunAt:scheduledAt.toISOString(), createdAt:new Date().toISOString() };
    store.campaigns.unshift(campaign);
    res.status(201).json({ success:true,data:campaign,message:'Scheduled with media attachment support' });
  } catch (e) {
    res.status(400).json({ success:false,message:e.message });
  }
};
