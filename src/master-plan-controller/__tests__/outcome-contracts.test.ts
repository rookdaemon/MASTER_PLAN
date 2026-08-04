import { describe, expect, it } from 'vitest';
import { outcomeContractErrors } from '../outcome-contracts.js';
import { makeOutcomeContract, makeState } from './fixtures.js';

describe('outcome contracts', () => {
  it('requires exactly one complete contract for every graph metric', () => {
    const state = makeState({ outcomeContracts: [] });
    expect(outcomeContractErrors(state).join('\n')).toMatch(/metric-1.*contract/i);

    state.outcomeContracts = [makeOutcomeContract()];
    expect(outcomeContractErrors(state)).toEqual([]);

    state.outcomeContracts.push({ ...state.outcomeContracts[0], id: 'duplicate' });
    expect(outcomeContractErrors(state).join('\n')).toMatch(/duplicate.*contract/i);
  });
});
