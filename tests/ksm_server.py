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


def _free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


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
    state_dir = tempfile.mkdtemp(prefix='ksm-e2e-')
    log = open(Path(state_dir) / 'wrangler.log', 'w')
    proc = None
    base = f'http://127.0.0.1:{port}'

    def stop():
        nonlocal proc
        if proc is not None:
            os.killpg(proc.pid, 15)
            proc.wait(timeout=10)
            proc = None

    def start():
        nonlocal proc
        if proc is not None:
            raise RuntimeError('Stop the worker before starting it again')
        proc = subprocess.Popen(
            # Same port and persisted storage on restart; separate inspector port per worker.
            [str(wrangler), 'dev', '--ip', '127.0.0.1', '--port', str(port), '--inspector-port', str(_free_port()),
             '--persist-to', state_dir, '--log-level', 'warn'],
            cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
            env={**os.environ, 'WRANGLER_SEND_METRICS': 'false', 'CI': '1'},
            start_new_session=True,
        )
        deadline = time.time() + timeout
        while not _healthy(base):
            if proc.poll() is not None or time.time() > deadline:
                log.flush()
                raise RuntimeError('wrangler dev did not start:\n' + (Path(state_dir) / 'wrangler.log').read_text()[-3000:])
            time.sleep(0.3)

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
