require("./utils");
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");

//upload profile image
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const uploadDir = path.join(__dirname, "/public/profile");

const bcrypt = require("bcrypt");
const saltRounds = 12;

const database = include("databaseConnection");
const db_utils = include("database/db_utils");
const db_users = include("database/users");
const db_chats = include("database/chats");
const db_emojis = include("database/emojis");
const success = db_utils.printMySQLVersion();

const port = process.env.PORT || 3000;

const app = express();

const expireTime = 1 * 60 * 60 * 1000;

/* secret information section */
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: false }));

var mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@cluster0.9fd4byt.mongodb.net/?retryWrites=true&w=majority`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore, //default is memory store
    saveUninitialized: false,
    resave: true,
  })
);

// Using middleware to pass session data to views
app.use((req, res, next) => {
  res.locals.username = req.session.username;
  next();
});

function isValidSession(req) {
  if (req.session.authenticated) {
    return true;
  }
  return false;
}

function sessionValidation(req, res, next) {
  if (!isValidSession(req)) {
    req.session.destroy();
    res.redirect("/login");
    return;
  } else {
    next();
  }
}

// get method route
// / : root path
app.get("/", async (req, res) => {
  if (!req.session.authenticated) {
    res.render("login");
  } else {
    var chat_results = await db_chats.getChatsLastMessageByUser({
      user_id: req.session.user_id,
    });

    let chats_info = chat_results.map((chat) => [
      chat.room_id,
      chat.room_user_id,
    ]);

    var behind_results = await db_chats.getBehind({
      chats_info: chats_info,
    });

    var room_results = await db_chats.getChatsNotJoinedSelf({
      user_id: req.session.user_id,
    });
    res.render("index", {
      chats: chat_results,
      rooms: room_results,
      behinds: behind_results,
    });
  }
});

// signup : signup path
app.get("/signup", (req, res) => {
  res.render("signup");
});

app.get("/signingUpStart", (req, res) => {
  var missingFields = req.query.missingFields;
  var invalidFields = req.query.invalidPassword;

  if (missingFields) {
    res.render("signup", { missingFields: true });
  } else if (invalidFields) {
    res.render("signup", { invalidFields: true });
  } else {
    res.render("signup");
  }
});

function generateFileName(username, originalName) {
  const uniqueFileName =
    username + "-" + Date.now() + path.extname(originalName);
  return uniqueFileName;
}

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const profileFileName = generateFileName(
      req.body.username,
      file.originalname
    );
    const uploadPath = path.join(uploadDir, profileFileName);
    cb(null, profileFileName);
  },
});
const upload = multer({ storage: storage });

// signingUp
app.post("/signingUp", upload.single("profile"), async (req, res) => {
  var email = req.body.email;
  var username = req.body.username;
  var password = req.body.password;
  var profile = req.file;

  console.log("profile", profile);
  var uploadPath;
  var profileFileName;
  if (profile) {
    profileFileName = profile.filename;
    uploadPath = path.join(uploadDir, profileFileName);
  }
  var hashedPassword = "";

  // if (!email || !username || !password) {
  //   return res.render("signup", { missingFields: true });
  // }

  //password validation >= 10 characters with upper/lower, numbers, symbols
  var regexUpper = /[A-Z]/;
  var regexLower = /[a-z]/;
  var regexNumber = /[0-9]/;
  var regexSymbol = /[$&+,:;=?@#|'<>.^*()%!-]/;

  // Check if password meets requirements
  if (
    password.length >= 10 &&
    regexUpper.test(password) &&
    regexLower.test(password) &&
    regexNumber.test(password) &&
    regexSymbol.test(password)
  ) {
    // when password meets requirements
    bcrypt.hash(password, saltRounds, async (err, hash) => {
      if (err) {
        console.log(err);
        res.redirect("/signup");
      } else {
        hashedPassword = hash;

        // Check if the profile image exists
        if (profile) {
          // Save the file
          fs.writeFileSync(uploadPath, fs.readFileSync(profile.path));
        }
        console.log("profileFileName", profileFileName);
        var success = await db_users.createUser({
          email: email,
          username: username,
          hashedPassword: hashedPassword,
          profile: profile ? profileFileName : null,
        });

        if (success) {
          var results = await db_users.getUsers();
          res.render("login", { users: results });
        } else {
          res.render("errorMessage", { error: "Failed to create user." });
          // return res.render("signup", { invalidPassword: true });
        }
      }
    });
  } else {
    // Password does not meet requirements
    return res.render("signup", { invalidPassword: true });
  }
});

// Login
app.get("/login", (req, res) => {
  res.render("login");
});

// Logging in
app.post("/loggingin", async (req, res) => {
  var username = req.body.username;
  var password = req.body.password;

  var results = await db_users.getUser({
    username: username,
  });
  if (results) {
    if (results.length == 1) {
      //there should only be 1 user in the db that matches
      // if (bcrypt.compareSync(password, results[0].password_hash)) {
      req.session.authenticated = true;
      req.session.username = username;
      req.session.user_id = results[0].user_id;
      req.session.profile_img = results[0].profile_img;
      req.session.cookie.maxAge = expireTime;

      res.redirect("/");
      return;
      // } else {
      //   console.log("invalid password");
      // }
    } else {
      console.log("invalid user");
    }
  } else {
    console.log(
      "invalid number of users matched: " + results.length + " (expected 1)."
    );
    res.redirect("/login");
  }

  res.render("login", { invalidUser: true });
});

// Log out
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// A page that you can give your group a name and
// select from a list of users to add to the group
app.use("/newgroup", sessionValidation);
app.get("/newgroup", async (req, res) => {
  var results = await db_users.getUsersWithoutSelf({
    username: req.session.username,
  });
  console.log("results12", results);
  if (results) {
    res.render("newgroup", { users: results });
  } else {
    res.render("errorMessage", { error: "Failed to get users." });
  }
});

app.use("/creatingGroup", sessionValidation);
app.post("/creatingGroup", async (req, res) => {
  // console.log(req.body.users_ids);
  // console.log(req.body.groupname);

  var results = await db_chats.createChat({
    username: req.session.username,
    name: req.body.name,
    users_ids: req.body.users_ids,
  });

  if (results) {
    res.redirect("/");
  } else {
    res.render("errorMessage", { error: "Failed to get users." });
  }
});

// A list of the messages within that group
app.use("/chat", sessionValidation);
app.get("/chat", async (req, res) => {
  var chats = await db_chats.getChatsByRoom({
    room_id: req.query.room_id,
  });

  var users = await db_users.getUsersNotInRoom({
    room_id: req.query.room_id,
  });

  var last_message = await db_chats.getMyLastReadByUserAndRoom({
    room_id: req.query.room_id,
    user_id: req.session.user_id,
  });

  var emojis = await db_emojis.getEmojis();
  // console.log("emojis", emojis);

  if (chats && users) {
    res.render("chat", {
      chats: chats,
      users: users,
      username: req.session.username,
      room_name: req.query.room_name,
      room_id: req.query.room_id,
      req: req,
      emojis: emojis,
      last_message: last_message[0],
    });
  } else {
    res.render("errorMessage", { error: "Failed to get users." });
  }
});

// A list of the messages within that group
app.use("/markAsRead", sessionValidation);
app.post("/markAsRead", async (req, res) => {
  var message_id = req.body.message_id;
  var room_id = req.body.room_id;
  var user_id = req.session.user_id;

  try {
    await db_chats.updateLastReadMessageId({
      message_id: message_id,
      room_id: room_id,
      user_id: user_id,
    });

    res.status(200).json({});
  } catch (error) {
    console.error("Failed to update unread message:", error);
    // 클라이언트에게 오류 응답 반환
    res.status(500).json({
      error: "Failed to update unread message!",
    });
  }
});

app.use("/chatInviting", sessionValidation);
app.post("/chatInviting", async (req, res) => {
  var success = await db_chats.addUserToRoom({
    room_id: req.body.room_id,
    users_ids: req.body.users_ids,
  });
  if (success) {
    res.redirect(
      "/chat?room_id=" + req.body.room_id + "&room_name=" + req.body.room_name
    );
  } else {
    res.render("errorMessage", { error: "Failed to get users." });
  }
});

app.use("/chatJoining", sessionValidation);
app.post("/chatJoining", async (req, res) => {
  var success = await db_chats.addRoomToUser({
    rooms_ids: req.body.rooms_ids,
    user_id: req.session.user_id,
  });
  if (success) {
    res.redirect("/");
  } else {
    res.render("errorMessage", { error: "Failed to get users." });
  }
});

app.use("/sendingMessage", sessionValidation);
app.post("/sendingMessage", async (req, res) => {
  var text = req.body.text;
  var room_id = req.body.room_id;
  var user_id = req.session.user_id;
  var room_name = req.body.room_name;

  let success = await db_chats.sendMessage({
    room_id: room_id,
    user_id: user_id,
    text: text,
  });

  if (success) {
    res.redirect(
      "/chat?room_id=" + room_id + "&room_name=" + req.body.room_name
    );
  } else {
    res.render("errorMessage", { error: "Failed to get users." });
  }
});

app.use("/addEmoji", sessionValidation);
app.post("/addEmoji", async (req, res) => {
  var message_id = req.body.message_id;
  var emoji_id = req.body.emoji_id;
  var message_id = req.body.message_id;
  var image = req.body.image;
  var room_id = req.body.room_id;
  var room_name = req.body.room_name;
  var emoji_id = req.body.emoji_id;
  console.log(message_id, emoji_id, req.session.user_id);

  let success = await db_emojis.addEmojiToChat({
    message_id: message_id,
    emoji_id: emoji_id,
    user_id: req.session.user_id,
  });

  if (success) {
    res.redirect("/chat?room_id=" + room_id + "&room_name=" + room_name);
  } else {
    res.render("errorMessage", { error: "Failed to get users." });
  }
});

// Serve static files
app.use(express.static(__dirname + "/public"));

//  Catch all other routes and 404s
app.get("*", (req, res) => {
  res.status(404);
  // res.send("Page not found - 404");
  res.render("404");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
