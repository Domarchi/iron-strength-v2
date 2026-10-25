"""Comprueba una captura UI nativa; no modifica el dispositivo ni datos."""
import argparse
import re
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument("hierarchy")
parser.add_argument("--top-inset", type=int, required=True)
args = parser.parse_args()
if args.top_inset <= 0:
    parser.error("Indica el área superior medida del dispositivo en píxeles")
root = ET.parse(args.hierarchy)
pages = [node for node in root.iter("node") if node.get("resource-id") == "app-page"]
assert len(pages) == 1, "Debe existir una única página visible"
bounds = list(map(int, re.findall(r"\d+", pages[0].get("bounds", ""))))
assert len(bounds) == 4, "No se pudieron leer los límites de la página"
assert bounds[1] >= args.top_inset, (
    f"La vista desplazable comienza en {bounds[1]} px, dentro del área segura de {args.top_inset} px"
)
print(f"Vista desplazable desde {bounds[1]} px; área superior respetada")
