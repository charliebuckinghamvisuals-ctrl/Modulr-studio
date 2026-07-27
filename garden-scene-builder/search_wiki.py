import urllib.request
import json
import ssl
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def search(query):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url&format=json"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req, context=ctx).read().decode('utf-8')
    data = json.loads(response)
    if 'query' in data:
        for page_id, page_info in data['query']['pages'].items():
            if 'imageinfo' in page_info:
                print(page_info['imageinfo'][0]['url'])

import urllib.parse
search("modern summer house")
search("garden studio")
search("wooden cladding building")
