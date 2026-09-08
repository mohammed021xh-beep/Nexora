const db = require("../database/connect");

const timers = new Map();

async function getSettings(guildId) {
  return await db.get(
    `SELECT voice_enabled, voice_points, voice_interval
     FROM settings
     WHERE guild_id=?`,
    [guildId]
  );
}

async function ensureUser(guildId, userId) {
  await db.run(
    `INSERT INTO users
      (
        guild_id,
        user_id,
        voice_points,
        total_points,
        last_voice,
        voice_started_at,
        voice_accumulated,
        voice_interval_minutes
      )
     VALUES (?, ?, 0, 0, 0, 0, 0, 0)
     ON CONFLICT (guild_id, user_id) DO NOTHING`,
    [guildId, userId]
  );
}

async function resetVoiceSession(
  guildId,
  userId,
  intervalMinutes,
  reason
) {
  const now = Date.now();

  await db.run(
    `UPDATE users
     SET
       voice_started_at=?,
       voice_accumulated=0,
       voice_interval_minutes=?
     WHERE guild_id=? AND user_id=?`,
    [now, intervalMinutes, guildId, userId]
  );

  console.log(
    "🎙️ VOICE SESSION RESET",
    userId,
    `EVERY ${intervalMinutes} MIN`,
    reason || ""
  );
}

async function startVoiceTimer(member) {
  if (!member || member.user.bot) return;

  const guildId = member.guild.id;
  const userId = member.id;
  const timerKey = `${guildId}:${userId}`;

  const settings = await getSettings(guildId);

  if (!settings || Number(settings.voice_enabled) !== 1) return;

  const intervalMinutes =
    Number(settings.voice_interval || 0);

  if (intervalMinutes <= 0) {
    console.log(
      "🎙️ VOICE INVALID INTERVAL",
      guildId,
      settings.voice_interval
    );
    return;
  }

  await ensureUser(guildId, userId);

  const user = await db.get(
    `SELECT
       voice_started_at,
       voice_accumulated,
       voice_interval_minutes
     FROM users
     WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );

  if (!user) return;

  const savedInterval =
    Number(user.voice_interval_minutes || 0);

  const startedAt =
    Number(user.voice_started_at || 0);

  if (
    savedInterval > 0 &&
    savedInterval !== intervalMinutes
  ) {
    await resetVoiceSession(
      guildId,
      userId,
      intervalMinutes,
      `${savedInterval} -> ${intervalMinutes} MIN`
    );
  } else if (savedInterval === 0) {
    await resetVoiceSession(
      guildId,
      userId,
      intervalMinutes,
      "INITIAL"
    );
  } else if (startedAt === 0) {
    await db.run(
      `UPDATE users
       SET voice_started_at=?
       WHERE guild_id=? AND user_id=?`,
      [Date.now(), guildId, userId]
    );

    console.log(
      "🎙️ VOICE SESSION STARTED",
      userId,
      `EVERY ${intervalMinutes} MIN`
    );
  } else {
    console.log(
      "🎙️ VOICE SESSION RESUMED",
      userId,
      `EVERY ${intervalMinutes} MIN`
    );
  }

  if (timers.has(timerKey)) return;

  const timer = setInterval(async () => {
    try {
      const currentSettings = await getSettings(guildId);

      if (
        !currentSettings ||
        Number(currentSettings.voice_enabled) !== 1
      ) {
        clearInterval(timer);
        timers.delete(timerKey);
        return;
      }

      const currentMember =
        member.guild.members.cache.get(userId);

      if (
        !currentMember ||
        !currentMember.voice.channel
      ) {
        clearInterval(timer);
        timers.delete(timerKey);

        console.log(
          "🎙️ VOICE TIMER PAUSED",
          userId
        );

        return;
      }

      const current = await db.get(
        `SELECT
           voice_started_at,
           voice_accumulated,
           voice_interval_minutes
         FROM users
         WHERE guild_id=? AND user_id=?`,
        [guildId, userId]
      );

      if (!current) return;

      const currentInterval =
        Number(currentSettings.voice_interval || 0);

      if (currentInterval <= 0) {
        clearInterval(timer);
        timers.delete(timerKey);
        return;
      }

      const savedInterval =
        Number(current.voice_interval_minutes || 0);

      if (
        savedInterval > 0 &&
        savedInterval !== currentInterval
      ) {
        await resetVoiceSession(
          guildId,
          userId,
          currentInterval,
          `${savedInterval} -> ${currentInterval} MIN`
        );

        return;
      }

      if (savedInterval === 0) {
        await resetVoiceSession(
          guildId,
          userId,
          currentInterval,
          "INITIALIZED"
        );

        return;
      }

      const startedAt =
        Number(current.voice_started_at || 0);

      const accumulated =
        Number(current.voice_accumulated || 0);

      if (startedAt === 0) {
        await db.run(
          `UPDATE users
           SET voice_started_at=?
           WHERE guild_id=? AND user_id=?`,
          [Date.now(), guildId, userId]
        );

        console.log(
          "🎙️ VOICE SESSION STARTED",
          userId,
          `EVERY ${currentInterval} MIN`
        );

        return;
      }

      const now = Date.now();

      const elapsedMs =
        now - startedAt;

      const totalVoiceMs =
        accumulated + elapsedMs;

      const intervalMs =
        currentInterval * 60 * 1000;

      if (totalVoiceMs < intervalMs) {
        return;
      }

      const voicePoints =
        Number(currentSettings.voice_points || 1);

      const pointsToAdd =
        Math.floor(totalVoiceMs / intervalMs);

      const totalPoints =
        pointsToAdd * voicePoints;

      const remainingMs =
        totalVoiceMs -
        (pointsToAdd * intervalMs);

      await db.run(
        `UPDATE users
         SET
           voice_points = voice_points + ?,
           total_points = total_points + ?,
           last_voice = ?,
           voice_started_at = ?,
           voice_accumulated = ?
         WHERE guild_id=? AND user_id=?`,
        [
          totalPoints,
          totalPoints,
          now,
          now,
          remainingMs,
          guildId,
          userId
        ]
      );

      console.log(
        "🎙️ VOICE POINT ADDED",
        userId,
        `+${totalPoints}`,
        `REMAINING ${Math.floor(remainingMs / 1000)} SEC`
      );

    } catch (err) {
      console.error(
        "VOICE TIMER ERROR:",
        err
      );
    }
  }, 10 * 1000);

  timers.set(timerKey, timer);
}

async function stopVoiceTimer(member) {
  if (!member || member.user.bot) return;

  const guildId = member.guild.id;
  const userId = member.id;
  const timerKey = `${guildId}:${userId}`;

  try {
    const user = await db.get(
      `SELECT
         voice_started_at,
         voice_accumulated
       FROM users
       WHERE guild_id=? AND user_id=?`,
      [guildId, userId]
    );

    if (
      user &&
      Number(user.voice_started_at || 0) > 0
    ) {
      const now = Date.now();

      const startedAt =
        Number(user.voice_started_at);

      const accumulated =
        Number(user.voice_accumulated || 0);

      const sessionMs =
        now - startedAt;

      const totalAccumulated =
        accumulated + sessionMs;

      await db.run(
        `UPDATE users
         SET
           voice_accumulated=?,
           voice_started_at=0
         WHERE guild_id=? AND user_id=?`,
        [
          totalAccumulated,
          guildId,
          userId
        ]
      );

      console.log(
        "🎙️ VOICE TIME SAVED",
        userId,
        `${Math.floor(totalAccumulated / 1000)} SEC`
      );
    }

  } catch (err) {
    console.error(
      "VOICE SAVE ERROR:",
      err
    );
  }

  if (timers.has(timerKey)) {
    clearInterval(timers.get(timerKey));
    timers.delete(timerKey);
  }

  console.log(
    "VOICE TIMER STOPPED",
    userId
  );
}

module.exports = {
  name: "voiceStateUpdate",

  startVoiceTimer,

  execute(oldState, newState) {
    const member =
      newState.member || oldState.member;

    if (!member || member.user.bot) return;

    if (newState.channel && !oldState.channel) {
      console.log(
        "🎙️ VOICE JOIN:",
        member.user.tag,
        `(${member.id})`,
        "CHANNEL:",
        newState.channel.name || newState.channel.id
      );

      startVoiceTimer(member);
      return;
    }

    if (!newState.channel && oldState.channel) {
      console.log(
        "🎙️ VOICE LEAVE:",
        member.user.tag,
        `(${member.id})`,
        "FROM:",
        oldState.channel?.name || oldState.channel?.id
      );

      stopVoiceTimer(member);
      return;
    }

    if (
      oldState.channel &&
      newState.channel &&
      oldState.channel.id !== newState.channel.id
    ) {
      console.log(
        "🎙️ VOICE MOVE:",
        member.user.tag,
        `(${member.id})`,
        "FROM:",
        oldState.channel.name || oldState.channel.id,
        "TO:",
        newState.channel.name || newState.channel.id
      );

      startVoiceTimer(member);
    }
  }
};
