console.log("GIVEAWAY RUNNER WORKING");

const db = require("./database/connect");
const processing = new Set();

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

async function getEligibleMembers(client, giveaway) {
  const guild = await client.guilds.fetch(giveaway.guild_id);

  try {
    await guild.members.fetch();
  } catch (err) {
    console.error(
      "❌ GIVEAWAY MEMBERS FETCH ERROR:",
      giveaway.id,
      giveaway.guild_id,
      err?.message || err
    );
  }

  return [...guild.members.cache.values()]
    .filter(member => {
      if (member.user.bot) return false;

      if (giveaway.role_id) {
        return member.roles.cache.has(giveaway.role_id);
      }

      return true;
    })
    .map(member => member.id);
}

async function processPaidMandatoryGiveaway(client, giveaway, users) {
  const fee = Number(giveaway.entry_fee || 0);
  const participants = [];

  for (const userId of users) {
    try {
      const existing = await dbGet(
        `SELECT id
         FROM giveaway_entries
         WHERE giveaway_id=? AND user_id=?`,
        [giveaway.id, userId]
      );

      if (existing) {
        participants.push(userId);
        continue;
      }

      const result = await dbRun(
        `UPDATE users
         SET total_points = total_points - ?
         WHERE guild_id=?
           AND user_id=?
           AND total_points >= ?`,
        [
          fee,
          giveaway.guild_id,
          userId,
          fee
        ]
      );

      if (!result || Number(result.rowCount || 0) < 1) {
        continue;
      }

      const entryResult = await dbRun(
        `INSERT INTO giveaway_entries
         (giveaway_id,user_id,joined_at,paid)
         VALUES (?,?,?,1)
         ON CONFLICT (giveaway_id,user_id) DO NOTHING`,
        [
          giveaway.id,
          userId,
          Date.now()
        ]
      );

      if (!entryResult || Number(entryResult.rowCount || 0) < 1) {
        await dbRun(
          `UPDATE users
           SET total_points = total_points + ?
           WHERE guild_id=? AND user_id=?`,
          [
            fee,
            giveaway.guild_id,
            userId
          ]
        );

        continue;
      }

      participants.push(userId);

    } catch (err) {
      console.error(
        "❌ PAID MANDATORY ENTRY ERROR:",
        giveaway.id,
        userId,
        err.message
      );
    }
  }

  return participants;
}

async function finishGiveaway(client, giveaway, users) {

  if (!users.length) {

    const channel = await client.channels
      .fetch(giveaway.channel_id)
      .catch(() => null);

    if (channel) {
      await channel.send(
`⚠️ **انتهى السحب**

🎁 الجائزة: ${giveaway.prize}

❌ لم يتم العثور على مشاركين مؤهلين.`
      );
    }

    await dbRun(
      `UPDATE giveaways
       SET status='completed'
       WHERE id=?`,
      [giveaway.id]
    );

    return;
  }

  const available = [...new Set(users)];
  const winners = [];

  const winnersCount = Math.max(
    1,
    Number(giveaway.winners_count || 1)
  );

  while (
    winners.length < winnersCount &&
    available.length
  ) {
    const index = Math.floor(
      Math.random() * available.length
    );

    winners.push(available[index]);
    available.splice(index, 1);
  }

  for (const winner of winners) {

    await dbRun(
      `INSERT INTO giveaway_winners
       (giveaway_id,user_id,created_at)
       VALUES (?,?,?)`,
      [
        giveaway.id,
        winner,
        Date.now()
      ]
    );
  }

  const channel = await client.channels
    .fetch(giveaway.channel_id)
    .catch(() => null);

  if (channel?.isTextBased()) {
    try {
      await channel.send(
`🏆 **انتهى السحب**

📌 **${giveaway.name}**

🎁 الجائزة: ${giveaway.prize}

🏆 **الفائزون:**
${winners.map(id => `<@${id}>`).join(", ")}`
      );
    } catch (err) {
      console.error(
        "❌ GIVEAWAY RESULT MESSAGE ERROR:",
        giveaway.id,
        err?.message || err
      );
    }
  }

  await dbRun(
    `UPDATE giveaways
     SET status='completed'
     WHERE id=?`,
    [giveaway.id]
  );

  console.log(
    "🏆 GIVEAWAY FINISHED:",
    giveaway.id,
    "WINNERS:",
    winners.join(", ")
  );
}

module.exports = async function(client) {

  let giveaways;

  try {
    giveaways = await dbAll(
      `SELECT *
       FROM giveaways
       WHERE status='active'
       AND run_at <= ?`,
      [Date.now()]
    );
  } catch (err) {
    console.error("❌ GIVEAWAY LOAD ERROR:", err);
    return;
  }

  for (const giveaway of giveaways) {

    if (processing.has(giveaway.id)) {
      continue;
    }

    processing.add(giveaway.id);

    try {

      let users = [];

      /*
       * ⚡ الإجباري
       * بدون رتبة = كل أعضاء السيرفر
       * مع رتبة = أعضاء الرتبة فقط
       */
      if (giveaway.type === "forced") {

        users = await getEligibleMembers(
          client,
          giveaway
        );

        /*
         * 💰 إجباري برسوم
         * الشروط أولًا، ثم الرصيد، ثم الخصم والتسجيل.
         */
        if (Number(giveaway.entry_fee || 0) > 0) {

          users = await processPaidMandatoryGiveaway(
            client,
            giveaway,
            users
          );

        } else {

          /*
           * إجباري مجاني:
           * يسجل المؤهلين كمشاركين بدون خصم.
           */
          for (const userId of users) {

            await dbRun(
              `INSERT INTO giveaway_entries
               (giveaway_id,user_id,joined_at,paid)
               VALUES (?,?,?,0)
               ON CONFLICT (giveaway_id,user_id) DO NOTHING`,
              [
                giveaway.id,
                userId,
                Date.now()
              ]
            );
          }
        }

      } else {

        /*
         * 🎉 الاختياري
         * نعتمد فقط على الأشخاص الذين ضغطوا مشاركة.
         */
        const entries = await dbAll(
          `SELECT user_id
           FROM giveaway_entries
           WHERE giveaway_id=?`,
          [giveaway.id]
        );

        users = entries.map(row => row.user_id);

        /*
         * إعادة فحص الرتبة قبل السحب.
         */
        if (giveaway.role_id) {

          const guild = await client.guilds
            .fetch(giveaway.guild_id)
            .catch(() => null);

          if (!guild) {
            throw new Error("تعذر الوصول إلى السيرفر");
          }

          const eligible = [];

          for (const userId of users) {

            const member = await guild.members
              .fetch(userId)
              .catch(() => null);

            if (
              member &&
              !member.user.bot &&
              member.roles.cache.has(giveaway.role_id)
            ) {
              eligible.push(userId);
            }
          }

          users = eligible;
        }
      }

      await finishGiveaway(
        client,
        giveaway,
        users
      );

    } catch (err) {

      console.error(
        "❌ GIVEAWAY PROCESS ERROR:",
        giveaway.id,
        err
      );

    } finally {

      processing.delete(giveaway.id);
    }
  }
};
