"""Shared target guards. Resolve and validate before any AWS mutation."""
import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parents[2]


def parser(description=None):
    result = argparse.ArgumentParser(description=description)
    result.add_argument('--profile', default='dropit-admin')
    result.add_argument('--region', default='us-east-1')
    result.add_argument('--account', default='303278700480')
    # Physical resource names currently support this isolated lab only.
    result.add_argument('--stack', choices=['flashrush-lab'], default='flashrush-lab')
    return result


def connect(args):
    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    identity = session.client('sts').get_caller_identity()
    if identity['Account'] != args.account:
        raise SystemExit('AWS account mismatch; no mutation performed')
    return session


def stack_outputs(session, args):
    stack = session.client('cloudformation').describe_stacks(StackName=args.stack)['Stacks'][0]
    arn = stack['StackId'].split(':')
    tags = {tag['Key']: tag['Value'] for tag in stack.get('Tags', [])}
    if arn[3:5] != [args.region, args.account] or tags.get('Project') != 'FLASHRUSH':
        raise SystemExit('Stack identity/ownership mismatch; no mutation performed')
    if stack['StackStatus'] not in ('CREATE_COMPLETE', 'UPDATE_COMPLETE'):
        raise SystemExit('Stack is not ready: ' + stack['StackStatus'])
    return {item['OutputKey']: item['OutputValue'] for item in stack['Outputs']}


def manifest(args, operation, **details):
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip())
    timestamp = datetime.now(timezone.utc)
    record = dict(operation=operation, timestamp=timestamp.isoformat(), commit=commit,
                  dirty=dirty, account=args.account, region=args.region, stack=args.stack, **details)
    directory = ROOT / '.build' / 'manifests'
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / (timestamp.strftime('%Y%m%dT%H%M%S%fZ') + '-' + operation + '.json')
    target.write_text(json.dumps(record, indent=2, default=str) + '\n', encoding='utf-8')
    return str(target)
