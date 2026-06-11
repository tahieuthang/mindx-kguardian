import os
from PIL import Image

src_path = "/home/mindx/.gemini/antigravity/brain/968dc17c-cfd0-4d3a-bd94-92f6610d4023/kguardian_logo_1781058232318.png"
dest_dir = "/home/mindx/MindX/MindX-OpsCoPilot/mindx-kguardian/public/icons"

os.makedirs(dest_dir, exist_ok=True)

sizes = [16, 48, 128]

with Image.open(src_path) as img:
    for size in sizes:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        out_path = os.path.join(dest_dir, f"icon{size}.png")
        resized.save(out_path, "PNG")
        print(f"Generated {out_path} ({size}x{size})")
