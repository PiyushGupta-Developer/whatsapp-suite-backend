const Device = require('../models/Device');

const { store, init, isMongoConnected } = require('../utils/memoryStore');
const wa = require('../services/whatsappService');

// ─── List ─────────────────────────────────────────────────────
exports.getDevices = async (req, res) => {
  try {
    // Logged-in user ka ID
    const userId = req.user._id;

    let devices = [];

    // MongoDB Mode
    if (isMongoConnected()) {
      devices = await Device.find({
        owner: userId,
      })
        .populate('owner', 'name email')
        .sort({ createdAt: -1 });

      devices = devices.map((d) => d.toObject());

    } else {
      // Memory Mode
      await init();

      devices = store.devices.filter(
        (d) => String(d.owner) === String(userId)
      );
    }

    devices = devices.map((d) => {
      const st = wa.getStatus(d._id);

      if (st.status !== 'Offline') {
        return {
          ...d,
          status: st.status,
          isActive: st.status === 'Online',
          phoneNumber: st.phone
            ? `+${st.phone}`
            : d.phoneNumber,
          contactCount: st.contacts,
        };
      }

      return d;
    });

    res.json({
      success: true,
      count: devices.length,
      data: devices,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ─── Add ──────────────────────────────────────────────────────
exports.addDevice = async (req, res) => {
  try {
    const { name, phoneNumber, model } = req.body;

    // MongoDB Mode
    if (isMongoConnected()) {
      const device = await Device.create({
        name: name || model || 'New Device',
        phoneNumber,
        model,
        status: 'Offline',

        // Logged-in user is device owner
        owner: req.user._id,
      });

      return res.status(201).json({
        success: true,
        data: device,
      });
    }

    // Memory Mode
    await init();

    const device = {
      _id: `d${Date.now()}`,
      name: name || model || 'New Device',
      phoneNumber,
      model,
      status: 'Offline',
      battery: 100,
      lastSeen: new Date(),

      // IMPORTANT: Memory mode me bhi owner save hoga
      owner: req.user._id,
    };

    store.devices.push(device);

    res.status(201).json({
      success: true,
      data: device,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ─── Connect (start Baileys → emits QR) ───────────────────────
exports.connectDevice = async (req, res) => {
  try {
    const id = req.params.id;

    // Logged-in user
    const userId = req.user._id;

    await init();

    // MongoDB Mode
    if (isMongoConnected()) {

      // Sirf logged-in user ka device find hoga
      const device = await Device.findOne({
        _id: id,
        owner: userId,
      });

      if (!device) {
        return res.status(404).json({
          success: false,
          message: 'Device not found',
        });
      }

      device.status = 'Connecting';
      await device.save();

    } else {

      // Memory Mode
      const device = store.devices.find(
        (d) =>
          String(d._id) === String(id) &&
          String(d.owner) === String(userId)
      );

      if (!device) {
        return res.status(404).json({
          success: false,
          message: 'Device not found',
        });
      }

      device.status = 'Connecting';
    }

    // Ownership verify hone ke baad hi WhatsApp session start hoga
    try {
      await wa.startSession(id);

    } catch (e) {
      return res.status(500).json({
        success: false,
        message: e.message,
        install:
          'npm install @whiskeysockets/baileys@6.7.18 qrcode pino socket.io',
      });
    }

    res.json({
      success: true,
      message: 'Session starting — scan QR when it appears',
      data: {
        _id: id,
        status: 'Connecting',
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ─── Get QR ───────────────────────────────────────────────────
exports.getQr = async (req, res) => {
  try {
    const id = req.params.id;

    // Logged-in user
    const userId = req.user._id;

    let device;

    // MongoDB Mode
    if (isMongoConnected()) {

      device = await Device.findOne({
        _id: id,
        owner: userId,
      });

    } else {

      // Memory Mode
      await init();

      device = store.devices.find(
        (d) =>
          String(d._id) === String(id) &&
          String(d.owner) === String(userId)
      );
    }

    // Device kisi aur user ka hai ya exist nahi karta
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
      });
    }

    // Ownership verify hone ke BAAD session start hoga
    try {
      await wa.startSession(id);

    } catch (e) {
      return res.status(500).json({
        success: false,
        message: e.message,
      });
    }

    const early = wa.getStatus(id);

    // Already connected
    if (early.status === 'Online') {
      return res.json({
        success: true,
        qrCode: null,
        status: 'Online',
        message: 'Already connected',
        phone: early.phone,
        deviceId: id,
      });
    }

    let qr = wa.getQr(id);

    // QR ke liye wait
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
          deviceId: id,
        });
      }
    }

    // QR ready nahi hua
    if (!qr) {
      return res.status(404).json({
        success: false,
        message: 'QR not ready yet — try again in 2 seconds',
        status: wa.getStatus(id).status,
      });
    }

    // QR return
    return res.json({
      success: true,
      qrCode: qr,
      deviceId: id,
      status: 'Connecting',
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};// Alias used by some routes
exports.getQrcode = exports.getQr;


// ─── Live status ─────────────────────────────────────────────
exports.getDeviceStatus = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user._id;

    let device;

    // MongoDB Mode
    if (isMongoConnected()) {
      device = await Device.findOne({
        _id: id,
        owner: userId,
      });
    } else {
      // Memory Mode
      await init();

      device = store.devices.find(
        (d) =>
          String(d._id) === String(id) &&
          String(d.owner) === String(userId)
      );
    }

    // Device nahi mila ya kisi aur user ka hai
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
      });
    }

    const st = wa.getStatus(id);

    res.json({
      success: true,
      data: {
        _id: id,
        status: st.status,
        phone: st.phone,

        phoneNumber: st.phone
          ? `+${st.phone}`
          : device.phoneNumber,

        contactCount: st.contacts,
        isActive: st.status === 'Online',
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ─── Disconnect ───────────────────────────────────────────────
exports.disconnectDevice = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user._id;

    let device;

    // MongoDB Mode
    if (isMongoConnected()) {
      device = await Device.findOne({
        _id: id,
        owner: userId,
      });

    } else {
      // Memory Mode
      await init();

      device = store.devices.find(
        (d) =>
          String(d._id) === String(id) &&
          String(d.owner) === String(userId)
      );
    }

    // Pehle ownership verify
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
      });
    }

    // Ab session stop hoga
    await wa.stopSession(id);

    device.status = 'Offline';

    // MongoDB me save karo
    if (isMongoConnected()) {
      await device.save();
    }

    return res.json({
      success: true,
      data: device,
      message: 'Disconnected',
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─── Update ───────────────────────────────────────────────────
exports.updateDevice = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user._id;

    // Security: owner change nahi karne dena
    delete req.body.owner;

    // MongoDB Mode
    if (isMongoConnected()) {

      const device = await Device.findOneAndUpdate(
        {
          _id: id,
          owner: userId,
        },
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!device) {
        return res.status(404).json({
          success: false,
          message: 'Device not found',
        });
      }

      return res.json({
        success: true,
        data: device,
      });
    }

    // Memory Mode
    await init();

    const device = store.devices.find(
      (d) =>
        String(d._id) === String(id) &&
        String(d.owner) === String(userId)
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
      });
    }

    Object.assign(device, req.body);

    return res.json({
      success: true,
      data: device,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ─── Delete ───────────────────────────────────────────────────
exports.deleteDevice = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user._id;

    // MongoDB Mode
    if (isMongoConnected()) {

      // Pehle ownership check
      const device = await Device.findOne({
        _id: id,
        owner: userId,
      });

      if (!device) {
        return res.status(404).json({
          success: false,
          message: 'Device not found',
        });
      }

      // Ownership verify hone ke baad session stop
      await wa.stopSession(id);

      await Device.deleteOne({
        _id: id,
        owner: userId,
      });

      return res.json({
        success: true,
        message: 'Deleted',
      });
    }

    // Memory Mode
    await init();

    const index = store.devices.findIndex(
      (d) =>
        String(d._id) === String(id) &&
        String(d.owner) === String(userId)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Device not found',
      });
    }

    // Ownership verify hone ke baad stop
    await wa.stopSession(id);

    store.devices.splice(index, 1);

    return res.json({
      success: true,
      message: 'Deleted',
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─── Send one message / quick send ────────────────────────────
exports.sendMessage = async (req, res) => {
  try {
    const messageService = require('../services/messageService');

    const deviceId =
      req.params.id || req.body.deviceId;

    const userId = req.user._id;

    const {
      phone,
      jid,
      message,
      text,
      mediaFiles,
      media,
      sendText = true,
      contact,
    } = req.body;

    // Device ID required
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'deviceId required',
      });
    }

    // Message/media required
    if (
      sendText !== false &&
      !message &&
      !text &&
      !Array.isArray(mediaFiles) &&
      !media
    ) {
      return res.status(400).json({
        success: false,
        message: 'message or media required',
      });
    }

    let device;

    // MongoDB Mode
    if (isMongoConnected()) {
      device = await Device.findOne({
        _id: deviceId,
        owner: userId,
      });

    } else {
      // Memory Mode
      await init();

      device = store.devices.find(
        (d) =>
          String(d._id) === String(deviceId) &&
          String(d.owner) === String(userId)
      );
    }

    // Dusre user ka device use nahi kar sakta
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found or not authorized',
      });
    }

    // Ownership verify hone ke baad message send
    const result = await messageService.sendOne(
      deviceId,
      {
        phone,
        jid,
        message: message || text,
        mediaFiles,
        media,
        sendText,
        contact,
      }
    );

    res.json({
      success: true,
      data: result,
      sent: 1,
      failed: 0,
      message: 'Message sent',
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      sent: 0,
      failed: 1,
      message: error.message,
    });
  }
};

// ─── Send bulk messages ───────────────────────────────────────
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

    const userId = req.user._id;

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

    // 2. Normalize each item
    const list = [];
    const invalid = [];

    rawList.forEach((item, index) => {
      const to = item.to || item.phone || item.number;

      if (!to) {
        invalid.push({
          index,
          reason: 'missing recipient (to/phone/number)',
        });
        return;
      }

      const finalMessage =
        item.message || message || '';

      const finalMedia =
        item.mediaFiles ||
        mediaFiles ||
        (media ? [media] : []);

      if (!finalMessage && finalMedia.length === 0) {
        invalid.push({
          index,
          reason: 'no message text or media provided',
        });
        return;
      }

      list.push({
        ...item,
        to,
        message: finalMessage,
        mediaFiles: finalMedia,
        sendText:
          item.sendText !== undefined
            ? item.sendText
            : sendText,
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
    const selectedDevices =
      Array.isArray(deviceIds) && deviceIds.length
        ? deviceIds
        : deviceId
          ? [deviceId]
          : [];

    /*
      IMPORTANT:
      Agar devices select kiye gaye hain,
      to verify karo ki sab logged-in user ke hain.
    */

    if (selectedDevices.length > 0) {

      // MongoDB Mode
      if (isMongoConnected()) {

        const ownedDevices = await Device.find({
          _id: {
            $in: selectedDevices,
          },
          owner: userId,
        }).select('_id');

        const ownedDeviceIds =
          ownedDevices.map(
            (device) => String(device._id)
          );

        const unauthorizedDevices =
          selectedDevices.filter(
            (id) =>
              !ownedDeviceIds.includes(String(id))
          );

        if (unauthorizedDevices.length > 0) {
          return res.status(403).json({
            success: false,
            message:
              'You are not authorized to use one or more selected devices',
          });
        }

      } else {

        // Memory Mode
        await init();

        const ownedDeviceIds =
          store.devices
            .filter(
              (device) =>
                String(device.owner) === String(userId)
            )
            .map(
              (device) =>
                String(device._id)
            );

        const unauthorizedDevices =
          selectedDevices.filter(
            (id) =>
              !ownedDeviceIds.includes(String(id))
          );

        if (unauthorizedDevices.length > 0) {
          return res.status(403).json({
            success: false,
            message:
              'You are not authorized to use one or more selected devices',
          });
        }
      }
    }

    // 4. Send
    const {
      deviceIds: activeDevices,
      results,
    } = await messageService.sendBulk(
      list,
      selectedDevices
    );

    const sent =
      results.filter((r) => r.ok).length;

    const failed =
      results.length - sent;

    return res.status(200).json({
      success: true,
      sent,
      failed,
      total: results.length,
      skipped: invalid.length,
      invalid,
      activeDevices,

      distribution: activeDevices.reduce(
        (acc, id) => {
          acc[id] = results.filter(
            (r) => r.deviceId === id
          ).length;

          return acc;
        },
        {}
      ),

      results,

      message:
        `Bulk send completed across ${activeDevices.length} active device(s)`,
    });

  } catch (error) {

    console.error(
      'sendBulkMessages error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        'Internal server error',
    });
  }
};