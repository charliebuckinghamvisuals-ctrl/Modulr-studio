import urllib.request
import re

url = "https://www.greenretreats.co.uk/gallery/"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    images = re.findall(r'<img[^>]+src="([^">]+)"', html)
    valid = [img for img in images if ('jpg' in img or 'jpeg' in img) and 'wp-content' in img and 'nav-' not in img]
    for v in valid[:10]:
        print(v)
except Exception as e:
    print(e)
