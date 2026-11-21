"""Check the web payload of an APK against one freshly rendered Hugo tree (Python stdlib)."""

import hashlib, json, re, zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        self.refs.extend(v for k, v in attrs if k in ("src", "href", "poster") and v)


def verify(apk, web):
    base = "https://appassets.androidplatform.net/"
    pre = "assets/atlas/"
    links = 0
    paths = {
        p.relative_to(web).as_posix(): p
        for p in web.rglob("*")
        if p.is_file() and p.name not in (".nojekyll", "CNAME")
    }

    def check(k, v):
        nonlocal links
        if not v or v.startswith(("#", "data:", "blob:", "mailto:", "tel:")):
            return
        u = urlparse(urljoin(base + k, v))
        n = unquote(u.path.lstrip("/"))
        if u.netloc != urlparse(base).netloc:
            return
        if (
            n not in paths
            and (n.rstrip("/") + "/" if n else "") + "index.html" not in paths
        ):
            raise ValueError("Broken local link: " + k + " -> " + v)
        links += 1

    with zipfile.ZipFile(apk) as z:
        if len(z.namelist()) != len(set(z.namelist())) or z.testzip():
            raise ValueError("Damaged APK directory")
        if {n[len(pre) :] for n in z.namelist() if n.startswith(pre)} != set(paths):
            raise ValueError("Embedded file set differs from Hugo output")
        for n, p in sorted(paths.items()):
            b = z.read(pre + n)
            if b != p.read_bytes():
                raise ValueError("Embedded asset differs: " + n)
            if n.endswith(".html"):
                parser = Links()
                parser.feed(b.decode())
                [check(n, x) for x in parser.refs]
            elif n.endswith((".js", ".mjs")):
                for x in re.findall(
                    r"""(?:from\s*|import\s*\(|new URL\(\s*)["'](\.\.?/[^"']+)["']""",
                    b.decode(),
                ):
                    check(n, x)
            elif n.endswith(".css"):
                for _, x in re.findall(
                    r"""url\(\s*(['"]?)([^)'"\s]+)\1\s*\)""", b.decode()
                ):
                    check(n, x)
        for name, baseFile in [
            ("library/sources.json", "library/"),
            ("assets/LICENSES.json", ""),
        ]:
            for art in json.loads(z.read(pre + name))["files"]:
                # The library's downloaded source receipts are immutable. Authored JS may intentionally change.
                if art["file"].endswith(".js"):
                    continue
                if (
                    hashlib.sha256(z.read(pre + baseFile + art["file"])).hexdigest()
                    != art["sha256"]
                ):
                    raise ValueError(
                        "Update the bundled artwork receipt: " + art["file"]
                    )
    return {"verified_web_files": len(paths), "local_links_checked": links}
