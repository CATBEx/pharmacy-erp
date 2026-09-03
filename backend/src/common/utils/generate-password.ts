import { randomInt } from 'node:crypto';

// Generates a one-time login password for an account the person themselves never typed
// one in for (a newly created pharmacy admin, or a regenerated password for anyone).
// Charset drops visually-ambiguous characters (0/O, 1/I/L). One continuous 8-char string,
// no separator -- it's relayed by copy/paste (the "Your Credentials" tap-to-copy block),
// not dictated, so a hyphen would only add an extra keyboard-switch tap when someone has
// to type it in by hand. Only ever shown once, in the response that creates/resets it --
// it's stored solely as a bcrypt hash after that, exactly like a normal password.
//
// Shared between PharmaciesService (pharmacy admin create/regenerate) and UsersService
// (staff regenerate, bug #15) -- was originally private to PharmaciesService, pulled out
// here the moment a second caller needed the exact same behavior.
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePassword() {
  return Array.from({ length: 8 }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)]).join('');
}
