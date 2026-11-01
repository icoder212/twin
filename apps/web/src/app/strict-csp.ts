import { z } from 'zod';

/**
 * Zod compiles fast parsers with `new Function` when it can. Under our CSP (no 'unsafe-eval',
 * Trusted Types enforced) that probe is blocked and reported as a violation, so turn it off.
 * This module must be the first import of the entry point: schemas parse at import time.
 */
z.config({ jitless: true });
