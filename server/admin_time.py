"""
admin_time.py - the one date + time format of the admin side
------------------------------------------------------------------------------
    fmt_datetime(dt)  ->  "Oct 5, 2026 4:53 PM"   (None -> "—")

Times are already Philippine time (cobradb.py sets the MySQL session
time_zone and the process TZ), so this only formats - it never converts.
"""


def fmt_datetime(dt, empty="—"):
    """e.g. 'Oct 5, 2026 4:53 PM'. A missing value -> `empty`."""
    if not dt:
        return empty
    hour = dt.strftime("%I").lstrip("0") or "12"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year} {hour}:{dt.strftime('%M %p')}"
