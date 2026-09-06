import React, { useEffect, useState } from "react";
import { assets } from "../assets/assets";
import moment from "moment";
import Markdown from "react-markdown";
import Prism from "prismjs";

const RETRY_DELAY_MS = 3000;
const MAX_RETRIES = 12;

// ImageKit serves a text placeholder for the first few seconds while it
// generates. The placeholder is cached for only 10s, so remounting the
// <img> after a short delay eventually picks up the real image.
const GeneratedImage = ({ src }) => {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="text-sm text-red-400">
        This image could not be generated. Please try the prompt again.
      </p>
    );
  }

  return (
    <img
      key={attempt}
      src={src}
      alt="Generated image"
      className="w-full max-w-md mt-2 rounded-md min-h-40 bg-black/20"
      onError={() => {
        if (attempt >= MAX_RETRIES) {
          setFailed(true);
          return;
        }
        setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAY_MS);
      }}
    />
  );
};

const Message = ({ message }) => {
  useEffect(() => {
    Prism.highlightAll();
  }, [message.content]);

  return (
    <div>
      {message.role === "User" ? (
        <div className="flex items-end justify-end my-4 gap-2">
          <div className="flex flex-col gap-2 p-2 px-4 bg-slate-50 dark:bg-[#57317C]/30 border border-[#806094]/30 rounded-md max-w-2xl">
            <p className="text-sm dark:text-primary">{message.content}</p>
            <span className="text-xs text-gray-400 dark:text-[#B1A6C0]">
              {moment(message.timestamp).fromNow}
            </span>
          </div>
          <img src={assets.user_icon} className="" alt="w-8 rounded-full" />
        </div>
      ) : (
        <div className="inline-flex flex-col gap-2 p-2 px-4 max-w-2xl bg-primary/20 dark:bg-[#57317C]/30 border border-[#80609F]/30 rounded-md my-4">
          {message.isImage ? (
            <GeneratedImage src={message.content} />
          ) : (
            <div className="text-sm dark:text-primary reset-tw">
              <Markdown>{message.content}</Markdown>
            </div>
          )}
          <span className="text-xs text-gray-400 dark:text-[#B1A6C0]">
            {moment(message.timestamp).fromNow}
          </span>
        </div>
      )}
    </div>
  );
};

export default Message;
