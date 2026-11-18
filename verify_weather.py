"""Checks for weather_feed.py: the parser that reads the 中国天气网 forecast page.

    python -B verify_weather.py

Runs offline on a small page written here; nothing is fetched.
"""
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

import weather_feed as W

ROWS = [{"time": f"{h:02d}", "weatherCode": ("n" if h < 6 or h >= 19 else "d") + code, "weather": text, "temp": temp, "windL": "<3级", "windD": "南风"}
        for h, code, text, temp in [(22, '02', '阴', 5), (23, '02', '阴', 4), (0, '01', '多云', 4), (1, '00', '晴', 3), (2, '07', '小雨', 3)]]
PAGE = ('<html><script>var villages = [];</script><script>var forecast_1h = ' + json.dumps(ROWS, ensure_ascii=False) +
        '; var forecast_default = {"time":"21:40","weatherBg":"weatherBg03","temp":7.6,"wind":"西风 1级","humidity":67,"maxTemp":11,"minTemp":1,"weather":"阴"};</script></html>')
NOW = datetime(2026, 11, 11, 21, 40, tzinfo=W.CST)


class WeatherFeed(unittest.TestCase):
    def test_hours_are_dated_across_midnight(self):
        data = W.parse(PAGE, NOW)
        stamps = [datetime.fromtimestamp(h['t'] / 1000, W.CST) for h in data['hours']]
        self.assertEqual([(s.day, s.hour) for s in stamps], [(11, 22), (11, 23), (12, 0), (12, 1), (12, 2)])
        self.assertEqual([h['hour'] for h in data['hours']], [22, 23, 0, 1, 2])

    def test_first_hour_after_midnight_belongs_to_tomorrow(self):
        late = W.parse(PAGE.replace('"time": "22"', '"time": "01"', 1), datetime(2026, 11, 11, 23, 50, tzinfo=W.CST))
        first = datetime.fromtimestamp(late['hours'][0]['t'] / 1000, W.CST)
        self.assertEqual((first.day, first.hour), (12, 1))

    def test_forecast_issued_last_evening_is_not_moved_to_tonight(self):
        # at 03:19 the page still shows the forecast issued at 20:00 the evening before
        rows = [{"time": f"{(20 + i) % 24:02d}", "weatherCode": "n00", "weather": "晴", "temp": 0} for i in range(24)]
        page = '<script>var forecast_1h = ' + json.dumps(rows, ensure_ascii=False) + ';</script>'
        data = W.parse(page, datetime(2026, 11, 19, 3, 19, tzinfo=W.CST))
        first, last = (datetime.fromtimestamp(h['t'] / 1000, W.CST) for h in (data['hours'][0], data['hours'][-1]))
        self.assertEqual([(first.day, first.hour), (last.day, last.hour)], [(18, 20), (19, 19)])

    def test_codes_text_and_observation(self):
        data = W.parse(PAGE, NOW)
        self.assertEqual([h['code'] for h in data['hours']], ['02', '02', '01', '00', '07'])
        self.assertEqual([h['night'] for h in data['hours']], [True] * 5)
        self.assertEqual(data['hours'][4]['text'], '小雨')
        self.assertEqual(data['hours'][0]['windL'], '不到3级')
        self.assertEqual(data['now'], {'time': '21:40', 'text': '阴', 'temp': 7.6, 'humidity': 67.0, 'wind': '西风 1级', 'hi': 11.0, 'lo': 1.0})
        self.assertEqual(data['fetchedAt'], int(NOW.timestamp() * 1000))
        self.assertIn('中央气象台', data['source'])

    def test_markup_and_bad_numbers_are_dropped(self):
        rows = [{"time": "22", "weatherCode": "d00", "weather": "<img src=x onerror=1>晴", "temp": "abc", "windL": "", "windD": ""}, {"time": "x"}, "junk"]
        data = W.parse('<script>var forecast_1h = ' + json.dumps(rows, ensure_ascii=False) + ';</script>', NOW)
        self.assertEqual(len(data['hours']), 1)
        self.assertNotIn('<', data['hours'][0]['text'])
        self.assertIsNone(data['hours'][0]['temp'])
        self.assertIsNone(data['now']['temp'])

    def test_page_without_forecast_is_an_error(self):
        for page in ('<html></html>', '<script>var forecast_1h = [];</script>', '<script>var forecast_1h = {broken</script>'):
            with self.assertRaises(ValueError):
                W.parse(page, NOW)

    def test_snapshot_is_a_script_the_page_can_load(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'weather-snapshot.js'
            W.write_snapshot(W.parse(PAGE, NOW), path)
            text = path.read_text(encoding='utf-8')
        body = text[text.index('window.WEATHER_SNAPSHOT = ') + len('window.WEATHER_SNAPSHOT = '):].rstrip().rstrip(';')
        self.assertEqual(len(json.loads(body)['hours']), 5)


if __name__ == '__main__':
    unittest.main(verbosity=1)
