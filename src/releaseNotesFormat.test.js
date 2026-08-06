const fs = require('fs');
const os = require('os');
const path = require('path');
const { readReleaseNotes } = require('../scripts/release-common');

function withReleaseNotes(text, callback) {
  const base = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kelani-release-notes-')
  );
  const version = '9.9.9';
  const notesPath = path.join(
    base,
    'docs',
    'releases',
    `release-notes-v${version}.md`
  );

  fs.mkdirSync(path.dirname(notesPath), { recursive: true });

  fs.writeFileSync(notesPath, text, 'utf8');

  try {
    callback(version, base);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

test('accepts release notes that start directly with What’s new', () => {
  withReleaseNotes(
    "## What's new\n\n- Added a user-facing improvement.\n",
    (version, base) => {
      expect(readReleaseNotes(version, base)).toMatchObject({
        relativePath:
          'docs/releases/release-notes-v9.9.9.md',
        text:
          "## What's new\n\n" +
          "- Added a user-facing improvement.",
      });
    }
  );
});

test('rejects a repeated GitHub release title', () => {
  withReleaseNotes(
    "# Kelani SBD Tracker v9.9.9\n\n" +
      "## What's new\n\n- Added a feature.\n",
    (version, base) => {
      expect(() => readReleaseNotes(version, base)).toThrow(
        'must not repeat the GitHub release title'
      );
    }
  );
});

test('rejects a different opening heading', () => {
  withReleaseNotes(
    "## Highlights\n\n- Added a feature.\n",
    (version, base) => {
      expect(() => readReleaseNotes(version, base)).toThrow(
        `must start with "## What's new"`
      );
    }
  );
});
