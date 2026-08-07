const {
  assertValidCommitSignatures,
} = require('../scripts/release-common');

test('rejects an unsigned release commit before expensive release work', () => {
  expect(() => assertValidCommitSignatures([
    { commit: 'abc123', status: 'N' },
  ])).toThrow(/valid cryptographic signatures/);
});

test('accepts commits with valid cryptographic signatures', () => {
  expect(() => assertValidCommitSignatures([
    { commit: 'abc123', status: 'G' },
  ])).not.toThrow();
});
