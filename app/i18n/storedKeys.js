/**
 * Phase 12 Part D (D1) — every key a producer uses for a sentence it STORES
 * in English, compiled once. Pure modules only: this is imported by the
 * client (react.jsx) and by server loaders alike.
 */
import { compileStoredKeys, storedTranslator } from "./stored.js";
import { GRADE_NOTE_KEYS } from "../utils/catalogueWatch.js";
import { INDEXABILITY_NOTE_KEYS } from "../utils/indexability.js";
import { VERIFY_NOTE_KEYS } from "../utils/publishVerify.js";
import { JOB_MESSAGE_KEYS } from "../utils/jobMessages.js";
import { FIX_ERROR_KEYS } from "../utils/remediation.js";
import { SUPPORT_ERROR_KEYS } from "../utils/support.js";

export const STORED_KEYS = compileStoredKeys([
  ...GRADE_NOTE_KEYS,
  ...INDEXABILITY_NOTE_KEYS,
  ...VERIFY_NOTE_KEYS,
  ...JOB_MESSAGE_KEYS,
  ...FIX_ERROR_KEYS,
  ...SUPPORT_ERROR_KEYS,
]);

/** Server side: the stored-sentence translator for a request's `t`. */
export const storedTFor = (t) => storedTranslator(t, STORED_KEYS);
