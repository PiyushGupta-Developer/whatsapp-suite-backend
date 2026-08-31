// /**
//  * WhatsApp Service - Baileys
//  *
//  * Install:
//  * npm install @whiskeysockets/baileys@6.7.18 qrcode pino
//  *
//  * This service:
//  * - Creates one WhatsApp session per device
//  * - Generates QR as PNG Data URL
//  * - Persists authentication in /sessions/<deviceId>
//  * - Reconnects safely
//  * - Handles restartRequired
//  * - Handles loggedOut
//  * - Exposes status + QR
//  */

// const path = require('path');
// const fs = require('fs');

// // ============================================================
// // Baileys imports
// // ============================================================

// let makeWASocket = null;
// let useMultiFileAuthState = null;
// let DisconnectReason = {};
// let fetchLatestBaileysVersion = null;
// let Browsers = null;

// let QRCode = null;
// let pino = null;

// // ============================================================
// // Load QRCode
// // ============================================================

// try {
//   QRCode = require('qrcode');

//   console.log('[WA] qrcode loaded OK');
// } catch (error) {
//   console.error('[WA] qrcode package missing');
//   console.error('Run: npm install qrcode');
// }

// // ============================================================
// // Load Pino
// // ============================================================

// try {
//   pino = require('pino');
// } catch (error) {
//   console.warn('[WA] pino not installed, using silent fallback');

//   pino = () => ({
//     level: 'silent',
//     child() {
//       return this;
//     },
//     info() {},
//     error() {},
//     warn() {},
//     debug() {},
//     trace() {},
//     fatal() {},
//   });
// }

// // ============================================================
// // Load Baileys
// // ============================================================

// try {
//   const baileys = require('@whiskeysockets/baileys');

//   makeWASocket =
//     baileys.default ||
//     baileys.makeWASocket;

//   useMultiFileAuthState =
//     baileys.useMultiFileAuthState;

//   DisconnectReason =
//     baileys.DisconnectReason || {};

//   fetchLatestBaileysVersion =
//     baileys.fetchLatestBaileysVersion;

//   Browsers =
//     baileys.Browsers;

//   if (!makeWASocket) {
//     throw new Error('makeWASocket not found');
//   }

//   if (!useMultiFileAuthState) {
//     throw new Error('useMultiFileAuthState not found');
//   }

//   console.log('[WA] Baileys loaded OK');

// } catch (error) {
//   console.error('[WA] Baileys load failed:', error.message);

//   console.error(
//     'Run: npm install @whiskeysockets/baileys@6.7.18 qrcode pino'
//   );
// }

// // ============================================================
// // Sessions directory
// // ============================================================

// const sessionsDir = path.resolve(
//   __dirname,
//   '../../sessions'
// );

// if (!fs.existsSync(sessionsDir)) {
//   fs.mkdirSync(sessionsDir, {
//     recursive: true,
//   });
// }

// // ============================================================
// // Session storage
// // ============================================================

// const sessions = new Map();

// // Prevent multiple simultaneous startSession calls
// const starting = new Set();

// // Socket.IO
// let io = null;

// // ============================================================
// // Socket.IO
// // ============================================================

// function setSocketIO(socketIo) {
//   io = socketIo;

//   console.log('[WA] Socket.IO connected to WhatsApp service');
// }

// // ============================================================
// // Emit helper
// // ============================================================

// function emit(event, payload = {}) {
//   try {
//     if (io) {
//       io.emit(event, payload);
//     }
//   } catch (error) {
//     console.error(
//       '[WA] Socket.IO emit error:',
//       error.message
//     );
//   }

//   console.log(
//     `[WA] ${event}`,
//     payload.deviceId ||
//       payload._id ||
//       ''
//   );
// }

// // ============================================================
// // Get session
// // ============================================================

// function getSession(deviceId) {
//   return sessions.get(String(deviceId));
// }

// // ============================================================
// // Get contacts
// // ============================================================

// function listContacts(deviceId) {
//   return (
//     getSession(deviceId)?.contacts ||
//     []
//   );
// }

// // ============================================================
// // Safe socket close
// // ============================================================

// function safeEnd(sock) {
//   if (!sock) return;

//   try {
//     sock.ev?.removeAllListeners?.();
//   } catch (_) {}

//   try {
//     sock.ws?.removeAllListeners?.();
//   } catch (_) {}

//   try {
//     if (
//       sock.ws &&
//       sock.ws.readyState === 1
//     ) {
//       sock.ws.close();
//     }
//   } catch (_) {}

//   try {
//     sock.end?.(undefined);
//   } catch (_) {}
// }

// // ============================================================
// // Sleep
// // ============================================================

// function sleep(ms) {
//   return new Promise((resolve) =>
//     setTimeout(resolve, ms)
//   );
// }

// // ============================================================
// // Create logger
// // ============================================================

// function createLogger() {
//   try {
//     return pino({
//       level: 'silent',
//     });
//   } catch (_) {
//     return pino();
//   }
// }

// // ============================================================
// // START SESSION
// // ============================================================

// async function startSession(deviceId) {

//   if (
//     !makeWASocket ||
//     !useMultiFileAuthState
//   ) {
//     throw new Error(
//       'Baileys is not installed. Run: npm install @whiskeysockets/baileys@6.7.18 qrcode pino'
//     );
//   }

//   const id = String(deviceId);

//   // ----------------------------------------------------------
//   // Existing session
//   // ----------------------------------------------------------

//   const existing = sessions.get(id);

//   if (
//     existing &&
//     existing.status === 'Online' &&
//     existing.sock
//   ) {
//     console.log(
//       `[WA] Session already online: ${id}`
//     );

//     return existing;
//   }

//   // ----------------------------------------------------------
//   // If already connecting, don't create another socket
//   // ----------------------------------------------------------

//   if (starting.has(id)) {

//     console.log(
//       `[WA] Session already starting: ${id}`
//     );

//     // Wait for current start operation
//     for (let i = 0; i < 20; i++) {

//       await sleep(500);

//       const current =
//         sessions.get(id);

//       if (
//         current &&
//         (
//           current.status === 'Connecting' ||
//           current.status === 'Online'
//         )
//       ) {
//         return current;
//       }
//     }

//     const current =
//       sessions.get(id);

//     if (current) {
//       return current;
//     }
//   }

//   starting.add(id);

//   try {

//     // --------------------------------------------------------
//     // Close stale socket
//     // --------------------------------------------------------

//     if (
//       existing?.sock &&
//       existing.status !== 'Online'
//     ) {
//       console.log(
//         `[WA] Closing stale socket: ${id}`
//       );

//       safeEnd(existing.sock);

//       sessions.delete(id);
//     }

//     // --------------------------------------------------------
//     // Authentication folder
//     // --------------------------------------------------------

//     const authPath =
//       path.join(
//         sessionsDir,
//         id
//       );

//     if (!fs.existsSync(authPath)) {
//       fs.mkdirSync(authPath, {
//         recursive: true,
//       });
//     }

//     console.log(
//       `[WA] Auth path: ${authPath}`
//     );

//     // --------------------------------------------------------
//     // Load auth state
//     // --------------------------------------------------------

//     const {
//       state,
//       saveCreds,
//     } =
//       await useMultiFileAuthState(
//         authPath
//       );

//     // --------------------------------------------------------
//     // Get Baileys version
//     // --------------------------------------------------------

//     let version;

//     try {

//       if (
//         typeof fetchLatestBaileysVersion ===
//         'function'
//       ) {
//         const latest =
//           await fetchLatestBaileysVersion();

//         version =
//           latest?.version;
//       }

//     } catch (error) {

//       console.warn(
//         '[WA] Could not fetch latest Baileys version:',
//         error.message
//       );
//     }

//     // --------------------------------------------------------
//     // Session object
//     // --------------------------------------------------------

//     const session = {

//       deviceId: id,

//       sock: null,

//       // Raw WhatsApp QR
//       qr: null,

//       // PNG Data URL for frontend
//       qrDataUrl: null,

//       status:
//         state.creds.registered
//           ? 'Connecting'
//           : 'Connecting',

//       phone: null,

//       contacts: [],

//       reconnectAttempts: 0,

//       manualStop: false,

//       authPath,

//       saveCreds,
//     };

//     sessions.set(
//       id,
//       session
//     );

//     // --------------------------------------------------------
//     // Create socket
//     // --------------------------------------------------------

//     const socketOptions = {

//       auth: state,

//       logger:
//         createLogger(),

//       printQRInTerminal: false,

//       browser:
//         Browsers?.ubuntu
//           ? Browsers.ubuntu(
//               'WhatsApp Suite'
//             )
//           : [
//               'WhatsApp Suite',
//               'Chrome',
//               '120.0.0',
//             ],

//       syncFullHistory: false,

//       markOnlineOnConnect: false,

//       generateHighQualityLinkPreview:
//         false,

//       connectTimeoutMs:
//         60000,

//       defaultQueryTimeoutMs:
//         60000,

//       keepAliveIntervalMs:
//         25000,

//       retryRequestDelayMs:
//         500,

//       connectWithLastDisconnect:
//         false,
//     };

//     if (version) {
//       socketOptions.version =
//         version;
//     }

//     console.log(
//       `[WA] Creating WhatsApp socket: ${id}`
//     );

//     const sock =
//       makeWASocket(
//         socketOptions
//       );

//     session.sock =
//       sock;

//     // --------------------------------------------------------
//     // Save credentials
//     // --------------------------------------------------------

//     sock.ev.on(
//       'creds.update',
//       async () => {
//         try {
//           await saveCreds();
//         } catch (error) {
//           console.error(
//             '[WA] Failed to save credentials:',
//             error.message
//           );
//         }
//       }
//     );

//     // --------------------------------------------------------
//     // WebSocket errors
//     // --------------------------------------------------------

//     try {

//       sock.ws?.on?.(
//         'error',
//         (error) => {

//           console.warn(
//             `[WA] WebSocket error (${id}):`,
//             error?.message ||
//               error
//           );
//         }
//       );

//     } catch (_) {}

//     // --------------------------------------------------------
//     // Connection update
//     // --------------------------------------------------------

//     sock.ev.on(
//       'connection.update',
//       async (update) => {

//         try {

//           await handleConnectionUpdate(
//             id,
//             session,
//             sock,
//             update
//           );

//         } catch (error) {

//           console.error(
//             `[WA] connection.update error (${id}):`,
//             error
//           );
//         }
//       }
//     );

//     // --------------------------------------------------------
//     // Contacts
//     // --------------------------------------------------------

//     sock.ev.on(
//       'contacts.upsert',
//       (list) => {
//         mergeContacts(
//           id,
//           list
//         );
//       }
//     );

//     sock.ev.on(
//       'contacts.update',
//       (list) => {
//         mergeContacts(
//           id,
//           list
//         );
//       }
//     );

//     // --------------------------------------------------------
//     // Chats
//     // --------------------------------------------------------

//     sock.ev.on(
//       'chats.upsert',
//       (list) => {
//         mergeChats(
//           id,
//           list
//         );
//       }
//     );

//     sock.ev.on(
//       'chats.update',
//       (list) => {
//         mergeChats(
//           id,
//           list
//         );
//       }
//     );

//     return session;

//   } finally {

//     starting.delete(id);
//   }
// }

// // ============================================================
// // CONNECTION UPDATE
// // ============================================================

// async function handleConnectionUpdate(
//   id,
//   session,
//   sock,
//   update
// ) {

//   const {
//     connection,
//     lastDisconnect,
//     qr,
//   } = update;

//   // ==========================================================
//   // QR RECEIVED
//   // ==========================================================

//   if (qr) {

//     console.log(
//       `[WA] QR received: ${id}`
//     );

//     session.status =
//       'Connecting';

//     session.qr =
//       qr;

//     // --------------------------------------------------------
//     // Generate PNG
//     // --------------------------------------------------------

//     if (!QRCode) {

//       console.error(
//         '[WA] qrcode module unavailable'
//       );

//       emit(
//         'device_update',
//         {
//           _id: id,

//           deviceId: id,

//           status: 'Connecting',

//           error:
//             'qrcode package is missing',
//         }
//       );

//       return;
//     }

//     try {

//       const dataUrl =
//         await QRCode.toDataURL(
//           qr,
//           {
//             width: 400,

//             margin: 2,

//             errorCorrectionLevel:
//               'L',
//           }
//         );

//       if (
//         !dataUrl ||
//         !dataUrl.startsWith(
//           'data:image/png;base64,'
//         )
//       ) {
//         throw new Error(
//           'QR Data URL generation failed'
//         );
//       }

//       session.qrDataUrl =
//         dataUrl;

//       console.log(
//         `[WA] QR image generated: ${id}`
//       );

//     } catch (error) {

//       console.error(
//         `[WA] QR generation failed (${id}):`,
//         error.message
//       );

//       session.qrDataUrl =
//         null;

//       emit(
//         'device_update',
//         {
//           _id: id,

//           deviceId: id,

//           status:
//             'Connecting',

//           error:
//             'Failed to generate QR image',
//         }
//       );

//       return;
//     }

//     // --------------------------------------------------------
//     // Emit QR to frontend
//     // --------------------------------------------------------

//     emit(
//       'device_qr',
//       {
//         deviceId: id,

//         _id: id,

//         qrCode:
//           session.qrDataUrl,

//         status:
//           'Connecting',
//       }
//     );

//     emit(
//       'device_update',
//       {
//         _id: id,

//         deviceId: id,

//         status:
//           'Connecting',

//         isActive:
//           false,
//       }
//     );
//   }

//   // ==========================================================
//   // CONNECTION OPEN
//   // ==========================================================

//   if (
//     connection === 'open'
//   ) {

//     console.log(
//       `========================================`
//     );

//     console.log(
//       `[WA] WhatsApp CONNECTED: ${id}`
//     );

//     console.log(
//       `========================================`
//     );

//     session.status =
//       'Online';

//     session.qr =
//       null;

//     session.qrDataUrl =
//       null;

//     session.reconnectAttempts =
//       0;

//     // --------------------------------------------------------
//     // Get phone
//     // --------------------------------------------------------

//     try {

//       const userId =
//         sock.user?.id;

//       if (userId) {

//         session.phone =
//           userId
//             .split(':')[0]
//             .split('@')[0];

//       }

//     } catch (_) {

//       session.phone =
//         null;
//     }

//     // --------------------------------------------------------
//     // Authenticated event
//     // --------------------------------------------------------

//     emit(
//       'device_authenticated',
//       {
//         deviceId: id,

//         _id: id,

//         phone:
//           session.phone,
//       }
//     );

//     // --------------------------------------------------------
//     // Device update
//     // --------------------------------------------------------

//     emit(
//       'device_update',
//       {
//         _id: id,

//         deviceId: id,

//         status:
//           'Online',

//         phone:
//           session.phone,

//         phoneNumber:
//           session.phone
//             ? `+${session.phone}`
//             : null,

//         isActive:
//           true,
//       }
//     );

//     // --------------------------------------------------------
//     // Load contacts
//     // --------------------------------------------------------

//     setTimeout(
//       () => {

//         loadContacts(id)
//           .catch(
//             (error) => {

//               console.error(
//                 '[WA] loadContacts error:',
//                 error.message
//               );

//             }
//           );

//       },
//       3000
//     );

//     return;
//   }

//   // ==========================================================
//   // CONNECTION CLOSED
//   // ==========================================================

//   if (
//     connection === 'close'
//   ) {

//     const statusCode =
//       getDisconnectStatusCode(
//         lastDisconnect?.error
//       );

//     const errorMessage =
//       lastDisconnect
//         ?.error
//         ?.message ||
//       '';

//     console.warn(
//       `[WA] Connection closed: ${id}`
//     );

//     console.warn(
//       `[WA] Status code: ${statusCode}`
//     );

//     console.warn(
//       `[WA] Message: ${errorMessage}`
//     );

//     // --------------------------------------------------------
//     // Important Baileys reasons
//     // --------------------------------------------------------

//     const loggedOut =
//       statusCode ===
//       DisconnectReason.loggedOut;

//     const restartRequired =
//       statusCode ===
//       DisconnectReason.restartRequired;

//     const connectionClosed =
//       statusCode ===
//       DisconnectReason.connectionClosed;

//     const connectionLost =
//       statusCode ===
//       DisconnectReason.connectionLost;

//     const timedOut =
//       statusCode ===
//       DisconnectReason.timedOut;

//     const badSession =
//       statusCode ===
//       DisconnectReason.badSession;

//     // --------------------------------------------------------
//     // Mark offline temporarily
//     // --------------------------------------------------------

//     session.status =
//       'Offline';

//     session.sock =
//       null;

//     session.qr =
//       null;

//     session.qrDataUrl =
//       null;

//     // --------------------------------------------------------
//     // Logged out
//     // --------------------------------------------------------

//     if (loggedOut) {

//       console.warn(
//         `[WA] Device logged out: ${id}`
//       );

//       emit(
//         'device_logged_out',
//         {
//           deviceId: id,

//           _id: id,
//         }
//       );

//       try {

//         fs.rmSync(
//           session.authPath,
//           {
//             recursive: true,

//             force: true,
//           }
//         );

//       } catch (error) {

//         console.warn(
//           '[WA] Failed to remove auth:',
//           error.message
//         );
//       }

//       sessions.delete(id);

//       emit(
//         'device_update',
//         {
//           _id: id,

//           deviceId: id,

//           status:
//             'Offline',

//           isActive:
//             false,

//           message:
//             'WhatsApp logged out. Scan QR again.',
//         }
//       );

//       return;
//     }

//     // --------------------------------------------------------
//     // Bad session
//     // --------------------------------------------------------

//     if (badSession) {

//       console.warn(
//         `[WA] Bad session detected: ${id}`
//       );

//       try {

//         fs.rmSync(
//           session.authPath,
//           {
//             recursive: true,

//             force: true,
//           }
//         );

//       } catch (_) {}

//       sessions.delete(id);

//       emit(
//         'device_update',
//         {
//           _id: id,

//           deviceId: id,

//           status:
//             'Offline',

//           isActive:
//             false,

//           message:
//             'Session expired. Please scan QR again.',
//         }
//       );

//       return;
//     }

//     // --------------------------------------------------------
//     // Restart required
//     //
//     // VERY IMPORTANT:
//     // WhatsApp requires a NEW socket.
//     // --------------------------------------------------------

//     if (
//       restartRequired
//     ) {

//       console.log(
//         `[WA] Restart required: ${id}`
//       );

//       emit(
//         'device_update',
//         {
//           _id: id,

//           deviceId: id,

//           status:
//             'Connecting',

//           isActive:
//             false,

//           message:
//             'Restarting WhatsApp connection...',
//         }
//       );

//       sessions.delete(id);

//       setTimeout(
//         () => {

//           startSession(id)
//             .catch(
//               (error) => {

//                 console.error(
//                   `[WA] Restart failed (${id}):`,
//                   error.message
//                 );

//               }
//             );

//         },
//         1000
//       );

//       return;
//     }

//     // --------------------------------------------------------
//     // Normal reconnect
//     // --------------------------------------------------------

//     const reconnectable =
//       connectionClosed ||
//       connectionLost ||
//       timedOut ||
//       !statusCode;

//     if (
//       reconnectable
//     ) {

//       session.reconnectAttempts =
//         (session.reconnectAttempts || 0) +
//         1;

//       const attempt =
//         session.reconnectAttempts;

//       const delay =
//         Math.min(
//           3000 * attempt,
//           30000
//         );

//       if (
//         attempt <= 8
//       ) {

//         console.log(
//           `[WA] Reconnecting ${id} in ${delay}ms`
//         );

//         emit(
//           'device_update',
//           {
//             _id: id,

//             deviceId: id,

//             status:
//               'Connecting',

//             isActive:
//               false,

//             message:
//               `Reconnecting... attempt ${attempt}`,
//           }
//         );

//         sessions.delete(id);

//         setTimeout(
//           () => {

//             startSession(id)
//               .catch(
//                 (error) => {

//                   console.error(
//                     `[WA] Reconnect failed (${id}):`,
//                     error.message
//                   );

//                 }
//               );

//           },
//           delay
//         );

//       } else {

//         console.warn(
//           `[WA] Maximum reconnect attempts reached: ${id}`
//         );

//         sessions.delete(id);

//         emit(
//           'device_update',
//           {
//             _id: id,

//             deviceId: id,

//             status:
//               'Offline',

//             isActive:
//               false,

//             message:
//               'Connection lost. Click Connect & Scan again.',
//           }
//         );
//       }

//       return;
//     }

//     // --------------------------------------------------------
//     // Unknown close reason
//     // --------------------------------------------------------

//     console.warn(
//       `[WA] Unknown disconnect reason: ${statusCode}`
//     );

//     emit(
//       'device_update',
//       {
//         _id: id,

//         deviceId: id,

//         status:
//           'Offline',

//         isActive:
//           false,

//         message:
//           'WhatsApp connection closed. Try connecting again.',
//       }
//     );

//     sessions.delete(id);
//   }
// }

// // ============================================================
// // Disconnect status code
// // ============================================================

// function getDisconnectStatusCode(error) {

//   if (!error) {
//     return undefined;
//   }

//   try {

//     if (
//       error.output?.statusCode
//     ) {
//       return error.output.statusCode;
//     }

//     if (
//       error.data?.statusCode
//     ) {
//       return error.data.statusCode;
//     }

//     if (
//       error.statusCode
//     ) {
//       return error.statusCode;
//     }

//   } catch (_) {}

//   return undefined;
// }

// // ============================================================
// // CONTACTS
// // ============================================================

// function mergeContacts(
//   deviceId,
//   list
// ) {

//   const session =
//     getSession(deviceId);

//   if (
//     !session ||
//     !Array.isArray(list)
//   ) {
//     return;
//   }

//   const map =
//     new Map();

//   for (
//     const contact of
//     session.contacts
//   ) {

//     if (contact?._id) {
//       map.set(
//         contact._id,
//         contact
//       );
//     }
//   }

//   for (
//     const contact of list
//   ) {

//     const jid =
//       contact?.id ||
//       contact?.jid;

//     if (!jid) {
//       continue;
//     }

//     // Groups are handled by chats
//     if (
//       jid.endsWith('@g.us')
//     ) {
//       continue;
//     }

//     const phone =
//       jid
//         .split('@')[0]
//         .split(':')[0];

//     const name =
//       contact.notify ||
//       contact.name ||
//       contact.verifiedName ||
//       phone;

//     const previous =
//       map.get(jid) ||
//       {};

//     map.set(
//       jid,
//       {
//         _id:
//           jid,

//         name:
//           name,

//         phone:
//           phone.startsWith('+')
//             ? phone
//             : `+${phone}`,

//         lastMessage:
//           previous.lastMessage ||
//           '',

//         lastAt:
//           previous.lastAt ||
//           '',

//         unread:
//           previous.unread ||
//           0,

//         isGroup:
//           false,

//         deviceId,
//       }
//     );
//   }

//   session.contacts =
//     Array.from(
//       map.values()
//     );
// }

// // ============================================================
// // CHATS
// // ============================================================

// function mergeChats(
//   deviceId,
//   list
// ) {

//   const session =
//     getSession(deviceId);

//   if (
//     !session ||
//     !Array.isArray(list)
//   ) {
//     return;
//   }

//   const map =
//     new Map();

//   for (
//     const contact of
//     session.contacts
//   ) {

//     if (contact?._id) {
//       map.set(
//         contact._id,
//         contact
//       );
//     }
//   }

//   for (
//     const chat of list
//   ) {

//     const jid =
//       chat?.id;

//     if (!jid) {
//       continue;
//     }

//     const isGroup =
//       jid.endsWith('@g.us');

//     const phone =
//       jid
//         .split('@')[0]
//         .split(':')[0];

//     const previous =
//       map.get(jid) ||
//       {};

//     let lastAt =
//       previous.lastAt ||
//       '';

//     if (
//       chat.conversationTimestamp
//     ) {

//       try {

//         lastAt =
//           new Date(
//             Number(
//               chat.conversationTimestamp
//             ) * 1000
//           ).toLocaleString();

//       } catch (_) {}
//     }

//     map.set(
//       jid,
//       {
//         _id:
//           jid,

//         name:
//           chat.name ||
//           previous.name ||
//           (
//             isGroup
//               ? 'Group'
//               : phone
//           ),

//         phone:
//           isGroup
//             ? jid
//             : phone.startsWith('+')
//               ? phone
//               : `+${phone}`,

//         lastMessage:
//           previous.lastMessage ||
//           '',

//         lastAt,

//         unread:
//           chat.unreadCount ??
//           previous.unread ??
//           0,

//         isGroup,

//         deviceId,
//       }
//     );
//   }

//   session.contacts =
//     Array.from(
//       map.values()
//     );
// }

// // ============================================================
// // LOAD CONTACTS
// // ============================================================

// async function loadContacts(
//   deviceId
// ) {

//   const session =
//     getSession(deviceId);

//   if (!session?.sock) {
//     return [];
//   }

//   try {

//     // Some Baileys versions expose store data
//     if (
//       session.sock.store?.contacts
//     ) {

//       const contacts =
//         Object.values(
//           session.sock.store.contacts
//         );

//       mergeContacts(
//         deviceId,
//         contacts
//       );
//     }

//     if (
//       session.sock.store?.chats
//     ) {

//       const chats =
//         Object.values(
//           session.sock.store.chats
//         );

//       mergeChats(
//         deviceId,
//         chats
//       );
//     }

//   } catch (error) {

//     console.warn(
//       '[WA] Could not load local contacts:',
//       error.message
//     );
//   }

//   // ----------------------------------------------------------
//   // At least show connected account
//   // ----------------------------------------------------------

//   if (
//     session.contacts.length === 0 &&
//     session.phone
//   ) {

//     session.contacts = [
//       {
//         _id:
//           `${session.phone}@s.whatsapp.net`,

//         name:
//           'Me (connected)',

//         phone:
//           `+${session.phone}`,

//         lastMessage:
//           'WhatsApp linked',

//         lastAt:
//           new Date().toLocaleString(),

//         unread:
//           0,

//         isGroup:
//           false,

//         deviceId,
//       },
//     ];
//   }

//   emit(
//     'wa_contacts_synced',
//     {
//       deviceId,

//       _id: deviceId,

//       count:
//         session.contacts.length,
//     }
//   );

//   return session.contacts;
// }

// // ============================================================
// // STOP SESSION
// // ============================================================

// async function stopSession(
//   deviceId
// ) {

//   const id =
//     String(deviceId);

//   const session =
//     sessions.get(id);

//   if (!session) {

//     emit(
//       'device_update',
//       {
//         _id: id,

//         deviceId: id,

//         status:
//           'Offline',

//         isActive:
//           false,
//       }
//     );

//     return;
//   }

//   session.manualStop =
//     true;

//   // ----------------------------------------------------------
//   // Logout WhatsApp
//   // ----------------------------------------------------------

//   if (session.sock) {

//     try {

//       await session.sock.logout();

//     } catch (error) {

//       console.warn(
//         `[WA] logout failed (${id}):`,
//         error.message
//       );

//       safeEnd(
//         session.sock
//       );
//     }
//   }

//   sessions.delete(id);

//   // ----------------------------------------------------------
//   // Remove auth directory
//   //
//   // This means next Connect requires a new QR.
//   // ----------------------------------------------------------

//   try {

//     fs.rmSync(
//       session.authPath,
//       {
//         recursive: true,

//         force: true,
//       }
//     );

//   } catch (_) {}

//   emit(
//     'device_update',
//     {
//       _id: id,

//       deviceId: id,

//       status:
//         'Offline',

//       isActive:
//         false,
//     }
//   );

//   emit(
//     'device_logged_out',
//     {
//       deviceId: id,

//       _id: id,
//     }
//   );

//   console.log(
//     `[WA] Session stopped: ${id}`
//   );
// }

// // ============================================================
// // GET QR
// // ============================================================

// function getQr(
//   deviceId
// ) {

//   const session =
//     getSession(deviceId);

//   if (!session) {
//     return null;
//   }

//   if (
//     session.qrDataUrl &&
//     session.qrDataUrl.startsWith(
//       'data:image/png;base64,'
//     )
//   ) {

//     return session.qrDataUrl;
//   }

//   return null;
// }

// // ============================================================
// // GET STATUS
// // ============================================================

// function getStatus(
//   deviceId
// ) {

//   const session =
//     getSession(deviceId);

//   if (!session) {

//     return {
//       status:
//         'Offline',

//       phone:
//         null,

//       contacts:
//         0,
//     };
//   }

//   return {

//     status:
//       session.status ||
//       'Offline',

//     phone:
//       session.phone ||
//       null,

//     contacts:
//       session.contacts?.length ||
//       0,
//   };
// }

// // ============================================================
// // Get all sessions
// // ============================================================

// function getAllSessions() {

//   return Array.from(
//     sessions.values()
//   ).map(
//     (session) => ({
//       deviceId:
//         session.deviceId,

//       status:
//         session.status,

//       phone:
//         session.phone,

//       contacts:
//         session.contacts?.length ||
//         0,

//       hasQr:
//         !!session.qrDataUrl,
//     })
//   );
// }

// // ============================================================
// // Restore existing sessions
// // ============================================================

// async function restoreSessions() {

//   if (!fs.existsSync(sessionsDir)) {
//     return;
//   }

//   let folders = [];

//   try {

//     folders =
//       fs.readdirSync(
//         sessionsDir,
//         {
//           withFileTypes: true,
//         }
//       );

//   } catch (error) {

//     console.error(
//       '[WA] Could not read sessions directory:',
//       error.message
//     );

//     return;
//   }

//   for (
//     const folder of folders
//   ) {

//     if (!folder.isDirectory()) {
//       continue;
//     }

//     const id =
//       folder.name;

//     // --------------------------------------------------------
//     // Check if auth exists
//     // --------------------------------------------------------

//     const credsPath =
//       path.join(
//         sessionsDir,
//         id,
//         'creds.json'
//       );

//     if (
//       !fs.existsSync(credsPath)
//     ) {
//       continue;
//     }

//     console.log(
//       `[WA] Restoring session: ${id}`
//     );

//     try {

//       await startSession(id);

//       // Avoid starting too many sockets simultaneously
//       await sleep(500);

//     } catch (error) {

//       console.error(
//         `[WA] Restore failed (${id}):`,
//         error.message
//       );
//     }
//   }
// }

// // ============================================================
// // Error protection
// // ============================================================

// process.on(
//   'uncaughtException',
//   (error) => {

//     const message =
//       error?.message ||
//       String(error);

//     const ignored =
//       message.includes('WebSocket') ||
//       message.includes('ws closed') ||
//       message.includes('ECONNRESET') ||
//       message.includes(
//         'closed before the connection'
//       );

//     if (ignored) {

//       console.warn(
//         '[WA] WebSocket exception:',
//         message
//       );

//       return;
//     }

//     console.error(
//       '[WA] uncaughtException:',
//       error
//     );
//   }
// );

// process.on(
//   'unhandledRejection',
//   (reason) => {

//     const message =
//       reason?.message ||
//       String(reason);

//     const ignored =
//       message.includes('WebSocket') ||
//       message.includes('ws closed') ||
//       message.includes('ECONNRESET') ||
//       message.includes(
//         'closed before the connection'
//       );

//     if (ignored) {

//       console.warn(
//         '[WA] WebSocket rejection:',
//         message
//       );

//       return;
//     }

//     console.error(
//       '[WA] unhandledRejection:',
//       reason
//     );
//   }
// );

// // ============================================================
// // EXPORTS
// // ============================================================

// module.exports = {

//   setSocketIO,

//   startSession,

//   stopSession,

//   getQr,

//   getSession,

//   listContacts,

//   loadContacts,

//   getStatus,

//   getAllSessions,

//   restoreSessions,
// };



/**
 * WhatsApp Service - Baileys
 *
 * Install:
 *
 * npm install @whiskeysockets/baileys@6.7.18 qrcode pino
 *
 * Features:
 * - One WhatsApp session per device
 * - QR as PNG Data URL
 * - Persistent authentication
 * - Automatic reconnect
 * - restartRequired handling
 * - loggedOut handling
 * - Session restore after server restart
 * - Contacts/chats
 * - Socket.IO events
 */

const path = require('path');
const fs = require('fs');

// ============================================================
// BAILEYS IMPORTS
// ============================================================

let makeWASocket = null;
let useMultiFileAuthState = null;
let DisconnectReason = {};
let fetchLatestBaileysVersion = null;
let Browsers = null;

// ============================================================
// QR / LOGGER
// ============================================================

let QRCode = null;
let pino = null;

// ============================================================
// LOAD QR CODE
// ============================================================

try {
  QRCode = require('qrcode');

  console.log(
    '[WA] qrcode loaded OK'
  );
} catch (error) {
  console.error(
    '[WA] qrcode package missing'
  );

  console.error(
    'Run: npm install qrcode'
  );
}

// ============================================================
// LOAD PINO
// ============================================================

try {
  pino = require('pino');
} catch (error) {
  console.warn(
    '[WA] pino not installed, using silent fallback'
  );

  pino = () => ({
    level: 'silent',

    child() {
      return this;
    },

    info() {},
    error() {},
    warn() {},
    debug() {},
    trace() {},
    fatal() {},
  });
}

// ============================================================
// LOAD BAILEYS
// ============================================================

try {
  const baileys =
    require('@whiskeysockets/baileys');

  makeWASocket =
    baileys.default ||
    baileys.makeWASocket;

  useMultiFileAuthState =
    baileys.useMultiFileAuthState;

  DisconnectReason =
    baileys.DisconnectReason ||
    {};

  fetchLatestBaileysVersion =
    baileys.fetchLatestBaileysVersion;

  Browsers =
    baileys.Browsers;

  if (!makeWASocket) {
    throw new Error(
      'makeWASocket not found'
    );
  }

  if (!useMultiFileAuthState) {
    throw new Error(
      'useMultiFileAuthState not found'
    );
  }

  console.log(
    '[WA] Baileys loaded OK'
  );
} catch (error) {
  console.error(
    '[WA] Baileys load failed:',
    error.message
  );

  console.error(
    'Run: npm install @whiskeysockets/baileys@6.7.18 qrcode pino'
  );
}

// ============================================================
// SESSIONS DIRECTORY
// ============================================================

const sessionsDir =
  path.resolve(
    __dirname,
    '../../sessions'
  );

if (
  !fs.existsSync(
    sessionsDir
  )
) {
  fs.mkdirSync(
    sessionsDir,
    {
      recursive: true,
    }
  );
}

// ============================================================
// SESSION MAP
// ============================================================

const sessions =
  new Map();

// ============================================================
// STARTING LOCK
// ============================================================

const starting =
  new Set();

// ============================================================
// SOCKET.IO
// ============================================================

let io = null;

function setSocketIO(
  socketIo
) {
  io = socketIo;

  console.log(
    '[WA] Socket.IO connected to WhatsApp service'
  );
}

// ============================================================
// NORMALIZE DEVICE ID
// ============================================================

function normaliseDeviceId(
  deviceId
) {
  if (
    deviceId === undefined ||
    deviceId === null
  ) {
    return null;
  }

  let id =
    String(deviceId).trim();

  /*
   * Fix accidental:
   *
   * {{deviceId}}
   */

  id = id.replace(
    /^\{\{/,
    ''
  );

  id = id.replace(
    /\}\}$/,
    ''
  );

  // Remove quotes
  id = id.replace(
    /^["']+|["']+$/g,
    ''
  );

  return (
    id.trim() || null
  );
}

// ============================================================
// SOCKET.IO EMIT
// ============================================================

function emit(
  event,
  payload = {}
) {
  try {
    if (io) {
      io.emit(
        event,
        payload
      );
    }
  } catch (error) {
    console.error(
      '[WA] Socket.IO emit error:',
      error.message
    );
  }

  console.log(
    `[WA] ${event}`,
    payload.deviceId ||
      payload._id ||
      ''
  );
}

// ============================================================
// GET SESSION
// ============================================================

function getSession(
  deviceId
) {
  const id =
    normaliseDeviceId(
      deviceId
    );

  if (!id) {
    return undefined;
  }

  return sessions.get(id);
}

// ============================================================
// LIST CONTACTS
// ============================================================

function listContacts(
  deviceId
) {
  return (
    getSession(
      deviceId
    )?.contacts || []
  );
}

// ============================================================
// SAFE SOCKET END
// ============================================================

function safeEnd(
  sock
) {
  if (!sock) {
    return;
  }

  try {
    sock.ev?.removeAllListeners?.();
  } catch (_) {}

  try {
    sock.ws?.removeAllListeners?.();
  } catch (_) {}

  try {
    if (
      sock.ws &&
      sock.ws.readyState === 1
    ) {
      sock.ws.close();
    }
  } catch (_) {}

  try {
    sock.end?.(
      undefined
    );
  } catch (_) {}
}

// ============================================================
// SLEEP
// ============================================================

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

// ============================================================
// CREATE LOGGER
// ============================================================

function createLogger() {
  try {
    return pino({
      level: 'silent',
    });
  } catch (_) {
    return pino();
  }
}

// ============================================================
// START SESSION
// ============================================================

async function startSession(
  deviceId
) {
  if (
    !makeWASocket ||
    !useMultiFileAuthState
  ) {
    throw new Error(
      'Baileys is not installed. Run: npm install @whiskeysockets/baileys@6.7.18 qrcode pino'
    );
  }

  const id =
    normaliseDeviceId(
      deviceId
    );

  if (!id) {
    throw new Error(
      'deviceId is required'
    );
  }

  console.log(
    `[WA] startSession requested: ${id}`
  );

  // ==========================================================
  // EXISTING ONLINE SESSION
  // ==========================================================

  const existing =
    sessions.get(id);

  if (
    existing &&
    existing.status === 'Online' &&
    existing.sock
  ) {
    console.log(
      `[WA] Session already online: ${id}`
    );

    return existing;
  }

  // ==========================================================
  // ALREADY STARTING
  // ==========================================================

  if (starting.has(id)) {
    console.log(
      `[WA] Session already starting: ${id}`
    );

    for (
      let i = 0;
      i < 30;
      i++
    ) {
      await sleep(500);

      const current =
        sessions.get(id);

      if (
        current &&
        (
          current.status ===
            'Connecting' ||
          current.status ===
            'Online'
        )
      ) {
        return current;
      }
    }

    const current =
      sessions.get(id);

    if (current) {
      return current;
    }
  }

  starting.add(id);

  try {
    // ========================================================
    // CLOSE STALE SOCKET
    // ========================================================

    if (
      existing?.sock &&
      existing.status !==
        'Online'
    ) {
      console.log(
        `[WA] Closing stale socket: ${id}`
      );

      safeEnd(
        existing.sock
      );

      sessions.delete(id);
    }

    // ========================================================
    // AUTH PATH
    // ========================================================

    const authPath =
      path.join(
        sessionsDir,
        id
      );

    if (
      !fs.existsSync(
        authPath
      )
    ) {
      fs.mkdirSync(
        authPath,
        {
          recursive: true,
        }
      );
    }

    console.log(
      `[WA] Auth path: ${authPath}`
    );

    // ========================================================
    // LOAD AUTH
    // ========================================================

    const {
      state,
      saveCreds,
    } =
      await useMultiFileAuthState(
        authPath
      );

    // ========================================================
    // FETCH BAILEYS VERSION
    // ========================================================

    let version;

    try {
      if (
        typeof fetchLatestBaileysVersion ===
        'function'
      ) {
        const latest =
          await fetchLatestBaileysVersion();

        version =
          latest?.version;
      }
    } catch (error) {
      console.warn(
        '[WA] Could not fetch latest Baileys version:',
        error.message
      );
    }

    // ========================================================
    // SESSION OBJECT
    // ========================================================

    const session = {
      deviceId: id,

      sock: null,

      qr: null,

      qrDataUrl: null,

      status: 'Connecting',

      phone: null,

      contacts: [],

      reconnectAttempts: 0,

      manualStop: false,

      authPath,

      saveCreds,

      // Unique socket generation.
      // Prevents an old socket from deleting
      // a newer socket.
      generation:
        Date.now(),
    };

    sessions.set(
      id,
      session
    );

    // ========================================================
    // SOCKET OPTIONS
    // ========================================================

    const socketOptions = {
      auth: state,

      logger:
        createLogger(),

      printQRInTerminal:
        false,

      browser:
        Browsers?.ubuntu
          ? Browsers.ubuntu(
              'WhatsApp Suite'
            )
          : [
              'WhatsApp Suite',
              'Chrome',
              '120.0.0',
            ],

      syncFullHistory:
        false,

      markOnlineOnConnect:
        false,

      generateHighQualityLinkPreview:
        false,

      connectTimeoutMs:
        60000,

      defaultQueryTimeoutMs:
        60000,

      keepAliveIntervalMs:
        25000,

      retryRequestDelayMs:
        500,

      connectWithLastDisconnect:
        false,
    };

    if (version) {
      socketOptions.version =
        version;
    }

    console.log(
      `[WA] Creating WhatsApp socket: ${id}`
    );

    const sock =
      makeWASocket(
        socketOptions
      );

    session.sock =
      sock;

    // ========================================================
    // SAVE CREDENTIALS
    // ========================================================

    sock.ev.on(
      'creds.update',
      async () => {
        try {
          await saveCreds();
        } catch (error) {
          console.error(
            '[WA] Failed to save credentials:',
            error.message
          );
        }
      }
    );

    // ========================================================
    // WEBSOCKET ERROR
    // ========================================================

    try {
      sock.ws?.on?.(
        'error',
        (error) => {
          console.warn(
            `[WA] WebSocket error (${id}):`,
            error?.message ||
              error
          );
        }
      );
    } catch (_) {}

    // ========================================================
    // CONNECTION UPDATE
    // ========================================================

    sock.ev.on(
      'connection.update',
      async (update) => {
        try {
          await handleConnectionUpdate(
            id,
            session,
            sock,
            update
          );
        } catch (error) {
          console.error(
            `[WA] connection.update error (${id}):`,
            error
          );
        }
      }
    );

    // ========================================================
    // CONTACTS
    // ========================================================

    sock.ev.on(
      'contacts.upsert',
      (list) => {
        mergeContacts(
          id,
          list
        );
      }
    );

    sock.ev.on(
      'contacts.update',
      (list) => {
        mergeContacts(
          id,
          list
        );
      }
    );

    // ========================================================
    // CHATS
    // ========================================================

    sock.ev.on(
      'chats.upsert',
      (list) => {
        mergeChats(
          id,
          list
        );
      }
    );

    sock.ev.on(
      'chats.update',
      (list) => {
        mergeChats(
          id,
          list
        );
      }
    );

    console.log(
      `[WA] Session created: ${id}`
    );

    return session;
  } finally {
    starting.delete(id);
  }
}

// ============================================================
// CONNECTION UPDATE
// ============================================================

async function handleConnectionUpdate(
  id,
  session,
  sock,
  update
) {
  const {
    connection,
    lastDisconnect,
    qr,
  } = update;

  // ==========================================================
  // IGNORE EVENTS FROM OLD SOCKET
  // ==========================================================

  const current =
    sessions.get(id);

  if (
    current &&
    current !== session
  ) {
    console.warn(
      `[WA] Ignoring stale socket event: ${id}`
    );

    return;
  }

  // ==========================================================
  // QR RECEIVED
  // ==========================================================

  if (qr) {
    console.log(
      `[WA] QR received: ${id}`
    );

    session.status =
      'Connecting';

    session.qr = qr;

    if (!QRCode) {
      console.error(
        '[WA] qrcode module unavailable'
      );

      emit(
        'device_update',
        {
          _id: id,
          deviceId: id,
          status:
            'Connecting',
          error:
            'qrcode package is missing',
        }
      );

      return;
    }

    try {
      const dataUrl =
        await QRCode.toDataURL(
          qr,
          {
            width: 400,
            margin: 2,
            errorCorrectionLevel:
              'L',
          }
        );

      if (
        !dataUrl ||
        !dataUrl.startsWith(
          'data:image/png;base64,'
        )
      ) {
        throw new Error(
          'QR Data URL generation failed'
        );
      }

      session.qrDataUrl =
        dataUrl;

      console.log(
        `[WA] QR image generated: ${id}`
      );
    } catch (error) {
      console.error(
        `[WA] QR generation failed (${id}):`,
        error.message
      );

      session.qrDataUrl =
        null;

      emit(
        'device_update',
        {
          _id: id,
          deviceId: id,
          status:
            'Connecting',
          error:
            'Failed to generate QR image',
        }
      );

      return;
    }

    // --------------------------------------------------------
    // SEND QR TO FRONTEND
    // --------------------------------------------------------

    emit(
      'device_qr',
      {
        deviceId: id,
        _id: id,
        qrCode:
          session.qrDataUrl,
        status:
          'Connecting',
      }
    );

    emit(
      'device_update',
      {
        _id: id,
        deviceId: id,
        status:
          'Connecting',
        isActive:
          false,
      }
    );
  }

  // ==========================================================
  // CONNECTION OPEN
  // ==========================================================

  if (
    connection === 'open'
  ) {
    console.log(
      '========================================'
    );

    console.log(
      `[WA] WhatsApp CONNECTED: ${id}`
    );

    console.log(
      `[WA] Session marked ONLINE: ${id}`
    );

    console.log(
      `[WA] Socket available: ${Boolean(
        sock
      )}`
    );

    console.log(
      '========================================'
    );

    session.status =
      'Online';

    session.sock =
      sock;

    session.qr =
      null;

    session.qrDataUrl =
      null;

    session.reconnectAttempts =
      0;

    // --------------------------------------------------------
    // GET CONNECTED PHONE
    // --------------------------------------------------------

    try {
      const userId =
        sock.user?.id;

      if (userId) {
        session.phone =
          userId
            .split(':')[0]
            .split('@')[0];
      }
    } catch (_) {
      session.phone =
        null;
    }

    // --------------------------------------------------------
    // AUTHENTICATED
    // --------------------------------------------------------

    emit(
      'device_authenticated',
      {
        deviceId: id,
        _id: id,
        phone:
          session.phone,
      }
    );

    // --------------------------------------------------------
    // DEVICE ONLINE
    // --------------------------------------------------------

    emit(
      'device_update',
      {
        _id: id,
        deviceId: id,
        status:
          'Online',
        phone:
          session.phone,
        phoneNumber:
          session.phone
            ? `+${session.phone}`
            : null,
        isActive:
          true,
      }
    );

    // --------------------------------------------------------
    // LOAD CONTACTS
    // --------------------------------------------------------

    setTimeout(
      () => {
        loadContacts(id)
          .catch(
            (error) => {
              console.error(
                '[WA] loadContacts error:',
                error.message
              );
            }
          );
      },
      3000
    );

    return;
  }

  // ==========================================================
  // CONNECTION CLOSED
  // ==========================================================

  if (
    connection === 'close'
  ) {
    const statusCode =
      getDisconnectStatusCode(
        lastDisconnect?.error
      );

    const errorMessage =
      lastDisconnect
        ?.error?.message ||
      '';

    console.warn(
      `[WA] Connection closed: ${id}`
    );

    console.warn(
      `[WA] Status code: ${statusCode}`
    );

    console.warn(
      `[WA] Message: ${errorMessage}`
    );

    // --------------------------------------------------------
    // DISCONNECT REASONS
    // --------------------------------------------------------

    const loggedOut =
      statusCode ===
      DisconnectReason.loggedOut;

    const restartRequired =
      statusCode ===
      DisconnectReason.restartRequired;

    const connectionClosed =
      statusCode ===
      DisconnectReason.connectionClosed;

    const connectionLost =
      statusCode ===
      DisconnectReason.connectionLost;

    const timedOut =
      statusCode ===
      DisconnectReason.timedOut;

    const badSession =
      statusCode ===
      DisconnectReason.badSession;

    // --------------------------------------------------------
    // Mark offline
    // --------------------------------------------------------

    session.status =
      'Offline';

    session.sock =
      null;

    session.qr =
      null;

    session.qrDataUrl =
      null;

    // ========================================================
    // LOGGED OUT
    // ========================================================

    if (loggedOut) {
      console.warn(
        `[WA] Device logged out: ${id}`
      );

      emit(
        'device_logged_out',
        {
          deviceId: id,
          _id: id,
        }
      );

      try {
        fs.rmSync(
          session.authPath,
          {
            recursive: true,
            force: true,
          }
        );
      } catch (error) {
        console.warn(
          '[WA] Failed to remove auth:',
          error.message
        );
      }

      // Only delete if this is still
      // the current session
      if (
        sessions.get(id) ===
        session
      ) {
        sessions.delete(id);
      }

      emit(
        'device_update',
        {
          _id: id,
          deviceId: id,
          status:
            'Offline',
          isActive:
            false,
          message:
            'WhatsApp logged out. Scan QR again.',
        }
      );

      return;
    }

    // ========================================================
    // BAD SESSION
    // ========================================================

    if (badSession) {
      console.warn(
        `[WA] Bad session detected: ${id}`
      );

      try {
        fs.rmSync(
          session.authPath,
          {
            recursive: true,
            force: true,
          }
        );
      } catch (_) {}

      if (
        sessions.get(id) ===
        session
      ) {
        sessions.delete(id);
      }

      emit(
        'device_update',
        {
          _id: id,
          deviceId: id,
          status:
            'Offline',
          isActive:
            false,
          message:
            'Session expired. Please scan QR again.',
        }
      );

      return;
    }

    // ========================================================
    // RESTART REQUIRED
    // ========================================================

    if (
      restartRequired
    ) {
      console.log(
        `[WA] Restart required: ${id}`
      );

      emit(
        'device_update',
        {
          _id: id,
          deviceId: id,
          status:
            'Connecting',
          isActive:
            false,
          message:
            'Restarting WhatsApp connection...',
        }
      );

      // Only delete current session
      if (
        sessions.get(id) ===
        session
      ) {
        sessions.delete(id);
      }

      setTimeout(
        () => {
          startSession(id)
            .catch(
              (error) => {
                console.error(
                  `[WA] Restart failed (${id}):`,
                  error.message
                );
              }
            );
        },
        1000
      );

      return;
    }

    // ========================================================
    // NORMAL RECONNECT
    // ========================================================

    const reconnectable =
      connectionClosed ||
      connectionLost ||
      timedOut ||
      !statusCode;

    if (reconnectable) {
      session.reconnectAttempts =
        (
          session.reconnectAttempts ||
          0
        ) + 1;

      const attempt =
        session.reconnectAttempts;

      const delay =
        Math.min(
          3000 * attempt,
          30000
        );

      if (
        attempt <= 8
      ) {
        console.log(
          `[WA] Reconnecting ${id} in ${delay}ms`
        );

        emit(
          'device_update',
          {
            _id: id,
            deviceId: id,
            status:
              'Connecting',
            isActive:
              false,
            message:
              `Reconnecting... attempt ${attempt}`,
          }
        );

        if (
          sessions.get(id) ===
          session
        ) {
          sessions.delete(id);
        }

        setTimeout(
          () => {
            startSession(id)
              .catch(
                (error) => {
                  console.error(
                    `[WA] Reconnect failed (${id}):`,
                    error.message
                  );
                }
              );
          },
          delay
        );
      } else {
        console.warn(
          `[WA] Maximum reconnect attempts reached: ${id}`
        );

        if (
          sessions.get(id) ===
          session
        ) {
          sessions.delete(id);
        }

        emit(
          'device_update',
          {
            _id: id,
            deviceId: id,
            status:
              'Offline',
            isActive:
              false,
            message:
              'Connection lost. Click Connect & Scan again.',
          }
        );
      }

      return;
    }

    // ========================================================
    // UNKNOWN CLOSE
    // ========================================================

    console.warn(
      `[WA] Unknown disconnect reason: ${statusCode}`
    );

    if (
      sessions.get(id) ===
      session
    ) {
      sessions.delete(id);
    }

    emit(
      'device_update',
      {
        _id: id,
        deviceId: id,
        status:
          'Offline',
        isActive:
          false,
        message:
          'WhatsApp connection closed. Try connecting again.',
      }
    );
  }
}

// ============================================================
// GET DISCONNECT STATUS CODE
// ============================================================

function getDisconnectStatusCode(
  error
) {
  if (!error) {
    return undefined;
  }

  try {
    if (
      error.output?.statusCode
    ) {
      return (
        error.output.statusCode
      );
    }

    if (
      error.data?.statusCode
    ) {
      return (
        error.data.statusCode
      );
    }

    if (
      error.statusCode
    ) {
      return error.statusCode;
    }
  } catch (_) {}

  return undefined;
}

// ============================================================
// MERGE CONTACTS
// ============================================================

function mergeContacts(
  deviceId,
  list
) {
  const session =
    getSession(deviceId);

  if (
    !session ||
    !Array.isArray(list)
  ) {
    return;
  }

  const map =
    new Map();

  // Existing
  for (
    const contact of
    session.contacts
  ) {
    if (contact?._id) {
      map.set(
        contact._id,
        contact
      );
    }
  }

  // New
  for (
    const contact of list
  ) {
    const jid =
      contact?.id ||
      contact?.jid;

    if (!jid) {
      continue;
    }

    // Ignore groups
    if (
      jid.endsWith('@g.us')
    ) {
      continue;
    }

    const phone =
      jid
        .split('@')[0]
        .split(':')[0];

    const name =
      contact.notify ||
      contact.name ||
      contact.verifiedName ||
      phone;

    const previous =
      map.get(jid) ||
      {};

    map.set(
      jid,
      {
        _id: jid,

        name,

        phone:
          phone.startsWith('+')
            ? phone
            : `+${phone}`,

        lastMessage:
          previous.lastMessage ||
          '',

        lastAt:
          previous.lastAt ||
          '',

        unread:
          previous.unread ||
          0,

        isGroup:
          false,

        deviceId,
      }
    );
  }

  session.contacts =
    Array.from(
      map.values()
    );
}

// ============================================================
// MERGE CHATS
// ============================================================

function mergeChats(
  deviceId,
  list
) {
  const session =
    getSession(deviceId);

  if (
    !session ||
    !Array.isArray(list)
  ) {
    return;
  }

  const map =
    new Map();

  // Existing contacts
  for (
    const contact of
    session.contacts
  ) {
    if (contact?._id) {
      map.set(
        contact._id,
        contact
      );
    }
  }

  // Chats
  for (
    const chat of list
  ) {
    const jid =
      chat?.id;

    if (!jid) {
      continue;
    }

    const isGroup =
      jid.endsWith('@g.us');

    const phone =
      jid
        .split('@')[0]
        .split(':')[0];

    const previous =
      map.get(jid) ||
      {};

    let lastAt =
      previous.lastAt ||
      '';

    if (
      chat.conversationTimestamp
    ) {
      try {
        lastAt =
          new Date(
            Number(
              chat.conversationTimestamp
            ) * 1000
          ).toLocaleString();
      } catch (_) {}
    }

    map.set(
      jid,
      {
        _id: jid,

        name:
          chat.name ||
          previous.name ||
          (
            isGroup
              ? 'Group'
              : phone
          ),

        phone:
          isGroup
            ? jid
            : phone.startsWith('+')
              ? phone
              : `+${phone}`,

        lastMessage:
          previous.lastMessage ||
          '',

        lastAt,

        unread:
          chat.unreadCount ??
          previous.unread ??
          0,

        isGroup,

        deviceId,
      }
    );
  }

  session.contacts =
    Array.from(
      map.values()
    );
}

// ============================================================
// LOAD CONTACTS
// ============================================================

async function loadContacts(
  deviceId
) {
  const session =
    getSession(deviceId);

  if (
    !session?.sock
  ) {
    return [];
  }

  try {
    // --------------------------------------------------------
    // Local contacts
    // --------------------------------------------------------

    if (
      session.sock.store
        ?.contacts
    ) {
      const contacts =
        Object.values(
          session.sock.store
            .contacts
        );

      mergeContacts(
        deviceId,
        contacts
      );
    }

    // --------------------------------------------------------
    // Local chats
    // --------------------------------------------------------

    if (
      session.sock.store
        ?.chats
    ) {
      const chats =
        Object.values(
          session.sock.store
            .chats
        );

      mergeChats(
        deviceId,
        chats
      );
    }
  } catch (error) {
    console.warn(
      '[WA] Could not load local contacts:',
      error.message
    );
  }

  // ----------------------------------------------------------
  // At least show connected account
  // ----------------------------------------------------------

  if (
    session.contacts.length ===
      0 &&
    session.phone
  ) {
    session.contacts = [
      {
        _id:
          `${session.phone}@s.whatsapp.net`,

        name:
          'Me (connected)',

        phone:
          `+${session.phone}`,

        lastMessage:
          'WhatsApp linked',

        lastAt:
          new Date().toLocaleString(),

        unread: 0,

        isGroup: false,

        deviceId,
      },
    ];
  }

  emit(
    'wa_contacts_synced',
    {
      deviceId,
      _id: deviceId,
      count:
        session.contacts
          .length,
    }
  );

  return session.contacts;
}

// ============================================================
// STOP SESSION
// ============================================================

async function stopSession(
  deviceId
) {
  const id =
    normaliseDeviceId(
      deviceId
    );

  if (!id) {
    throw new Error(
      'deviceId is required'
    );
  }

  const session =
    sessions.get(id);

  if (!session) {
    emit(
      'device_update',
      {
        _id: id,
        deviceId: id,
        status:
          'Offline',
        isActive:
          false,
      }
    );

    return;
  }

  session.manualStop =
    true;

  // ----------------------------------------------------------
  // Logout WhatsApp
  // ----------------------------------------------------------

  if (session.sock) {
    try {
      await session.sock.logout();
    } catch (error) {
      console.warn(
        `[WA] logout failed (${id}):`,
        error.message
      );

      safeEnd(
        session.sock
      );
    }
  }

  // ----------------------------------------------------------
  // Delete session
  // ----------------------------------------------------------

  if (
    sessions.get(id) ===
    session
  ) {
    sessions.delete(id);
  }

  // ----------------------------------------------------------
  // Delete auth
  // ----------------------------------------------------------

  try {
    fs.rmSync(
      session.authPath,
      {
        recursive: true,
        force: true,
      }
    );
  } catch (_) {}

  // ----------------------------------------------------------
  // Notify frontend
  // ----------------------------------------------------------

  emit(
    'device_update',
    {
      _id: id,
      deviceId: id,
      status:
        'Offline',
      isActive:
        false,
    }
  );

  emit(
    'device_logged_out',
    {
      deviceId: id,
      _id: id,
    }
  );

  console.log(
    `[WA] Session stopped: ${id}`
  );
}

// ============================================================
// GET QR
// ============================================================

function getQr(
  deviceId
) {
  const session =
    getSession(deviceId);

  if (!session) {
    return null;
  }

  if (
    session.qrDataUrl &&
    session.qrDataUrl.startsWith(
      'data:image/png;base64,'
    )
  ) {
    return session.qrDataUrl;
  }

  return null;
}

// ============================================================
// GET STATUS
// ============================================================

function getStatus(
  deviceId
) {
  const session =
    getSession(deviceId);

  if (!session) {
    return {
      status:
        'Offline',

      phone:
        null,

      contacts:
        0,
    };
  }

  return {
    status:
      session.status ||
      'Offline',

    phone:
      session.phone ||
      null,

    contacts:
      session.contacts
        ?.length || 0,
  };
}

// ============================================================
// GET ALL SESSIONS
// ============================================================

function getAllSessions() {
  return Array.from(
    sessions.values()
  ).map(
    (session) => ({
      deviceId:
        session.deviceId,

      status:
        session.status,

      phone:
        session.phone,

      contacts:
        session.contacts
          ?.length || 0,

      hasQr:
        Boolean(
          session.qrDataUrl
        ),

      socketAvailable:
        Boolean(
          session.sock
        ),
    })
  );
}

// ============================================================
// RESTORE EXISTING SESSIONS
// ============================================================

async function restoreSessions() {
  if (
    !fs.existsSync(
      sessionsDir
    )
  ) {
    return;
  }

  let folders = [];

  try {
    folders =
      fs.readdirSync(
        sessionsDir,
        {
          withFileTypes:
            true,
        }
      );
  } catch (error) {
    console.error(
      '[WA] Could not read sessions directory:',
      error.message
    );

    return;
  }

  for (
    const folder of folders
  ) {
    if (
      !folder.isDirectory()
    ) {
      continue;
    }

    const id =
      normaliseDeviceId(
        folder.name
      );

    if (!id) {
      continue;
    }

    const credsPath =
      path.join(
        sessionsDir,
        id,
        'creds.json'
      );

    if (
      !fs.existsSync(
        credsPath
      )
    ) {
      continue;
    }

    console.log(
      `[WA] Restoring session: ${id}`
    );

    try {
      await startSession(
        id
      );

      // Don't start too many sockets at once
      await sleep(500);
    } catch (error) {
      console.error(
        `[WA] Restore failed (${id}):`,
        error.message
      );
    }
  }
}

// ============================================================
// ERROR PROTECTION
// ============================================================

process.on(
  'uncaughtException',
  (error) => {
    const message =
      error?.message ||
      String(error);

    const ignored =
      message.includes(
        'WebSocket'
      ) ||
      message.includes(
        'ws closed'
      ) ||
      message.includes(
        'ECONNRESET'
      ) ||
      message.includes(
        'closed before the connection'
      );

    if (ignored) {
      console.warn(
        '[WA] WebSocket exception:',
        message
      );

      return;
    }

    console.error(
      '[WA] uncaughtException:',
      error
    );
  }
);

process.on(
  'unhandledRejection',
  (reason) => {
    const message =
      reason?.message ||
      String(reason);

    const ignored =
      message.includes(
        'WebSocket'
      ) ||
      message.includes(
        'ws closed'
      ) ||
      message.includes(
        'ECONNRESET'
      ) ||
      message.includes(
        'closed before the connection'
      );

    if (ignored) {
      console.warn(
        '[WA] WebSocket rejection:',
        message
      );

      return;
    }

    console.error(
      '[WA] unhandledRejection:',
      reason
    );
  }
);

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  setSocketIO,

  startSession,

  stopSession,

  getQr,

  getSession,

  listContacts,

  loadContacts,

  getStatus,

  getAllSessions,

  restoreSessions,

  normaliseDeviceId,
};