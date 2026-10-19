"""Render a real PDF page while protecting supplier identities and contacts."""
import argparse
import io
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    xml = subprocess.check_output([
        "pdftotext", "-f", "2", "-l", "2", "-bbox-layout", str(args.source), "-"
    ])
    root = ET.fromstring(xml)
    ns = {"x": "http://www.w3.org/1999/xhtml"}
    page_xml = root.find(".//x:page", ns)
    height = float(page_xml.attrib["height"])
    width = float(page_xml.attrib["width"])
    page = PdfReader(args.source).pages[1]
    origin_y = float(page.mediabox.bottom)
    overlay = io.BytesIO()
    drawing = canvas.Canvas(overlay, pagesize=(width, height))
    keep = {"Instagram", "Vendas", "Catálogo", "Site", "On-line", *map(str, range(1, 8))}
    protected = 0
    for line in page_xml.findall(".//x:line", ns):
        words = [w for w in line.findall("x:word", ns)
                 if 180 < float(w.attrib["yMin"]) < 1085 and w.text not in keep]
        if not words:
            continue
        left = min(float(w.attrib["xMin"]) for w in words) - 1
        right = max(float(w.attrib["xMax"]) for w in words) + 2
        top = min(float(w.attrib["yMin"]) for w in words) - 1
        bottom = max(float(w.attrib["yMax"]) for w in words) + 1
        drawing.setFillColorRGB(.87, .79, .77)
        drawing.roundRect(left, origin_y + height - bottom, right - left, bottom - top, 3, fill=1, stroke=0)
        protected += 1
    drawing.save()
    page.merge_page(PdfReader(io.BytesIO(overlay.getvalue())).pages[0])
    writer = PdfWriter()
    writer.add_page(page)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="beauty-protected-preview-") as tmp:
        pdf = Path(tmp) / "protected.pdf"
        with pdf.open("wb") as stream:
            writer.write(stream)
        image_base = Path(tmp) / "preview"
        subprocess.run(["pdftoppm", "-singlefile", "-scale-to", "1300", "-png", str(pdf), str(image_base)], check=True)
        subprocess.run(["magick", str(image_base.with_suffix(".png")), "-quality", "88", str(args.output)], check=True)
    if protected < 20:
        raise RuntimeError(f"Unexpected masking coverage: {protected} lines")
    print(f"PASS protected_lines={protected}; output={args.output}; original unchanged")


if __name__ == "__main__":
    main()
