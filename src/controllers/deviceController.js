const Device = require('../models/Device');

const { store, init, isMongoConnected } = require('../utils/memoryStore');
const wa = require('../services/whatsappService');

// ─── List ─────────────────────────────────────────────────────
exports.getDevices = async (req, res) => {
  try {
    let devices = [];
    if (isMongoConnected()) {
      devices = await Device.find().populate('owner', 'name email').sort({ createdAt: -1 });
      devices = devices.map((d) => d.toObject());
    } else {
      await init();
      devices = [...store.devices];
    }

    devices = devices.map((d) => {
      const st = wa.getStatus(d._id);
      if (st.status !== 'Offline') {
        return {
          ...d,
          status: st.status,
          isActive: st.status === 'Online',
          phoneNumber: st.phone ? `+${st.phone}` : d.phoneNumber,
          contactCount: st.contacts,
        };
      }
      return d;
    });

    res.json({ success: true, count: devices.length, data: devices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Add ──────────────────────────────────────────────────────
exports.addDevice = async (req, res) => {
  try {
    const { name, phoneNumber, model } = req.body;

    if (isMongoConnected()) {
      const device = await Device.create({
        name: name || model || 'New Device',
        phoneNumber,
        model,
        status: 'Offline',
        owner: req.user._id,
      });
      return res.status(201).json({ success: true, data: device });
    }

    await init();
    const device = {
      _id: `d${Date.now()}`,
      name: name || model || 'New Device',
      phoneNumber,
      model,
      status: 'Offline',
      battery: 100,
      lastSeen: new Date(),
    };
    store.devices.push(device);
    res.status(201).json({ success: true, data: device });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Connect (start Baileys → emits QR) ───────────────────────
exports.connectDevice = async (req, res) => {
  try {
    const id = req.params.id;
    await init();

    if (isMongoConnected()) {
      const device = await Device.findById(id);
      if (!device) {
        return res.status(404).json({ success: false, message: 'Device not found' });
      }
      device.status = 'Connecting';
      await device.save();
    } else {
      const device = store.devices.find((d) => d._id === id);
      if (!device) {
        return res.status(404).json({ success: false, message: 'Device not found' });
      }
      device.status = 'Connecting';
    }

    try {
      await wa.startSession(id);
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: e.message,
        install: 'npm install @whiskeysockets/baileys@6.7.18 qrcode pino socket.io',
      });
    }

    res.json({
      success: true,
      message: 'Session starting — scan QR when it appears',
      data: { _id: id, status: 'Connecting' },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── QR ───────────────────────────────────────────────────────
// exports.getQr = async (req, res) => {
//   try {
//     const id = req.params.id;

//     try {
//       await wa.startSession(id);
//     } catch (e) {
//       return res.status(500).json({ success: false, message: e.message });
//     }

//     // Already online?
//     const early = wa.getStatus(id);
//     if (early.status === 'Online') {
//       return res.json({
//         success: true,
//         qrCode: null,
//         status: 'Online',
//         message: 'Already connected',
//         phone: early.phone,
//         deviceId: id,
//       });
//     }

//     // Wait up to ~10s for QR
//     let qr = wa.getQr(id);
//     for (let i = 0; i < 20 && !qr; i++) {
//       await new Promise((r) => setTimeout(r, 500));
//       qr = wa.getQr(id);
//       const st = wa.getStatus(id);
//       if (st.status === 'Online') {
//         return res.json({
//           success: true,
//           qrCode: null,
//           status: 'Online',
//           message: 'Already connected',
//           phone: st.phone,
//           deviceId: id,
//         });
//       }
//     }

//     if (!qr) {
//       return res.status(404).json({
//         success: false,
//         message: 'QR not ready yet — try again in 2 seconds',
//         status: wa.getStatus(id).status,
//       });
//     }

//     res.json({ success: true, qrCode: qr, deviceId: id, status: 'Connecting' });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// // Alias used by some routes
// exports.getQrcode = exports.getQr;

// // ─── Live status (Flutter polls after scan) ───────────────────
// exports.getDeviceStatus = async (req, res) => {
//   try {
//     const id = req.params.id;
//     const st = wa.getStatus(id);
//     res.json({
//       success: true,
//       data: {
//         _id: id,
//         status: st.status,
//         phone: st.phone,
//         phoneNumber: st.phone ? `+${st.phone}` : null,
//         contactCount: st.contacts,
//         isActive: st.status === 'Online',
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };




exports.getQr = async (req, res) => {
  try {
    const id = req.params.id;

    try {
      await wa.startSession(id);
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: e.message
      });
    }

    const early = wa.getStatus(id);

    if (early.status === 'Online') {
      return res.json({
        success: true,
        qrCode: null,
        status: 'Online',
        message: 'Already connected',
        phone: early.phone,
        deviceId: id
      });
    }

    let qr = wa.getQr(id);

    for (let i = 0; i < 20 && !qr; i++) {
      await new Promise((r) => setTimeout(r, 500));

      qr = wa.getQr(id);

      const st = wa.getStatus(id);

      if (st.status === 'Online') {
        return res.json({
          success: true,
          qrCode: null,
          status: 'Online',
          message: 'Already connected',
          phone: st.phone,
          deviceId: id
        });
      }
    }

    if (!qr) {
      return res.status(404).json({
        success: false,
        message: 'QR not ready yet — try again in 2 seconds',
        status: wa.getStatus(id).status
      });
    }

    return res.json({
      success: true,
      qrCode: qr,
      deviceId: id,
      status: 'Connecting'
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};// Alias used by some routes
exports.getQrcode = exports.getQr;


// ─── Live status ─────────────────────────────────────────────
exports.getDeviceStatus = async (req, res) => {
  try {
    const id = req.params.id;

    const st = wa.getStatus(id);

    res.json({
      success: true,
      data: {
        _id: id,
        status: st.status,
        phone: st.phone,
        phoneNumber: st.phone ? `+${st.phone}` : null,
        contactCount: st.contacts,
        isActive: st.status === 'Online'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
// ─── Disconnect ───────────────────────────────────────────────
exports.disconnectDevice = async (req, res) => {
  try {
    const id = req.params.id;
    await wa.stopSession(id);

    if (isMongoConnected()) {
      const device = await Device.findById(id);
      if (device) {
        device.status = 'Offline';
        await device.save();
        return res.json({ success: true, data: device, message: 'Disconnected' });
      }
    }

    await init();
    const device = store.devices.find((d) => d._id === id);
    if (device) device.status = 'Offline';
    res.json({ success: true, data: device, message: 'Disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Update ───────────────────────────────────────────────────
exports.updateDevice = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const device = await Device.findByIdAndUpdate(req.params.id, req.body, { new: true });
      return res.json({ success: true, data: device });
    }
    await init();
    const device = store.devices.find((d) => d._id === req.params.id);
    if (!device) return res.status(404).json({ success: false, message: 'Not found' });
    Object.assign(device, req.body);
    res.json({ success: true, data: device });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Delete ───────────────────────────────────────────────────
exports.deleteDevice = async (req, res) => {
  try {
    await wa.stopSession(req.params.id);

    if (isMongoConnected()) {
      await Device.findByIdAndDelete(req.params.id);
      return res.json({ success: true, message: 'Deleted' });
    }

    await init();
    store.devices = store.devices.filter((d) => d._id !== req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Send one message / quick send ────────────────────────────
exports.sendMessage = async (req, res) => {
  try {
    const messageService = require('../services/messageService');
    const deviceId = req.params.id || req.body.deviceId;
    const {
      phone, jid, message, text, mediaFiles, media, sendText = true,
      contact,
    } = req.body;

    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId required' });
    if (sendText !== false && !message && !text && !Array.isArray(mediaFiles) && !media) {
      return res.status(400).json({ success: false, message: 'message or media required' });
    }

    const result = await messageService.sendOne(deviceId, {
      phone, jid, message: message || text, mediaFiles, media, sendText, contact,
    });
    res.json({ success: true, data: result, sent: 1, failed: 0, message: 'Message sent' });
  } catch (error) {
    res.status(400).json({ success: false, sent: 0, failed: 1, message: error.message });
  }
};

// ─── Bulk send with equal distribution across selected active devices
// exports.sendBulkMessages = async (req, res) => {
//   try {
//     const messageService = require('../services/messageService');
//     const {
//       messages, message, contacts = [], recipients = [],
//       deviceIds, deviceId, mediaFiles, media, sendText = true,
//     } = req.body;

//     let list = Array.isArray(messages) ? messages : (Array.isArray(recipients) && recipients.length ? recipients : contacts);
//     if (!Array.isArray(list) || list.length === 0) {
//       return res.status(400).json({ success: false, message: 'contacts/messages/recipients array required' });
//     }

//     list = list.map((item) => ({
//       ...item,
//       message: item.message || message || '',
//       mediaFiles: item.mediaFiles || mediaFiles || (media ? [media] : []),
//       sendText: item.sendText !== undefined ? item.sendText : sendText,
//     }));

//     const selected = Array.isArray(deviceIds) && deviceIds.length ? deviceIds : (deviceId ? [deviceId] : []);
//     const { deviceIds: activeDevices, results } = await messageService.sendBulk(list, selected);

//     const sent = results.filter((r) => r.ok).length;
//     const failed = results.length - sent;
//     res.json({
//       success: true,
//       sent,
//       failed,
//       total: results.length,
//       activeDevices,
//       distribution: activeDevices.reduce((acc, id) => {
//         acc[id] = results.filter((r) => r.deviceId === id).length;
//         return acc;
//       }, {}),
//       results,
//       message: `Bulk send completed across ${activeDevices.length} active device(s)`,
//     });
//   } catch (error) {
//     res.status(400).json({ success: false, message: error.message });
//   }
// };

// controllers/devices.js
exports.sendBulkMessages = async (req, res) => {
  try {
    const messageService = require('../services/messageService');
    const {
      messages,
      message,
      contacts = [],
      recipients = [],
      deviceIds,
      deviceId,
      mediaFiles,
      media,
      sendText = true,
    } = req.body;

    // 1. Pick whichever array was sent
    const rawList = Array.isArray(messages)
      ? messages
      : Array.isArray(recipients) && recipients.length
        ? recipients
        : contacts;

    if (!Array.isArray(rawList) || rawList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'contacts/messages/recipients array required',
      });
    }

    // 2. Normalize each item + validate it has a recipient
    const list = [];
    const invalid = [];

    rawList.forEach((item, index) => {
      const to = item.to || item.phone || item.number;
      if (!to) {
        invalid.push({ index, reason: 'missing recipient (to/phone/number)' });
        return;
      }

      const finalMessage = item.message || message || '';
      const finalMedia = item.mediaFiles || mediaFiles || (media ? [media] : []);

      if (!finalMessage && finalMedia.length === 0) {
        invalid.push({ index, reason: 'no message text or media provided' });
        return;
      }

      list.push({
        ...item,
        to,
        message: finalMessage,
        mediaFiles: finalMedia,
        sendText: item.sendText !== undefined ? item.sendText : sendText,
      });
    });

    if (list.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid recipients found',
        invalid,
      });
    }

    // 3. Device selection
    const selectedDevices = Array.isArray(deviceIds) && deviceIds.length
      ? deviceIds
      : deviceId
        ? [deviceId]
        : [];

    // 4. Send
    const { deviceIds: activeDevices, results } = await messageService.sendBulk(
      list,
      selectedDevices
    );

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;

    return res.status(200).json({
      success: true,
      sent,
      failed,
      total: results.length,
      skipped: invalid.length,
      invalid,
      activeDevices,
      distribution: activeDevices.reduce((acc, id) => {
        acc[id] = results.filter((r) => r.deviceId === id).length;
        return acc;
      }, {}),
      results,
      message: `Bulk send completed across ${activeDevices.length} active device(s)`,
    });
  } catch (error) {
    console.error('sendBulkMessages error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};