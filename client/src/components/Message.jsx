import React, { useEffect, useState } from "react";
import { assets } from "../assets/assets";
import moment from "moment";
import Markdown from "react-markdown";
import Prism from "prismjs";

const POLL_INTERVAL_MS = 5000;
const DEADLINE_MS = 180000; // generation measured at ~60s; generous headroom

const GeneratedImage = ({ src }) => {
  const [status, setStatus] = useState("generating"); // generating | ready | failed
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const deadline = Date.now() + DEADLINE_MS;

    const poll = async () => {
      while (!cancelled && Date.now() < deadline) {
        try {
          const res = await fetch(src);
          const type = res.headers.get("content-type") || "";

          // Ready
          if (res.ok && type.startsWith("image/")) {
            if (!cancelled) setStatus("ready");
            return;
          }

          // Permanent failure (403 quota, etc) - stop, don't burn the budget
          if (!res.ok) {
            const body = (await res.text()).trim();
            if (!cancelled) {
              setError(body || `Image service returned ${res.status}`);
              setStatus("failed");
            }
            return;
          }

          // 200 + non-image = placeholder, still generating: keep polling
        } catch {
          // transient network error: keep polling
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      if (!cancelled) {
        setError("Image generation timed out. Please try again.");
        setStatus("failed");
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (status === "failed") {
    return <p className="text-sm text-red-400 mt-2">{error}</p>;
  }

  if (status === "generating") {
    return (
      <div className="flex h-48 w-full max-w-md items-center justify-center rounded-md bg-black/20 text-xs text-gray-400 mt-2">
        Generating image… this can take up to a minute
      </div>
    );
  }

  return <img src={src} alt="" className="w-full max-w-md mt-2 rounded-md" />;
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
              {moment(message.timestamp).fromNow()}
            </span>
          </div>
          <img src={assets.user_icon} className="w-8 rounded-full" alt="" />
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
            {moment(message.timestamp).fromNow()}
          </span>
        </div>
      )}
    </div>
  );
};

export default Message;
