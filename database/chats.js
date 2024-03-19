const database = include("databaseConnection");

async function createChat(postData) {
  let users_ids = postData.users_ids;
  try {
    // Start a transaction
    await database.query(`START TRANSACTION;`);

    // Create the chat
    await database.query(`INSERT INTO room (name) VALUES (:name);`, {
      name: postData.name,
    });

    // Get the id of the chat that was just created
    let lastRoomIdResult = await database.query(
      `SELECT Max(room_id) AS room_id FROM room;`
    );

    // Add the user who created the chat to the room
    await database.query(
      `
      INSERT INTO room_user (user_id, room_id, last_read_message_id)
      SELECT user_id,:lastRoomId, 0
      FROM user
      WHERE username = :username;
    `,
      {
        lastRoomId: lastRoomIdResult[0][0].room_id,
        username: postData.username,
      }
    );

    // Add the other users to the room according to the users_ids array
    if (Array.isArray(users_ids)) {
      for (const userId of users_ids) {
        await database.query(
          `
        INSERT INTO room_user (user_id, room_id, last_read_message_id)
        VALUES (?, ?, 0)
      `,
          [userId, lastRoomIdResult[0][0].room_id]
        );
      }
    } else {
      await database.query(
        `
        INSERT INTO room_user (user_id, room_id, last_read_message_id)
        VALUES (?, ?, 0)
      `,
        [users_ids, lastRoomIdResult[0][0].room_id]
      );
    }

    // Commit the transaction
    await database.query(`COMMIT;`);
    console.log("Successfully created chat");
    return true;
  } catch (err) {
    console.log("Error inserting user");
    console.log(err);
    return false;
  }
}

async function getChatsByUser(postData) {
  let getChatsByUserSQL = `
		SELECT room.name
        FROM room
        JOIN room_user ON room.room_id = room_user.room_id
        JOIN user ON user.user_id = room_user.user_id
        WHERE user.username = :username;
	`;

  let params = {
    username: postData.username,
  };

  try {
    const results = await database.query(getChatsByUserSQL, params);
    console.log("Successfully invoked chats by user");
    return results[0];
  } catch (err) {
    console.log("Error invoking chats");
    console.log(err);
    return false;
  }
}

async function getChatsLastMessageByUser(postData) {
  let getChatsLastMessageByUserSQL = `
  SELECT 
      room.room_id, 
      room.name, 
      user.username, 
      room_user.room_user_id,
      COALESCE(room_user.last_read_message_id, 0) AS last_read_message_id,
      MAX(message.message_id) AS my_last_sent_message,
      COALESCE(max_message.max_message_id, 0) as max_message_id,
      COALESCE(latest_message.sent_datetime, 'No messages') as latest_message_time
  FROM room
  LEFT JOIN room_user ON room.room_id = room_user.room_id
  LEFT JOIN user ON room_user.user_id = user.user_id
  LEFT JOIN message ON room_user.room_user_id = message.room_user_id
  LEFT JOIN (
    SELECT room_user.room_id, room_user.user_id, room_user.room_user_id, message.message_id, message.sent_datetime, message.text
      FROM message
      JOIN (
        SELECT room_id, MAX(message_id) as max_message_id
        FROM message
        JOIN room_user ON message.room_user_id = room_user.room_user_id
        GROUP BY room_id
      ) subquery ON message.message_id = subquery.max_message_id
    JOIN room_user ON message.room_user_id = room_user.room_user_id
  ) latest_message ON room.room_id = latest_message.room_id
  LEFT JOIN( 
    SELECT room_user.room_id, MAX(message_id) as max_message_id
    FROM message
    JOIN room_user ON message.room_user_id = room_user.room_user_id
    GROUP BY room_user.room_id
  )  max_message ON max_message.room_id = room.room_id
  WHERE user.user_id = :user_id
  GROUP BY 
    room.room_id, 
    room.name, 
    user.username,  
    room_user.room_user_id, 
    room_user.last_read_message_id, 
    max_message.max_message_id, 
    latest_message.sent_datetime;
	`;

  let params = {
    user_id: postData.user_id,
  };

  try {
    const results = await database.query(getChatsLastMessageByUserSQL, params);
    console.log("Successfully invoked chats by user");

    return results[0];
  } catch (err) {
    console.log("Error invoking chats");
    console.log(err);
    return false;
  }
}

async function getBehind(postData) {
  let chats_info = postData.chats_info;
  let unreadCounts = [];
  try {
    // Start a transaction
    await database.query(`START TRANSACTION;`);

    // Count the unread messages for each chat
    for (const chat_info of chats_info) {
      let result = await database.query(
        `
        SELECT room_user.room_id, COUNT(*) AS unread_message_count
        FROM message
        JOIN room_user ON message.room_user_id = room_user.room_user_id
        WHERE room_user.room_id = ?
        AND message.message_id > (SELECT last_read_message_id FROM room_user WHERE room_user_id = ?)
        GROUP BY room_user.room_id;
      `,
        [chat_info[0], chat_info[1]]
      );

      unreadCounts.push(result[0]);
    }

    // Commit the transaction
    await database.query(`COMMIT;`);
    console.log("Successfully found unread messages for each chat");

    return unreadCounts;
  } catch (err) {
    console.log("Error finding unread messages for each chat");
    console.log(err);
    return false;
  }
}

async function getChatsNotJoinedSelf(postData) {
  let getChatsNotJoinedSelfSQL = `
    SELECT room.room_id, room.name
    FROM room
    LEFT JOIN room_user ON room.room_id = room_user.room_id AND room_user.user_id = :user_id
    WHERE room_user.user_id IS NULL
    GROUP BY room.room_id, room.name;
	`;

  let params = {
    user_id: postData.user_id,
  };

  try {
    const results = await database.query(getChatsNotJoinedSelfSQL, params);
    console.log("Successfully invoked chats");

    return results[0];
  } catch (err) {
    console.log("Error invoking chats");
    console.log(err);
    return false;
  }
}

async function getChatsByRoom(postData) {
  let getChatsByRoomSQL = `
		SELECT 
        message.sent_datetime,
        message.message_id, 
        message.text, 
        user.user_id, 
        user.profile_img, 
        user.username, 
        room.room_id, 
        room.name,
        room_user.last_read_message_id,
        COALESCE(GROUP_CONCAT(emojireactions.emoji_id), null) AS emoji_ids,
        COALESCE(GROUP_CONCAT(emojireactions.image), null) AS emoji_img,
        COALESCE(GROUP_CONCAT(emojireactions.count_emoji), null) AS count_emoji
    FROM 
        message 
    LEFT JOIN 
        room_user ON message.room_user_id = room_user.room_user_id
    JOIN 
        user ON user.user_id = room_user.user_id
    JOIN 
        room ON room.room_id = room_user.room_id
    LEFT JOIN 
        (SELECT emojireactions.message_id, emoji.emoji_id, emoji.image, COUNT(*) as count_emoji
        FROM emojireactions
        JOIN emoji ON emoji.emoji_id = emojireactions.emoji_id
        GROUP BY message_id, emoji_id
        )
        AS emojireactions ON message.message_id = emojireactions.message_id
    WHERE 
        room.room_id = :room_id
    GROUP BY
        message.sent_datetime,
        message.message_id, 
        message.text, 
        user.user_id, 
        user.profile_img, 
        user.username, 
        room.room_id, 
        room.name,
        room_user.last_read_message_id
    ORDER BY 
        message.sent_datetime ASC;
	`;

  let params = {
    room_id: postData.room_id,
  };

  try {
    const results = await database.query(getChatsByRoomSQL, params);
    console.log("Successfully invoked chats by room");

    return results[0];
  } catch (err) {
    console.log("Error invoking chats by room");
    console.log(err);
    return false;
  }
}

async function getMyLastReadByUserAndRoom(postData) {
  let getMyLastReadByUserAndRoomSQL = `
		SELECT last_read_message_id
    FROM room_user
    WHERE user_id = :user_id AND room_id = :room_id;
	`;

  let params = {
    room_id: postData.room_id,
    user_id: postData.user_id,
  };

  try {
    const results = await database.query(getMyLastReadByUserAndRoomSQL, params);
    console.log("Successfully invoked chats by room");

    return results[0];
  } catch (err) {
    console.log("Error invoking chats by room");
    console.log(err);
    return false;
  }
}

async function addRoomToUser(postData) {
  let rooms_ids = postData.rooms_ids;
  let user_id = postData.user_id;
  console.log("rooms_ids", rooms_ids);

  try {
    // Start a transaction
    await database.query(`START TRANSACTION;`);
    console.log(Array.isArray(rooms_ids));
    // Add the other users to the room
    if (Array.isArray(rooms_ids)) {
      for (const room_id of rooms_ids) {
        await database.query(
          `
        INSERT INTO room_user (user_id, room_id, last_read_message_id)
        VALUES (?, ?, 0)
      `,
          [user_id, room_id]
        );
      }
    } else {
      await database.query(
        `
        INSERT INTO room_user (user_id, room_id, last_read_message_id)
        VALUES (?, ?, 0)
      `,
        [user_id, rooms_ids]
      );
    }

    // Commit the transaction
    await database.query(`COMMIT;`);

    console.log("Successfully added room to user");
    return true;
  } catch (err) {
    console.log("Error adding room to user");
    console.log(err);
    return false;
  }
}

async function addUserToRoom(postData) {
  let users_ids = postData.users_ids;
  let room_id = postData.room_id;
  console.log("users_ids", users_ids);

  try {
    // Start a transaction
    await database.query(`START TRANSACTION;`);

    // Add the other users to the room
    if (Array.isArray(users_ids)) {
      for (const user_id of users_ids) {
        await database.query(
          `
        INSERT INTO room_user (user_id, room_id, last_read_message_id)
        VALUES (?, ?, 0)
      `,
          [user_id, room_id]
        );
      }
    } else {
      await database.query(
        `
        INSERT INTO room_user (user_id, room_id, last_read_message_id)
        VALUES (?, ?, 0)
      `,
        [users_ids, room_id]
      );
    }

    // Commit the transaction
    await database.query(`COMMIT;`);
    console.log("Successfully inviting people to the room");
    return true;
  } catch (err) {
    console.log("Error inviting people to the room");
    console.log(err);
    return false;
  }
}

async function sendMessage(postData) {
  let room_id = postData.room_id;
  let user_id = postData.user_id;
  let text = postData.text;
  let date = new Date();

  try {
    await database.query(`START TRANSACTION;`);

    // Create the chat
    let room_user_id = await database.query(
      `SELECT room_user_id
        FROM room_user
        WHERE user_id = :user_id and room_id = :room_id`,
      {
        room_id: room_id,
        user_id: user_id,
      }
    );

    console.log("room_user_id", room_user_id[0]);

    await database.query(
      `INSERT INTO message (room_user_id, text, sent_datetime) VALUES (:room_user_id, :text, :sent_datetime)`,
      {
        room_user_id: room_user_id[0][0].room_user_id,
        text: text,
        sent_datetime: date,
      }
    );

    await database.query(
      `UPDATE room_user
      SET last_read_message_id = (SELECT MAX(message_id) FROM message WHERE room_user_id = :room_user_id)
      WHERE room_user_id = :room_user_id`,
      {
        room_user_id: room_user_id[0][0].room_user_id,
      }
    );

    // Commit the transaction
    await database.query(`COMMIT;`);
    console.log("Successfully created chat");
    return true;
  } catch (err) {
    console.log("Error creating chat");
    console.log(err);
    return false;
  }
}

async function updateLastReadMessageId(postData) {
  var user_id = postData.user_id;
  var room_id = postData.room_id;
  var message_id = postData.message_id;
  let updateLastReadMessageIdSQL = `
		UPDATE room_user
    JOIN (
        SELECT room_user_id
        FROM room_user
        WHERE user_id = :user_id AND room_id = :room_id
    ) AS subquery
    ON room_user.room_user_id = subquery.room_user_id
    SET room_user.last_read_message_id = :message_id;
	`;

  let params = {
    user_id: user_id,
    room_id: room_id,
    message_id: message_id,
  };

  try {
    const results = await database.query(updateLastReadMessageIdSQL, params);
    console.log("Successfully invoked chats by user");
    // console.log(results[0]);
    return true;
  } catch (err) {
    console.log("Error invoking chats");
    console.log(err);
    return false;
  }
}

module.exports = {
  createChat,
  getChatsByUser,
  getChatsLastMessageByUser,
  getBehind,
  getChatsNotJoinedSelf,
  getChatsByRoom,
  getMyLastReadByUserAndRoom,
  addRoomToUser,
  addUserToRoom,
  sendMessage,
  updateLastReadMessageId,
};
