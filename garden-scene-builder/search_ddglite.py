import urllib.request
import urllib.parse
import re

def search(query):
    url = "https://lite.duckduckgo.com/lite/"
    data = urllib.parse.urlencode({'q': query}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        matches = re.findall(r'unsplash\.com/(?:photos/)?([a-zA-Z0-9\-]{10,})', html)
        return list(dict.fromkeys(matches))[:5]
    except Exception as e:
        return str(e)

print(search("site:unsplash.com modern garden room exterior"))
print(search("site:unsplash.com modern shed wood exterior"))
print(search("site:unsplash.com architectural wood cladding"))
