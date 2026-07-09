/**
 * WebSocket gateway.
 *
 * SECURITY: the upgrade handshake checks the Origin header and verifies the
 * SAME HttpOnly JWT cookie the HTTP middleware uses, then re-loads the
 * account from the table matching the signed role claim. From then on,
 * every event handler takes the sender's identity from `client.user` —
 * NEVER from a userId/role field inside the frame payload. A client cannot
 * speak as anyone but its authenticated self.
 *
 * HOT PATH: on a `message` frame → messageService.postMessage validates and
 * pushes to the ring buffer → we BROADCAST IMMEDIATELY → the MySQL INSERT
 * completes in the background (write-behind).
 */
const { WebSocketServer } = require('ws');
const jwtUtil = require('../utils/jwt');
const userModel = require('../models/user.model');
const adminModel = require('../models/admin.model');
const roomService = require('../services/room.service');
const messageService = require('../services/message.service');
const env = require('../config/env');
const WS = require('../constants/wsEvents');
const MSG = require('../constants/messages');
const logger = require('../utils/logger');

const clients = new Set();              // Set<client>; client = { ws, user, rooms:Set<roomId>, isAlive, lastMessageAt }
const roomClients = new Map();          // roomId → Set<client>

/* ---------------- helpers ---------------- */

const send = (client, frame) => {
  if (client.ws.readyState === client.ws.OPEN) client.ws.send(JSON.stringify(frame));
};

function broadcastToRoom(roomId, frame, { except = null } = {}) {
  const set = roomClients.get(roomId);
  if (!set) return;
  for (const client of set) {
    if (client !== except) send(client, frame);
  }
}

function onlineIn(roomId) {
  const set = roomClients.get(roomId);
  if (!set) return [];
  const byUser = new Map();
  for (const c of set) byUser.set(c.user.id, { id: c.user.id, name: c.user.name });
  return [...byUser.values()];
}

function joinRoomSet(client, roomId) {
  client.rooms.add(roomId);
  if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
  roomClients.get(roomId).add(client);
}

function leaveRoomSet(client, roomId) {
  client.rooms.delete(roomId);
  const set = roomClients.get(roomId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) roomClients.delete(roomId);
}

function detach(client) {
  for (const roomId of [...client.rooms]) {
    leaveRoomSet(client, roomId);
    broadcastToRoom(roomId, { type: WS.PRESENCE, roomId, online: onlineIn(roomId) });
  }
  clients.delete(client);
}

/* ---------------- handshake ---------------- */

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function authenticate(req) {
  const token = parseCookies(req.headers.cookie).token;
  if (!token) return null;
  let payload;
  try {
    payload = jwtUtil.verify(token);
  } catch {
    return null;
  }
  const model = payload.role === 'admin' ? adminModel : userModel;
  const account = await model.findById(payload.id);
  if (!account || !account.is_active) return null;
  if (account.locked_until && new Date(account.locked_until) > new Date()) return null;
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: payload.role === 'admin' ? 'admin' : 'user',
  };
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (no Origin header)
  return origin === env.corsOrigin || origin === env.baseUrl;
}

/* ---------------- event handlers ---------------- */

const handlers = {
  async [WS.JOIN](client, { roomId }) {
    roomId = parseInt(roomId, 10);
    await roomService.assertMember(roomId, client.user); // throws if not allowed
    joinRoomSet(client, roomId);
    const messages = await messageService.getRecent(client.user, roomId, 50);
    send(client, { type: WS.JOINED, roomId, messages, online: onlineIn(roomId) });
    broadcastToRoom(roomId, { type: WS.PRESENCE, roomId, online: onlineIn(roomId) }, { except: client });
  },

  async [WS.LEAVE](client, { roomId }) {
    roomId = parseInt(roomId, 10);
    leaveRoomSet(client, roomId);
    send(client, { type: WS.LEFT, roomId });
    broadcastToRoom(roomId, { type: WS.PRESENCE, roomId, online: onlineIn(roomId) });
  },

  async [WS.MESSAGE](client, { roomId, body, clientId }) {
    roomId = parseInt(roomId, 10);

    // trivial per-socket flood guard
    const now = Date.now();
    if (now - client.lastMessageAt < env.chat.minMsBetweenMessages) {
      return send(client, { type: WS.ERROR, message: MSG.TOO_FAST, ref: clientId });
    }
    client.lastMessageAt = now;

    // identity comes from client.user (verified at handshake) — never the frame
    const { message } = await messageService.postMessage(client.user, roomId, body);

    // BROADCAST FIRST — the INSERT is still in flight (write-behind)
    broadcastToRoom(roomId, { type: WS.NEW_MESSAGE, message, clientId });
  },
};

/* ---------------- moderation + admin hooks (called from HTTP controllers) ---------------- */

exports.notifyMessageRemoved = (roomId, messageId) =>
  broadcastToRoom(roomId, { type: WS.REMOVED, roomId, messageId });

exports.notifyMessageRestored = (roomId, message) =>
  broadcastToRoom(roomId, { type: WS.RESTORED, roomId, message });

/** Deactivating a user closes their live sockets immediately. */
exports.kickUser = (userId) => {
  for (const client of [...clients]) {
    if (client.user.id === userId && client.user.role === 'user') {
      send(client, { type: WS.ERROR, message: MSG.ACCOUNT_DISABLED });
      client.ws.close(4003, 'account deactivated');
    }
  }
};

/** Live numbers for the admin dashboard. */
exports.stats = () => ({
  openConnections: clients.size,
  roomsWithListeners: roomClients.size,
});

/* ---------------- server wiring ---------------- */

exports.init = (httpServer) => {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: env.chat.wsMaxPayloadBytes,
  });

  httpServer.on('upgrade', async (req, socket, head) => {
    try {
      if (req.url !== '/ws' || !originAllowed(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        return socket.destroy();
      }
      const user = await authenticate(req);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        return socket.destroy();
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, user);
      });
    } catch (err) {
      logger.error('ws upgrade failed', { msg: err.message });
      socket.destroy();
    }
  });

  wss.on('connection', (ws, _req, user) => {
    const client = { ws, user, rooms: new Set(), isAlive: true, lastMessageAt: 0 };
    clients.add(client);
    logger.info('ws connected', { userId: user.id, open: clients.size });
    send(client, { type: WS.READY, user: { id: user.id, name: user.name, role: user.role } });

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', async (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return send(client, { type: WS.ERROR, message: 'Frames must be JSON.' });
      }
      const handler = handlers[frame.type];
      if (!handler) return send(client, { type: WS.ERROR, message: `Unknown frame type: ${frame.type}` });
      try {
        // per-event safeHandler: an error answers THIS client, never crashes the socket
        await handler(client, frame);
      } catch (err) {
        send(client, {
          type: WS.ERROR,
          message: err.isOperational ? err.message : MSG.SERVER_ERROR,
          ref: frame.clientId,
        });
        if (!err.isOperational) logger.error('ws handler error', { type: frame.type, msg: err.message });
      }
    });

    ws.on('close', () => {
      detach(client);
      logger.info('ws disconnected', { userId: user.id, open: clients.size });
    });

    ws.on('error', (err) => logger.error('ws socket error', { msg: err.message }));
  });

  // heartbeat: ping every 30s, terminate connections that never pong back
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.isAlive) {
        client.ws.terminate();
        detach(client);
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
    }
  }, 30 * 1000);
  wss.on('close', () => clearInterval(heartbeat));

  logger.info('ws gateway ready at /ws');
  return wss;
};
