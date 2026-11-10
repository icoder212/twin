import { z } from 'zod';

/**
 * Workers refuse code generation from strings, so stop Zod probing for it. This module must be
 * the first import of the entry point, because schemas in the shared core parse at import time.
 */
z.config({ jitless: true });
