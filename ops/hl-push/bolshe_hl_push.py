#!/usr/bin/env python3
"""Tell BOLSHE Live Center which tennis highlights are ready, so the app shows them by player and match.

Runs on the Moscow server every 5 minutes (bolshe-hl-push.timer). Reads the tennis desk's jobs
(/opt/hoh-highlights/tennis-data/desk/jobs/*.json, read only), takes the light copies that exist on disk and
POSTs them to the Worker (/api/highlights/push, header x-push-token from /etc/bolshe-hl/token).
The video files stay where the desk put them; the app plays them through the no-VPN door — Caddy
(/etc/hoh-bolshe/bolshe.caddy) serves /hl/<key>/<name> read-only from the desk's out/ folder, light copies
and covers only. Sends only when something changed, and at least once an hour.
"""
import hashlib
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

DATA = pathlib.Path('/opt/hoh-highlights/tennis-data')
JOBS = DATA / 'desk' / 'jobs'
OUT = DATA / 'out'
URL = 'https://bolshe-live-center.rngn.workers.dev/api/highlights/push'
TOKEN = pathlib.Path('/etc/bolshe-hl/token')
STATE = pathlib.Path('/var/lib/bolshe-hl/last.json')
RESEND_EVERY = 3600


def item_of(job_file):
    job = json.loads(job_file.read_text(encoding='utf-8'))
    key = job_file.stem
    folder = OUT / key
    files = []
    for rec in job.get('files') or []:
        if rec.get('quality') != 'light' or not (folder / rec.get('name', '')).is_file():
            continue
        kind = rec['kind']
        if kind.startswith('top'):
            kind = f"top{job.get('top_count') or kind[3:] or 5}"
        files.append({'kind': kind, 'url': f"/hl/{key}/{rec['name']}", 'secs': rec.get('secs') or 0, 'mb': rec.get('mb') or 0})
    if not files:
        return None
    cover = job.get('cover')
    return {
        'key': key,
        'match_id': job.get('flashscore_id'),
        'vk': job.get('vk'),
        'finished': job.get('finished'),
        'summaries': job.get('set_summaries'),
        'cover': f'/hl/{key}/{cover}' if cover and (folder / cover).is_file() else None,
        'files': files,
    }


def post(items, token):
    body = json.dumps({'items': items}, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(URL, data=body, method='POST', headers={
        'content-type': 'application/json', 'x-push-token': token, 'user-agent': 'bolshe-hl-push/1'})
    # Cloudflare sometimes drops connections from this server: a few tries with a pause.
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=25) as res:
                return json.loads(res.read().decode('utf-8'))
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            if isinstance(error, urllib.error.HTTPError) and error.code < 500:
                raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('Worker unreachable')


def main():
    items = []
    for job_file in sorted(JOBS.glob('*.json')):
        try:
            item = item_of(job_file)
        except (OSError, ValueError, KeyError) as error:
            print(f'skip {job_file.name}: {error}', file=sys.stderr)
            continue
        if item:
            items.append(item)
    digest = hashlib.sha256(json.dumps(items, sort_keys=True).encode()).hexdigest()
    last = json.loads(STATE.read_text()) if STATE.is_file() else {}
    if last.get('digest') == digest and time.time() - last.get('at', 0) < RESEND_EVERY:
        print(f'unchanged, {len(items)} matches')
        return
    result = post(items, TOKEN.read_text().strip())
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({'digest': digest, 'at': time.time(), 'result': result}))
    print(f'sent {len(items)} matches: {result}')


if __name__ == '__main__':
    main()
