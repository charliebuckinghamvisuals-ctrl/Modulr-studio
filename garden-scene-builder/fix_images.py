import re

with open('src/config/images.ts', 'r') as f:
    content = f.read()

# Replace local paths with Unsplash placeholders so it's not a broken image
content = content.replace('"/material_image_2.png"', '"https://images.unsplash.com/photo-1510627498534-fcb472e3ea8b?auto=format&fit=crop&w=2800&q=80"')
content = content.replace('"/napc_advice.jpg"', '"https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=2800&q=80"')
content = content.replace('"/3d_config.png"', '"https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2800&q=80"')

with open('src/config/images.ts', 'w') as f:
    f.write(content)
