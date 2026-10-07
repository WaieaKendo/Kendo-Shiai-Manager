// The deploy setup's safety rules (docs/DEPLOYMENT.md), checked on the config files:
// wrangler.jsonc keeps production at the top level and gives dev its own Worker and Durable
// Object binding; .github/workflows/deploy.yml never deploys from a pull request, deploys dev only
// from `develop`, production only from `main` (a release, i.e. a new version, or by hand), and
// both only after the test suite.
import { readRepoFile } from './lib/ksm-source.mjs';

const checks = [];
const check = (ok, name) => checks.push([ok, name]);

// JSONC: drop // comments outside strings, then parse.
const stripComments = text => text.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g, (m, str) => str ?? '');
const wrangler = JSON.parse(stripComments(readRepoFile('wrangler.jsonc')));
const dev = wrangler.env?.dev;
check(wrangler.name === 'kendoshiaimanager-cloud-staging', 'production (top level) is still the existing Worker, kendoshiaimanager-cloud-staging');
check(JSON.stringify(wrangler.migrations) === JSON.stringify([{ tag: 'v1', new_sqlite_classes: ['TournamentState'] }]),
  'production Durable Object migrations unchanged (v1, SQLite TournamentState)');
check(dev?.name === 'kendoshiaimanager-dev' && dev.name !== wrangler.name, 'env.dev is a separate Worker: kendoshiaimanager-dev');
check(dev?.durable_objects?.bindings?.length === 1 && dev.durable_objects.bindings[0].name === 'TOURNAMENTS' && dev.durable_objects.bindings[0].class_name === 'TournamentState' && !dev.durable_objects.bindings[0].script_name,
  'env.dev binds its own TournamentState namespace (no script_name pointing at production)');
check(Object.keys(wrangler.env).join() === 'dev', 'dev is the only environment');

const deploy = readRepoFile('.github/workflows/deploy.yml');
const on = deploy.slice(deploy.indexOf('\non:'), deploy.indexOf('\nrun-name:'));
check(!/pull_request/.test(on) && /push:\n\s+branches: \[develop, main\]/.test(on) && /workflow_dispatch:/.test(on),
  'deploy.yml triggers: pushes to develop and main, and workflow_dispatch (never pull requests)');
const jobs = Object.fromEntries(deploy.slice(deploy.indexOf('\njobs:')).split(/\n  (?=[\w-]+:\n)/).slice(1).map(block => [block.match(/^([\w-]+):/)[1], block]));
check(/name: Deploy dev/.test(jobs.dev) && /needs: test/.test(jobs.dev) && /if: github.event_name == 'push' && github.ref == 'refs\/heads\/develop'/.test(jobs.dev) && /npm run deploy:dev/.test(jobs.dev) && /health-check\.mjs "\$DEV_URL"/.test(jobs.dev),
  'Deploy dev: after the tests, only on a push to develop, then the health check');
check(/name: Deploy production/.test(jobs.production) && /needs: \[release-check, test\]/.test(jobs.production)
  && /needs\.test\.result == 'success' && github\.ref == 'refs\/heads\/main' && \(/.test(jobs.production)
  && /github\.event_name == 'workflow_dispatch' \|\|/.test(jobs.production) && /\(github\.event_name == 'push' && needs\.release-check\.outputs\.deploy == 'true'\)\)/.test(jobs.production)
  && /"\$GITHUB_REF" != "refs\/heads\/main"/.test(jobs.production) && /npm run deploy:production/.test(jobs.production) && /health-check\.mjs "\$PRODUCTION_URL"/.test(jobs.production),
  'Deploy production: only from main (job condition and a guard step), by hand or on a push carrying a new version, only after the tests passed, then the health check');
check(/if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/.test(jobs['release-check']) && /if \[ "\$live" = "\$want" \]; then\n\s+echo "deploy=false"/.test(jobs['release-check']) && /echo "deploy=true"/.test(jobs['release-check']),
  'a push to main deploys production only when package.json has a version production does not report');
check(/\(github\.event_name == 'push' && github\.ref == 'refs\/heads\/develop'\) \|\|/.test(jobs.test) && /needs\.release-check\.outputs\.deploy == 'true'\)/.test(jobs.test),
  'the tests run for a dev deploy, a manual production deploy and a release pushed to main');
check(/github.event_name == 'workflow_dispatch' && github.ref != 'refs\/heads\/main'/.test(jobs.refuse) && /exit 1/.test(jobs.refuse), 'a manual run from another branch fails visibly');
check(/uses: \.\/\.github\/workflows\/test\.yml/.test(jobs.test) && /workflow_call:/.test(readRepoFile('.github/workflows/test.yml')), 'the tests are the shared test.yml workflow');

const pkg = JSON.parse(readRepoFile('package.json'));
check(pkg.scripts['deploy:dev'] === 'vite build && wrangler deploy --env dev' && pkg.scripts['deploy:production'] === 'vite build && wrangler deploy --env=""' && !pkg.scripts.deploy,
  'npm scripts build before deploying and always name the target (no bare `npm run deploy`)');

let failed = 0;
for (const [ok, name] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
