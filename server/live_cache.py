"""
live_cache.py - a 10-second memory for the admin pages' heavy numbers
------------------------------------------------------------------------------
The admin stat cards refresh themselves every LIVE_TTL_SECONDS (see
admin/js/admin-live-refresh.js). Learner Progress, Analytics, Reports and
the Dashboard's learning numbers all recompute every learner's lesson
scores, so without this several open admin tabs would each redo that work
every 10 seconds.

    @live_cached
    def get_learning_analytics(status=None, date_range=None): ...

The same call with the same arguments within LIVE_TTL_SECONDS gets the
saved answer (a copy - callers may change it freely). Different filters are
different keys, so changing a filter is never answered from the cache.
A None result (database unreachable) is never kept.

Per process: each server worker has its own memory. Read-only builders only -
never put it on anything that writes.
"""

import copy
import threading
import time
from functools import wraps

LIVE_TTL_SECONDS = 10   # = the admin pages' refresh interval
MAX_KEYS = 256          # per function; expired keys are dropped first


def live_cached(fn):
    store = {}
    lock = threading.Lock()

    @wraps(fn)
    def wrapper(*args, **kwargs):
        key = (args, tuple(sorted(kwargs.items())))
        now = time.monotonic()
        with lock:
            hit = store.get(key)
            if hit and now - hit[0] < LIVE_TTL_SECONDS:
                return copy.deepcopy(hit[1])

        value = fn(*args, **kwargs)

        if value is not None:
            with lock:
                if len(store) >= MAX_KEYS:
                    for k in [k for k, (t, _) in store.items() if now - t >= LIVE_TTL_SECONDS]:
                        store.pop(k, None)
                    if len(store) >= MAX_KEYS:
                        store.clear()
                store[key] = (now, value)
        return copy.deepcopy(value)

    wrapper.uncached = fn
    return wrapper
