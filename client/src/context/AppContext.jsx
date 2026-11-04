import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dummyChats, dummyUserData } from "../assets/assets";
import axios from "axios";
import toast from "react-hot-toast";

axios.defaults.baseURL = import.meta.env.VITE_SERVER_URL;

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

  const createNewChat = async () => {
    try {
      if (!user) return toast("Login to create a new chat");
      navigate("/");
      await axios.get("/api/chat/create", {
        headers: { Authorization: token },
      });
      await fetchUsersChat();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const fetchUsersChat = async () => {
    try {
      const { data } = await axios.get("/api/chat/get", {
        headers: { Authorization: token },
      });

      if (data.success) {
        setChats(data.chats);

        //If user has no chats, then we will create new one
        if (data.chats.length === 0) {
          await createNewChat();
          return fetchUsersChat();
        } else {
          setSelectedChat(data.chats[0]);
        }
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message);
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
      messages: [...chat.messages, message],
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
      messages: chat.messages.filter((m) => m !== message),
    });

    setChats((prev) =>
      prev.map((c) => (c._id === chatId ? withoutMessage(c) : c)),
    );
    setSelectedChat((prev) =>
      prev?._id === chatId ? withoutMessage(prev) : prev,
    );
  };

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
