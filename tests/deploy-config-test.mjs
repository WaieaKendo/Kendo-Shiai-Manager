// The deploy setup's safety rules (docs/DEPLOYMENT.md), checked on the config files:
// wrangler.jsonc keeps production at the top level and gives dev its own Worker and Durable
// Object binding; .github/workflows/deploy.yml never deploys from a pull request, deploys dev only
// from `develop`, production only from `main` (a release, i.e. a new version, or by hand), and
// both only after the test suite, and only the branch's current head (an older overlapping run
// skips its deploy).
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

// F34: overlapping runs. Concurrency only serialises the deploys, so right before each deploy a
// step checks that the run's commit is still the branch's head (git ls-remote); an older run skips
// its deploy and health check with a notice. Neither group cancels a running deploy.
const steps = job => job.split(/\n      - /).slice(1);
for (const [job, branch, command, url] of [['dev', 'develop', 'npm run deploy:dev', 'DEV_URL'], ['production', 'main', 'npm run deploy:production', 'PRODUCTION_URL']]) {
  const list = steps(jobs[job]);
  const fresh = list.findIndex(s => /id: fresh/.test(s));
  const deployAt = list.findIndex(s => s.includes(command));
  const healthAt = list.findIndex(s => s.includes(`health-check.mjs "$${url}"`));
  const gate = s => /\n\s+if: steps\.fresh\.outputs\.fresh == 'true'\n/.test(s);
  check(fresh >= 0 && deployAt === fresh + 1
    && list[fresh].includes(`git ls-remote --exit-code origin refs/heads/${branch}`) && /if \[ "\$head" = "\$GITHUB_SHA" \]; then\n\s+echo "fresh=true"/.test(list[fresh])
    && /echo "fresh=false"/.test(list[fresh]) && /::notice::/.test(list[fresh]) && !/exit/.test(list[fresh].split('fresh=true')[1] || 'exit'),
    `Deploy ${job}: right before the deploy, a check that the run's commit is still the head of ${branch} (a notice, not a failure, when it is not)`);
  check(deployAt >= 0 && healthAt > deployAt && gate(list[deployAt]) && gate(list[healthAt]),
    `Deploy ${job}: the deploy and the health check run only when the commit is still the head`);
  check(/concurrency:\n\s+group: deploy-[\w]+\n\s+cancel-in-progress: false/.test(jobs[job]), `Deploy ${job}: a running deploy is never cancelled midway`);
}

const pkg = JSON.parse(readRepoFile('package.json'));
check(pkg.scripts['deploy:dev'] === 'vite build && wrangler deploy --env dev' && pkg.scripts['deploy:production'] === 'vite build && wrangler deploy --env=""' && !pkg.scripts.deploy,
  'npm scripts build before deploying and always name the target (no bare `npm run deploy`)');

// The custom-domain pass-through (pages-proxy/): one Pages project per site, bound to that site's
// Worker, deployed after it (never production's Worker behind the dev address or the reverse).
const proxy = site => JSON.parse(stripComments(readRepoFile(`pages-proxy/${site}.jsonc`)));
const devProxy = proxy('dev'), productionProxy = proxy('production');
const target = config => config.services?.length === 1 && config.services[0].binding === 'KSM' ? config.services[0].service : null;
check(target(devProxy) === dev?.name && target(productionProxy) === wrangler.name,
  'pages-proxy: the dev project binds KSM to the dev Worker, the production project to the production Worker');
check(devProxy.name !== productionProxy.name && ![dev?.name, wrangler.name].includes(devProxy.name) && ![dev?.name, wrangler.name].includes(productionProxy.name),
  'pages-proxy: two Pages projects, named apart from each other and from the Workers');
check(devProxy.pages_build_output_dir === './public' && productionProxy.pages_build_output_dir === './public' && !devProxy.durable_objects && !productionProxy.durable_objects,
  'pages-proxy: no Durable Objects or assets of its own (it only forwards)');
check(/return env\.KSM\.fetch\(request\);/.test(readRepoFile('pages-proxy/_worker.js')), 'pages-proxy/_worker.js forwards the request unchanged');
check(/npm run proxy:dev/.test(jobs.dev) && jobs.dev.indexOf('npm run proxy:dev') > jobs.dev.indexOf('health-check.mjs')
  && /npm run proxy:production/.test(jobs.production) && jobs.production.indexOf('npm run proxy:production') > jobs.production.indexOf('health-check.mjs'),
  'deploy.yml: each site\'s pass-through deploys after its Worker passed the health check');
check(pkg.scripts['proxy:dev'] === 'node scripts/pages-proxy.mjs dev' && pkg.scripts['proxy:production'] === 'node scripts/pages-proxy.mjs production', 'npm scripts proxy:dev / proxy:production');

let failed = 0;
for (const [ok, name] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
