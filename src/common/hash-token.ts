import * as crypto from 'crypto';

// Single source of truth for hashing the opaque, high-entropy tokens this app
// stores instead of raw secrets (refresh tokens, password-reset codes, and
// the reset-link tokens an admin can mint). Deliberately sha256 and not
// bcrypt: these are already 256-bit random values, so key stretching buys
// nothing and would add ~100ms to every refresh call.
//
// Lives here rather than as a private method on AuthService because
// UsersService now mints reset-link tokens that AuthService.resetPassword has
// to verify — if the two ever hashed differently, every admin-issued reset
// link would silently fail to validate.
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
