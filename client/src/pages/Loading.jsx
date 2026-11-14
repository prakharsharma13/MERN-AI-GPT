import React, { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useAppContext } from "../context/AppContext";

//How long to keep checking a payment Stripe still reports as processing
const VERIFY_ATTEMPTS = 10;
const VERIFY_INTERVAL_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const Loading = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  //Set by Stripe when it redirects back here after a successful checkout
  const sessionId = searchParams.get("session_id");
  const { axios, token, user, setUser, loadingUser } = useAppContext();
  const isLoggedIn = Boolean(user);

  //Plain loading screen: go home after a while only when on the standalone /loading page
  useEffect(() => {
    if (pathname !== "/loading" || sessionId) return;
    const timeout = setTimeout(() => {
      navigate("/");
    }, 8000);

    return () => clearTimeout(timeout);
  }, [pathname, sessionId, navigate]);

  //Back from Stripe Checkout: confirm the payment with the server and show the new balance.
  //Doesn't depend on the webhook having arrived yet.
  useEffect(() => {
    if (pathname !== "/loading" || !sessionId) return;
    //wait for the initial user fetch, so its (older) balance can't overwrite the new one
    if (loadingUser) return;
    if (!isLoggedIn) {
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;

    const verify = async () => {
      for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
        try {
          const { data } = await axios.post(
            "/api/credit/verify",
            { sessionId },
            { headers: { Authorization: token } },
          );
          if (cancelled) return;

          if (data.success) {
            setUser((prev) => (prev ? { ...prev, credits: data.credits } : prev));
            toast.success("Credits added to your account");
            return;
          }
          if (!data.pending) {
            toast.error(data.message);
            return;
          }
          //still processing: try again
        } catch (error) {
          if (cancelled) return;
          if (attempt === VERIFY_ATTEMPTS) {
            toast.error(error.response?.data?.message || error.message);
            return;
          }
        }
        await sleep(VERIFY_INTERVAL_MS);
        if (cancelled) return;
      }
      toast("Your payment is still processing. Credits will appear once it completes.");
    };

    verify().then(() => {
      if (!cancelled) navigate("/", { replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [
    pathname,
    sessionId,
    loadingUser,
    isLoggedIn,
    axios,
    navigate,
    setUser,
    token,
  ]);

  return (
    <div className="bg-linear-to-b from-[#531B81] to-[#29184B] backdrop-opacity-60 flex items-center justify-center h-screen w-screen text-white text-2xl">
      <div className="w-10 h-10 rounded-full border-3 border-white border-t-transparent animate-spin"></div>
    </div>
  );
};

export default Loading;
