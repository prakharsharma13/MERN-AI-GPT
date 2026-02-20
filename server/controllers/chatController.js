import Chat from "../models/Chat.js";

//Creating a new chat
export const createChat = async (req, res) => {
    const userId = req.user._id;

    try {
        const chatData = {
            userId,
            messages: [],
            name: "New Chat",
            userName: req.user.name,
        };
        await Chat.create(chatData);
        res.json({ success: true, message: "Chat created" });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
};

//Get all chats
export const getChats = async (req, res) => {
    const userId = req.user._id;
    try {
        const chats = await Chat.find({ userId }).sort({ updatedAt: -1 });

        res.json({ success: true, chats });
    } catch (error) {
        res.json({ success: false, error: error.message });
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
        res.json({ success: false, error: error.message });
    }
};
