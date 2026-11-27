"""Validate an explicit release inventory, bind build artifacts, and report smoke levels."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

import boto3
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'deploy'))
from target_config import load, preflight, frontend_env, require


def fingerprint(config):
    return hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()


def artifacts(directory):
    return {p.relative_to(directory).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(directory.rglob('*')) if p.is_file() and p.name != 'release-manifest.json'}


def bind(config, directory):
    require(all(os.environ.get(k) == v for k, v in frontend_env(config).items()), 'build environment differs from inventory')
    require(not any(k.startswith('VITE_') and any(word in k.upper() for word in ('SECRET','PASSWORD','ADMIN_KEY','API_KEY','ACCESS_KEY','TOKEN')) for k in os.environ), 'privileged Vite variable detected')
    require((directory / 'index.html').is_file(), 'frontend build missing')
    manifest = {'targetSha256':fingerprint(config), 'files':artifacts(directory)}
    (directory / 'release-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


def verify(config, directory):
    manifest = json.loads((directory / 'release-manifest.json').read_text(encoding='utf-8'))
    require(manifest['targetSha256'] == fingerprint(config), 'artifact belongs to a different target')
    require(manifest['files'] == artifacts(directory), 'artifact integrity mismatch')


def request(url, token=None, payload=None):
    headers = {'Content-Type':'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, headers=headers, data=json.dumps(payload).encode() if payload is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            body = response.read()
            return response.status, response.headers.get('Content-Type', ''), body
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get('Content-Type', ''), exc.read()


def smoke(session, config):
    r = config['resources']
    report = {level: {'status':'NOT_VERIFIED', 'checks':[]} for level in ('public','customer','staff')}
    def check(level, label, condition):
        report[level]['checks'].append({'check':label,'status':'PASS' if condition else 'FAIL'})
    def api(level, path, token=None, expected=(200,), payload=None):
        status, kind, raw = request(r['ApiUrl'] + path, token, payload)
        check(level, path, status in expected and 'application/json' in kind)
        return json.loads(raw) if 'application/json' in kind else {}
    for path in ('/', '/account/orders', '/account/vouchers', '/staff/login', '/admin/inventory'):
        status, kind, raw = request(r['WebsiteUrl'].rstrip('/') + path)
        check('public', path, status == 200 and 'text/html' in kind and b'id="root"' in raw)
    api('public', '/products')
    api('public', '/admin/vouchers', expected=(401,403))
    for level in ('customer','staff'):
        username = os.environ.get('SMOKE_' + level.upper() + '_USERNAME')
        password = os.environ.get('SMOKE_' + level.upper() + '_PASSWORD')
        if not username or not password:
            continue
        require(config.get('nonProduction') is True, 'authenticated smoke requires explicit nonProduction inventory')
        token = session.client('cognito-idp').initiate_auth(ClientId=r['UserPoolClientId'], AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={'USERNAME':username,'PASSWORD':password})['AuthenticationResult']['AccessToken']
        if level == 'customer':
            for path in ('/me/profile','/me/cart','/me/orders','/me/vouchers'):
                api(level, path, token)
            api(level, '/me/checkouts/smoke-nonexistent', token, (404,))
            # Invalid selection checks the authorized boundary without creating an order.
            api(level, '/me/checkout-quote', token, (400,409,422), {})
            api(level, '/admin/vouchers', token, (403,))
        else:
            me = api(level, '/auth/me', token)
            roles = set(me.get('roles', []))
            check(level, 'staff role', bool(roles & {'owner','manager','warehouse','support'}))
            path = '/admin/inventory' if 'warehouse' in roles else '/admin/orders'
            api(level, path, token)
            api(level, '/admin/vouchers', token, (200,) if roles & {'owner','manager'} else (403,))
    for level in report.values():
        if level['checks']:
            level['status'] = 'PASS' if all(c['status'] == 'PASS' for c in level['checks']) else 'FAIL'
    return report


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--inventory', required=True)
    cli.add_argument('--profile')
    cli.add_argument('--preflight', action='store_true')
    cli.add_argument('--smoke', action='store_true')
    cli.add_argument('--bind', type=Path)
    cli.add_argument('--github-env', type=Path)
    cli.add_argument('--output', type=Path)
    args = cli.parse_args()
    report = {'status':'NOT_VERIFIED', 'aws':'NOT_VERIFIED'}
    failed = False
    try:
        config = load(args.inventory)
        report.update(target=config['target'], localConfiguration='PASS')
        if args.preflight or args.smoke:
            session = boto3.Session(profile_name=args.profile, region_name=config['region'])
            report['preflight'] = preflight(session, config)
            if args.smoke:
                report['smoke'] = smoke(session, config)
                failed = any(v['status'] != 'PASS' for v in report['smoke'].values())
        if args.github_env:
            with args.github_env.open('a', encoding='utf-8') as file:
                for key, value in frontend_env(config).items():
                    file.write(key + '=' + value + '\n')
        if args.bind:
            bind(config, args.bind)
    except Exception as exc:
        failed = True
        report.update(status='NOT_READY', errorType=type(exc).__name__)
        if isinstance(exc, ValueError):
            report['reason'] = str(exc)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    return 2 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
