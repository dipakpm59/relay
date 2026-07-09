/**
 * The whole WS protocol: small, documented JSON frames { type, ...payload }.
 * CLIENT → SERVER                      SERVER → CLIENT
 *   join    { roomId }                   ready    { user }
 *   leave   { roomId }                   joined   { room, messages, online }
 *   message { roomId, body, clientId }   left     { roomId }
 *                                        message  { message }         (broadcast)
 *                                        removed  { roomId, messageId }
 *                                        restored { roomId, message }
 *                                        presence { roomId, online }
 *                                        error    { message, ref? }
 */
module.exports = Object.freeze({
  // client → server
  JOIN: 'join',
  LEAVE: 'leave',
  MESSAGE: 'message',
  // server → client
  READY: 'ready',
  JOINED: 'joined',
  LEFT: 'left',
  NEW_MESSAGE: 'message',
  REMOVED: 'removed',
  RESTORED: 'restored',
  PRESENCE: 'presence',
  ERROR: 'error',
});
