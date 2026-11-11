import Chat from "../models/Chat.js";
import { isValidObjectIdString } from "../utils/validateId.js";

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
  const { chatId } = req.body || {};

  try {
    if (!isValidObjectIdString(chatId)) {
      return res.status(400).json({
        success: false,
        message: !chatId ? "Chat ID is required" : "Invalid chat ID",
      });
    }

    const result = await Chat.deleteOne({ _id: chatId, userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    res.json({ success: true, message: "Chat Deleted!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
