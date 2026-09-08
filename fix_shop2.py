from pathlib import Path
import re

p = Path("src/index.js")
text = p.read_text(encoding="utf-8")

pattern = r'''
\s*db\.run\(
\s*"UPDATE users SET total_points=total_points-\? WHERE guild_id=\? AND user_id=\? AND total_points>=\?",
\s*\[item\.price,\s*guildId,\s*userId,\s*item\.price\],
\s*\(\)=>\{
.*?
\s*\}
\s*\);
'''

text = re.sub(pattern, "", text, flags=re.S | re.X)

p.write_text(text, encoding="utf-8")
print("Done")
