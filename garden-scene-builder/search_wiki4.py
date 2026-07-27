import urllib.request
import json

url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=cedar%20wood%20texture&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url&format=json"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
response = urllib.request.urlopen(req).read().decode('utf-8')
data = json.loads(response)

for page_id, page_info in data['query']['pages'].items():
    if 'imageinfo' in page_info:
        print(page_info['imageinfo'][0]['url'])

