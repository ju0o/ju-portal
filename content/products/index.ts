import juqode from './juqode';
import jutell from './jutell';
import type { ProductEntry } from '../../src/registry/types';

/**
 * Products V0 ships ONLY entries whose primary action resolves to a verified live
 * target. Verified 2026-09-29 against the public GitHub Releases API and the npm
 * registry. JuDoctor, JuControler, JuCeipt and JuMiner did not pass and are
 * therefore absent by design. See docs/BUILDER_INTERFACE.md and infra/RUNBOOK.md.
 */
export const products: ProductEntry[] = [juqode, jutell];

export default products;
