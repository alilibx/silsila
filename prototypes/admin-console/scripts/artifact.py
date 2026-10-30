"""Turns the single-file build into the fragment the artifact page expects."""
import re

html = open("dist/index.html", encoding="utf8").read()
head = re.search(r"<head>(.*)</head>", html, re.S).group(1)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
head = re.sub(r'<meta charset="UTF-8" />\s*', "", head)
head = re.sub(r'<meta name="viewport"[^>]*/>\s*', "", head)
meta = '<meta name="claude:viewport-fit-sides" content="cover">\n'
title = re.search(r"<title>.*?</title>", head).group(0)
head = meta + title + "\n" + head.replace(title, "")
open("dist/wirdak-admin-console.html", "w", encoding="utf8").write(head + "\n" + body)
