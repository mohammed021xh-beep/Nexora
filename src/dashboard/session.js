const session = require("express-session");

module.exports = session({
  secret: process.env.SESSION_SECRET || "md-points-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,

  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: null
  }
});
