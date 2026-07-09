module.exports = Object.freeze({
  // auth
  AUTH_REQUIRED: 'Sign in to continue.',
  SESSION_EXPIRED: 'Session expired. Sign in again.',
  BAD_CREDENTIALS: 'Incorrect email or password.',
  ACCOUNT_LOCKED: 'Too many failed attempts. Account locked temporarily.',
  ACCOUNT_DISABLED: 'This account has been deactivated.',
  ADMIN_ONLY: 'Admin access required.',
  EMAIL_TAKEN: 'An account with that email already exists.',
  INVALID_NAME: 'Name must be at least 2 characters.',
  INVALID_EMAIL: 'Enter a valid email address.',
  WEAK_PASSWORD: 'Password needs 8+ characters with at least one letter and one number.',
  WRONG_CURRENT_PASSWORD: 'Current password is incorrect.',

  // rooms
  INVALID_ROOM_NAME: 'Room name must be 3–50 characters.',
  ROOM_NOT_FOUND: 'Room not found.',
  ROOM_ARCHIVED: 'This room has been archived.',
  NOT_A_MEMBER: 'You are not a member of this room.',
  NOT_ROOM_OWNER: 'Only the room owner can do that.',
  OWNER_CANNOT_LEAVE: 'Owners cannot leave their own room — archive it instead.',
  INVALID_INVITE: 'That invite link is not valid.',

  // messages
  EMPTY_MESSAGE: 'Message cannot be empty.',
  MESSAGE_TOO_LONG: 'Message is too long.',
  MESSAGE_NOT_FOUND: 'Message not found.',
  CANNOT_MODERATE: 'You cannot moderate this message.',
  DAILY_LIMIT_REACHED: 'Daily message limit reached. Try again tomorrow.',
  TOO_FAST: 'You are sending messages too quickly.',

  // generic
  NOT_FOUND: 'Not found.',
  RATE_LIMITED: 'Too many requests. Try again in a few minutes.',
  SERVER_ERROR: 'Something went wrong on our side.',
});
