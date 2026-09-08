from pathlib import Path

p = Path("src/index.js")
text = p.read_text(encoding="utf-8")

old = '''db.run(
            "UPDATE users SET total_points=total_points-? WHERE guild_id=? AND user_id=? AND total_points>=?",
            [item.price, guildId, userId, item.price],
            ()=>{
              if(item.stock > 0){
                db.run(
                  "UPDATE shop_items SET stock=stock-1 WHERE id=?",
                  [item.id]
                );
              }
            }
          );
'''

text = text.replace(old, "")

p.write_text(text, encoding="utf-8")
print("Done")
