"""Start a throwaway local KSM backend (`wrangler dev`) for end-to-end tests.

Runs Cloudflare's real Workers runtime locally (no Cloudflare account needed)
with its own temporary Durable Object storage, and shuts it down afterwards.
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
def local_worker(timeout=60):
    if os.environ.get('KSM_BASE_URL'):
        yield os.environ['KSM_BASE_URL'].rstrip('/')
        return
    wrangler = ROOT / 'node_modules' / '.bin' / 'wrangler'
    if not wrangler.exists():
        raise SystemExit('wrangler is not installed — run `npm install` first.')
    port = _free_port()
    state_dir = tempfile.mkdtemp(prefix='ksm-e2e-')
    log = open(Path(state_dir) / 'wrangler.log', 'w')
    proc = subprocess.Popen(
        [str(wrangler), 'dev', '--ip', '127.0.0.1', '--port', str(port), '--persist-to', state_dir, '--log-level', 'warn'],
        cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
        env={**os.environ, 'WRANGLER_SEND_METRICS': 'false', 'CI': '1'},
        start_new_session=True,
    )
    base = f'http://127.0.0.1:{port}'
    try:
        deadline = time.time() + timeout
        while not _healthy(base):
            if proc.poll() is not None or time.time() > deadline:
                log.flush()
                raise RuntimeError('wrangler dev did not start:\n' + (Path(state_dir) / 'wrangler.log').read_text()[-3000:])
            time.sleep(0.3)
        yield base
    finally:
        with contextlib.suppress(Exception):
            os.killpg(proc.pid, 15)
            proc.wait(timeout=10)
        log.close()
        shutil.rmtree(state_dir, ignore_errors=True)
