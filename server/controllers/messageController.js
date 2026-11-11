import mongoose from "mongoose";
import openai from "../configs/openai.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";

//Max number of chat messages (including the new prompt) sent to the model
const MAX_HISTORY_MESSAGES = 20;
const IMAGE_CREDIT_COST = 2;
const IMAGE_PROBE_TIMEOUT_MS = 10000;
const IMAGE_GENERATION_DEADLINE_MS = 180000;

//Convert stored chat messages into the format the chat completions API expects
const toModelMessages = (messages) => {
  const recent = messages.slice(-MAX_HISTORY_MESSAGES);
  //Start on a user turn; the last message is always the new prompt
  const start = recent.findIndex((message) => message.role === "User");

  return recent.slice(start).map((message) => {
    let content = message.content;
    if (message.isImage) {
      if (message.imageStatus === "failed") {
        content = "[Image generation failed for the previous prompt]";
      } else if (message.imageStatus === "generating") {
        content = "[Generating an image for the previous prompt]";
      } else {
        //Image replies are stored as URLs, so describe them instead of sending the URL
        content = "[Generated an image for the previous prompt]";
      }
    }
    return {
      role: message.role === "User" ? "user" : "assistant",
      content,
    };
  });
};

const getImageKitEndpoint = () => {
  const raw = process.env.IMAGEKIT_URL_ENDPOINT?.trim().replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
};

//Probe an ImageKit generation URL once to check whether it is ready, still generating, or failed
const probeImageUrl = async (url) => {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(IMAGE_PROBE_TIMEOUT_MS),
  });

  if (res.ok) {
    const contentType = res.headers.get("content-type") || "";
    const contentLength = res.headers.get("content-length");
    await res.body?.cancel().catch(() => {});

    if (contentType.startsWith("image/") && contentLength !== "0") {
      return { status: "ready" };
    }
    return { status: "generating" };
  }

  const body = (await res.text().catch(() => "")).trim();
  return {
    status: "failed",
    error: body || `Image service returned ${res.status}`,
  };
};

const refundImageCredits = (userId) =>
  User.findByIdAndUpdate(
    userId,
    { $inc: { credits: IMAGE_CREDIT_COST } },
    { new: true },
  );

const findSubmessage = (chat, messageId) =>
  chat?.messages?.id?.(messageId) ??
  chat?.messages?.find((m) => String(m._id) === String(messageId));

//Fetch the authoritative settled state when a concurrent request won the transition race
const readSettledImageState = async ({
  chatObjectId,
  userId,
  messageObjectId,
  fallbackStatus,
  fallbackError,
}) => {
  const [currentChat, currentUser] = await Promise.all([
    Chat.findOne({ _id: chatObjectId, userId }),
    User.findById(userId),
  ]);
  const currentMessage = findSubmessage(currentChat, messageObjectId);
  return {
    status: currentMessage?.imageStatus || fallbackStatus,
    error: currentMessage?.imageError ?? fallbackError,
    credits: currentUser?.credits,
  };
};

//Atomically transition an image message from "generating" to "failed" and refund 2 credits once
const failImageAndRefund = async ({
  chatId,
  userId,
  messageId,
  errorMessage,
}) => {
  const chatObjectId = new mongoose.Types.ObjectId(chatId);
  const messageObjectId = new mongoose.Types.ObjectId(messageId);

  const updatedChat = await Chat.findOneAndUpdate(
    {
      _id: chatObjectId,
      userId,
      messages: {
        $elemMatch: {
          _id: messageObjectId,
          imageStatus: "generating",
        },
      },
    },
    {
      $set: {
        "messages.$.imageStatus": "failed",
        "messages.$.imageError": errorMessage,
      },
    },
    { new: true },
  );

  if (!updatedChat) {
    //Another request already settled this message; return its current state without refunding twice
    return readSettledImageState({
      chatObjectId,
      userId,
      messageObjectId,
      fallbackStatus: "failed",
      fallbackError: errorMessage,
    });
  }

  try {
    const refundedUser = await refundImageCredits(userId);
    return {
      status: "failed",
      error: errorMessage,
      credits: refundedUser?.credits,
    };
  } catch (error) {
    //Release the failed claim so a retry can still refund the credits
    await Chat.updateOne(
      {
        _id: chatObjectId,
        userId,
        messages: {
          $elemMatch: {
            _id: messageObjectId,
            imageStatus: "failed",
          },
        },
      },
      {
        $set: { "messages.$.imageStatus": "generating" },
        $unset: { "messages.$.imageError": "" },
      },
    ).catch(() => {});
    throw error;
  }
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
  let creditsReserved = false;

  try {
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.json({ success: false, message: "Prompt is required" });
    }

    const endpoint = getImageKitEndpoint();
    if (!endpoint) {
      return res.json({
        success: false,
        message: "Image service is not configured",
      });
    }

    if (!mongoose.isValidObjectId(chatId)) {
      return res.json({ success: false, message: "Chat not found" });
    }

    const chat = await Chat.findOne({ userId, _id: chatId });
    if (!chat) {
      return res.json({ success: false, message: "Chat not found" });
    }

    //Atomically reserve 2 credits so concurrent requests cannot double-spend
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, credits: { $gte: IMAGE_CREDIT_COST } },
      { $inc: { credits: -IMAGE_CREDIT_COST } },
      { new: true },
    );
    if (!updatedUser) {
      return res.json({
        success: false,
        message: "You don't have enough credits",
      });
    }
    creditsReserved = true;

    //encode the prompt
    const encodedPrompt = encodeURIComponent(prompt);

    //construct imagekit ai generation url
    const generatedImageUrl = `${endpoint}/ik-genimg-prompt-${encodedPrompt}/quickgpt/${Date.now()}.png?tr=w-800,h-800`;

    //Trigger generation and reject immediate failures (e.g. 403 quota) before saving or charging
    let probe;
    try {
      probe = await probeImageUrl(generatedImageUrl);
    } catch (probeError) {
      probe = {
        status: "failed",
        error:
          probeError.name === "TimeoutError"
            ? "Image service timed out. Please try again."
            : probeError.message || "Failed to connect to image service",
      };
    }

    if (probe.status === "failed") {
      await refundImageCredits(userId);
      creditsReserved = false;
      return res.json({ success: false, message: probe.error });
    }

    const now = Date.now();
    chat.messages.push(
      {
        role: "User",
        content: prompt,
        timestamp: now,
        isImage: false,
      },
      {
        role: "assistant",
        content: generatedImageUrl,
        timestamp: now,
        isImage: true,
        isPublished: Boolean(isPublished),
        imageStatus: probe.status,
      },
    );

    await chat.save();
    creditsReserved = false;

    const reply = chat.messages[chat.messages.length - 1];
    res.json({ success: true, reply, credits: updatedUser.credits });
  } catch (error) {
    if (creditsReserved) {
      await refundImageCredits(userId).catch((refundError) => {
        console.error("Failed to refund reserved image credits:", refundError);
      });
    }
    res.json({ success: false, message: error.message });
  }
};

//Check async ImageKit generation progress and refund reserved credits if generation fails
export const imageStatusController = async (req, res) => {
  const userId = req.user._id;
  const { chatId, messageId } = req.body;

  try {
    if (
      !mongoose.isValidObjectId(chatId) ||
      !mongoose.isValidObjectId(messageId)
    ) {
      return res.json({
        success: false,
        notFound: true,
        message: "Image message not found",
      });
    }

    const chatObjectId = new mongoose.Types.ObjectId(chatId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    const chat = await Chat.findOne({ _id: chatObjectId, userId });
    const message = findSubmessage(chat, messageObjectId);
    if (!message || !message.isImage) {
      return res.json({
        success: false,
        notFound: true,
        message: "Image message not found",
      });
    }

    if (message.imageStatus !== "generating") {
      return res.json({
        success: true,
        status: message.imageStatus || "ready",
        error: message.imageError,
        credits: req.user.credits,
      });
    }

    let probe;
    try {
      probe = await probeImageUrl(message.content);
    } catch {
      probe = { status: "generating" };
    }

    if (probe.status === "ready") {
      const updatedChat = await Chat.findOneAndUpdate(
        {
          _id: chatObjectId,
          userId,
          messages: {
            $elemMatch: {
              _id: messageObjectId,
              imageStatus: "generating",
            },
          },
        },
        { $set: { "messages.$.imageStatus": "ready" } },
        { new: true },
      );

      if (!updatedChat) {
        const settled = await readSettledImageState({
          chatObjectId,
          userId,
          messageObjectId,
          fallbackStatus: "ready",
        });
        return res.json({ success: true, ...settled });
      }

      return res.json({
        success: true,
        status: "ready",
        credits: req.user.credits,
      });
    }

    if (probe.status === "failed") {
      const result = await failImageAndRefund({
        chatId,
        userId,
        messageId,
        errorMessage: probe.error,
      });
      return res.json({ success: true, ...result });
    }

    const elapsed = Date.now() - (message.timestamp || 0);
    if (elapsed >= IMAGE_GENERATION_DEADLINE_MS) {
      const result = await failImageAndRefund({
        chatId,
        userId,
        messageId,
        errorMessage: "Image generation timed out. Please try again.",
      });
      return res.json({ success: true, ...result });
    }

    return res.json({ success: true, status: "generating" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};
