#!/usr/bin/env node
// Typecheck the Cockpit slice. Full `tsc -b` stays red on gestao/superadmin;
// this script fails only when the Task 6 path filter matches.
import { spawnSync } from 'node:child_process';

const tsc = spawnSync(
  'npx',
  ['tsc', '-p', 'tsconfig.cockpit.json', '--pretty', 'false'],
  { encoding: 'utf8' },
);

const output = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`;
if (output) process.stderr.write(output);

const pattern =
  /src\/(pages\/salao|cockpit|hooks\/useAuth|hooks\/useImplantacao|hooks\/useEvolution|hooks\/useMeta)/;
const hits = output.split(/\r?\n/).filter((line) => pattern.test(line));

if (hits.length > 0) {
  process.stderr.write(
    `\nCockpit typecheck failed (${hits.length} matching line(s)).\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `Cockpit slice clean (tsc exit ${tsc.status ?? 1}; residual errors outside slice ignored)\n`,
);
process.exit(0);
