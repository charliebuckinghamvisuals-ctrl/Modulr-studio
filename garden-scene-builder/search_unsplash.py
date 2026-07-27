import urllib.request
import re

def search(query):
    url = f"https://unsplash.com/s/photos/{query.replace(' ', '-')}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        # find photo ids like "photo-123456789-abcdef"
        matches = re.findall(r'images\.unsplash\.com/photo-([a-zA-Z0-9\-]+)\?', html)
        # return unique matches
        return list(dict.fromkeys(matches))[:5]
    except Exception as e:
        return str(e)

print("Garden Office:", search("garden office exterior"))
print("Modern Shed:", search("modern shed"))
print("Backyard Office:", search("backyard office"))
