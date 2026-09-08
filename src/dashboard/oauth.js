const express = require("express");

const router = express.Router();

const DISCORD_API = "https://discord.com/api/v10";

async function discordRequest(url, options = {}) {
  const response = await fetch(DISCORD_API + url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Discord API error ${response.status}`);
  }

  return data;
}

function getRedirectUri(req) {
  const host = String(req.get("host") || "").toLowerCase();

  if (host.includes("app.github.dev")) {
    return process.env.CODESPACES_REDIRECT_URI;
  }

  if (host.includes("nexora-mbot.duckdns.org")) {
    return process.env.HOST_REDIRECT_URI;
  }

  if (host.startsWith("78.154.103.14")) {
    return process.env.HOST_REDIRECT_URI;
  }

  return process.env.CODESPACES_REDIRECT_URI;
}

// بدء تسجيل الدخول عبر Discord
router.get("/auth/discord", (req, res) => {
  const redirectUri = getRedirectUri(req);

  if (!redirectUri) {
    console.error("❌ OAuth REDIRECT URI غير مضبوط");
    return res.status(500).send("❌ إعدادات تسجيل الدخول غير مكتملة.");
  }

  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds"
  });

  res.redirect(
    `https://discord.com/oauth2/authorize?${params.toString()}`
  );
});

// Discord يرجع المستخدم لهنا
router.get("/auth/discord/callback", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("❌ لم يتم استلام كود تسجيل الدخول.");
    }

    const redirectUri = getRedirectUri(req);

    if (!redirectUri) {
      return res.status(500).send("❌ إعدادات OAuth غير مكتملة.");
    }

    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      })
    });

    const token = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("DISCORD TOKEN ERROR:", token);
      return res.status(401).send("❌ فشل تسجيل الدخول عبر Discord.");
    }

    const user = await discordRequest("/users/@me", {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    req.session.regenerate(err => {
      if (err) {
        console.error("SESSION ERROR:", err);
        return res.status(500).send("❌ حدث خطأ في الجلسة.");
      }

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.accessToken = token.access_token;
      req.session.refreshToken = token.refresh_token;
      req.session.lastActivity = Date.now();

      req.session.save(saveErr => {
        if (saveErr) {
          console.error("SESSION SAVE ERROR:", saveErr);
          return res.status(500).send("❌ حدث خطأ أثناء حفظ الجلسة.");
        }

        res.redirect("/");
      });
    });

  } catch (err) {
    console.error("DISCORD OAUTH ERROR:", err);
    res.status(500).send("❌ حدث خطأ أثناء تسجيل الدخول.");
  }
});

module.exports = router;
