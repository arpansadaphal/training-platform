cd /Users/arpan/Documents/code/training-platform

# Remove the trailing Next-ID line so the new entries land above it
python3 - << 'PYEOF'
import re
path = 'docs/DECISIONS.md'
with open(path) as f:
    content = f.read()
# Drop the trailing "*Next ID: ARCH-042...*" line
content = re.sub(r'\n\*Next ID: ARCH-042[^\n]*\n?$', '\n', content)
with open(path, 'w') as f:
    f.write(content)
print("Removed trailing Next-ID line")
PYEOF

cat >> docs/DECISIONS.md << 'DECISIONS_EOF'
