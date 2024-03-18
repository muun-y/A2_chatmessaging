const database = include("databaseConnection");

async function createUser(postData) {
  let createUserSQL = `
		INSERT INTO user
		(email, username, password_hash, profile_img)
		VALUES
		(:email, :username, :hashedPassword, :profile);
	`;

  let params = {
    email: postData.email,
    username: postData.username,
    hashedPassword: postData.hashedPassword,
    profile: postData.profile,
  };

  try {
    const results = await database.query(createUserSQL, params);

    console.log("Successfully created user");
    console.log(results[0]);
    return true;
  } catch (err) {
    console.log("Error inserting user");
    console.log(err);
    return false;
  }
}

async function getUsers(postData) {
  let getUsersSQL = `
		SELECT username, password_hash
		FROM user;
	`;

  try {
    const results = await database.query(getUsersSQL);

    console.log("Successfully retrieved users");
    console.log(results[0]);
    return results[0];
  } catch (err) {
    console.log("Error getting users");
    console.log(err);
    return false;
  }
}

async function getUsersWithoutSelf(postData) {
  // console.log(postData.username, "postData.username");
  let getUsersWithoutSelfSQL = `
		SELECT user_id, username
		FROM user 
    WHERE username != :username;
	`;

  let params = {
    username: postData.username,
  };

  try {
    const results = await database.query(getUsersWithoutSelfSQL, params);

    console.log("Successfully retrieved users");
    console.log(results[0]);
    return results[0];
  } catch (err) {
    console.log("Error getting users");
    console.log(err);
    return false;
  }
}

async function getUser(postData) {
  let getUserSQL = `
		SELECT user_id, username, profile_img, password_hash
    FROM user
		WHERE username = :username;
	`;

  let params = {
    username: postData.username,
  };

  try {
    const results = await database.query(getUserSQL, params);
    console.log("Successfully found user");
    console.log(results[0]);
    return results[0];
  } catch (err) {
    console.log("Error trying to find user");
    console.log(err);
    return false;
  }
}

async function getUsersNotInRoom(postData) {
  let getUsersNotInRoomSQL = `
		SELECT user.user_id, user.username
    FROM user
    WHERE user.username NOT IN (
        SELECT user.username
        FROM user
        JOIN room_user ON user.user_id = room_user.user_id
        JOIN room ON room_user.room_id = room.room_id
        WHERE room.room_id = :room_id
    );
	`;

  let params = {
    room_id: postData.room_id,
  };

  try {
    const results = await database.query(getUsersNotInRoomSQL, params);
    console.log("Successfully found users not in the room");
    console.log(results[0]);
    return results[0];
  } catch (err) {
    console.log("Error trying to find user not in the room");
    console.log(err);
    return false;
  }
}

module.exports = {
  createUser,
  getUsers,
  getUser,
  getUsersWithoutSelf,
  getUsersNotInRoom,
};
