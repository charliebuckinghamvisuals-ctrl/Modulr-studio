import urllib.request
import re

def search(query):
    url = f"https://www.pexels.com/search/{query.replace(' ', '%20')}/"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        matches = re.findall(r'images\.pexels\.com/photos/[0-9]+/pexels-photo-([0-9]+)\.jpeg', html)
        return list(dict.fromkeys(matches))[:5]
    except Exception as e:
        return str(e)

print("Garden Office:", search("garden office exterior"))
print("Modern Shed:", search("modern shed"))
