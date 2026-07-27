import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch_category(cat):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:{urllib.parse.quote(cat)}&gcmnamespace=6&gcmlimit=20&prop=imageinfo&iiprop=url&format=json"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req, context=ctx).read().decode('utf-8')
        data = json.loads(response)
        if 'query' in data:
            for page_id, page_info in data['query']['pages'].items():
                if 'imageinfo' in page_info:
                    print(page_info['imageinfo'][0]['url'])
    except Exception as e:
        print(f"Error fetching {cat}: {e}")

import urllib.parse
fetch_category("Garden offices")
fetch_category("Modern summer houses")
fetch_category("Summer houses in the United Kingdom")
fetch_category("Garden studios")
