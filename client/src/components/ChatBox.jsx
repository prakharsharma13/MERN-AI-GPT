import React, { useEffect, useRef, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { assets } from "../assets/assets";
import Message from "./Message";
import toast from "react-hot-toast";

const ChatBox = () => {
  const containerRef = useRef(null);
  const {
    selectedChat,
    theme,
    user,
    axios,
    token,
    setUser,
    addMessageToChat,
    removeMessageFromChat,
  } = useAppContext();
  const messages = selectedChat?.messages || [];
  //Chat the in-flight request was sent from, so its reply lands there
  const [loadingChatId, setLoadingChatId] = useState(null);
  const loading = loadingChatId !== null;
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("text");
  const [isPublished, setIsPublished] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!user) return toast("Login to send message");

    const chatId = selectedChat._id;
    const promptCopy = prompt;
    const userMessage = {
      role: "User",
      content: promptCopy,
      timestamp: Date.now(),
      isImage: false,
    };

    //Undo the optimistic message (the server didn't save it) and give the prompt back
    const rollback = (message) => {
      toast.error(message);
      removeMessageFromChat(chatId, userMessage);
      //don't overwrite anything typed while the request was in flight
      setPrompt((current) => current || promptCopy);
    };

    setLoadingChatId(chatId);
    setPrompt("");
    addMessageToChat(chatId, userMessage);

    try {
      const { data } = await axios.post(
        `/api/message/${mode}`,
        {
          chatId,
          prompt: promptCopy,
          isPublished,
        },
        {
          headers: { Authorization: token },
        },
      );

      if (data.success) {
        addMessageToChat(chatId, data.reply);

        //decrease credits
        if (mode === "image") {
          setUser((prev) => ({ ...prev, credits: prev.credits - 2 }));
        } else {
          setUser((prev) => ({ ...prev, credits: prev.credits - 1 }));
        }
      } else {
        rollback(data.message);
      }
    } catch (error) {
      rollback(error.response?.data?.message || error.message);
    } finally {
      setLoadingChatId(null);
    }
  };

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behaviour: "smooth",
      });
    }
  }, [selectedChat]);

  return (
    <div className="flex-1 flex flex-col justify-between m-5 md:m-10 xl:mx-30 max-md:mt-14 2xl:pr-40">
      {/**Chat Messages */}

      <div ref={containerRef} className="flex-1 mb-5 overflow-y-scroll">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-primary">
            <img
              src={
                theme === "dark"
                  ? assets.nexus_logo_full
                  : assets.nexus_logo_full_dark
              }
              alt=""
              className="w-full max-w-56 sm:max-w-68"
            />
            <p className="mt-5 text-4xl sm:text-6xl text-center text-gray-400 dark:text-white">
              Ask me anything.
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <Message key={index} message={message} />
        ))}

        {loading && loadingChatId === selectedChat?._id && (
          <div className="loader flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-white animate-bounce"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-white animate-bounce"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-white animate-bounce"></div>
          </div>
        )}
      </div>

      {mode === "image" && (
        <label className="inline-flex items-center gap-2 mb-3 text-sm mx-auto">
          <p className="text-xs">Publish Generated Image to Community</p>
          <input
            type="checkbox"
            className="cursor-pointer"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
        </label>
      )}

      {/**Prompt Input Box */}
      <form
        onSubmit={onSubmit}
        className="bg-primary/20 dark:bg-[#583C79]/30 border border-primary dark:border-[#80609F]/30 rounded-full w-full max-w-2xl p-3 pl-4 mx-auto flex gap-4 items-center"
      >
        <select
          className="text-sm pl-3 pr-2 outline-none"
          onChange={(e) => setMode(e.target.value)}
          value={mode}
        >
          <option value="text" className="dark:bg-purple-900">
            Text
          </option>
          <option className="dark:bg-purple-900" value="image">
            Image
          </option>
        </select>
        <input
          onChange={(e) => setPrompt(e.target.value)}
          value={prompt}
          type="text"
          placeholder="Type your prompt here..."
          className="flex-1 w-full text-sm outline-none"
          required
        />
        <button disabled={loading}>
          <img
            src={loading ? assets.stop_icon : assets.send_icon}
            alt=""
            className="w-8 cursor-pointer "
          />
        </button>
      </form>
    </div>
  );
};

export default ChatBox;
