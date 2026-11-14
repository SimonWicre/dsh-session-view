import test from 'node:test';
import assert from 'node:assert/strict';
import { isWorkspaceReady, workspaceChoices } from '../src/model.js';

const scenarios = [
  ['initial loading is not archive-authoritative', { phase: 'pending', state: 'loading', error: null }, false],
  ['a complete idle baseline allows opening', { phase: 'ready', state: 'idle', error: null }, true],
  ['a reconnect keeps phase ready but must disable opening', { phase: 'ready', state: 'loading', error: null }, false],
  ['an errored baseline is not authoritative', { phase: 'ready', state: 'error', error: { code: 'synthetic-failure' } }, false],
  ['an error record disables opening even with idle state', { phase: 'ready', state: 'idle', error: { code: 'synthetic-failure' } }, false],
  ['a pending baseline cannot be opened even with idle state', { phase: 'pending', state: 'idle', error: null }, false],
  ['an unknown state is conservative', { phase: 'ready', state: 'unknown', error: null }, false],
  ['absent workspace metadata is conservative', undefined, false],
  ['null workspace metadata is conservative', null, false],
];
for (const [name, snapshot, expected] of scenarios) {
  test(name, () => assert.equal(isWorkspaceReady(snapshot), expected));
}

test('workspace choices remain distinct when identical suffixes exceed the depth budget', () => {
  const shared = Array.from({ length: 20 }, (_, index) => `synthetic-segment-${index}`).join('/');
  const choices = workspaceChoices([
    { workspaceId: 'syn-west', title: 'Synthetic deep project', path: `Q:/west/${shared}` },
    { workspaceId: 'syn-east', title: 'Synthetic deep project', path: `Q:/east/${shared}` },
  ], { ungrouped: 'Synthetic ungrouped' });
  assert.notEqual(choices[0].label, choices[1].label);
  assert(choices[0].label.endsWith('syn-west'));
  assert(choices[1].label.endsWith('syn-east'));
});
