const db = require("../database/connect");

function parseArray(value) {
  if (!value) return [];

  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function checkCommandSettings({
  guildId,
  commandName,
  channelId,
  member
}) {
  const settings = await db.get(
    `SELECT *
     FROM command_settings
     WHERE guild_id = ? AND command_name = ?`,
    [guildId, commandName]
  );

  // لا توجد إعدادات = الأمر مسموح بشكل طبيعي
  if (!settings) {
    return {
      allowed: true
    };
  }

  const enabledChannels = parseArray(settings.enabled_channels);
  const disabledChannels = parseArray(settings.disabled_channels);
  const allowedRoles = parseArray(settings.allowed_roles);
  const blockedRoles = parseArray(settings.blocked_roles);

  // ==========================================
  // 🚫 الروم المحجوب دائماً يمنع الأمر
  // ==========================================
  if (disabledChannels.includes(channelId)) {
    return {
      allowed: false,
      reason: "هذا الأمر محجوب في هذه القناة."
    };
  }

  // ==========================================
  // 🟢 إذا تم تحديد رومات مفعلة
  // لازم يكون المستخدم داخل واحدة منها
  // ==========================================
  if (
    enabledChannels.length > 0 &&
    !enabledChannels.includes(channelId)
  ) {
    return {
      allowed: false,
      reason: "هذا الأمر غير متاح في هذه القناة."
    };
  }

  const roleIds = member
    ? [...member.roles.cache.keys()]
    : [];

  // ==========================================
  // 🚫 رول محجوب = منع مباشر
  // ==========================================
  if (
    blockedRoles.length > 0 &&
    blockedRoles.some(roleId => roleIds.includes(roleId))
  ) {
    return {
      allowed: false,
      reason: "لا تملك رتبة مسموح لها باستخدام هذا الأمر."
    };
  }

  // ==========================================
  // 👤 إذا تم تحديد رولات مسموحة
  // لازم يملك واحدة منها
  // ==========================================
  if (
    allowedRoles.length > 0 &&
    !allowedRoles.some(roleId => roleIds.includes(roleId))
  ) {
    return {
      allowed: false,
      reason: "رتبتك غير مسموح لها باستخدام هذا الأمر."
    };
  }

  return {
    allowed: true
  };
}

module.exports = checkCommandSettings;
