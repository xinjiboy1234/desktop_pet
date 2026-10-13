"""Send Duckside v1 events using Python's standard library."""
import argparse
import json
import os
import sys
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ACTIONS = ('idle', 'thinking', 'working', 'waiting', 'success', 'error',
           'celebrating', 'sleeping', 'speaking', 'box_speaking', 'angry')
TYPES = ('health', 'snapshot', 'task.start', 'task.update', 'task.end',
         'task.cancel', 'pet.action', 'pet.reset')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('type', choices=TYPES)
    parser.add_argument('--endpoint', default=os.getenv('PET_BRIDGE_URL', 'http://127.0.0.1:17789'))
    parser.add_argument('--task-id')
    parser.add_argument('--action', choices=ACTIONS)
    parser.add_argument('--outcome', choices=('success', 'error'))
    parser.add_argument('--ttl-ms', type=int)
    parser.add_argument('--priority', type=int)
    parser.add_argument('--message')
    parser.add_argument('--id', help='Reuse the same id when retrying one event')
    parser.add_argument('--dry-run', action='store_true', help='Print event JSON without sending')
    args = parser.parse_args()
    url = urlsplit(args.endpoint)
    if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or url.query or url.fragment:
        parser.error('endpoint must be an HTTP(S) base URL without credentials, query or fragment')
    if args.type.startswith('task.') and not args.task_id:
        parser.error('task events require --task-id')
    if args.type == 'pet.action' and not args.action:
        parser.error('pet.action requires --action')
    if args.ttl_ms is not None and not 1 <= args.ttl_ms <= 600000:
        parser.error('--ttl-ms must be between 1 and 600000')
    if args.priority is not None and not -1000 <= args.priority <= 1000:
        parser.error('--priority must be between -1000 and 1000')
    for value in (args.task_id, args.id):
        if value is not None and not 1 <= len(value) <= 128:
            parser.error('id and task-id must contain 1 to 128 characters')
    if args.message is not None and len(args.message) > 1000:
        parser.error('message must be at most 1000 characters')
    read = args.type in ('health', 'snapshot')
    event = {'version': 1, 'id': args.id or str(uuid.uuid4()), 'type': args.type}
    for key, value in (('taskId', args.task_id), ('action', args.action),
                       ('outcome', args.outcome), ('ttlMs', args.ttl_ms),
                       ('priority', args.priority), ('message', args.message)):
        if value is not None:
            event[key] = value
    data = json.dumps(event, ensure_ascii=False).encode('utf-8')
    if args.dry_run:
        print(args.type if read else data.decode('utf-8'))
        return 0
    headers = {'Content-Type': 'application/json'}
    token = os.getenv('PET_TOKEN')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    path = '/' + args.type if read else '/events'
    request = Request(args.endpoint.rstrip('/') + path,
                      data=None if read else data, headers=headers,
                      method='GET' if read else 'POST')
    try:
        with urlopen(request, timeout=3) as response:
            print(json.dumps(json.load(response), ensure_ascii=False))
    except HTTPError as error:
        print(f'Bridge returned HTTP {error.code}; check token, origin and event fields.', file=sys.stderr)
        return 1
    except (URLError, TimeoutError, OSError, ValueError):
        print('Bridge request failed; check service, endpoint and response JSON.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
