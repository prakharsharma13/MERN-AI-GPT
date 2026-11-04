import Chat from "../models/Chat.js";

//Creating a new chat (or reusing the user's empty one, so empty chats don't pile up)
export const createChat = async (req, res) => {
  const userId = req.user._id;

  try {
    const emptyChat = await Chat.findOne({
      userId,
      "messages.0": { $exists: false },
    }).sort({ updatedAt: -1 });

    if (emptyChat) {
      return res.json({ success: true, message: "Chat reused", chat: emptyChat });
    }

    const chatData = {
      userId,
      messages: [],
      name: "New Chat",
      userName: req.user.name,
    };
    //Return the new chat so the client doesn't have to refetch the whole list
    const chat = await Chat.create(chatData);
    res.json({ success: true, message: "Chat created", chat });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

//Get all chats
export const getChats = async (req, res) => {
  const userId = req.user._id;
  try {
    const chats = await Chat.find({ userId }).sort({ updatedAt: -1 });

    res.json({ success: true, chats });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

//Delete a chat
export const deleteChat = async (req, res) => {
  const userId = req.user._id;
  const { chatId } = req.body;

  try {
    await Chat.deleteOne({ _id: chatId, userId });

    res.json({ success: true, message: "Chat Deleted!" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
