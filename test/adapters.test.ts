import { describe, expect, it } from 'vitest';

import { getFactoryAdapter } from '../src/libs/dex.js';
import Camelot from '../src/libs/dex/camelot.js';
import { GlacierFactory } from '../src/libs/dex/glacier.js';
import Primary, { PrimaryFactory } from '../src/libs/dex/primary.js';
import { getPairAdapter } from '../src/libs/pair.js';

// The adapters only stash the constructor arg; selection is what we care about,
// so a placeholder pair / factory is enough to assert which class is chosen.
const fakePair = {} as never;
const fakeFactory = {} as never;

describe('getPairAdapter', () => {
  it('selects the Camelot adapter for the camelot dex', () => {
    expect(getPairAdapter('camelot', fakePair)).toBeInstanceOf(Camelot);
  });

  it('falls back to the Primary adapter for an unknown dex', () => {
    expect(getPairAdapter('pancake', fakePair)).toBeInstanceOf(Primary);
    expect(getPairAdapter('some-new-dex', fakePair)).toBeInstanceOf(Primary);
  });
});

describe('getFactoryAdapter', () => {
  it('selects the Glacier factory adapter for glacier', () => {
    expect(getFactoryAdapter('glacier', fakeFactory)).toBeInstanceOf(
      GlacierFactory,
    );
  });

  it('falls back to the Primary factory adapter otherwise', () => {
    expect(getFactoryAdapter('camelot', fakeFactory)).toBeInstanceOf(
      PrimaryFactory,
    );
    expect(getFactoryAdapter('pancake', fakeFactory)).toBeInstanceOf(
      PrimaryFactory,
    );
  });
});
