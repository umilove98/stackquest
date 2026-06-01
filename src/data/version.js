// version.js — single source of truth for the build version + release source.
// `stackquest --update` pulls the latest exe from this GitHub repo's Releases.

export const VERSION = '0.5.0';

// GitHub repo that hosts the releases, as "owner/name". The updater pulls the
// latest exe from this repo's Releases.
export const REPO = 'umilove98/stackquest';
