import { z } from 'zod';

// Zod 4 probes `new Function()` to compile faster parsers. Our CSP forbids eval (no 'unsafe-eval'),
// so the browser refuses the probe and logs a CSP violation on every page. Turn the optimisation off.
// This must run before any schema is created: Zod reads the flag when each object schema is built,
// which is why it lives in its own module, imported first by main.tsx.
z.config({ jitless: true });
