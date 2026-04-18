export { requireEnv } from "../config.js";
import { CONFIG as _BASE } from "../config.js";
import { CONTRACTS } from "../abi-registry.js";

export const CONFIG = { ..._BASE, CONTRACT: CONTRACTS.AGI_JOB_MANAGER_V2 };
