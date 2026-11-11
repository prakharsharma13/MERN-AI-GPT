import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { dummyChats, dummyUserData } from "../assets/assets";
import axios from "axios";
import toast from "react-hot-toast";

axios.defaults.baseURL = import.meta.env.VITE_SERVER_URL;

const IMAGE_POLL_INTERVAL_MS = 5000;
const IMAGE_CLIENT_POLL_MAX_MS = 210000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const AppContext = createContext();

export const AppContextProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [token, setToken] = useState(() => {
    const stored = localStorage.getItem("token");
    if (!stored || stored === "undefined" || stored === "null") {
      localStorage.removeItem("token");
      return null;
    }
    return stored;
  });
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingChats, setLoadingChats] = useState(false);
  const imagePollsRef = useRef(new Map());
  const pollAuthRef = useRef({ token: null, userId: null });

  const fetchUser = async () => {
    try {
      const { data } = await axios.get("/api/user/data", {
        headers: { Authorization: token },
      });

      if (data.success) {
        setUser(data.user);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
      } else {
        toast.error(error.response?.data?.message || error.message);
      }
    } finally {
      setLoadingUser(false);
    }
  };

  //Create a chat, put it at the top of the list and select it.
  //Makes exactly one request and never retries; shows one toast on failure.
  //The server hands back the user's existing empty chat instead of a new one if there is one.
  const createChat = async () => {
    try {
      const { data } = await axios.post(
        "/api/chat/create",
        {},
        { headers: { Authorization: token } },
      );

      if (!data.success) {
        toast.error(data.message || "Couldn't create a new chat");
        return false;
      }

      //the returned chat may already be in the list (a reused empty chat)
      setChats((prev) => [
        data.chat,
        ...prev.filter((c) => c._id !== data.chat._id),
      ]);
      setSelectedChat(data.chat);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
      return false;
    }
  };

  //"New Chat" button: open the chat page with an empty chat,
  //reusing one that's already in the list instead of creating another
  const createNewChat = async () => {
    if (!user) return toast("Login to create a new chat");
    navigate("/");

    const emptyChat = chats.find((c) => c.messages?.length === 0);
    if (emptyChat) {
      setSelectedChat(emptyChat);
      return;
    }
    await createChat();
  };

  const fetchUsersChat = async () => {
    setLoadingChats(true);
    try {
      const { data } = await axios.get("/api/chat/get", {
        headers: { Authorization: token },
      });

      if (!data.success) {
        toast.error(data.message);
        return;
      }

      setChats(data.chats);
      if (data.chats.length > 0) {
        //Keep the open chat if it still exists (e.g. another chat was deleted);
        //otherwise (first load, or the open chat was deleted) open the most recent one.
        //The open chat is kept as-is so an in-flight optimistic message isn't lost.
        setSelectedChat((prev) =>
          prev && data.chats.some((c) => c._id === prev._id)
            ? prev
            : data.chats[0],
        );
      } else {
        //No chats yet: create the first one once, without leaving the current page.
        //If that fails, stop here; the user can retry with the "New Chat" button.
        setSelectedChat(null);
        await createChat();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    } finally {
      setLoadingChats(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setUser(null);
      setLoadingUser(false);
    }
  }, [token]);

  //Append a message to a chat and move that chat to the top of the list
  const addMessageToChat = (chatId, message) => {
    const withMessage = (chat) => ({
      ...chat,
      messages: [...(chat.messages || []), message],
      updatedAt: new Date().toISOString(),
    });

    setChats((prev) => {
      const chat = prev.find((c) => c._id === chatId);
      if (!chat) return prev;
      return [withMessage(chat), ...prev.filter((c) => c._id !== chatId)];
    });
    setSelectedChat((prev) => (prev?._id === chatId ? withMessage(prev) : prev));
  };

  //Remove a message added with addMessageToChat (matched by reference), e.g. when sending it failed
  const removeMessageFromChat = (chatId, message) => {
    const withoutMessage = (chat) => ({
      ...chat,
      messages: (chat.messages || []).filter((m) => m !== message),
    });

    setChats((prev) =>
      prev.map((c) => (c._id === chatId ? withoutMessage(c) : c)),
    );
    setSelectedChat((prev) =>
      prev?._id === chatId ? withoutMessage(prev) : prev,
    );
  };

  //Update fields on a saved message in a chat (e.g. async image status)
  const updateMessageInChat = useCallback((chatId, messageId, updates) => {
    const withUpdates = (chat) => ({
      ...chat,
      messages: (chat.messages || []).map((m) =>
        m._id === messageId ? { ...m, ...updates } : m,
      ),
    });

    setChats((prev) =>
      prev.map((c) => (c._id === chatId ? withUpdates(c) : c)),
    );
    setSelectedChat((prev) =>
      prev?._id === chatId ? withUpdates(prev) : prev,
    );
  }, []);

  //Only refetch chats when the logged-in user changes, not on every credit update
  const userId = user?._id;

  useEffect(() => {
    if (userId) {
      fetchUsersChat();
    } else {
      setChats([]);
      setSelectedChat(null);
    }
  }, [userId]);

  //Poll pending image generations across all chats and sync status/refunded credits
  useEffect(() => {
    const activePolls = imagePollsRef.current;

    if (
      pollAuthRef.current.token !== token ||
      pollAuthRef.current.userId !== userId
    ) {
      for (const stop of activePolls.values()) stop();
      activePolls.clear();
      pollAuthRef.current = { token, userId };
    }

    if (!token || !userId) {
      return;
    }

    const pending = new Map();
    for (const chat of chats) {
      for (const message of chat.messages || []) {
        if (
          message.isImage &&
          message.imageStatus === "generating" &&
          message._id
        ) {
          pending.set(`${chat._id}:${message._id}`, {
            chatId: chat._id,
            messageId: message._id,
            timestamp: message.timestamp,
          });
        }
      }
    }

    for (const [key, stop] of activePolls.entries()) {
      if (!pending.has(key)) {
        stop();
        activePolls.delete(key);
      }
    }

    const startPoll = (key, { chatId, messageId, timestamp }) => {
      let cancelled = false;
      const controller = new AbortController();

      const run = async () => {
        const messageStartedAt = timestamp || Date.now();
        if (Date.now() - messageStartedAt < IMAGE_POLL_INTERVAL_MS) {
          await sleep(IMAGE_POLL_INTERVAL_MS);
        }

        const pollStartedAt = Date.now();
        let firstCheck = true;

        while (
          !cancelled &&
          (firstCheck || Date.now() - pollStartedAt < IMAGE_CLIENT_POLL_MAX_MS)
        ) {
          firstCheck = false;
          try {
            const { data } = await axios.post(
              "/api/message/image/status",
              { chatId, messageId },
              {
                headers: { Authorization: token },
                signal: controller.signal,
              },
            );
            if (cancelled) return;

            if (!data.success) {
              if (data.notFound) break;
            } else if (data.status === "ready") {
              updateMessageInChat(chatId, messageId, { imageStatus: "ready" });
              if (typeof data.credits === "number") {
                setUser((prev) =>
                  prev ? { ...prev, credits: data.credits } : prev,
                );
              }
              break;
            } else if (data.status === "failed") {
              updateMessageInChat(chatId, messageId, {
                imageStatus: "failed",
                imageError: data.error,
              });
              if (typeof data.credits === "number") {
                setUser((prev) =>
                  prev ? { ...prev, credits: data.credits } : prev,
                );
              }
              toast.error(
                `${data.error || "Image generation failed"} — 2 credits refunded`,
              );
              break;
            }
          } catch (error) {
            if (cancelled || error.code === "ERR_CANCELED") return;
            const status = error.response?.status;
            if (status === 400 || status === 401 || status === 404) break;
          }

          await sleep(IMAGE_POLL_INTERVAL_MS);
        }

        activePolls.delete(key);
      };

      run();
      return () => {
        cancelled = true;
        controller.abort();
      };
    };

    for (const [key, info] of pending.entries()) {
      if (!activePolls.has(key)) {
        activePolls.set(key, startPoll(key, info));
      }
    }
  }, [chats, token, userId, updateMessageInChat]);

  useEffect(() => {
    const activePolls = imagePollsRef.current;
    return () => {
      for (const stop of activePolls.values()) stop();
      activePolls.clear();
    };
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const value = {
    navigate,
    user,
    setUser,
    chats,
    setChats,
    selectedChat,
    setSelectedChat,
    theme,
    setTheme,
    createNewChat,
    loadingUser,
    loadingChats,
    fetchUsersChat,
    addMessageToChat,
    removeMessageFromChat,
    token,
    setToken,
    axios,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);
