import urllib.request
import re

url = "https://www.cabinmaster.co.uk/garden-rooms"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    images = re.findall(r'<img[^>]+src="([^">]+)"', html)
    valid = list(set([img for img in images if ('jpg' in img or 'jpeg' in img) and 'http' in img]))
    for v in valid[:10]:
        print(v)
except Exception as e:
    print(e)
