"""Hourly weather forecast for the campus, read from 中国天气网.

The campus sits in 长安区太乙宫街道; the page below is the public town forecast for it
(数据来源：中央气象台).  serve.py answers /api/weather with what this module reads, and

    python weather_feed.py

refreshes dist/assets/weather-snapshot.js, the copy the page falls back to when it is opened
without the local server.  Only that one public page is requested, at most once every
20 minutes, with an honest User-Agent.
"""
import json
import re
import sys
import threading
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

PAGE = 'https://forecast.weather.com.cn/town/weather1dn/101110102013.shtml'
PLACE = '长安区太乙宫街道'
SOURCE = '中国天气网（数据来源：中央气象台）'
CST = timezone(timedelta(hours=8))
SNAPSHOT = Path(__file__).resolve().parent / 'dist' / 'assets' / 'weather-snapshot.js'
MAX_AGE = 20 * 60

_lock = threading.Lock()
_cache = {'at': 0.0, 'data': None}


def _var(html, name):
    """The JSON value assigned to `var name = …` inside the page, or None."""
    m = re.search(r'var\s+' + re.escape(name) + r'\s*=\s*', html)
    if not m:
        return None
    try:
        return json.JSONDecoder().raw_decode(html, m.end())[0]
    except ValueError:
        return None


def _num(value, low=-60, high=60):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if low <= number <= high else None


def _text(value, limit=12):
    return re.sub(r'[<>&"\'\\]', '', str(value if value is not None else ''))[:limit]


def parse(html, now=None):
    """Turn the forecast page into {place, source, page, fetchedAt, now, hours}.

    The page only gives clock hours ("20", "21", …), so each one is dated from the moment of
    reading.  The list starts at the hour the forecast was issued, which can be up to a day ago:
    at 03:00 the page may still show the one issued at 20:00 the evening before.  So the first
    hour is the latest time that hour came round, but not more than 3 hours ahead.
    """
    now = now or datetime.now(CST)
    rows = _var(html, 'forecast_1h')
    current = _var(html, 'forecast_default')
    if not isinstance(rows, list) or not rows:
        raise ValueError('页面里没有逐小时预报')
    hours, stamp = [], None
    for row in rows[:48]:
        if not isinstance(row, dict):
            continue
        try:
            hour = int(row.get('time')) % 24
        except (TypeError, ValueError):
            continue
        if stamp is None:
            stamp = now.replace(hour=hour, minute=0, second=0, microsecond=0)
            if stamp > now + timedelta(hours=3):
                stamp -= timedelta(days=1)
            elif stamp <= now + timedelta(hours=3) - timedelta(days=1):
                stamp += timedelta(days=1)
        else:
            stamp += timedelta(hours=1)
            for _ in range(24):
                if stamp.hour == hour:
                    break
                stamp += timedelta(hours=1)
        code = _text(row.get('weatherCode'), 6)
        hours.append({
            't': int(stamp.timestamp() * 1000), 'hour': hour,
            'code': code[1:] if code[:1] in 'dn' else code, 'night': code[:1] == 'n',
            'text': _text(row.get('weather')), 'temp': _num(row.get('temp')),
            'windD': _text(row.get('windD'), 8), 'windL': _text(str(row.get('windL') or '').replace('<', '不到'), 8),
        })
    if not hours:
        raise ValueError('逐小时预报格式无法识别')
    current = current if isinstance(current, dict) else {}
    return {
        'place': PLACE, 'source': SOURCE, 'page': PAGE, 'fetchedAt': int(now.timestamp() * 1000),
        'now': {'time': _text(current.get('time'), 5), 'text': _text(current.get('weather')), 'temp': _num(current.get('temp')),
                'humidity': _num(current.get('humidity'), 0, 100), 'wind': _text(current.get('wind'), 12),
                'hi': _num(current.get('maxTemp')), 'lo': _num(current.get('minTemp'))},
        'hours': hours,
    }


def fetch(timeout=12):
    request = urllib.request.Request(PAGE, headers={'User-Agent': 'campus-shade-guide/1.0 (student project; hourly forecast for one town)'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        html = response.read(2_000_000).decode('utf-8', 'replace')
    return parse(html)


def write_snapshot(data, path=SNAPSHOT):
    path.write_text('// 天气预报快照，由 weather_feed.py 写入；过期后页面会自动忽略。\nwindow.WEATHER_SNAPSHOT = '
                    + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')


def get(max_age=MAX_AGE):
    """(data, fresh).  Reads the page at most once per `max_age` seconds; when a read fails the
    last good forecast is returned with fresh=False, and with nothing to fall back on it raises."""
    with _lock:
        if _cache['data'] and time.time() - _cache['at'] < max_age:
            return _cache['data'], False
        try:
            data = fetch()
        except Exception:
            _cache['at'] = time.time() - max_age + 120  # wait two minutes before trying again
            if _cache['data']:
                return _cache['data'], False
            raise
        _cache.update(at=time.time(), data=data)
        return data, True


def main():
    try:
        data = fetch()
    except Exception as error:  # network down, page changed …
        print('没有取到天气预报：', error)
        return 1
    write_snapshot(data)
    first, last = data['hours'][0], data['hours'][-1]
    stamp = lambda ms: datetime.fromtimestamp(ms / 1000, CST).strftime('%m-%d %H:%M')
    print(f"{PLACE} 实况 {data['now']['text']} {data['now']['temp']}℃；逐小时预报 {len(data['hours'])} 条（{stamp(first['t'])} 至 {stamp(last['t'])}）")
    print('已写入', SNAPSHOT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
