import {writeFileSync} from 'node:fs';
import {sprigIconSvg} from '../packages/canvas/src/sprig-brand';
writeFileSync(new URL('../packages/canvas/src/sprig-icon.svg',import.meta.url),sprigIconSvg());
