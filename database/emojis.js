const database = include("databaseConnection");

async function getEmojis() {
  let getEmojisSQL = `
		SELECT emoji_id, name, image FROM emoji;
	`;

  try {
    const results = await database.query(getEmojisSQL);
    console.log("Successfully found emojis");
    // console.log(results[0]);
    return results[0];
  } catch (err) {
    console.log("Error trying to find emojis");
    console.log(err);
    return false;
  }
}

async function addEmojiToChat(postData) {
  let addEmojiToChatSQL = `
		INSERT INTO emoji_reactions (message_id, emoji_id, user_id)
    VALUES (:message_id, :emoji_id, :user_id);
	`;

  params = {
    message_id: postData.message_id,
    emoji_id: postData.emoji_id,
    user_id: postData.user_id,
  };

  try {
    const results = await database.query(addEmojiToChatSQL, params);
    console.log("Successfully found emojis");
    // console.log(results[0]);
    return true;
  } catch (err) {
    console.log("Error trying to find emojis");
    console.log(err);
    return false;
  }
}

async function getEmojiReactions(postData) {
  let getEmojiReactionsSQL = `
		SELECT emoji_reactions.message_id, emoji.emoji_id, emoji.image, COUNT(*) as count_emoji
        FROM emoji_reactions
        JOIN emoji ON emoji.emoji_id = emoji_reactions.emoji_id
        WHERE message_id = :message_id and user_id = :user_id
        GROUP BY message_id, emoji_id
	`;

  params = {
    message_id: postData.message_id,
    user_id: postData.user_id,
  };

  try {
    const results = await database.query(getEmojiReactionsSQL, params);
    console.log("Successfully found emoji reactions");
    // console.log(results[0]);
    return results[0];
  } catch (err) {
    console.log("Error trying to find emoji reactions");
    console.log(err);
    return false;
  }
}

module.exports = {
  getEmojis,
  addEmojiToChat,
  getEmojiReactions,
};
