// @ts-check
// The React bridges (step 3d of #136): the classic code that signals the React islands (app/react) and keeps the
// state they read. Each file runs its load-time side effects (the "module could not load" notices, the listeners) from an
// init…() function; initReactBridges() runs them in the order the files used to load (app/js/35- to 44-), from
// app/js/34-bootstrap.js, right after initBootstrap().
import {initCourtBridge} from './court.js';
import {initLibraryBridge} from './library.js';
import {initLiveScoresBridge} from './live-scores.js';
import {initOverviewBridge} from './overview.js';
import {initPoolsBridge} from './pools.js';
import {initRegistrationBridge} from './registration.js';
import {initResultsBridge} from './results.js';
import {initSetupBridge} from './setup.js';
import {initShellBridge} from './shell.js';
import {initTvBridge} from './tv.js';

export function initReactBridges(){
  initCourtBridge();
  initLiveScoresBridge();
  initTvBridge();
  initResultsBridge();
  initOverviewBridge();
  initLibraryBridge();
  initPoolsBridge();
  initSetupBridge();
  initRegistrationBridge();
  initShellBridge();
}
