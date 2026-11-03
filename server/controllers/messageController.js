import openai from "../configs/openai.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";

//Max number of chat messages (including the new prompt) sent to the model
const MAX_HISTORY_MESSAGES = 20;

//Convert stored chat messages into the format the chat completions API expects
const toModelMessages = (messages) => {
  const recent = messages.slice(-MAX_HISTORY_MESSAGES);
  //Start on a user turn; the last message is always the new prompt
  const start = recent.findIndex((message) => message.role === "User");

  return recent.slice(start).map((message) => ({
    role: message.role === "User" ? "user" : "assistant",
    //Image replies are stored as URLs, so describe them instead of sending the URL
    content: message.isImage
      ? "[Generated an image for the previous prompt]"
      : message.content,
  }));
};

//Text generation
export const textMessageController = async (req, res) => {
  const userId = req.user._id;
  const { chatId, prompt } = req.body;

  try {
    //check credist
    if (req.user.credits < 1) {
      return res.json({
        success: false,
        message: "You don't have enough credits",
      });
    }
    const chat = await Chat.findOne({ userId, _id: chatId });
    chat.messages.push({
      role: "User",
      content: prompt,
      timestamp: Date.now(),
      isImage: false,
    });

    const { choices } = await openai.chat.completions.create({
      model: "gemini-2.5-flash",
      messages: toModelMessages(chat.messages),
    });

    const reply = {
      ...choices[0].message,
      timestamp: Date.now(),
      isImage: false,
    };

    chat.messages.push(reply);
    await chat.save();
    await User.updateOne({ _id: userId }, { $inc: { credits: -1 } });
    res.json({ success: true, reply });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

//Image generation
export const imageMessageController = async (req, res) => {
  const userId = req.user._id;
  const { prompt, chatId, isPublished } = req.body;

  try {
    //check credits
    if (req.user.credits < 2) {
      return res.json({
        success: false,
        message: "You don't have enough credits",
      });
    }

    const chat = await Chat.findOne({ userId, _id: chatId });
    chat.messages.push({
      role: "User",
      content: prompt,
      timestamp: Date.now(),
      isImage: false,
    });

    //encode the prompt
    const encodedPrompt = encodeURIComponent(prompt);

    //construct imagekit ai generation url
    const generatedImageUrl = `${
      process.env.IMAGEKIT_URL_ENDPOINT
    }/ik-genimg-prompt-${encodedPrompt}/quickgpt/${Date.now()}.png?tr=w-800,h-800`;

    const reply = {
      role: "assistant",
      content: generatedImageUrl,
      timestamp: Date.now(),
      isImage: true,
      isPublished,
    };

    chat.messages.push(reply);
    await chat.save();

    await User.updateOne({ _id: userId }, { $inc: { credits: -2 } });
    res.json({ success: true, reply });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
