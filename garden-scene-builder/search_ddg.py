import urllib.request
import re
import json

url = "https://duckduckgo.com/html/?q=site:unsplash.com+garden+room+office+modern"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    matches = re.findall(r'unsplash\.com/photos/([a-zA-Z0-9\-]+)', html)
    print("DDG:", list(dict.fromkeys(matches))[:10])
except Exception as e:
    print(e)

