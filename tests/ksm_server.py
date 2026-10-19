"""Start a throwaway local KSM backend (`wrangler dev`) for end-to-end tests.

Runs Cloudflare's real Workers runtime locally (no Cloudflare account needed)
with its own temporary Durable Object storage, and shuts it down afterwards.
The site is the built app in dist/ (wrangler.jsonc `assets`), rebuilt first if stale.
Set KSM_BASE_URL to reuse an already-running server instead.
"""
import contextlib
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

from ksm_source import ensure_built

ROOT = Path(__file__).resolve().parents[1]


def _free_port(avoid=()):
    """A port nothing listens on now. (Bind-and-close leaves a window before wrangler binds it, so
    local_worker() retries with fresh ports; `avoid` keeps the inspector port off the main one.)"""
    while True:
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0))
            port = s.getsockname()[1]
        if port not in avoid:
            return port


def _healthy(base):
    try:
        with urllib.request.urlopen(f'{base}/api/health', timeout=1) as r:
            return json.load(r).get('ok') is True
    except Exception:
        return False


@contextlib.contextmanager
def local_worker(timeout=60, restartable=False):
    if os.environ.get('KSM_BASE_URL'):
        if restartable:
            raise RuntimeError('Restart tests need their own worker; unset KSM_BASE_URL')
        yield os.environ['KSM_BASE_URL'].rstrip('/')
        return
    wrangler = ROOT / 'node_modules' / '.bin' / 'wrangler'
    if not wrangler.exists():
        raise SystemExit('wrangler is not installed — run `npm install` first.')
    ensure_built()
    port = _free_port()
    inspector = _free_port(avoid=(port,))
    state_dir = tempfile.mkdtemp(prefix='ksm-e2e-')
    log = open(Path(state_dir) / 'wrangler.log', 'w')
    proc = None
    started = []
    base = f'http://127.0.0.1:{port}'

    def stop():
        nonlocal proc
        if proc is not None:
            os.killpg(proc.pid, 15)
            proc.wait(timeout=10)
            proc = None

    def start(attempts=3):
        nonlocal proc, port, inspector, base
        if proc is not None:
            raise RuntimeError('Stop the worker before starting it again')
        for attempt in range(1, attempts + 1):
            proc = subprocess.Popen(
                # Same port and persisted storage on restart; separate inspector port per worker.
                [str(wrangler), 'dev', '--ip', '127.0.0.1', '--port', str(port), '--inspector-port', str(inspector),
                 '--persist-to', state_dir, '--log-level', 'warn'],
                cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                env={**os.environ, 'WRANGLER_SEND_METRICS': 'false', 'CI': '1'},
                start_new_session=True,
            )
            deadline = time.time() + timeout
            while not _healthy(base):
                if proc.poll() is not None or time.time() > deadline:
                    log.flush()
                    text = (Path(state_dir) / 'wrangler.log').read_text()
                    taken = proc.poll() is not None and 'address already in use' in text.lower()
                    if taken and attempt < attempts and not started:
                        # Another process took a port between choosing it and wrangler binding it:
                        # try again with fresh ports (only before the first successful start: a
                        # restart must keep its port).
                        proc = None
                        port = _free_port()
                        inspector = _free_port(avoid=(port,))
                        base = f'http://127.0.0.1:{port}'
                        break
                    raise RuntimeError('wrangler dev did not start:\n' + text[-3000:])
                time.sleep(0.3)
            else:
                started.append(True)
                return

    class RestartableURL(str):
        """URL compatible with existing helpers; restart retains Durable Object storage."""
        def stop(self):
            stop()

        def start(self):
            start()

    try:
        start()
        yield RestartableURL(base) if restartable else base
    finally:
        with contextlib.suppress(Exception):
            stop()
        log.close()
        shutil.rmtree(state_dir, ignore_errors=True)
