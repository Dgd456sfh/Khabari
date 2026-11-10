
from pathlib import Path
import re

file = Path("lib/catalog.ts")


backup = Path("lib/catalog.ts.encoding-backup")
backup.write_bytes(file.read_bytes())

text = file.read_text(encoding="utf-8")


pattern = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'')
markers = ("à¤", "à¥", "â€”", "Ã", "Â")

fixed_count = 0

def repair(match):
    global fixed_count
    value = match.group(0)

    if not any(marker in value for marker in markers):
        return value

    try:
        repaired = value.encode("cp1252").decode("utf-8")
        if repaired != value:
            fixed_count += 1
        return repaired
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value

result = pattern.sub(repair, text)

file.write_text(result, encoding="utf-8")

print("Encoding repair completed.")
print("Strings repaired:", fixed_count)
print("Backup saved:", backup)
