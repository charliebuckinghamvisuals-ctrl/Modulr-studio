import urllib.request
import re

url = "https://html.duckduckgo.com/html/?q=site:unsplash.com+%22backyard+office%22+OR+%22garden+room%22+OR+%22modern+shed%22"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    links = re.findall(r'href="([^"]+)"', html)
    for link in links:
        if 'unsplash.com/photos' in link:
            # DuckDuckGo wraps links, extract the actual unsplash URL
            actual = urllib.parse.unquote(link)
            m = re.search(r'(https://unsplash.com/photos/[a-zA-Z0-9\-]+)', actual)
            if m:
                print(m.group(1))
except Exception as e:
    print(e)
