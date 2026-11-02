"""Builds a single-file preview of the app (demo mode) for sharing as a Claude artifact.
Usage: python3 tools/make-preview.py OUT.html"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text()
shared = (root / "shared.js").read_text()
html = re.sub(r"<!DOCTYPE html>\s*<html[^>]*>\s*<head>\s*", "", html)
html = re.sub(r'<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*', "", html)
html = re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\s*', "", html)
html = re.sub(r'<meta name="(theme-color|apple-[^"]*|mobile-web-app-capable)"[^>]*>\s*', "", html)
html = html.replace("</head>\n<body>\n", "").replace("</body>\n</html>\n", "")
html = re.sub(r"<script src=\"shared.js[^\"]*\"></script>", lambda m: "<script>\n" + shared + "\n</script>", html)
pathlib.Path(sys.argv[1]).write_text(html)
