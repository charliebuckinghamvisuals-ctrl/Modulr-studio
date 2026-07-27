import urllib.request
import urllib.parse
import re

def search(query):
    url = "https://lite.duckduckgo.com/lite/"
    data = urllib.parse.urlencode({"q": query}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req).read().decode("utf-8")
    matches = re.findall(r"unsplash\.com/(?:photos/)?([a-zA-Z0-9\-]{10,})", html)
    return list(dict.fromkeys(matches))[:5]

print("Modern Architecture:", search("site:unsplash.com modern architecture house exterior wood"))
print("Office Desk:", search("site:unsplash.com modern office desk plant"))
print("Wood Texture:", search("site:unsplash.com cedar wood cladding texture exterior"))
