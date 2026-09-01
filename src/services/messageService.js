
const fs = require('fs');
const path = require('path');

const wa = require('./whatsappService');

const Device = require('../models/Device');

const {
  store,
  init,
  isMongoConnected,
} = require('../utils/memoryStore');

const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR ||
    path.join(__dirname, '../../uploads')
);

// ============================================================
// NORMALIZE DEVICE ID
// ============================================================

function normaliseDeviceId(deviceId) {
  if (
    deviceId === undefined ||
    deviceId === null
  ) {
    return null;
  }

  let id = String(deviceId).trim();

  /*
   * Handles:
   *
   * 6a802b9a28f2a7405ba21cfb
   *
   * and accidental:
   *
   * {{6a802b9a28f2a7405ba21cfb}}
   */

  id = id.replace(/^\{\{/, '');
  id = id.replace(/\}\}$/, '');

  // Remove accidental surrounding quotes
  id = id.replace(/^["']+|["']+$/g, '');

  id = id.trim();

  return id || null;
}

// ============================================================
// NORMALIZE PHONE
// ============================================================

function normalisePhone(phone) {
  if (!phone) {
    return null;
  }

  const digits = String(phone)
    .replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

// ============================================================
// RESOLVE MEDIA FILE
// ============================================================

function resolveFile(media) {
  if (!media) {
    return null;
  }

  const input =
    media.path ||
    media.url ||
    media.file ||
    media.filePath;

  if (!input) {
    return null;
  }

  // HTTP / HTTPS URL
  if (/^https?:\/\//i.test(input)) {
    return {
      url: input,
    };
  }

  const clean = String(input)
    .replace(/^\/+/, '');

  const candidates = [
    // Project relative
    path.isAbsolute(input)
      ? input
      : path.join(
          __dirname,
          '../..',
          clean
        ),

    // Upload directory
    path.join(
      UPLOAD_DIR,
      path.basename(input)
    ),
  ];

  const filePath =
    candidates.find((file) =>
      fs.existsSync(file)
    );

  if (!filePath) {
    throw new Error(
      `Media file not found: ${input}`
    );
  }

  return {
    buffer: fs.readFileSync(
      filePath
    ),
  };
}

// ============================================================
// CREATE BAILEYS MEDIA PAYLOAD
// ============================================================

function mediaPayload(media, caption = '') {
  if (!media) {
    throw new Error('Invalid media attachment');
  }

  const mime = String(
    media.mimeType ||
    media.mimetype ||
    ''
  ).toLowerCase();

  const type = String(
    media.type || ''
  ).toLowerCase();

  const source = resolveFile(media);

  if (!source) {
    throw new Error('Invalid media attachment');
  }

  // ==========================================================
  // IMAGE
  // ==========================================================

  if (
    type === 'image' ||
    mime.startsWith('image/')
  ) {
    return {
      image: source.buffer || source.url,
      ...(caption
        ? { caption }
        : {}
      ),
    };
  }

  // ==========================================================
  // VIDEO
  // ==========================================================

  if (
    type === 'video' ||
    mime.startsWith('video/')
  ) {
    return {
      video: source.buffer || source.url,
      ...(caption
        ? { caption }
        : {}
      ),
      mimetype: mime || 'video/mp4',
    };
  }

  // ==========================================================
  // AUDIO
  // ==========================================================

  if (
    type === 'audio' ||
    mime.startsWith('audio/')
  ) {
    return {
      audio: source.buffer || source.url,
      mimetype: mime || 'audio/mpeg',

      // Voice note true ho to PTT
      ptt: Boolean(media.ptt),
    };
  }

  // ==========================================================
  // DOCUMENT
  // ==========================================================

  return {
    document: source.buffer || source.url,

    mimetype:
      mime ||
      'application/octet-stream',

    fileName:
      media.originalName ||
      media.filename ||
      media.name ||
      'attachment',
  };
}

// ============================================================
// GET ACTIVE DEVICE IDS
// ============================================================

async function activeDeviceIds(
  requestedIds = []
) {
  await init();

  const ids = Array.isArray(
    requestedIds
  )
    ? requestedIds
        .map(normaliseDeviceId)
        .filter(Boolean)
    : [];

  let candidates = [];

  // ----------------------------------------------------------
  // MongoDB
  // ----------------------------------------------------------

  if (isMongoConnected()) {
    const filter = ids.length
      ? {
          _id: {
            $in: ids,
          },
        }
      : {};

    candidates =
      await Device.find(filter)
        .select('_id')
        .lean();
  }

  // ----------------------------------------------------------
  // Memory store
  // ----------------------------------------------------------

  else {
    candidates =
      (store.devices || [])
        .filter(
          (device) =>
            !ids.length ||
            ids.includes(
              String(device._id)
            )
        )
        .map(
          (device) => ({
            _id: device._id,
          })
        );
  }

  // ----------------------------------------------------------
  // IMPORTANT
  //
  // Database status is NOT used here.
  // Baileys live session is the source of truth.
  // ----------------------------------------------------------

  const active = [];

  for (
    const candidate of candidates
  ) {
    const id =
      normaliseDeviceId(
        candidate._id
      );

    if (!id) {
      continue;
    }

    const session =
      wa.getSession(id);

    if (
      session &&
      session.sock &&
      session.status === 'Online'
    ) {
      active.push(id);
    }
  }

  return active;
}

// ============================================================
// SPLIT MESSAGES EQUALLY
// ============================================================

function splitEqually(
  items,
  deviceIds
) {
  if (
    !Array.isArray(items) ||
    !deviceIds.length
  ) {
    return new Map();
  }

  const result =
    new Map(
      deviceIds.map(
        (id) => [
          id,
          [],
        ]
      )
    );

  items.forEach(
    (item, index) => {
      const id =
        deviceIds[
          index %
            deviceIds.length
        ];

      result
        .get(id)
        .push(item);
    }
  );

  return result;
}

// ============================================================
// MESSAGE TEMPLATE RENDER
// ============================================================

function renderMessage(
  message,
  contact = {}
) {
  return String(
    message || ''
  )
    .replace(
      /\{\{Name\}\}/gi,
      contact.name || ''
    )
    .replace(
      /\{\{Phone\}\}/gi,
      contact.phone || ''
    )
    .replace(
      /\{\{Email\}\}/gi,
      contact.email || ''
    )
    .replace(
      /\{\{Company\}\}/gi,
      contact.company ||
        contact.firmName ||
        ''
    )
    .replace(
      /\{\{Date\}\}/gi,
      contact.date
        ? new Date(
            contact.date
          ).toLocaleDateString(
            'en-IN'
          )
        : ''
    );
}

// ============================================================
// SEND ONE MESSAGE
// ============================================================

async function sendOne(
  deviceId,
  item
) {
  const id =
    normaliseDeviceId(
      deviceId
    );

  if (!id) {
    throw new Error(
      'Valid deviceId is required'
    );
  }

  console.log(
    '========================================'
  );

  console.log(
    '[WA SEND] Requested deviceId:',
    deviceId
  );

  console.log(
    '[WA SEND] Normalized deviceId:',
    id
  );

  // ----------------------------------------------------------
  // Get LIVE Baileys session
  // ----------------------------------------------------------

  const session =
    wa.getSession(id);

  console.log(
    '[WA SEND] Session found:',
    Boolean(session)
  );

  if (!session) {
    console.error(
      '[WA SEND] Session not found:',
      id
    );

    console.error(
      '[WA SEND] Available sessions:',
      wa.getAllSessions()
    );

    throw new Error(
      `Device ${id} session not found. ` +
        `Please connect the device and scan QR.`
    );
  }

  console.log(
    '[WA SEND] Session status:',
    session.status
  );

  console.log(
    '[WA SEND] Socket available:',
    Boolean(session.sock)
  );

  // ----------------------------------------------------------
  // Check socket
  // ----------------------------------------------------------

  if (!session.sock) {
    throw new Error(
      `Device ${id} socket is not available.`
    );
  }

  // ----------------------------------------------------------
  // Check status
  // ----------------------------------------------------------

  if (
    session.status !== 'Online'
  ) {
    throw new Error(
      `Device ${id} is not connected. ` +
        `Current status: ${session.status}`
    );
  }

  // ----------------------------------------------------------
  // Destination
  // ----------------------------------------------------------

  const to =
    item?.jid ||
    normalisePhone(
      item?.phone
    );

  if (!to) {
    throw new Error(
      'phone or jid required'
    );
  }

  // ----------------------------------------------------------
  // Render message
  // ----------------------------------------------------------

  const message =
    renderMessage(
      item?.message ||
        item?.text ||
        '',
      item?.contact ||
        item ||
        {}
    );

  // ----------------------------------------------------------
  // Media
  // ----------------------------------------------------------

  const mediaFiles =
    Array.isArray(
      item?.mediaFiles
    )
      ? item.mediaFiles
      : item?.media
        ? [item.media]
        : [];

  const sendText =
    item?.sendText !== false;

  let lastResult =
    null;

  // ==========================================================
  // SEND TEXT
  // ==========================================================

  if (
    sendText &&
    message
  ) {
    console.log(
      `[WA SEND] Sending text: ${id} -> ${to}`
    );

    lastResult =
      await session.sock.sendMessage(
        to,
        {
          text: message,
        }
      );

    console.log(
      '[WA SEND] Text sent:',
      lastResult?.key?.id ||
        null
    );
  }

  // ==========================================================
  // SEND MEDIA
  // ==========================================================

  for (
    const media of mediaFiles
  ) {
    console.log(
      `[WA SEND] Sending media: ${id} -> ${to}`
    );

    const payload =
      mediaPayload(
        media,
        sendText
          ? undefined
          : message
      );

    lastResult =
      await session.sock.sendMessage(
        to,
        payload
      );

    console.log(
      '[WA SEND] Media sent:',
      lastResult?.key?.id ||
        null
    );
  }

  // ==========================================================
  // NOTHING TO SEND
  // ==========================================================

  if (!lastResult) {
    throw new Error(
      'Nothing to send: enable text or attach media'
    );
  }

  console.log(
    `[WA SEND] SUCCESS: ${id} -> ${to}`
  );

  console.log(
    '========================================'
  );

  return {
    ok: true,
    to,
    deviceId: id,
    messageId:
      lastResult?.key?.id ||
      null,
  };
}

// ============================================================
// SEND BULK
// ============================================================

async function sendBulk(
  items,
  requestedDeviceIds = []
) {
  if (!Array.isArray(items)) {
    throw new Error(
      'items must be an array'
    );
  }

  const requestedIds =
    Array.isArray(
      requestedDeviceIds
    )
      ? requestedDeviceIds
          .map(
            normaliseDeviceId
          )
          .filter(Boolean)
      : [];

  console.log(
    '========================================'
  );

  console.log(
    '[WA BULK] Requested devices:',
    requestedIds
  );

  console.log(
    '[WA BULK] Live sessions:',
    wa.getAllSessions()
  );

  // ----------------------------------------------------------
  // Find connected devices
  // ----------------------------------------------------------

  const devices =
    await activeDeviceIds(
      requestedIds
    );

  console.log(
    '[WA BULK] Active devices:',
    devices
  );

  if (!devices.length) {
    throw new Error(
      'No active WhatsApp device is connected. ' +
        'Connect and scan at least one device.'
    );
  }

  // ----------------------------------------------------------
  // Distribute messages
  // ----------------------------------------------------------

  const groups =
    splitEqually(
      items,
      devices
    );

  const results = [];

  // ----------------------------------------------------------
  // Send
  // ----------------------------------------------------------

  for (
    const [
      deviceId,
      list,
    ] of groups.entries()
  ) {
    for (
      const item of list
    ) {
      try {
        const result =
          await sendOne(
            deviceId,
            item
          );

        results.push(
          result
        );
      } catch (error) {
        console.error(
          `[WA BULK] Failed for ${deviceId}:`,
          error.message
        );

        results.push({
          ok: false,
          deviceId,
          to:
            item?.phone ||
            item?.jid ||
            null,
          error:
            error.message,
        });
      }

      // ------------------------------------------------------
      // Delay
      // ------------------------------------------------------

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            700
          )
      );
    }
  }

  const sent =
    results.filter(
      (item) => item.ok
    ).length;

  const failed =
    results.filter(
      (item) => !item.ok
    ).length;

  console.log(
    `[WA BULK] Complete. Sent: ${sent}, Failed: ${failed}`
  );

  console.log(
    '========================================'
  );

  return {
    deviceIds: devices,
    results,
    sent,
    failed,
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  normaliseDeviceId,
  normalisePhone,
  activeDeviceIds,
  splitEqually,
  renderMessage,
  sendOne,
  sendBulk,
};